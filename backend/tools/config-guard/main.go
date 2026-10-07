// Command config-guard 把 observability.metric.guard 写进 Config Center 的
// bootstrap.yaml(或本机被 gitignore 的 configs/<env>.yml),用来按环境启用指标
// 导出的退避/熔断/ntfy 告警参数。
//
// 前置条件(顺序不能反,见 context/project/ecommerce/config/INDEX.md):
//  1. 本仓提交 services/*/configs/bootstrap.schema.json(必须已含 guard 字段);
//  2. control-tower 执行 make sync-ecommerce-schemas 并发布 config 服务——
//     配置中心以 CONFIG_SCHEMA_MODE=enforce 运行,旧快照的
//     additionalProperties=false 会直接把 guard 当未知键拒绝(HTTP 400);
//  3. 本工具写配置;
//  4. 发布消费服务。⚠️ 消费服务的二进制必须先带 guard 字段再写配置:旧二进制
//     解码开了 ErrorUnused,配置里出现未知键会让它在下次重启时起不来。
//
// 凭据只从环境变量读,不落盘、不进仓库:
//
//	CONFIG_CENTER_TOKEN  Casdoor 管理员 JWT(PutKey 不接受 machine token)
//	NTFY_URL NTFY_TOPIC NTFY_TOKEN
//
// 默认 dry-run,只有 -apply 才写。
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	defaultBase  = "https://config-api.apikv.com"
	bootstrapKey = "bootstrap.yaml"

	envToken     = "CONFIG_CENTER_TOKEN"
	envNtfyURL   = "NTFY_URL"
	envNtfyTopic = "NTFY_TOPIC"
	envNtfyToken = "NTFY_TOKEN"
)

// ecommerceServices 与 control-tower 的 scripts/sync-ecommerce-schemas.sh 对齐。
var ecommerceServices = []string{
	"address", "behavior", "cart", "inventory", "merchant",
	"order", "payment", "product", "search", "user",
}

// guardBlock 是写进 observability.metric.guard 的内容,默认值等于
// go-connect-kit/otelguard 的默认值。enable 用指针:不写 = 保持开启,
// 只有显式 false 才关闭(proto 里是 google.protobuf.BoolValue)。
type guardBlock struct {
	Enable         *bool     `yaml:"enable,omitempty"`
	MaxFailures    int       `yaml:"max_failures"`
	InitialBackoff string    `yaml:"initial_backoff"`
	MaxBackoff     string    `yaml:"max_backoff"`
	Multiplier     float64   `yaml:"multiplier"`
	Jitter         float64   `yaml:"jitter"`
	ProbeInterval  string    `yaml:"probe_interval"`
	HardShutdown   bool      `yaml:"hard_shutdown"`
	Ntfy           ntfyBlock `yaml:"ntfy"`
}

type ntfyBlock struct {
	URL              string `yaml:"url"`
	Topic            string `yaml:"topic"`
	Token            string `yaml:"token"`
	AlertPriority    string `yaml:"alert_priority,omitempty"`
	RecoveryPriority string `yaml:"recovery_priority,omitempty"`
}

