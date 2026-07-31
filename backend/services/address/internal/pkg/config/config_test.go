package config

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hashicorp/consul/api"
	confv1 "github.com/lens077/ecommerce/backend/services/address/internal/conf/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testBootstrapYAML 模拟 Consul KV 里存的那一份完整配置。
// 含 duration 字段以覆盖 decodeConfig 的 duration 钩子 —— 它坏掉时不会报错,
// 只会让超时静默变成 0,是最难靠日志发现的一类故障。
const testBootstrapYAML = `
server:
  addr: "0.0.0.0:30001"
  http:
    read_timeout: 10s
    write_timeout: 20s
    idle_timeout: 1m30s
data:
  database:
    postgres:
      host: localhost
      port: 5432
      user: postgres
      db_name: ecommerce
discovery:
  consul:
    addr: 127.0.0.1:8500
    scheme: http
    health_check: true
`

// fakeConsulKV 模拟 Consul 的 KV HTTP 接口(GET /v1/kv/<path>)。
// 用真实的 consul api 客户端打这个桩,能连带覆盖客户端构造、路径拼接与 404 语义,
// 比 mock 掉整个 client 更接近线上行为。
type fakeConsulKV struct {
	// addr 形如 127.0.0.1:port,可直接塞进 CONSUL_ADDR
	addr string

	// httptest 每个连接一个 goroutine,并发用例下 handler 会同时写 lastPath,故加锁
	mu       sync.Mutex
	lastPath string
}

// LastPath 返回最后一次被请求的 KV 路径
func (f *fakeConsulKV) LastPath() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lastPath
}

func startFakeConsulKV(t *testing.T, kv map[string]string) *fakeConsulKV {
	t.Helper()

	f := &fakeConsulKV{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/v1/kv/")
		f.mu.Lock()
		f.lastPath = path
		f.mu.Unlock()

		value, ok := kv[path]
		if !ok {
			// Consul 对不存在的 key 返回 404,客户端据此给出 (nil, nil)
			w.WriteHeader(http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{{
			"LockIndex":   0,
			"Key":         path,
			"Flags":       0,
			"Value":       base64.StdEncoding.EncodeToString([]byte(value)),
			"CreateIndex": 1,
			"ModifyIndex": 1,
		}})
	}))
	t.Cleanup(server.Close)

	f.addr = strings.TrimPrefix(server.URL, "http://")
	return f
}

func newConsulClient(t *testing.T, addr string) *api.Client {
	t.Helper()
	cfg := api.DefaultConfig()
	cfg.Address = addr
	cfg.Scheme = "http"
	client, err := api.NewClient(cfg)
	require.NoError(t, err)
	return client
}

// useConsul 把配置读取指向桩服务
func useConsul(t *testing.T, f *fakeConsulKV, path string) {
	t.Helper()
	t.Setenv("CONSUL_ADDR", f.addr)
	t.Setenv("CONSUL_PATH", path)
	t.Setenv("CONSUL_SCHEME", "http")
	t.Setenv("CONSUL_TOKEN", "")
}

func TestParseYAMLToMap(t *testing.T) {
	got, err := parseYAMLToMap([]byte(testBootstrapYAML))
	require.NoError(t, err)

	server, ok := got["server"].(map[string]any)
	require.True(t, ok, "server 应被解析为嵌套 map")
	assert.Equal(t, "0.0.0.0:30001", server["addr"])
}

func TestParseYAMLToMap_Invalid(t *testing.T) {
	_, err := parseYAMLToMap([]byte("server:\n\taddr: bad-tab-indent"))
	require.Error(t, err)
}

func TestDecodeConfig(t *testing.T) {
	raw, err := parseYAMLToMap([]byte(testBootstrapYAML))
	require.NoError(t, err)

	got := &confv1.Bootstrap{}
	require.NoError(t, decodeConfig(raw, got))

	require.NotNil(t, got.Server)
	assert.Equal(t, "0.0.0.0:30001", got.Server.Addr)

	require.NotNil(t, got.Data)
	require.NotNil(t, got.Data.Database)
	require.NotNil(t, got.Data.Database.Postgres)
	assert.Equal(t, "localhost", got.Data.Database.Postgres.Host)
	assert.Equal(t, uint32(5432), got.Data.Database.Postgres.Port)
	assert.Equal(t, "ecommerce", got.Data.Database.Postgres.DbName)

	require.NotNil(t, got.Discovery)
	assert.Equal(t, "127.0.0.1:8500", got.Discovery.Consul.Addr)
	assert.True(t, got.Discovery.Consul.HealthCheck)
}

