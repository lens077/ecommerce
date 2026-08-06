// config-seed 把 Consul KV 里的整份 Bootstrap 配置灌进配置中心。
//
// 为什么源是 Consul KV 而不是仓库里的 configs/*.yml:那些文件含 DB/Redis/ES 密码、
// Casdoor client_secret 和证书,按 AGENTS.md 硬规则 4 一律不入库(各服务
// configs/.gitignore 拦着),因此它们只存在于某台机器上、内容各不相同。
// Consul KV 才是「所有人都能取到同一份」的那个源。
//
// 两个数据源同内容是有意的:CONFIG_SOURCE 决定服务读哪一边,配置中心挂了还能切回
// consul。代价是改配置要同步两处 —— 本工具就是那个同步动作。
//
// 用法:
//
//	# 先看会写什么(默认 dry-run,不写任何东西)
//	go run ./tools/config-seed
//	# 真写
//	go run ./tools/config-seed -write
//	# 只灌某几个服务的 pre
//	go run ./tools/config-seed -services user,cart -envs pre -write
//
// 独立 config-center 需要先启动(cd ../config-center && make dev)。
// 写入必须使用 Casdoor 管理员 JWT；服务 token 只能读，不能写入配置。
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/hashicorp/consul/api"

	configv1 "github.com/lens077/config-center/api/config/v1"
	"github.com/lens077/config-center/api/config/v1/configv1connect"
)

const (
	// kvPrefix Consul KV 里配置的固定前缀,形如 ecommerce/<svc>/<env>.yml
	kvPrefix = "ecommerce/"
	// configKey 配置中心里的键名,与各服务 Makefile 的 CONFIG_CENTER_KEY 一致
	configKey = "bootstrap.yaml"
)

// skipServices 不参与灌入的服务。
//
// config 是配置中心本体,它的配置必须从 Consul KV 自举 —— 存进它自己里面,
// 重启后就没人能把它拉起来了。gateway 不是微服务,KV 里那几个键是证书和策略文件,
// 不是 Bootstrap。
var skipServices = map[string]bool{"config": true, "gateway": true}

type entry struct {
	service string
	env     string
	kvPath  string
	value   []byte
}

func main() {
	var (
		consulAddr = flag.String("consul", "192.168.3.112:8500", "Consul 地址,见 context/team/local-env.md")
		base       = flag.String("base", "http://127.0.0.1:30010", "config-center 地址")
		adminToken = flag.String("admin-token", os.Getenv("CONFIG_CENTER_ADMIN_TOKEN"), "Casdoor 管理员 JWT（也可用 CONFIG_CENTER_ADMIN_TOKEN 提供）")
		envsFlag   = flag.String("envs", "dev,pre", "要灌的环境,逗号分隔")
		svcsFlag   = flag.String("services", "", "只灌这几个服务,逗号分隔;留空表示 KV 里的全部")
		write      = flag.Bool("write", false, "真正写入。不加只做 dry-run")
		timeout    = flag.Duration("timeout", 30*time.Second, "整体超时")
	)
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	entries, err := loadFromConsul(*consulAddr, split(*envsFlag), split(*svcsFlag))
	if err != nil {
		fail("从 Consul 读配置失败: %v", err)
	}
	if len(entries) == 0 {
		fail("没有匹配到任何配置,检查 -services / -envs")
	}

	if !*write {
		fmt.Printf("dry-run(加 -write 才真正写入)。目标 %s,共 %d 项:\n", *base, len(entries))
		for _, e := range entries {
			fmt.Printf("  %-12s %-4s %-34s %6d 字节 -> %s/%s/%s\n",
				e.service, e.env, e.kvPath, len(e.value), e.service, e.env, configKey)
		}
		return
	}
	if strings.TrimSpace(*adminToken) == "" {
		fail("写入需要 Casdoor 管理员 JWT: 设置 CONFIG_CENTER_ADMIN_TOKEN 或传入 -admin-token")
	}

	var failed int
	client := configv1connect.NewConfigServiceClient(newAdminHTTPClient(*adminToken), *base)
	for _, e := range entries {
		if err := put(ctx, client, e); err != nil {
			fmt.Fprintf(os.Stderr, "FAIL  %s/%s: %v\n", e.service, e.env, err)
			failed++
			continue
		}
		// 立刻读回:PutKey 返回成功不等于存进去的就是我们发的那一份
		// (服务端会按 format 校验并可能规范化),不比对等于没验证。
		got, err := get(ctx, client, e)
		switch {
		case err != nil:
			fmt.Fprintf(os.Stderr, "FAIL  %s/%s 读回: %v\n", e.service, e.env, err)
			failed++
		case got != string(e.value):
			fmt.Fprintf(os.Stderr, "FAIL  %s/%s 读回内容与写入不一致(本地 %d 字节,远端 %d 字节)\n",
				e.service, e.env, len(e.value), len(got))
			failed++
		default:
			fmt.Printf("OK    %-12s %-4s %6d 字节\n", e.service, e.env, len(e.value))
		}
	}

	if failed > 0 {
		fail("%d/%d 项失败", failed, len(entries))
	}
	fmt.Printf("完成:%d 项全部写入并读回校验通过\n", len(entries))
}

