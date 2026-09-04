package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/lens077/ecommerce/backend/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/address/internal/conf/v1"
	sharedconfig "github.com/lens077/go-connect-kit/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
auth:
  casdoor:
    endpoint: "https://casdoor.example.com"
log:
  framework:
    format: console
    log_level: debug
    error_level: error
  application:
    format: console
    level: debug
`

func loadFromFile(t *testing.T, contents string) (*sharedconfig.Live[*confv1.Bootstrap], error) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "bootstrap.yaml")
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))
	t.Setenv(constants.EnvConfigFile, path)
	source, err := sharedconfig.NewFileSource(path)
	require.NoError(t, err)
	return sharedconfig.New[*confv1.Bootstrap](source)
}

func TestAdapterLoadsAndValidatesAddressBootstrap(t *testing.T) {
	live, err := loadFromFile(t, testBootstrapYAML)
	require.NoError(t, err)
	bootstrap := live.Get()
	assert.Equal(t, "0.0.0.0:30006", bootstrap.GetServer().GetAddr())
	assert.Equal(t, 10*time.Second, bootstrap.GetServer().GetHttp().GetReadTimeout().AsDuration())
	assert.Equal(t, constants.ConfigSourceFile, live.SourceName())
}

func TestAdapterRejectsUnknownKeys(t *testing.T) {
	live, err := loadFromFile(t, testBootstrapYAML+"unknown_section:\n  value: true\n")
	assert.Nil(t, live)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown_section")
}

func TestAdapterRejectsMissingRequiredSection(t *testing.T) {
	withoutLog := `
server:
  addr: "0.0.0.0:30006"
data:
  database:
    postgres:
      host: localhost
auth:
  casdoor:
    endpoint: "https://casdoor.example.com"
`
	live, err := loadFromFile(t, withoutLog)
	assert.Nil(t, live)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "log")
}

func TestRestartRequiredSections(t *testing.T) {
	bootstrap := &confv1.Bootstrap{
		Server:        &confv1.Server{},
		Discovery:     &confv1.Discovery{},
		Observability: &confv1.Observability{},
	}
	sections := restartRequiredSections(bootstrap)
	require.Len(t, sections, 3)
	assert.Equal(t, []string{"server", "discovery", "observability"},
		[]string{sections[0].Name, sections[1].Name, sections[2].Name})
}
