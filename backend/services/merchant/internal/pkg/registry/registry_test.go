package registry

import (
	"testing"

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

func TestRegistryTestSuite(t *testing.T) {
	suite.Run(t, new(RegistryTestSuite))
}

func TestNewConsulRegistry_PanicRecovery(t *testing.T) {
	assert.NotPanics(t, func() {
		_, _ = NewConsulRegistry("localhost:8500", "test-id", "test-name")
	})
}
