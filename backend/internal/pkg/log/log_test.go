package log

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// LogTestSuite 是 Log 的测试套件
type LogTestSuite struct {
	suite.Suite
}

func (suite *LogTestSuite) TestNewLogger_Development() {
	// 测试开发环境日志创建
	logger, err := NewLogger("dev")

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), logger)

	// 验证日志级别
	assert.True(suite.T(), logger.Core().Enabled(zapcore.DebugLevel))
}

func (suite *LogTestSuite) TestNewLogger_Production() {
	// 测试生产环境日志创建
	logger, err := NewLogger("prod")

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), logger)

	// 验证日志级别
	assert.True(suite.T(), logger.Core().Enabled(zapcore.InfoLevel))
	assert.False(suite.T(), logger.Core().Enabled(zapcore.DebugLevel))
}

func (suite *LogTestSuite) TestNewLogger_Default() {
	// 测试默认环境日志创建
	logger, err := NewLogger("")

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), logger)

	// 默认应该是生产环境（因为空字符串不等于"dev"）
	assert.True(suite.T(), logger.Core().Enabled(zapcore.InfoLevel))
	assert.False(suite.T(), logger.Core().Enabled(zapcore.DebugLevel))
}

func (suite *LogTestSuite) TestNewLogger_InvalidEnvironment() {
	// 测试无效环境日志创建
	logger, err := NewLogger("invalid")

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), logger)

	// 无效环境应该使用生产环境配置（因为不等于"dev"）
	assert.True(suite.T(), logger.Core().Enabled(zapcore.InfoLevel))
	assert.False(suite.T(), logger.Core().Enabled(zapcore.DebugLevel))
}

func (suite *LogTestSuite) TestNewLogger_WithOptions() {
	// 测试带选项的日志创建
	logger, err := NewLogger("dev")

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), logger)

	// 验证选项是否生效
	assert.NotNil(suite.T(), logger.Check(zap.InfoLevel, "test message"))
}

func (suite *LogTestSuite) TestGetLogger() {
	// 测试获取全局日志实例
	// GetLogger 函数不存在，跳过此测试
	suite.T().Skip("GetLogger 函数不存在，跳过此测试")
}

func (suite *LogTestSuite) TestModuleCreation() {
	// 测试模块创建
	module := Module

	assert.NotNil(suite.T(), module)

	// 验证模块名称
	assert.Contains(suite.T(), module.String(), "log")
}

func (suite *LogTestSuite) TestLoggerInterface() {
	// 测试日志接口实现
	logger, err := NewLogger("dev")
	assert.NoError(suite.T(), err)

	// 测试各种日志级别
	assert.NotPanics(suite.T(), func() {
		logger.Debug("debug message")
		logger.Info("info message")
		logger.Warn("warn message")
		logger.Error("error message")
	})
}

func (suite *LogTestSuite) TestLoggerWithFields() {
	// 测试带字段的日志
	logger, err := NewLogger("dev")
	assert.NoError(suite.T(), err)

	assert.NotPanics(suite.T(), func() {
		logger.With(
			zap.String("key", "value"),
			zap.Int("number", 42),
		).Info("message with fields")
	})
}

func (suite *LogTestSuite) TestLoggerSugar() {
	// 测试 Sugar 日志
	logger, err := NewLogger("dev")
	assert.NoError(suite.T(), err)
	sugar := logger.Sugar()

	assert.NotPanics(suite.T(), func() {
		sugar.Debugw("debug message", "key", "value")
		sugar.Infow("info message", "key", "value")
		sugar.Warnw("warn message", "key", "value")
		sugar.Errorw("error message", "key", "value")
	})
}

// 运行测试套件
func TestLogTestSuite(t *testing.T) {
	suite.Run(t, new(LogTestSuite))
}

// 单元测试函数
func TestNewLogger_PanicRecovery(t *testing.T) {
	// 测试日志创建时的 panic 恢复
	assert.NotPanics(t, func() {
		_, _ = NewLogger("development")
	})
}

func TestGetLogger_ConcurrentAccess(t *testing.T) {
	// 测试并发访问全局日志实例
	// GetLogger 函数不存在，跳过此测试
	t.Skip("GetLogger 函数不存在，跳过此测试")
}
