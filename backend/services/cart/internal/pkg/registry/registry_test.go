package registry

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hashicorp/consul/api"
	"github.com/lens077/ecommerce/backend/services/cart/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/cart/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/meta"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/fx/fxtest"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest"
	"google.golang.org/protobuf/types/known/durationpb"
)

var testAppInfo = meta.AppInfo{
	ID:          "cart-test-id",
	Name:        "cart-service",
	Host:        "10.0.0.7",
	Environment: "dev",
	Version:     "v1.2.3",
}

// newConf 造一份注册流程会读到的最小 Bootstrap。
// pingInterval 取毫秒级,好让心跳用例在几十毫秒内跑完。
func newConf(serverAddr string, pingInterval time.Duration) *confv1.Bootstrap {
	return &confv1.Bootstrap{
		Server: &confv1.Server{Addr: serverAddr},
		Discovery: &confv1.Discovery{
			Consul: &confv1.Discovery_Consul{
				Scheme: constants.ConsulScheme,
				Check: &confv1.Discovery_Consul_Check{
					Ttl: &confv1.Discovery_Consul_Check_TTL{
						Duration:     "30s",
						PingInterval: durationpb.New(pingInterval),
					},
					DeregisterCriticalServiceAfter: "1m",
				},
			},
		},
	}
}

// fakeConsulAgent 模拟 Consul Agent 的三个 HTTP 端点(注册/心跳/注销)。
// 用真实的 consul api 客户端打这个桩,连带覆盖了客户端构造、URL 拼接与请求体序列化 ——
// 直接 mock 掉 client 就看不到 "service:<ID>" 这类只在线上才暴露的格式错误了。
type fakeConsulAgent struct {
	// addr 形如 127.0.0.1:port,可直接传给 NewConsulRegistry
	addr string

	// httptest 每个连接一个 goroutine,心跳用例下 handler 与断言并发,故加锁
	mu           sync.Mutex
	registered   *api.AgentServiceRegistration
	ttlCheckIDs  []string
	deregistered []string
}

func (f *fakeConsulAgent) Registered() *api.AgentServiceRegistration {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.registered
}

func (f *fakeConsulAgent) TTLUpdates() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.ttlCheckIDs...)
}

func (f *fakeConsulAgent) Deregistered() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.deregistered...)
}

func startFakeConsulAgent(t *testing.T) *fakeConsulAgent {
	t.Helper()

	f := &fakeConsulAgent{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/agent/service/register":
			reg := &api.AgentServiceRegistration{}
			if err := json.NewDecoder(r.Body).Decode(reg); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			f.mu.Lock()
			f.registered = reg
			f.mu.Unlock()

		case strings.HasPrefix(r.URL.Path, "/v1/agent/check/update/"):
			f.mu.Lock()
			f.ttlCheckIDs = append(f.ttlCheckIDs, strings.TrimPrefix(r.URL.Path, "/v1/agent/check/update/"))
			f.mu.Unlock()

		case strings.HasPrefix(r.URL.Path, "/v1/agent/service/deregister/"):
			f.mu.Lock()
			f.deregistered = append(f.deregistered, strings.TrimPrefix(r.URL.Path, "/v1/agent/service/deregister/"))
			f.mu.Unlock()

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)

	f.addr = strings.TrimPrefix(server.URL, "http://")
	return f
}

// newRegistry 建一个指向桩 Agent 的 ConsulRegistry
func newRegistry(t *testing.T, addr string) *ConsulRegistry {
	t.Helper()
	reg, err := NewConsulRegistry(addr, testAppInfo.ID, testAppInfo.Name, WithLogger(zaptest.NewLogger(t)))
	require.NoError(t, err)
	return reg
}

func TestNewConsulRegistry(t *testing.T) {
	logger := zaptest.NewLogger(t)
	reg, err := NewConsulRegistry("localhost:8500", "test-id", "test-service", WithLogger(logger))
	require.NoError(t, err)
	require.NotNil(t, reg)

	assert.Equal(t, "test-id", reg.ID)
	assert.Equal(t, "test-service", reg.Name)
	assert.Equal(t, "localhost:8500", reg.Addr)
}