func main() {
	var (
		base        = flag.String("base", defaultBase, "Config Center API 基地址")
		environment = flag.String("environment", "", "环境:dev/pre/prod(本地模式用 dev/pre)")
		services    = flag.String("services", "all", "服务名逗号分隔,或 all")
		key         = flag.String("key", bootstrapKey, "配置键")
		local       = flag.Bool("local", false, "改本机 configs/<env>.yml(被 gitignore)而不是 Config Center")
		configsRoot = flag.String("configs-root", "services", "本地模式下 services 目录")
		apply       = flag.Bool("apply", false, "真正写入;默认只读并打印将要写入的内容")
		comment     = flag.String("comment", "启用指标导出的退避/熔断/ntfy 告警(otelguard)", "变更备注")

		disable        = flag.Bool("disable", false, "写入 disable: true,显式关掉保护")
		maxFailures    = flag.Int("max-failures", 8, "连续失败多少次熔断")
		initialBackoff = flag.String("initial-backoff", "2s", "首次失败后的退避窗口")
		maxBackoff     = flag.String("max-backoff", "5m", "退避窗口上限")
		multiplier     = flag.Float64("multiplier", 2.0, "退避递增倍数")
		jitter         = flag.Float64("jitter", 0.3, "退避抖动比例 [0,1)")
		probeInterval  = flag.String("probe-interval", "5m", "熔断后的探测间隔")
		hardShutdown   = flag.Bool("hard-shutdown", false, "熔断即关闭底层导出器,不再探测")
	)
	flag.Parse()

	if *environment == "" {
		fail("-environment 必填")
	}
	names, err := selectServices(*services)
	if err != nil {
		fail(err.Error())
	}

	block := guardBlock{
		MaxFailures:    *maxFailures,
		InitialBackoff: *initialBackoff,
		MaxBackoff:     *maxBackoff,
		Multiplier:     *multiplier,
		Jitter:         *jitter,
		ProbeInterval:  *probeInterval,
		HardShutdown:   *hardShutdown,
		Ntfy: ntfyBlock{
			URL:   os.Getenv(envNtfyURL),
			Topic: os.Getenv(envNtfyTopic),
			Token: os.Getenv(envNtfyToken),
		},
	}
	if *disable {
		disabled := false
		block.Enable = &disabled
	}
	if block.Ntfy.URL == "" || block.Ntfy.Topic == "" {
		fail(fmt.Sprintf("%s 与 %s 必填(告警要发到哪个 ntfy 主题)", envNtfyURL, envNtfyTopic))
	}

	if *local {
		runLocal(names, *environment, *configsRoot, block, *apply)
		return
	}

	token := os.Getenv(envToken)
	if token == "" {
		fail(fmt.Sprintf("%s 必填(Casdoor 管理员 JWT;machine token 不能写配置)", envToken))
	}
	runRemote(remoteOptions{
		base:        *base,
		environment: *environment,
		key:         *key,
		token:       token,
		comment:     *comment,
		apply:       *apply,
		names:       names,
		block:       block,
	})
}

type remoteOptions struct {
	base        string
	environment string
	key         string
	token       string
	comment     string
	apply       bool
	names       []string
	block       guardBlock
}

func runLocal(names []string, environment, configsRoot string, block guardBlock, apply bool) {
	for _, name := range names {
		path := filepath.Join(configsRoot, name, "configs", environment+".yml")
		current, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] 跳过:%v\n", name, err)
			continue
		}
		updated, err := withGuard(current, block)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] %v\n", name, err)
			continue
		}
		if bytes.Equal(current, updated) {
			fmt.Printf("[%s] 已是目标值,未改动 %s\n", name, path)
			continue
		}
		if !apply {
			fmt.Printf("[%s] 将写入 %s(本地文件被 gitignore)\n", name, path)
			continue
		}
		if err := os.WriteFile(path, updated, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "[%s] 写入失败:%v\n", name, err)
			continue
		}
		fmt.Printf("[%s] 已写入 %s\n", name, path)
	}
}

func runRemote(options remoteOptions) {
	client := &http.Client{Timeout: 30 * time.Second}
	failures := 0

	for _, name := range options.names {
		current, version, err := getKey(client, options, name)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] 读取失败:%v\n", name, err)
			failures++
			continue
		}
		updated, err := withGuard([]byte(current), options.block)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] %v\n", name, err)
			failures++
			continue
		}
		if bytes.Equal([]byte(current), updated) {
			fmt.Printf("[%s] %s/%s 已是目标值(v%d),未改动\n", name, options.environment, options.key, version)
			continue
		}
		if !options.apply {
			fmt.Printf("[%s] 将更新 %s/%s(v%d → v%d),新 guard 段:\n%s\n",
				name, options.environment, options.key, version, version+1, indent(guardYAML(options.block), "    "))
			continue
		}
		newVersion, err := putKey(client, options, name, string(updated))
		if err != nil {
			fmt.Fprintf(os.Stderr, "[%s] 写入失败:%v\n", name, err)
			failures++
			continue
		}
		fmt.Printf("[%s] 已写入 %s/%s(v%d → v%d)\n", name, options.environment, options.key, version, newVersion)
	}

	if failures > 0 {
		fail(fmt.Sprintf("%d 个服务未完成", failures))
	}
	if !options.apply {
		fmt.Println("dry-run:没有写入任何配置;确认无误后加 -apply")
	}
}

