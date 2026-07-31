// 最小「服务接入配置中心」示例:通过 ConnectRPC 直连 config-service 拉取一个 key。
// 这是本轮设计支持的接入方式(拉取);Watch 热更新/Go SDK 为后续。
//
// 运行(config-service 需在 :30010):
//
//	cd backend/services/config
//	go run ./examples/pull \
//	  -base http://127.0.0.1:30010 -ns cart -env dev -key feature.yaml
//
// 若经网关拉取:-base http://localhost:8080 且加 -token <admin JWT>
// (当前 /config* 网关策略为 admin-only;服务账号/机器 token 为后续。)
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/config/v1"
	"github.com/lens077/ecommerce/backend/api/config/v1/configv1connect"
)

func main() {
	base := flag.String("base", "http://127.0.0.1:30010", "config-service 或网关地址")
	ns := flag.String("ns", "cart", "namespace")
	env := flag.String("env", "dev", "environment")
	key := flag.String("key", "feature.yaml", "key")
	token := flag.String("token", "", "可选:经网关时的 Bearer JWT")
	flag.Parse()

	client := configv1connect.NewConfigServiceClient(http.DefaultClient, *base)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req := connect.NewRequest(&v1.GetKeyRequest{Namespace: *ns, Environment: *env, Key: *key})
	if *token != "" {
		req.Header().Set("Authorization", "Bearer "+*token)
	}

	resp, err := client.GetKey(ctx, req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "拉取失败: %v\n", err)
		os.Exit(1)
	}

	e := resp.Msg.Entry
	fmt.Printf("✅ 拉取成功 %s/%s/%s (v%d, format=%s, updatedBy=%s)\n",
		e.Namespace, e.Environment, e.Key, e.Version, e.Format, e.UpdatedBy)
	fmt.Printf("---- value ----\n%s\n", e.Value)
}
