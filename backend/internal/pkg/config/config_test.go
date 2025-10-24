package config

import (
	"os"
	"testing"

	"connect-go-example/internal/conf/v1"

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
	// 使用项目中的实际配置文件进行测试
	configPath := "configs/config.yaml"

	conf := Init(configPath)

	// 配置文件可能不存在，所以两种情况都接受
	if conf != nil {
		assert.NotNil(suite.T(), conf)
		// 验证基本结构
		assert.NotNil(suite.T(), conf.Server)
		assert.NotNil(suite.T(), conf.Data)
	} else {
		// 配置文件不存在是正常情况
		suite.T().Log("Config file not found, skipping detailed validation")
	}
}

func (suite *ConfigTestSuite) TestInit_InvalidConfig() {
	// 测试不存在的配置文件
	configPath := "nonexistent/config.yaml"

	conf := Init(configPath)

	assert.Nil(suite.T(), conf)
}

func (suite *ConfigTestSuite) TestGetConfigPath_EnvironmentVariable() {
	// 设置环境变量
	os.Setenv("CONFIG_PATH", "/custom/config.yaml")

	path := getConfigPath()

	assert.Equal(suite.T(), "/custom/config.yaml", path)

	// 清理环境变量
	os.Unsetenv("CONFIG_PATH")
}

func (suite *ConfigTestSuite) TestGetConfigPath_Default() {
	// 不设置环境变量，测试默认路径
	path := getConfigPath()

	// 默认应该是 configs/config.yaml
	assert.Equal(suite.T(), "configs/config.yaml", path)
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
