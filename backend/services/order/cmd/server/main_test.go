package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/go-connect-kit/meta"
	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/config"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/registry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// 只校验依赖图能不能解出来,不构造任何东西 —— 所以不需要数据库/Consul/配置中心。
//
// 装配错误(某个类型没人 provide、构造函数签名改了忘了改注入点)默认要等到
// fxApp.Start 才会暴露,而那时已经在连数据库了;这个测试把它提前到编译-测试阶段。
func TestAppOptions_GraphResolves(t *testing.T) {
	if err := fx.ValidateApp(appOptions("order-service", "dev", "v1")...); err != nil {
		t.Fatalf("fx dependency graph is not resolvable: %v", err)
	}
}

// Order previously read package globals in both registry construction and
// observability projection. This test executes the real Fx constructors and
// proves both consumers see the loaded file, never an empty pre-init snapshot.
func TestStartupConfigDependenciesReadLoadedBootstrap(t *testing.T) {
	contents := `
server:
  addr: "0.0.0.0:30103"
data:
  database:
    postgres:
      host: localhost
auth:
  casdoor:
    endpoint: "https://casdoor.example.com"
observability:
  enable: true
  trace:
    endpoint: trace-collector:4318
  metric:
    endpoint: metric-collector:4318
  log:
    endpoint: log-collector:4318
discovery:
  consul:
    addr: 127.0.0.1:1
    check:
      ttl:
        duration: 30s
        ping_interval: 10s
      deregister_critical_service_after: 1m
log:
  framework:
    format: json
    log_level: info
    error_level: error
  application:
    format: json
    level: info
`
	path := filepath.Join(t.TempDir(), "bootstrap.yaml")
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))
	t.Setenv(constants.EnvConfigSourceFile, "")
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceFile)
	t.Setenv(constants.EnvConfigFile, path)
	t.Setenv(constants.EnvConsulEnabled, "")

	var live *config.Live
	var observability *confv1.Observability
	var consulRegistry *registry.ConsulRegistry
	app := fx.New(
		fx.NopLogger,
		config.Module,
		fx.Provide(observabilityFromBootstrap),
		registry.Module,
		fx.Supply(meta.AppInfo{ID: "order-test", Name: "order-service"}, zap.NewNop()),
		fx.Populate(&live, &observability, &consulRegistry),
	)
	require.NoError(t, app.Err())
	require.NotNil(t, live)
	assert.Equal(t, "0.0.0.0:30103", live.Get().GetServer().GetAddr())
	require.NotNil(t, observability)
	assert.True(t, observability.GetEnable())
	assert.Equal(t, "trace-collector:4318", observability.GetTrace().GetEndpoint())
	require.NotNil(t, consulRegistry)
	assert.Equal(t, "127.0.0.1:1", consulRegistry.Addr)
}
