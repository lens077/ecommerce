package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"buf.build/go/protovalidate"
	"github.com/lens077/ecommerce/backend/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
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
discovery:
  consul:
    addr: 127.0.0.1:8500
    scheme: http
    health_check: true
auth:
  casdoor:
    endpoint: "https://casdoor.example.com"
search:
  catalog:
    endpoint: "http://127.0.0.1:9200"
    api_key: "0123456789abcdef"
    index: ecommerce_catalog_products
log:
  framework:
    format: console
    log_level: debug
    error_level: error
  application:
    format: console
    level: debug
`

func loadPath(t *testing.T, path string) (*sharedconfig.Live[*confv1.Bootstrap], error) {
	t.Helper()
	t.Setenv(constants.EnvConfigFile, path)
	source, err := sharedconfig.NewFileSource(path)
	require.NoError(t, err)
	return sharedconfig.New[*confv1.Bootstrap](source)
}

func loadContents(t *testing.T, contents string) (*sharedconfig.Live[*confv1.Bootstrap], error) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "bootstrap.yaml")
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))
	return loadPath(t, path)
}

func TestAdapterLoadsAndValidatesSearchBootstrap(t *testing.T) {
	live, err := loadContents(t, testBootstrapYAML)
	require.NoError(t, err)
	bootstrap := live.Get()
	assert.Equal(t, "0.0.0.0:30006", bootstrap.GetServer().GetAddr())
	assert.Equal(t, 10*time.Second, bootstrap.GetServer().GetHttp().GetReadTimeout().AsDuration())
	assert.Equal(t, "http://127.0.0.1:9200", bootstrap.GetSearch().GetCatalog().GetEndpoint())
	assert.Equal(t, constants.ConfigSourceFile, live.SourceName())
}

func TestExampleConfigDecodeAndValidate(t *testing.T) {
	path := filepath.Join("..", "..", "..", "configs", "config.yml.example")
	live, err := loadPath(t, path)
	require.NoError(t, err)
	assert.NotEmpty(t, live.Get().GetSearch().GetCatalog().GetEndpoint())
}

func TestValidateBootstrapSearchCatalogAuthentication(t *testing.T) {
	decode := func(t *testing.T) *confv1.Bootstrap {
		t.Helper()
		live, err := loadContents(t, testBootstrapYAML)
		require.NoError(t, err)
		return live.Get()
	}

	t.Run("api key", func(t *testing.T) {
		require.NoError(t, protovalidate.Validate(decode(t)))
	})
	t.Run("basic auth", func(t *testing.T) {
		conf := decode(t)
		conf.Search.Catalog.ApiKey = ""
		conf.Search.Catalog.Username = "elastic"
		conf.Search.Catalog.Password = "secret"
		require.NoError(t, protovalidate.Validate(conf))
	})
	t.Run("missing credentials", func(t *testing.T) {
		conf := decode(t)
		conf.Search.Catalog.ApiKey = ""
		require.Error(t, protovalidate.Validate(conf))
	})
	t.Run("both auth modes", func(t *testing.T) {
		conf := decode(t)
		conf.Search.Catalog.Username = "elastic"
		conf.Search.Catalog.Password = "secret"
		require.Error(t, protovalidate.Validate(conf))
	})
	t.Run("username without password", func(t *testing.T) {
		conf := decode(t)
		conf.Search.Catalog.ApiKey = ""
		conf.Search.Catalog.Username = "elastic"
		require.Error(t, protovalidate.Validate(conf))
	})
	t.Run("non-http endpoint", func(t *testing.T) {
		conf := decode(t)
		conf.Search.Catalog.Endpoint = "ftp://search.example.test"
		require.Error(t, protovalidate.Validate(conf))
	})
	t.Run("unsafe index name", func(t *testing.T) {
		conf := decode(t)
		conf.Search.Catalog.Index = "Catalog Products"
		require.Error(t, protovalidate.Validate(conf))
	})
}

func TestAdapterRejectsInvalidDuration(t *testing.T) {
	contents := testBootstrapYAML + "\nserver:\n  http:\n    read_timeout: 10 seconds\n"
	live, err := loadContents(t, contents)
	assert.Nil(t, live)
	require.Error(t, err)
}

func TestAdapterRejectsUnknownKeys(t *testing.T) {
	live, err := loadContents(t, testBootstrapYAML+"unknown_section:\n  value: true\n")
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
search:
  catalog:
    endpoint: "http://127.0.0.1:9200"
    api_key: "0123456789abcdef"
    index: ecommerce_catalog_products
`
	live, err := loadContents(t, withoutLog)
	assert.Nil(t, live)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "log")
}

func TestRealConfigFilesDecodeAndValidate(t *testing.T) {
	for _, name := range []string{"dev.yml", "pre.yml"} {
		path := filepath.Join("..", "..", "..", "configs", name)
		if _, err := os.Stat(path); err != nil {
			t.Skipf("本机没有 %s,跳过", path)
		}
		_, err := loadPath(t, path)
		require.NoError(t, err, name)
	}
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
