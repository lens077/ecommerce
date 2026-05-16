package registry

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
)

// RegistryTestSuite 是 Registry 的测试套件
type RegistryTestSuite struct {
	suite.Suite
	testLogger *zap.Logger
}

func (suite *RegistryTestSuite) SetupTest() {
	// 创建测试用的 logger
	var err error
	suite.testLogger, err = zap.NewDevelopment()
	assert.NoError(suite.T(), err)

	// 清理环境变量
	os.Clearenv()
}

func (suite *RegistryTestSuite) TestNewConsulRegistry_WithValidAddr() {
	// 测试 NewConsulRegistry 函数
	reg, err := NewConsulRegistry("localhost:8500", "test-id", "test-service", WithLogger(suite.testLogger))
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reg)
	assert.Equal(suite.T(), "test-id", reg.ID)
	assert.Equal(suite.T(), "test-service", reg.Name)
	assert.Equal(suite.T(), "localhost:8500", reg.Addr)
}

func (suite *RegistryTestSuite) TestNewConsulRegistry_WithInvalidAddr() {
	// 测试无效地址的情况
	reg, err := NewConsulRegistry("invalid-addr", "test-id", "test-service", WithLogger(suite.testLogger))
	// 这里应该不会在创建时就出错，而是在实际使用时出错
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reg)
}

func (suite *RegistryTestSuite) TestNewConsulRegistry_WithTLS() {
	// 测试带 TLS 配置的情况
	reg, err := NewConsulRegistry("localhost:8500", "test-id", "test-service", WithLogger(suite.testLogger), WithTLS(true, ""))
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reg)
}

func (suite *RegistryTestSuite) TestWithLogger() {
	// 测试 WithLogger 选项
	opt := WithLogger(suite.testLogger)
	o := &options{}
	opt(o)
	assert.Equal(suite.T(), suite.testLogger, o.logger)
}

func (suite *RegistryTestSuite) TestWithTLS() {
	// 测试 WithTLS 选项
	opt := WithTLS(true, "test-ca-pem")
	o := &options{}
	opt(o)
	assert.NotNil(suite.T(), o.tlsConf)
	assert.True(suite.T(), o.tlsConf.InsecureSkipVerify)
}

func (suite *RegistryTestSuite) TestModuleCreation() {
	// 测试模块创建
	module := Module
	assert.NotNil(suite.T(), module)
	assert.Contains(suite.T(), module.String(), "registry")
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_ValidHTTPUrl() {
	// 测试有效的 HTTP URL
	addr, err := ParseToTCPAddr("http://localhost:8080")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	// localhost 可能被解析为 127.0.0.1
	assert.True(suite.T(), addr.IP.String() == "localhost" || addr.IP.String() == "127.0.0.1")
	assert.Equal(suite.T(), 8080, addr.Port)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_ValidHTTPSUrl() {
	// 测试有效的 HTTPS URL
	addr, err := ParseToTCPAddr("https://localhost:8443")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	// localhost 可能被解析为 127.0.0.1
	assert.True(suite.T(), addr.IP.String() == "localhost" || addr.IP.String() == "127.0.0.1")
	assert.Equal(suite.T(), 8443, addr.Port)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_WithoutPort() {
	// 测试不带端口的 URL
	addr, err := ParseToTCPAddr("http://example.com")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	assert.Equal(suite.T(), 80, addr.Port) // 应该添加默认端口 80
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_HTTPSWithoutPort() {
	// 测试 HTTPS 不带端口的 URL
	addr, err := ParseToTCPAddr("https://example.com")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	assert.Equal(suite.T(), 443, addr.Port) // 应该添加默认端口 443
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_InvalidUrl() {
	// 测试无效 URL
	addr, err := ParseToTCPAddr("invalid-url")
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), addr)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_EmptyHost() {
	// 测试空 host
	addr, err := ParseToTCPAddr("http://")
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), addr)
}

// 运行测试套件
func TestRegistryTestSuite(t *testing.T) {
	suite.Run(t, new(RegistryTestSuite))
}

// 单元测试函数
func TestConstants(t *testing.T) {
	// 测试常量定义
	assert.Equal(t, "30s", TtlDuration)
	assert.Equal(t, 10*time.Second, TtlPingInterval)
}

func TestNewConsulRegistry_PanicRecovery(t *testing.T) {
	// 测试 panic 恢复
	assert.NotPanics(t, func() {
		_, _ = NewConsulRegistry("localhost:8500", "test-id", "test-name")
	})
}
