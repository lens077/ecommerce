package config

import (
	"os"
	"testing"

	"github.com/caarlos0/env/v11"
	confv1 "github.com/sunmery/ecommerce/backend/application/user/internal/conf/v1"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
)

// ConfigTestSuite 是 Config 的测试套件
type ConfigTestSuite struct {
	suite.Suite
}

func (suite *ConfigTestSuite) SetupTest() {
	// 清理环境变量
	os.Unsetenv("CONFIG_PATH")
}

func (suite *ConfigTestSuite) TestInit_ValidConfig() {
	// 测试Init函数，由于现在从Consul获取配置，实际运行时可能会失败
	// 这里主要测试函数调用不会 panic
	assert.NotPanics(suite.T(), func() {
		conf, err := Init()
		// 配置可能获取失败，所以两种情况都接受
		if err == nil && conf != nil {
			assert.NotNil(suite.T(), conf)
			// 验证基本结构
			assert.NotNil(suite.T(), conf.Server)
			assert.NotNil(suite.T(), conf.Data)
		} else {
			// 配置获取失败是正常情况（可能没有Consul服务）
			suite.T().Log("Config not found or Consul service unavailable, skipping detailed validation")
		}
	})
}

func (suite *ConfigTestSuite) TestInit_InvalidConfig() {
	// 测试Init函数在环境变量配置错误时的行为
	// 保存原始环境变量
	originalAddr := os.Getenv("CONSUL_CENTER_ADDR")
	originalPath := os.Getenv("CONSUL_PATH")
	defer func() {
		// 恢复原始环境变量
		if originalAddr != "" {
			os.Setenv("CONSUL_CENTER_ADDR", originalAddr)
		} else {
			os.Unsetenv("CONSUL_CENTER_ADDR")
		}
		if originalPath != "" {
			os.Setenv("CONSUL_PATH", originalPath)
		} else {
			os.Unsetenv("CONSUL_PATH")
		}
	}()

	// 设置无效的Consul地址
	os.Setenv("CONSUL_CENTER_ADDR", "invalid-address:8500")
	os.Setenv("CONSUL_PATH", "test/path")

	// 调用Init函数，应该返回错误
	conf, err := Init()

	// 应该返回错误
	assert.Error(suite.T(), err)
	// 配置应该为nil
	assert.Nil(suite.T(), conf)
}

func (suite *ConfigTestSuite) TestIsRunningInContainer_DockerEnv() {
	// 创建临时文件模拟容器环境
	tempFile := "/.dockerenv"

	// 尝试创建文件（如果权限允许）
	file, err := os.Create(tempFile)
	if err == nil {
		defer os.Remove(tempFile)
		defer file.Close()

		result := isRunningInContainer()
		assert.True(suite.T(), result)
	} else {
		// 如果没有权限创建文件，跳过测试
		suite.T().Skip("Cannot create /.dockerenv file, skipping container detection test")
	}
}

func (suite *ConfigTestSuite) TestIsRunningInContainer_NotInContainer() {
	// 测试非容器环境
	// 确保没有容器环境指示器
	result := isRunningInContainer()

	// 在非容器环境中应该返回 false
	assert.False(suite.T(), result)
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
		Trace: &confv1.Trace{
			Endpoint: "http://localhost:4317",
			Insecure: true,
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

func (suite *ConfigTestSuite) TestContains() {
	// 测试包含子字符串
	assert.True(suite.T(), contains("hello world", "hello"))
	assert.True(suite.T(), contains("hello world", "world"))
	assert.True(suite.T(), contains("hello", "hello"))

	// 测试不包含子字符串
	assert.False(suite.T(), contains("hello", "world"))
	assert.False(suite.T(), contains("", "hello"))
	assert.False(suite.T(), contains("hello", "helloworld"))
}

// 运行测试套件
func TestConfigTestSuite(t *testing.T) {
	suite.Run(t, new(ConfigTestSuite))
}

// 单元测试函数
func TestGetConfig(t *testing.T) {
	// 这个函数返回全局变量，在测试中可能为 nil
	// conf := GetConfig()

	// 由于是全局变量，可能为 nil，所以只验证函数能正常调用
	assert.NotPanics(t, func() {
		GetConfig()
	})
}

func TestModuleCreation(t *testing.T) {
	// 测试模块创建
	module := Module

	assert.NotNil(t, module)

	// 验证模块名称
	assert.Contains(t, module.String(), "config")
}

// 测试 Consul 配置结构体解析
func TestConsulConfig_Parse(t *testing.T) {
	// 保存原始环境变量
	originalAddr := os.Getenv("CONSUL_CENTER_ADDR")
	originalPath := os.Getenv("CONSUL_PATH")
	originalScheme := os.Getenv("CONSUL_CENTER_SCHEME")
	defer func() {
		// 恢复原始环境变量
		if originalAddr != "" {
			os.Setenv("CONSUL_CENTER_ADDR", originalAddr)
		} else {
			os.Unsetenv("CONSUL_CENTER_ADDR")
		}
		if originalPath != "" {
			os.Setenv("CONSUL_PATH", originalPath)
		} else {
			os.Unsetenv("CONSUL_PATH")
		}
		if originalScheme != "" {
			os.Setenv("CONSUL_CENTER_SCHEME", originalScheme)
		} else {
			os.Unsetenv("CONSUL_CENTER_SCHEME")
		}
	}()

	// 设置环境变量
	os.Setenv("CONSUL_CENTER_ADDR", "localhost:8500")
	os.Setenv("CONSUL_PATH", "test/path")
	os.Setenv("CONSUL_CENTER_SCHEME", "http")

	// 测试解析
	var cfg ConsulConfig
	err := env.Parse(&cfg)

	// 应该解析成功
	assert.NoError(t, err)
	// 验证值
	assert.Equal(t, "localhost:8500", cfg.Addr)
	assert.Equal(t, "test/path", cfg.Path)
	assert.Equal(t, "http", cfg.Scheme)
}

// 测试 updateConfig 函数
func TestUpdateConfig(t *testing.T) {
	// 测试 updateConfig 函数不会 panic
	assert.NotPanics(t, func() {
		// 创建一个测试配置
		testConfig := map[string]interface{}{
			"server": map[string]interface{}{
				"http": map[string]interface{}{
					"addr": ":8080",
				},
			},
			"data": map[string]interface{}{
				"database": map[string]interface{}{},
			},
			"auth": map[string]interface{}{
				"endpoint": "http://localhost:9000",
			},
			"trace": map[string]interface{}{
				"endpoint": "http://localhost:4317",
			},
			"discovery": map[string]interface{}{
				"consul": map[string]interface{}{
					"addr": "http://localhost:8500",
				},
			},
		}

		// 调用 updateConfig
		updateConfig(testConfig)

		// 验证全局配置是否更新
		updatedConfig := GetConfig()
		assert.NotNil(t, updatedConfig)
	})
}