// 地址格式非法不该在构造期报错:consul 客户端是懒连接的,错误要留到真正请求时才暴露,
// 否则 Consul 暂时不可用会直接拖垮进程启动。
func TestNewConsulRegistry_InvalidAddrStillConstructs(t *testing.T) {
	reg, err := NewConsulRegistry("invalid-addr", "test-id", "test-service", WithLogger(zaptest.NewLogger(t)))
	require.NoError(t, err)
	assert.NotNil(t, reg)
}

func TestNewConsulRegistry_WithTLS(t *testing.T) {
	reg, err := NewConsulRegistry("localhost:8500", "test-id", "test-service",
		WithLogger(zaptest.NewLogger(t)), WithTLS(true, ""))
	require.NoError(t, err)
	assert.NotNil(t, reg)
}

func TestNewConsulRegistry_NoOptions(t *testing.T) {
	assert.NotPanics(t, func() {
		_, _ = NewConsulRegistry("localhost:8500", "test-id", "test-name")
	})
}

func TestWithLogger(t *testing.T) {
	logger := zaptest.NewLogger(t)
	o := &options{}
	WithLogger(logger)(o)
	assert.Equal(t, logger, o.logger)
}

// WithTLS 必须同时改 scheme,否则会拿 https 的证书去发 http 请求
func TestWithTLS(t *testing.T) {
	o := &options{}
	WithTLS(true, "test-ca-pem")(o)

	require.NotNil(t, o.tlsConf)
	assert.True(t, o.tlsConf.InsecureSkipVerify)
	assert.Equal(t, "test-ca-pem", string(o.tlsConf.CAPem))

}

// CA PEM 解析不了必须在构造期就报错:带着一份坏证书跑起来,
// 到第一次请求才失败,排查成本高得多。
func TestNewConsulRegistry_InvalidCAPem(t *testing.T) {
	reg, err := NewConsulRegistry("localhost:8500", "id", "name",
		WithLogger(zaptest.NewLogger(t)), WithTLS(false, "not-a-pem"))
	require.Error(t, err)
	assert.Nil(t, reg)
	assert.Contains(t, err.Error(), "PEM")
}

func TestModule(t *testing.T) {
	require.NotNil(t, Module)
	assert.Contains(t, Module.String(), "registry")
}

// newModuleApp 用给定配置装配 Module,把解析出的 registry 写进 out
func newModuleApp(t *testing.T, conf *confv1.Bootstrap, out **ConsulRegistry) *fxtest.App {
	t.Helper()
	return fxtest.New(t,
		fx.NopLogger,
		fx.Supply(conf, testAppInfo, zaptest.NewLogger(t)),
		Module,
		fx.Populate(out),
	)
}

// Module 走一遍真实的 fx 生命周期:启动时注册 + 起心跳,停止时注销。
// 这是线上唯一会执行的路径,单测 Register/Deregister 覆盖不到二者的接线。
func TestModule_RegistersOnStartAndDeregistersOnStop(t *testing.T) {
	agent := startFakeConsulAgent(t)
	conf := newConf("0.0.0.0:30006", 5*time.Millisecond)
	conf.Discovery.Consul.Addr = agent.addr

	var reg *ConsulRegistry
	app := newModuleApp(t, conf, &reg)

	app.RequireStart()
	require.NotNil(t, reg)
	assert.NotNil(t, agent.Registered(), "OnStart 应完成注册")
	require.Eventually(t, func() bool {
		return len(agent.TTLUpdates()) > 0
	}, time.Second, 5*time.Millisecond, "OnStart 应拉起 TTL 心跳")

	app.RequireStop()
	assert.Equal(t, []string{testAppInfo.ID}, agent.Deregistered())
}

