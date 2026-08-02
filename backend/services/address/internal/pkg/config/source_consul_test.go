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

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeConsulKV 模拟 Consul 的 KV HTTP 接口(GET /v1/kv/<path>)。
// 用真实的 consul api 客户端打这个桩,能连带覆盖客户端构造、路径拼接与 404 语义,
// 比直接 mock 掉整个 client 更接近线上行为。
type fakeConsulKV struct {
	server *httptest.Server
	// addr 形如 127.0.0.1:port,可直接塞进 CONSUL_ADDR
	addr string

	// httptest 每个连接一个 goroutine,并发用例下 handler 会同时写 lastPath,故加锁
	mu sync.Mutex
	// lastPath 记录客户端实际请求的 KV 路径,用于断言 CONSUL_PATH 被正确使用
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
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	t.Cleanup(f.server.Close)

	f.addr = strings.TrimPrefix(f.server.URL, "http://")
	return f
}

// useConsulSource 把环境变量指向桩服务,返回构造好的数据源
func useConsulSource(t *testing.T, f *fakeConsulKV, path string) Source {
	t.Helper()
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceConsul)
	t.Setenv(constants.EnvConsulAddr, f.addr)
	t.Setenv(constants.EnvConsulPath, path)
	t.Setenv(constants.EnvConsulScheme, "http")

	src, err := NewSource()
	require.NoError(t, err)
	return src
}

func TestConsulSource_Load(t *testing.T) {
	const path = "ecommerce/cart/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: testBootstrapYAML})

	src := useConsulSource(t, f, path)
	got, err := src.Load(context.Background())
	require.NoError(t, err)

	server := got["server"].(map[string]any)
	assert.Equal(t, "0.0.0.0:30006", server["addr"])
	assert.Equal(t, path, f.LastPath(), "应当读 CONSUL_PATH 指定的 key")
}

func TestConsulSource_LoadKeyNotFound(t *testing.T) {
	f := startFakeConsulKV(t, map[string]string{})

	src := useConsulSource(t, f, "ecommerce/cart/missing.yml")
	_, err := src.Load(context.Background())
	require.Error(t, err)
	// 报错要同时带上 path 与 addr:线上最常见的错就是连错集群或写错路径
	assert.Contains(t, err.Error(), "ecommerce/cart/missing.yml")
	assert.Contains(t, err.Error(), f.addr)
}

func TestConsulSource_LoadEmptyValue(t *testing.T) {
	const path = "ecommerce/cart/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: ""})

	src := useConsulSource(t, f, path)
	_, err := src.Load(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "empty")
}

func TestConsulSource_LoadInvalidYAML(t *testing.T) {
	const path = "ecommerce/cart/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: "server:\n\taddr: tab"})

	src := useConsulSource(t, f, path)
	_, err := src.Load(context.Background())
	require.Error(t, err)
}

// Consul 不可达时必须报错返回,不能吞掉错误让服务带着空配置起来
func TestConsulSource_LoadUnreachable(t *testing.T) {
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceConsul)
	// 127.0.0.1:1 没有监听者,连接会立即被拒绝(比超时地址快)
	t.Setenv(constants.EnvConsulAddr, "127.0.0.1:1")
	t.Setenv(constants.EnvConsulPath, "ecommerce/cart/dev.yml")
	t.Setenv(constants.EnvConsulScheme, "http")

	src, err := NewSource()
	require.NoError(t, err)

	_, err = src.Load(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "consul kv get failed")
}

// Load 必须尊重传入的 context:启动阶段被取消时应立刻返回而不是干等
func TestConsulSource_LoadRespectsContext(t *testing.T) {
	const path = "ecommerce/cart/dev.yml"
	f := startFakeConsulKV(t, map[string]string{path: testBootstrapYAML})
	src := useConsulSource(t, f, path)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := src.Load(ctx)
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
}
