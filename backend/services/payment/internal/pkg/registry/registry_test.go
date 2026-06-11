package registry

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
)

type RegistryTestSuite struct {
	suite.Suite
	testLogger *zap.Logger
}

func (suite *RegistryTestSuite) SetupTest() {
	var err error
	suite.testLogger, err = zap.NewDevelopment()
	assert.NoError(suite.T(), err)
	os.Clearenv()
}

func (suite *RegistryTestSuite) TestNewConsulRegistry_WithValidAddr() {
	reg, err := NewConsulRegistry("localhost:8500", "test-id", "test-service", WithLogger(suite.testLogger))
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reg)
	assert.Equal(suite.T(), "test-id", reg.ID)
	assert.Equal(suite.T(), "test-service", reg.Name)
	assert.Equal(suite.T(), "localhost:8500", reg.Addr)
}

func (suite *RegistryTestSuite) TestNewConsulRegistry_WithInvalidAddr() {
	reg, err := NewConsulRegistry("invalid-addr", "test-id", "test-service", WithLogger(suite.testLogger))
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reg)
}

func (suite *RegistryTestSuite) TestNewConsulRegistry_WithTLS() {
	reg, err := NewConsulRegistry("localhost:8500", "test-id", "test-service", WithLogger(suite.testLogger), WithTLS(true, ""))
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reg)
}

func (suite *RegistryTestSuite) TestWithLogger() {
	opt := WithLogger(suite.testLogger)
	o := &options{}
	opt(o)
	assert.Equal(suite.T(), suite.testLogger, o.logger)
}

func (suite *RegistryTestSuite) TestWithTLS() {
	opt := WithTLS(true, "test-ca-pem")
	o := &options{}
	opt(o)
	assert.NotNil(suite.T(), o.tlsConf)
	assert.True(suite.T(), o.tlsConf.InsecureSkipVerify)
}

func (suite *RegistryTestSuite) TestModuleCreation() {
	module := Module
	assert.NotNil(suite.T(), module)
	assert.Contains(suite.T(), module.String(), "registry")
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_ValidHTTPUrl() {
	addr, err := ParseToTCPAddr("http://localhost:8080")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	assert.True(suite.T(), addr.IP.String() == "localhost" || addr.IP.String() == "127.0.0.1")
	assert.Equal(suite.T(), 8080, addr.Port)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_ValidHTTPSUrl() {
	addr, err := ParseToTCPAddr("https://localhost:8443")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	assert.True(suite.T(), addr.IP.String() == "localhost" || addr.IP.String() == "127.0.0.1")
	assert.Equal(suite.T(), 8443, addr.Port)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_WithoutPort() {
	addr, err := ParseToTCPAddr("http://example.com")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	assert.Equal(suite.T(), 80, addr.Port)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_HTTPSWithoutPort() {
	addr, err := ParseToTCPAddr("https://example.com")
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), addr)
	assert.Equal(suite.T(), 443, addr.Port)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_InvalidUrl() {
	addr, err := ParseToTCPAddr("invalid-url")
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), addr)
}

func (suite *RegistryTestSuite) TestParseToTCPAddr_EmptyHost() {
	addr, err := ParseToTCPAddr("http://")
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), addr)
}

func TestRegistryTestSuite(t *testing.T) {
	suite.Run(t, new(RegistryTestSuite))
}

func TestConstants(t *testing.T) {
	assert.Equal(t, "30s", TtlDuration)
	assert.Equal(t, 10*time.Second, TtlPingInterval)
}

func TestNewConsulRegistry_PanicRecovery(t *testing.T) {
	assert.NotPanics(t, func() {
		_, _ = NewConsulRegistry("localhost:8500", "test-id", "test-name")
	})
}