// 配置里没有 tls 段是常态(本地/内网集群都不开 TLS),不能因此 panic
func TestModule_WithoutTLSConfig(t *testing.T) {
	agent := startFakeConsulAgent(t)
	conf := newConf("0.0.0.0:30006", time.Second)
	conf.Discovery.Consul.Addr = agent.addr
	require.Nil(t, conf.Discovery.Consul.Tls)

	var reg *ConsulRegistry
	app := newModuleApp(t, conf, &reg)
	require.NoError(t, app.Err())
	assert.NotNil(t, reg)
}

// 关掉服务发现时 Module 返回 (nil, nil) 让 fx 继续装配 —— 本地起单个服务调试时用得上
func TestModule_Disabled(t *testing.T) {
	withAddr := func(addr string) *confv1.Bootstrap {
		c := newConf("0.0.0.0:30006", time.Second)
		c.Discovery.Consul.Addr = addr
		return c
	}
	noDiscovery := newConf("0.0.0.0:30006", time.Second)
	noDiscovery.Discovery = nil

	cases := []struct {
		name       string
		conf       *confv1.Bootstrap
		envDisable bool
	}{
		{"env disabled", withAddr("127.0.0.1:8500"), true},
		{"no discovery section", noDiscovery, false},
		{"empty consul addr", withAddr(""), false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.envDisable {
				t.Setenv(constants.EnvConsulEnabled, "false")
			}

			var reg *ConsulRegistry
			app := newModuleApp(t, c.conf, &reg)
			require.NoError(t, app.Err())
			assert.Nil(t, reg, "服务发现关闭时不应产出 registry")

			// 生命周期钩子也不能因为 reg 为 nil 就炸
			app.RequireStart()
			app.RequireStop()
		})
	}
}

// 注册报文里的每个字段都有实际后果:端口取自 conf.Server.Addr(不是 Consul 的地址),
// 地址取自 AppInfo.Host,TTL/自动注销时间取自配置 —— 错一个就是"注册成功但流量打不进来"。
func TestRegister(t *testing.T) {
	agent := startFakeConsulAgent(t)
	reg := newRegistry(t, agent.addr)
	conf := newConf("0.0.0.0:30006", time.Second)

	require.NoError(t, reg.Register(conf, testAppInfo))

	got := agent.Registered()
	require.NotNil(t, got)
	assert.Equal(t, testAppInfo.ID, got.ID)
	assert.Equal(t, testAppInfo.Name, got.Name)
	assert.Equal(t, testAppInfo.Host, got.Address, "注册的应是服务自己的地址,而不是 Consul 的")
	assert.Equal(t, 30006, got.Port)
	assert.ElementsMatch(t, []string{testAppInfo.Version, constants.ConsulTagFx, constants.ConsulTagTtl}, got.Tags)

	require.NotNil(t, got.Check)
	assert.Equal(t, "30s", got.Check.TTL)
	assert.Equal(t, "1m", got.Check.DeregisterCriticalServiceAfter)
	// TTL 检查不能同时带 HTTP/TCP 检查,否则 Consul 会按后者探活
	assert.Empty(t, got.Check.HTTP)
	assert.Empty(t, got.Check.TCP)
}

func TestRegister_BadServerAddr(t *testing.T) {
	cases := []struct {
		name string
		addr string
	}{
		{"missing port", "0.0.0.0"},
		{"non-numeric port", "0.0.0.0:http"},
		{"empty", ""},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			agent := startFakeConsulAgent(t)
			reg := newRegistry(t, agent.addr)

			require.Error(t, reg.Register(newConf(c.addr, time.Second), testAppInfo))
			// 端口都解析不出来就不该发出注册请求
			assert.Nil(t, agent.Registered())
		})
	}
}

// Agent 不可达时 Register 必须返回错误,让上层决定是降级还是退出
func TestRegister_AgentUnreachable(t *testing.T) {
	// 127.0.0.1:1 没有监听者,连接会立即被拒绝(比超时地址快)
	reg := newRegistry(t, "127.0.0.1:1")
	require.Error(t, reg.Register(newConf("0.0.0.0:30006", time.Second), testAppInfo))
}

