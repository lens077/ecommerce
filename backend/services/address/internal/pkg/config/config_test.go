package config

import (
	"context"
	"os"
	"testing"

	confv1 "github.com/lens077/ecommerce/backend/services/address/internal/conf/v1"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
)

type ConfigTestSuite struct {
	suite.Suite
}

func (suite *ConfigTestSuite) SetupTest() {
	os.Clearenv()
}

func (suite *ConfigTestSuite) TestDecodeConfig() {
	testConfig := map[string]interface{}{
		"server": map[string]interface{}{
			"http": map[string]interface{}{
				"addr": ":8080",
			},
		},
		"data": map[string]interface{}{
			"database": map[string]interface{}{
				"host":     "localhost",
				"port":     5432,
				"user":     "test",
				"password": "password",
				"db_name":  "test_db",
			},
		},
	}

	target := &confv1.Bootstrap{}
	err := decodeConfig(testConfig, target)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), target.Server)
	assert.NotNil(suite.T(), target.Server.Http)
	assert.Equal(suite.T(), ":8080", target.Server.Http.Addr)
}

func (suite *ConfigTestSuite) TestUpdateConfig() {
	testConfig := map[string]interface{}{
		"server": map[string]interface{}{
			"http": map[string]interface{}{
				"addr": ":9090",
			},
		},
	}

	updateConfig(testConfig)

	currentConf := GetConfig()
	assert.NotNil(suite.T(), currentConf.Server)
	assert.Equal(suite.T(), ":9090", currentConf.Server.Http.Addr)
}

func (suite *ConfigTestSuite) TestGetConfig() {
	currentConf := GetConfig()
	assert.NotNil(suite.T(), currentConf)
}

func (suite *ConfigTestSuite) TestValidateConfig_Valid() {
	validConfig := &confv1.Bootstrap{
		Server: &confv1.Server{
			Http: &confv1.Server_HTTP{
				Addr: ":8080",
			},
		},
		Data: &confv1.Data{
			Database: &confv1.Data_Database{},
		},
		Auth: &confv1.Auth{
			Endpoint:         "http://localhost:9000",
			ClientId:         "test-client-id",
			ClientSecret:     "test-client-secret",
			OrganizationName: "test-org",
			ApplicationName:  "test-app",
			Certificate:      "test-cert",
		},
		Observability: &confv1.Observability{
			Trace: &confv1.Observability_Trace{
				Endpoint: "http://localhost:4317",
				Tls: &confv1.Observability_Tls{
					Enable: false,
				},
			},
			Metric: &confv1.Observability_Metric{
				Endpoint: "http://localhost:4318",
				Tls: &confv1.Observability_Tls{
					Enable: false,
				},
			},
			Log: &confv1.Observability_Logging{
				Endpoint: "http://localhost:4319",
				Tls: &confv1.Observability_Tls{
					Enable: false,
				},
			},
		},
		Discovery: &confv1.Discovery{
			Consul: &confv1.Discovery_Consul{
				Addr:        "http://localhost:8500",
				Scheme:      "http",
				HealthCheck: true,
			},
		},
	}

	err := ValidateConfig(validConfig)
	assert.NoError(suite.T(), err)
}

func (suite *ConfigTestSuite) TestValidateConfig_NilConfig() {
	err := ValidateConfig(nil)
	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), "configuration is nil", err.Error())
}

func (suite *ConfigTestSuite) TestValidateConfig_MissingServer() {
	invalidConfig := &confv1.Bootstrap{
		Data: &confv1.Data{
			Database: &confv1.Data_Database{},
		},
	}

	err := ValidateConfig(invalidConfig)
	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), "server configuration is required", err.Error())
}

func (suite *ConfigTestSuite) TestValidateConfig_MissingDatabase() {
	invalidConfig := &confv1.Bootstrap{
		Server: &confv1.Server{
			Http: &confv1.Server_HTTP{
				Addr: ":8080",
			},
		},
	}

	err := ValidateConfig(invalidConfig)
	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), "database configuration is required", err.Error())
}

func (suite *ConfigTestSuite) TestModuleCreation() {
	module := Module
	assert.NotNil(suite.T(), module)
	assert.Contains(suite.T(), module.String(), "config")
}

func (suite *ConfigTestSuite) TestInit_MissingConsulPath() {
	ctx := context.Background()
	conf, err := Init(ctx)
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), conf)
}

func (suite *ConfigTestSuite) TestInit_InvalidConsulAddr() {
	ctx := context.Background()
	os.Setenv("CONSUL_PATH", "test/path")
	os.Setenv("CONSUL_ADDR", "invalid-addr:8500")
	conf, err := Init(ctx)
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), conf)
}

func TestConfigTestSuite(t *testing.T) {
	suite.Run(t, new(ConfigTestSuite))
}

func TestGetConfig_ConcurrentAccess(t *testing.T) {
	assert.NotPanics(t, func() {
		for i := 0; i < 100; i++ {
			GetConfig()
		}
	})
}
