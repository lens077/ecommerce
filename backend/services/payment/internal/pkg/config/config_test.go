package config

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	configv1 "github.com/lens077/config-center/api/config/v1"
	"github.com/lens077/ecommerce/backend/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/payment/internal/conf/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testBootstrapYAML 是配置加载测试共用的样例，含 duration 字段以覆盖解码钩子。
const testBootstrapYAML = `
server:
  addr: "0.0.0.0:30006"
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

func TestDecodeConfig(t *testing.T) {
	raw, err := parseYAMLToMap([]byte(testBootstrapYAML))
	require.NoError(t, err)

	got := &confv1.Bootstrap{}
	require.NoError(t, decodeConfig(raw, got))

	require.NotNil(t, got.Server)
	assert.Equal(t, "0.0.0.0:30006", got.Server.Addr)

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

// YAML 里的 "10s" 是字符串,protobuf 侧是 *durationpb.Duration,
// 靠 decodeConfig 里的 stringToProtoDurationHook 搭桥 —— 这块坏了服务会静默用零超时。
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

	err = decodeConfig(raw, &confv1.Bootstrap{})
	require.Error(t, err)
}

// 未知字段应被忽略而不是报错:配置中心里多一个还没被本服务用上的键,不该让服务起不来
func TestDecodeConfig_IgnoresUnknownFields(t *testing.T) {
	raw, err := parseYAMLToMap([]byte("server:\n  addr: \":1\"\nnot_a_real_section:\n  foo: bar\n"))
	require.NoError(t, err)

	got := &confv1.Bootstrap{}
	require.NoError(t, decodeConfig(raw, got))
	assert.Equal(t, ":1", got.Server.Addr)
}

func TestInit_FromConfigCenter(t *testing.T) {
	_, addr := startFakeConfigService(t, map[string]*configv1.ConfigEntry{
		"cart/dev/bootstrap.yaml": {Value: testBootstrapYAML},
	})
	useConfigCenterSource(t, addr, "cart", "dev", "bootstrap.yaml")

	got, err := Init(context.Background())
	require.NoError(t, err)
	require.NotNil(t, got)

	assert.Equal(t, "0.0.0.0:30006", got.Server.Addr)
	assert.Equal(t, 10*time.Second, got.Server.Http.ReadTimeout.AsDuration())
	assert.Equal(t, "config_center", SourceName())
	assert.Same(t, got, GetConfig())
}

func TestInit_FromFile(t *testing.T) {
	path := t.TempDir() + "/bootstrap.yaml"
	require.NoError(t, os.WriteFile(path, []byte(testBootstrapYAML), 0o600))
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceFile)
	t.Setenv(constants.EnvConfigFile, path)

	got, err := Init(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "0.0.0.0:30006", got.Server.Addr)
	assert.Equal(t, constants.ConfigSourceFile, SourceName())
}

func TestInit_UnknownSourceFailsFast(t *testing.T) {
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, "nacos")

	got, err := Init(context.Background())
	assert.Nil(t, got)
	require.Error(t, err)
}

// 数据源不可达时 Init 必须返回错误,让进程起不来 —— 而不是留着上一份配置继续跑
func TestInit_SourceUnreachable(t *testing.T) {
	useConfigCenterSource(t, "http://127.0.0.1:1", "cart", "pre", "bootstrap.yaml")

	got, err := Init(context.Background())
	assert.Nil(t, got)
	require.Error(t, err)
}

func TestInit_DecodeErrorMentionsSource(t *testing.T) {
	_, addr := startFakeConfigService(t, map[string]*configv1.ConfigEntry{
		"cart/pre/bootstrap.yaml": {Value: "server:\n  http:\n    read_timeout: not-a-duration\n"},
	})
	useConfigCenterSource(t, addr, "cart", "pre", "bootstrap.yaml")

	got, err := Init(context.Background())
	assert.Nil(t, got)
	require.Error(t, err)
	// 解析失败时要说清是哪个源的配置坏了
	assert.Contains(t, err.Error(), "config_center")
}

// GetConfig/SourceName 会被各 fx 组件在启动期并发读,Init 在同期写。
// 本用例在 -race 下才有意义:它守的是 confMu 别被将来的改动误删。
func TestGetConfig_ConcurrentWithInit(t *testing.T) {
	_, addr := startFakeConfigService(t, map[string]*configv1.ConfigEntry{
		"cart/pre/bootstrap.yaml": {Value: testBootstrapYAML},
	})
	useConfigCenterSource(t, addr, "cart", "pre", "bootstrap.yaml")

	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			for range 50 {
				assert.NotNil(t, GetConfig())
				_ = SourceName()
			}
		})
	}

	for range 4 {
		wg.Go(func() {
			_, _ = Init(context.Background())
		})
	}

	wg.Wait()
	assert.Equal(t, "config_center", SourceName())
}

func TestModule(t *testing.T) {
	require.NotNil(t, Module)
	assert.Contains(t, Module.String(), "config")
}
