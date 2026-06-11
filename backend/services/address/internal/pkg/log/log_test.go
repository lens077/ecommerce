package log

import (
	"testing"

	"github.com/lens077/ecommerce/backend/services/address/internal/constants"
	"github.com/lens077/ecommerce/backend/services/address/internal/pkg/meta"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type LogTestSuite struct {
	suite.Suite
	testAppInfo meta.AppInfo
}

func (suite *LogTestSuite) SetupTest() {
	suite.testAppInfo = meta.AppInfo{
		ID:          "test-service-id",
		Name:        "test-service",
		Host:        "localhost",
		Environment: "dev",
	}
}

func (suite *LogTestSuite) TestNewLogger_DebugLevel() {
	logger := NewLogger("debug", constants.FormatJson, suite.testAppInfo)
	assert.NotNil(suite.T(), logger)
	assert.True(suite.T(), logger.Core().Enabled(zapcore.DebugLevel))
}

func (suite *LogTestSuite) TestNewLogger_InfoLevel() {
	logger := NewLogger("info", constants.FormatJson, suite.testAppInfo)
	assert.NotNil(suite.T(), logger)
	assert.True(suite.T(), logger.Core().Enabled(zapcore.InfoLevel))
	assert.False(suite.T(), logger.Core().Enabled(zapcore.DebugLevel))
}

func (suite *LogTestSuite) TestNewLogger_WarnLevel() {
	logger := NewLogger("warn", constants.FormatJson, suite.testAppInfo)
	assert.NotNil(suite.T(), logger)
	assert.True(suite.T(), logger.Core().Enabled(zapcore.WarnLevel))
	assert.False(suite.T(), logger.Core().Enabled(zapcore.InfoLevel))
}

func (suite *LogTestSuite) TestNewLogger_ErrorLevel() {
	logger := NewLogger("error", constants.FormatJson, suite.testAppInfo)
	assert.NotNil(suite.T(), logger)
	assert.True(suite.T(), logger.Core().Enabled(zapcore.ErrorLevel))
	assert.False(suite.T(), logger.Core().Enabled(zapcore.WarnLevel))
}

func (suite *LogTestSuite) TestNewLogger_InvalidLevel() {
	logger := NewLogger("invalid-level", constants.FormatJson, suite.testAppInfo)
	assert.NotNil(suite.T(), logger)
	assert.True(suite.T(), logger.Core().Enabled(zapcore.InfoLevel))
}