// YAML 里的 "10s" 是字符串,protobuf 侧是 *durationpb.Duration,靠 decodeConfig
// 里的 stringToProtoDurationHook 搭桥。
func TestDecodeConfig_DurationHook(t *testing.T) {
	raw, err := parseYAMLToMap([]byte(testBootstrapYAML))
	require.NoError(t, err)

	got := &confv1.Bootstrap{}
	require.NoError(t, decodeConfig(raw, got))

	require.NotNil(t, got.Server.Http)
	assert.Equal(t, 10*time.Second, got.Server.Http.ReadTimeout.AsDuration())
	assert.Equal(t, 20*time.Second, got.Server.Http.WriteTimeout.AsDuration())
	assert.Equal(t, 90*time.Second, got.Server.Http.IdleTimeout.AsDuration())
}

func TestDecodeConfig_InvalidDuration(t *testing.T) {
	raw, err := parseYAMLToMap([]byte("server:\n  http:\n    read_timeout: 10 seconds\n"))
	require.NoError(t, err)

	require.Error(t, decodeConfig(raw, &confv1.Bootstrap{}))
}

// 未知字段应被忽略而不是报错:KV 里多一个本服务还没用上的键,不该让服务起不来
func TestDecodeConfig_IgnoresUnknownFields(t *testing.T) {
	raw, err := parseYAMLToMap([]byte("server:\n  addr: \":1\"\nnot_a_real_section:\n  foo: bar\n"))
	require.NoError(t, err)

	got := &confv1.Bootstrap{}
	require.NoError(t, decodeConfig(raw, got))
	assert.Equal(t, ":1", got.Server.Addr)
}

func TestGetConfigFromConsul(t *testing.T) {
	const path = "ecommerce/address/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: testBootstrapYAML})

	got, err := GetConfigFromConsul(newConsulClient(t, f.addr), path)
	require.NoError(t, err)

	server := got["server"].(map[string]any)
	assert.Equal(t, "0.0.0.0:30001", server["addr"])
	assert.Equal(t, path, f.LastPath(), "应当读传入的 path")
}

func TestGetConfigFromConsul_KeyNotFound(t *testing.T) {
	f := startFakeConsulKV(t, map[string]string{})

	_, err := GetConfigFromConsul(newConsulClient(t, f.addr), "ecommerce/address/missing.yml")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ecommerce/address/missing.yml")
}

// key 存在但值为空,和不存在一样致命:让服务带着空 Bootstrap 起来更难查
func TestGetConfigFromConsul_EmptyValue(t *testing.T) {
	const path = "ecommerce/address/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: ""})

	_, err := GetConfigFromConsul(newConsulClient(t, f.addr), path)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "empty")
}

func TestGetConfigFromConsul_Unreachable(t *testing.T) {
	// 127.0.0.1:1 没有监听者,连接会立即被拒绝(比不可达地址的超时快)
	_, err := GetConfigFromConsul(newConsulClient(t, "127.0.0.1:1"), "ecommerce/address/dev.yml")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "consul kv get failed")
}

func TestInit(t *testing.T) {
	const path = "ecommerce/address/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: testBootstrapYAML})
	useConsul(t, f, path)

	got, err := Init(context.Background())
	require.NoError(t, err)
	require.NotNil(t, got)

	assert.Equal(t, "0.0.0.0:30001", got.Server.Addr)
	assert.Equal(t, 10*time.Second, got.Server.Http.ReadTimeout.AsDuration())
	// Init 之后 GetConfig 必须返回同一份,而不是初始空值
	assert.Same(t, got, GetConfig())
}

// Consul 不可达时 Init 必须返回错误让进程起不来,而不是留着空配置继续跑
func TestInit_Unreachable(t *testing.T) {
	t.Setenv("CONSUL_ADDR", "127.0.0.1:1")
	t.Setenv("CONSUL_PATH", "ecommerce/address/dev.yml")
	t.Setenv("CONSUL_SCHEME", "http")

	got, err := Init(context.Background())
	assert.Nil(t, got)
	require.Error(t, err)
}

func TestInit_InvalidYAML(t *testing.T) {
	const path = "ecommerce/address/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: "server:\n\taddr: tab"})
	useConsul(t, f, path)

	got, err := Init(context.Background())
	assert.Nil(t, got)
	require.Error(t, err)
}

// GetConfig 会被各 fx 组件在启动期并发读,Init 在同期写。
// 本用例在 -race 下才有意义:它守的是 confMu 别被将来的改动误删。
func TestGetConfig_ConcurrentWithInit(t *testing.T) {
	const path = "ecommerce/address/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: testBootstrapYAML})
	useConsul(t, f, path)

	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			for range 50 {
				assert.NotNil(t, GetConfig())
			}
		})
	}
	for range 4 {
		wg.Go(func() {
			_, _ = Init(context.Background())
		})
	}
	wg.Wait()

	assert.NotNil(t, GetConfig())
}

func TestModule(t *testing.T) {
	require.NotNil(t, Module)
	assert.Contains(t, Module.String(), "config")
}