func getKey(client *http.Client, options remoteOptions, namespace string) (string, int32, error) {
	body := map[string]any{
		"namespace":   namespace,
		"environment": options.environment,
		"key":         options.key,
	}
	var response struct {
		Entry struct {
			Value   string `json:"value"`
			Version int32  `json:"version"`
		} `json:"entry"`
	}
	if err := post(client, options, "GetKey", body, &response); err != nil {
		return "", 0, err
	}
	return response.Entry.Value, response.Entry.Version, nil
}

func putKey(client *http.Client, options remoteOptions, namespace, value string) (int32, error) {
	body := map[string]any{
		"namespace":   namespace,
		"environment": options.environment,
		"key":         options.key,
		"format":      "CONFIG_FORMAT_YAML",
		"value":       value,
		"comment":     options.comment,
	}
	var response struct {
		Entry struct {
			Version int32 `json:"version"`
		} `json:"entry"`
	}
	if err := post(client, options, "PutKey", body, &response); err != nil {
		return 0, err
	}
	return response.Entry.Version, nil
}

func post(client *http.Client, options remoteOptions, method string, body, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	url := strings.TrimRight(options.base, "/") + "/config.v1.ConfigService/" + method
	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+options.token)

	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		// 不回显请求体:它含整个 bootstrap(可能有凭据)。只回显服务端错误。
		return fmt.Errorf("%s: HTTP %d: %s", method, response.StatusCode, strings.TrimSpace(string(data)))
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("%s: 解析响应: %w", method, err)
	}
	return nil
}

// withGuard 在文档的 observability.metric 下写入(或替换)guard 段,保留其余内容与
// 注释。找不到 observability 或 metric 时直接报错,不猜测结构。
func withGuard(document []byte, block guardBlock) ([]byte, error) {
	var root yaml.Node
	if err := yaml.Unmarshal(document, &root); err != nil {
		return nil, fmt.Errorf("解析 YAML: %w", err)
	}
	if len(root.Content) == 0 {
		return nil, errors.New("配置为空")
	}
	top := root.Content[0]
	if top.Kind != yaml.MappingNode {
		return nil, errors.New("配置顶层不是映射")
	}

	observability := mappingValue(top, "observability")
	if observability == nil {
		return nil, errors.New("配置里没有 observability 段")
	}
	metric := mappingValue(observability, "metric")
	if metric == nil {
		return nil, errors.New("配置里没有 observability.metric 段")
	}

	guard, err := yamlNode(block)
	if err != nil {
		return nil, err
	}
	guard.HeadComment = "指标导出保护:退避 + 熔断 + ntfy 告警,由 go-connect-kit/otelguard 实现"

	if existing := mappingValue(metric, "guard"); existing != nil {
		*existing = *guard
	} else {
		metric.Content = append(metric.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "guard"},
			guard,
		)
	}

	var buffer bytes.Buffer
	encoder := yaml.NewEncoder(&buffer)
	encoder.SetIndent(2)
	if err := encoder.Encode(&root); err != nil {
		return nil, fmt.Errorf("序列化 YAML: %w", err)
	}
	if err := encoder.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func mappingValue(mapping *yaml.Node, key string) *yaml.Node {
	for index := 0; index+1 < len(mapping.Content); index += 2 {
		if mapping.Content[index].Value == key {
			return mapping.Content[index+1]
		}
	}
	return nil
}

func yamlNode(value any) (*yaml.Node, error) {
	data, err := yaml.Marshal(value)
	if err != nil {
		return nil, err
	}
	var document yaml.Node
	if err := yaml.Unmarshal(data, &document); err != nil {
		return nil, err
	}
	if len(document.Content) == 0 {
		return nil, errors.New("空 YAML")
	}
	return document.Content[0], nil
}

func guardYAML(block guardBlock) string {
	data, _ := yaml.Marshal(block)
	return string(data)
}

func indent(text, prefix string) string {
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")
	for index, line := range lines {
		lines[index] = prefix + line
	}
	return strings.Join(lines, "\n")
}

func selectServices(value string) ([]string, error) {
	if strings.TrimSpace(value) == "all" {
		return slices.Clone(ecommerceServices), nil
	}
	var names []string
	for _, name := range strings.Split(value, ",") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if !slices.Contains(ecommerceServices, name) {
			return nil, fmt.Errorf("未知服务 %q", name)
		}
		names = append(names, name)
	}
	if len(names) == 0 {
		return nil, errors.New("-services 为空")
	}
	slices.Sort(names)
	return slices.Compact(names), nil
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, "错误:"+message)
	os.Exit(1)
}
