package log

import (
	confv1 "github.com/sunmery/ecommerce/backend/application/user/internal/conf/v1"
	"github.com/sunmery/ecommerce/backend/constants"
	"go.uber.org/zap/zapcore"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 提供 Fx 模块
var Module = fx.Module("log",
	fx.Provide(
		// 提供日志创建函数
		func(conf *confv1.Bootstrap) *zap.Logger {
			return NewLogger(conf.Log.Level, conf.Log.Format)
		},
	),
)

// NewLogger 创建一个新的 Zap Logger.
// levelStr 可选的参数: debug / info / warn / error / dpanic / panic / fatal.
// format 可选的参数: 参考constants/env.go的Log注释部分.
func NewLogger(levelStr string, format string) *zap.Logger {
	var config zap.Config

	// 解析字符串级别 (Zap 的级别顺序是：Debug < Info < Warn < Error < DPanic < Panic < Fatal)
	var level zapcore.Level
	if err := level.UnmarshalText([]byte(levelStr)); err != nil {
		level = zapcore.InfoLevel // 如果解析失败，回退到 info
	}
	config.Level = zap.NewAtomicLevelAt(level)

	switch format {
	case constants.FormatConsole:
		// 本地运行模式：输出到终端，带颜色，适合人类阅读, 适合开发阶段
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	case constants.FormatJson:
		// 容器/K8s模式：输出严格的 JSON 格式, 适合生产阶段
		config = zap.NewProductionConfig()
		// 统一时间戳格式，方便 Fluent Bit / OTEL 解析
		config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	}

	logger, err := config.Build()
	if err != nil {
		panic(err)
	}
	return logger
}
