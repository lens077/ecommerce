// Package connectv2 是 connect-go v2 全仓迁移的实机 e2e 验收。
//
// 打真实 pre 环境(config-api.apikv.com),验证迁移后的整条 RPC 链:
//
//	ecommerce v2 SDK 客户端 → (公网/Pangolin) → config 服务 v2 服务端
//
// 覆盖三件事:健康检查、GetKey 一元往返(与 config-seed 的真实调用形状一致)、
// WatchKeys 流式(v2 per-RPC 流类型 + 快照推送)。
//
// 运行方式(机器 token 向配置中心管理员索取,或从本地 gitignore 的
// source selector 里取;没有 token 时后两条自动 skip,CI 安全):
//
//	CONNECT_V2_E2E_ADDRESS=https://config-api.apikv.com \
//	CONNECT_V2_E2E_TOKEN=<machine token> \
//	go test ./e2e/connectv2/ -count=1 -v
//
// 范围边界:ecommerce 十服务的 v2 handler 在集群内,公网入口是网关
// (gateway.apikv.com 的 Pangolin 资源未建,见 control-tower AGENTS.md),
// 从本机不可达,因此这里只验收对外可达的 config 链路;服务侧的 v2 编译与
// fx 图由 backend 的单测与 structcheck 把关。
package connectv2

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	configv1 "github.com/lens077/control-tower/api/config/v1"
	configv1connect "github.com/lens077/control-tower/api/config/v1/configv1connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	defaultAddress = "https://config-api.apikv.com"
	// 与 config-seed 的 config_center_key 契约一致:{service}/{env}/bootstrap.yaml。
	// namespace=service,environment=pre,key=bootstrap.yaml。
	namespace   = "cart"
	environment = "pre"
	key         = "bootstrap.yaml"
)

func address() string {
	if a := os.Getenv("CONNECT_V2_E2E_ADDRESS"); a != "" {
		return a
	}
	return defaultAddress
}

func token(t *testing.T) string {
	t.Helper()
	tok := os.Getenv("CONNECT_V2_E2E_TOKEN")
	if tok == "" {
		t.Skip("CONNECT_V2_E2E_TOKEN 未设置:跳过需要机器 token 的实机验收(本条只在有凭据的机器上跑)")
	}
	return tok
}

// tokenContext 把机器 token 写进客户端 CallInfo,随 ctx 传播(v2 语义)。
func tokenContext(ctx context.Context, tok string) context.Context {
	ctx, info := connect.NewClientContext(ctx)
	info.RequestHeader().Set("x-config-center-service-token", tok)
	return ctx
}

// newClient 构造 v2 SDK 客户端,与 config-seed 的组装方式完全一致。
func newClient(t *testing.T) configv1connect.ConfigServiceClient {
	t.Helper()
	return configv1connect.NewConfigServiceClient(
		connect.NewClient(connecthttp.NewTransport(http.DefaultClient, address())),
	)
}

// TestConfigCenterV2_Healthz 验收 v2 config 服务的存活与版本回显。
// 无需凭据,CI 上也会真跑。
func TestConfigCenterV2_Healthz(t *testing.T) {
	resp, err := http.Get(address() + "/healthz")
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	buf := make([]byte, 1024)
	n, _ := resp.Body.Read(buf)
	assert.Contains(t, string(buf[:n]), "build", "healthz 应回显构建版本")
}

// TestConfigCenterV2_GetKeyRoundTrip 验收 v2 一元 RPC 往返:
// v2 客户端 → v2 服务端 → 读回 ecommerce cart 的 Bootstrap 配置。
func TestConfigCenterV2_GetKeyRoundTrip(t *testing.T) {
	tok := token(t)
	client := newClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	resp, err := client.GetKey(tokenContext(ctx, tok), &configv1.GetKeyRequest{
		Namespace:   namespace,
		Environment: environment,
		Key:         key,
	})
	require.NoError(t, err)
	entry := resp.GetEntry()
	require.NotNil(t, entry, "entry 不能为 nil")
	assert.NotEmpty(t, entry.GetValue(), "cart/pre/bootstrap.yaml 不应为空")
	assert.Positive(t, entry.GetVersion())
}

// TestConfigCenterV2_WatchKeysSmoke 验收 v2 流式 RPC:WatchKeys 建流后
// 服务端先推快照。这条链路在 v1 时代没有日志与流式验收覆盖,是迁移补上的盲区。
func TestConfigCenterV2_WatchKeysSmoke(t *testing.T) {
	tok := token(t)
	client := newClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	stream, err := client.WatchKeys(tokenContext(ctx, tok), &configv1.WatchKeysRequest{
		Namespace:   namespace,
		Environment: environment,
		Keys:        []string{key},
	})
	require.NoError(t, err, "建流失败")
	defer func() { _ = stream.Close() }()

	// v2 生成流的 Receive 无参,返回 (消息, error)。
	type recvResult struct {
		msg *configv1.WatchKeysResponse
		err error
	}
	ch := make(chan recvResult, 1)
	go func() {
		msg, err := stream.Receive()
		ch <- recvResult{msg: msg, err: err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			t.Logf("流读取结束: %v", r.err)
		}
		require.NotNil(t, r.msg, "应收到至少一条快照/事件")
		assert.NotEmpty(t, r.msg.GetEntry().GetKey(), "快照应携带 entry")
	case <-time.After(15 * time.Second):
		t.Fatal("15s 内未收到任何 WatchKeys 消息")
	}
}
