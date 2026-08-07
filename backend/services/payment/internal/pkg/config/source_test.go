package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clearSourceEnv 把所有影响选源的环境变量置空。
// env.GetEnvString 把空串当作「未设置」,故置空等价于 unsetenv,而 t.Setenv 会在
// 用例结束时自动还原 —— 无需 os.Clearenv 那种会污染整个进程的做法。
func clearSourceEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		constants.EnvConfigSource, constants.EnvConfigFile, constants.EnvConfigSourceFile,
		constants.EnvConsulAddr, constants.EnvConsulPath, constants.EnvConsulScheme, constants.EnvConsulToken,
		constants.EnvConfigCenterAddr, constants.EnvConfigCenterNamespace,
		constants.EnvConfigCenterEnv, constants.EnvConfigCenterKey, constants.EnvConfigCenterServiceToken,
	} {
		t.Setenv(k, "")
	}
}

func TestNewSource_DefaultIsConsul(t *testing.T) {
	clearSourceEnv(t)

	// 不设 CONFIG_SOURCE 时必须落到 Consul KV:现有部署清单一行不改也要能启动。
	src, err := NewSource()
	require.NoError(t, err)
	assert.Equal(t, constants.ConfigSourceConsul, src.Name())
}

func TestNewSource_Consul(t *testing.T) {
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceConsul)
	t.Setenv(constants.EnvConsulPath, "ecommerce/cart/dev.yml")

	src, err := NewSource()
	require.NoError(t, err)
	assert.Equal(t, constants.ConfigSourceConsul, src.Name())
}

func TestNewSource_SDKSelector(t *testing.T) {
	clearSourceEnv(t)
	businessConfig := filepath.Join(t.TempDir(), "cart.yaml")
	require.NoError(t, os.WriteFile(businessConfig, []byte(testBootstrapYAML), 0o600))
	selector := filepath.Join(t.TempDir(), "source.yaml")
	require.NoError(t, os.WriteFile(selector, []byte("type: file\nfile:\n  path: "+businessConfig+"\n"), 0o600))
	t.Setenv(constants.EnvConfigSourceFile, selector)

	src, err := NewSource()
	require.NoError(t, err)
	assert.Equal(t, "file", src.Name())
}

func TestNewSource_File(t *testing.T) {
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceFile)
	t.Setenv(constants.EnvConfigFile, "configs/dev.yaml")

	src, err := NewSource()
	require.NoError(t, err)
	assert.Equal(t, constants.ConfigSourceFile, src.Name())
}

func TestNewSource_DeprecatedConfigCenterEnvFailsFast(t *testing.T) {
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceConfigCenter)

	src, err := NewSource()
	assert.Nil(t, src)
	require.Error(t, err)
	assert.Contains(t, err.Error(), constants.EnvConfigSourceFile)
}

func TestNewSource_UnknownValue(t *testing.T) {
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSource, "etcd")

	src, err := NewSource()
	assert.Nil(t, src)
	require.Error(t, err)
	// 拼错值时不能静默回落到默认源 —— 那会让服务读到一份你以为早已换掉的配置
	assert.Contains(t, err.Error(), "etcd")
	assert.Contains(t, err.Error(), constants.ConfigSourceFile)
	assert.Contains(t, err.Error(), constants.ConfigSourceConsul)
	assert.Contains(t, err.Error(), constants.ConfigSourceConfigCenter)
}

func TestParseYAMLToMap(t *testing.T) {
	got, err := parseYAMLToMap([]byte(testBootstrapYAML))
	require.NoError(t, err)

	server, ok := got["server"].(map[string]any)
	require.True(t, ok, "server 应被解析为嵌套 map")
	assert.Equal(t, "0.0.0.0:30006", server["addr"])

	// viper 会把 key 统一小写,后续 mapstructure 按 json tag 匹配的正是小写下划线名
	data, ok := got["data"].(map[string]any)
	require.True(t, ok)
	pg := data["database"].(map[string]any)["postgres"].(map[string]any)
	assert.Equal(t, "localhost", pg["host"])
	assert.Equal(t, 5432, pg["port"])
}

func TestParseYAMLToMap_Invalid(t *testing.T) {
	_, err := parseYAMLToMap([]byte("server:\n\taddr: bad-tab-indent"))
	require.Error(t, err)
}

func TestParseYAMLToMap_Empty(t *testing.T) {
	// 空文档不是语法错误,但会解析出空 map;调用方(各 source)负责在取值时判空
	got, err := parseYAMLToMap(nil)
	require.NoError(t, err)
	assert.Empty(t, got)
}

// 两个实现必须都满足 Source 接口(编译期已由 var _ Source 保证,这里再做一次运行期确认)
func TestSourceNamesMatchConfigSourceValues(t *testing.T) {
	assert.Equal(t, constants.ConfigSourceFile, (&fileSource{}).Name())
	assert.Equal(t, constants.ConfigSourceConsul, (&consulSource{}).Name())
	// Name() 的返回值就是 CONFIG_SOURCE 的合法取值,不能带空格/大写
	assert.Equal(t, strings.ToLower((&consulSource{}).Name()), (&consulSource{}).Name())
}
