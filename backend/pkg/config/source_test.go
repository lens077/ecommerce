package config

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func clearSourceEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		constants.EnvConfigSource,
		constants.EnvConfigFile,
		constants.EnvConfigSourceFile,
	} {
		t.Setenv(key, "")
	}
}

func TestNewSourceRequiresSelector(t *testing.T) {
	clearSourceEnv(t)
	source, err := NewSource()
	assert.Nil(t, source)
	require.Error(t, err)
	assert.Contains(t, err.Error(), constants.EnvConfigSourceFile)
}

func TestNewSourceSelectsFileProvider(t *testing.T) {
	clearSourceEnv(t)
	path := filepath.Join(t.TempDir(), "bootstrap.yaml")
	require.NoError(t, os.WriteFile(path, []byte("value: local\n"), 0o600))
	t.Setenv(constants.EnvConfigSource, constants.ConfigSourceFile)
	t.Setenv(constants.EnvConfigFile, path)

	source, err := NewSource()
	require.NoError(t, err)
	assert.Equal(t, constants.ConfigSourceFile, source.Name())
	_, watchable := source.(Watcher)
	assert.False(t, watchable, "file provider must remain startup-only")

	raw, err := source.Load(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "local", raw["value"])
}

func TestNewSourceSelectsSDKProvider(t *testing.T) {
	clearSourceEnv(t)
	selector := filepath.Join(t.TempDir(), "source.yaml")
	require.NoError(t, os.WriteFile(selector, []byte("type: config_center\nconfig_center:\n  address: http://config-center:30010\n  namespace: test\n  environment: dev\n  key: bootstrap.yaml\n"), 0o600))
	t.Setenv(constants.EnvConfigSourceFile, selector)

	source, err := NewSource()
	require.NoError(t, err)
	assert.Equal(t, "config_center", source.Name())
	_, watchable := source.(Watcher)
	assert.True(t, watchable, "Config Center provider must expose Watcher")
}

func TestNewSourceRejectsDeprecatedAndUnknownValues(t *testing.T) {
	for _, value := range []string{constants.ConfigSourceConfigCenter, "etcd"} {
		t.Run(value, func(t *testing.T) {
			clearSourceEnv(t)
			t.Setenv(constants.EnvConfigSource, value)
			source, err := NewSource()
			assert.Nil(t, source)
			require.Error(t, err)
			assert.Contains(t, err.Error(), constants.EnvConfigSourceFile)
		})
	}
}

func TestParseYAMLToMap(t *testing.T) {
	raw, err := parseYAMLToMap([]byte("server:\n  addr: 0.0.0.0:30006\n"))
	require.NoError(t, err)
	server, ok := raw["server"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "0.0.0.0:30006", server["addr"])

	_, err = parseYAMLToMap([]byte("server:\n\taddr: invalid"))
	require.Error(t, err)
}