type bearerTokenTransport struct {
	base  http.RoundTripper
	token string
}

func (t bearerTokenTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header = req.Header.Clone()
	clone.Header.Set("Authorization", "Bearer "+t.token)
	return t.base.RoundTrip(clone)
}

func newAdminHTTPClient(token string) *http.Client {
	return &http.Client{Transport: bearerTokenTransport{base: http.DefaultTransport, token: token}}
}

func loadFromConsul(addr string, envs, only []string) ([]entry, error) {
	cfg := api.DefaultConfig()
	cfg.Address = addr
	c, err := api.NewClient(cfg)
	if err != nil {
		return nil, err
	}

	wanted := map[string]bool{}
	for _, s := range only {
		wanted[s] = true
	}
	envSet := map[string]bool{}
	for _, e := range envs {
		envSet[e] = true
	}

	pairs, _, err := c.KV().List(kvPrefix, nil)
	if err != nil {
		return nil, err
	}

	var out []entry
	for _, p := range pairs {
		// ecommerce/<svc>/<env>.yml —— 其余形状(gateway 的证书、策略文件)一律跳过
		rest := strings.TrimPrefix(p.Key, kvPrefix)
		parts := strings.Split(rest, "/")
		if len(parts) != 2 || !strings.HasSuffix(parts[1], ".yml") {
			continue
		}
		svc, env := parts[0], strings.TrimSuffix(parts[1], ".yml")
		if skipServices[svc] || !envSet[env] {
			continue
		}
		if len(wanted) > 0 && !wanted[svc] {
			continue
		}
		if len(p.Value) == 0 {
			return nil, fmt.Errorf("%s 是空的", p.Key)
		}
		out = append(out, entry{service: svc, env: env, kvPath: p.Key, value: p.Value})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].service != out[j].service {
			return out[i].service < out[j].service
		}
		return out[i].env < out[j].env
	})
	return out, nil
}

func put(ctx context.Context, c configv1connect.ConfigServiceClient, e entry) error {
	_, err := c.PutKey(ctx, connect.NewRequest(&configv1.PutKeyRequest{
		Namespace:   e.service,
		Environment: e.env,
		Key:         configKey,
		Format:      configv1.ConfigFormat_CONFIG_FORMAT_YAML,
		Value:       string(e.value),
		Comment:     "seed from consul kv " + e.kvPath,
		Description: "整份 Bootstrap 配置,与 Consul KV " + e.kvPath + " 同源",
	}))
	return err
}

func get(ctx context.Context, c configv1connect.ConfigServiceClient, e entry) (string, error) {
	resp, err := c.GetKey(ctx, connect.NewRequest(&configv1.GetKeyRequest{
		Namespace:   e.service,
		Environment: e.env,
		Key:         configKey,
	}))
	if err != nil {
		return "", err
	}
	return resp.Msg.GetEntry().GetValue(), nil
}

func split(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