// CheckID 必须是 "service:<ID>" —— Consul Agent 对 TTL 检查就认这个前缀,
// 格式写错时心跳会一直 404,服务在几十秒后被判 critical 摘流量。
func TestTtlCheckPinger_UpdatesTTL(t *testing.T) {
	agent := startFakeConsulAgent(t)
	reg := newRegistry(t, agent.addr)
	conf := newConf("0.0.0.0:30006", 5*time.Millisecond)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		reg.TtlCheckPinger(ctx, conf)
	}()

	require.Eventually(t, func() bool {
		return len(agent.TTLUpdates()) > 0
	}, time.Second, 5*time.Millisecond, "应周期性发送 TTL 心跳")

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("context 取消后 pinger 应立刻退出")
	}

	for _, id := range agent.TTLUpdates() {
		assert.Equal(t, "service:"+testAppInfo.ID, id)
	}
}

// 心跳发不出去只记日志、不退出:网络抖动不该让服务永久失去心跳能力
func TestTtlCheckPinger_SurvivesAgentErrors(t *testing.T) {
	reg := newRegistry(t, "127.0.0.1:1")
	conf := newConf("0.0.0.0:30006", 5*time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		reg.TtlCheckPinger(ctx, conf)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("pinger 不应因 Agent 不可达而卡死")
	}
}

// Deregister 必须先掐掉心跳再摘节点:反过来的话心跳会把刚注销的服务又"救活"
func TestDeregister_StopsPingerFirst(t *testing.T) {
	agent := startFakeConsulAgent(t)
	reg := newRegistry(t, agent.addr)
	conf := newConf("0.0.0.0:30006", 5*time.Millisecond)

	require.NoError(t, reg.Register(conf, testAppInfo))

	pingCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	reg.cancelPing = cancel

	done := make(chan struct{})
	go func() {
		defer close(done)
		reg.TtlCheckPinger(pingCtx, conf)
	}()

	require.Eventually(t, func() bool {
		return len(agent.TTLUpdates()) > 0
	}, time.Second, 5*time.Millisecond)

	require.NoError(t, reg.Deregister())

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Deregister 应取消心跳 goroutine")
	}
	assert.Equal(t, []string{testAppInfo.ID}, agent.Deregistered())

	// 注销之后不能再有心跳飘出来
	before := len(agent.TTLUpdates())
	time.Sleep(30 * time.Millisecond)
	assert.Equal(t, before, len(agent.TTLUpdates()))
}

// 没起过 pinger(cancelPing 为 nil)时 Deregister 也不能 panic:
// Register 失败的分支就会走到这里
func TestDeregister_WithoutPinger(t *testing.T) {
	agent := startFakeConsulAgent(t)
	reg := newRegistry(t, agent.addr)

	require.NoError(t, reg.Deregister())
	assert.Equal(t, []string{testAppInfo.ID}, agent.Deregistered())
}

func TestDeregister_AgentUnreachable(t *testing.T) {
	reg := newRegistry(t, "127.0.0.1:1")
	require.Error(t, reg.Deregister())
}

// logger 是 Register/Deregister 里第一行就用的依赖,忘了 WithLogger 会直接空指针 panic。
// 这条用例把这个前置条件钉住,免得将来有人把 Module 里的 WithLogger 拿掉。
func TestRegister_RequiresLogger(t *testing.T) {
	agent := startFakeConsulAgent(t)
	reg, err := NewConsulRegistry(agent.addr, testAppInfo.ID, testAppInfo.Name)
	require.NoError(t, err)
	assert.Nil(t, reg.logger)

	var _ *zap.Logger = reg.logger
	assert.Panics(t, func() {
		_ = reg.Register(newConf("0.0.0.0:30006", time.Second), testAppInfo)
	})
}
