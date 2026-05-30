package log

import (
	"os"

	"github.com/lens077/ecommerce/backend/services/order/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/meta"
	"go.opentelemetry.io/contrib/bridges/otelzap"
	"go.opentelemetry.io/otel/log/global"
	"go.uber.org/fx/fxevent"
	"go.uber.org/zap/zapcore"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 提供 Fx 模块
var Module = fx.Module("log",
	fx.Provide(
		// 提供日志创建函数
		func(conf *confv1.Bootstrap, info meta.AppInfo) *zap.Logger {
			return NewLogger(conf, info)
		},
	),
)

// FxLogger Fx本身日志重定向选项
func FxLogger() fx.Option {
	return fx.WithLogger(func(log *zap.Logger, conf *confv1.Bootstrap) fxevent.Logger {
		zlog := &fxevent.ZapLogger{Logger: log}

		// 1. 从配置文件动态读取 Fx 框架的日志级别
		var fxLogLevel zapcore.Level
		if err := fxLogLevel.UnmarshalText([]byte(conf.Log.Framework.LogLevel)); err != nil {
			fxLogLevel = zapcore.DebugLevel // 解析失败则降级
		}
		var fxErrLevel zapcore.Level
		if err := fxErrLevel.UnmarshalText([]byte(conf.Log.Framework.ErrorLevel)); err != nil {
			fxErrLevel = zapcore.ErrorLevel // 解析失败则降级
		}

		// 2. 动态设置级别
		zlog.UseLogLevel(fxLogLevel)   // 普通日志级别
		zlog.UseErrorLevel(fxErrLevel) // 错误级别

		return zlog
	})
}

// NewLogger 创建一个新的 Zap Logger.
// levelStr 可选的参数: debug / info / warn / error / dpanic / panic / fatal.
// format 可选的参数: 参考constants/env.go的Log注释部分.
func NewLogger(conf *confv1.Bootstrap, info meta.AppInfo) *zap.Logger {
	logConfig := conf.Log.Application
	var level zapcore.Level
	if err := level.UnmarshalText([]byte(logConfig.Level)); err != nil {
		level = zapcore.DebugLevel
	}

	// 定义基础的 Encoder (编码器)
	var encoder zapcore.Encoder
	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	if logConfig.Format == constants.FormatConsole {
		encoderConfig = zap.NewDevelopmentEncoderConfig()
		encoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		encoder = zapcore.NewConsoleEncoder(encoderConfig)
	} else {
		encoder = zapcore.NewJSONEncoder(encoderConfig)
	}

	// 创建标准输出 Core (Stdout)
	stdCore := zapcore.NewCore(encoder, zapcore.AddSync(os.Stdout), level)

	// 创建 OTel Core (发送到 OTLP)
	// 这里使用 global.GetLoggerProvider()
	otelCore := otelzap.NewCore(
		info.Name, // 你的 Instrumentation Name
		otelzap.WithLoggerProvider(global.GetLoggerProvider()),
	)

	// 4. 使用 Tee 组合两个 Core
	// 这样 logger.Info 就会同时发往：
	// 1. 控制台/JSON文件
	// 2. OTel Collector
	core := zapcore.NewTee(stdCore, otelCore)

	return zap.New(core, zap.AddCaller())
}
