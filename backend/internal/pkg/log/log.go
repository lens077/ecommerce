package log

import (
	confv1 "connect-go-example/internal/conf/v1"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 提供 Fx 模块
var Module = fx.Module("log",
	fx.Provide(
		// 提供日志创建函数
		func(conf *confv1.Bootstrap) (*zap.Logger, error) {
			runMode := "prod"
			if conf.Server != nil && conf.Server.Http != nil {
				// 可以根据配置中的其他字段来决定运行模式
				// 例如：如果配置了开发环境特定的设置，则使用 "dev"
				runMode = "prod"
			}
			return NewLogger(runMode)
		},
	),
)

// NewLogger 创建一个新的 Zap Logger
func NewLogger(runMode string) (*zap.Logger, error) {
	if runMode == "dev" {
		return zap.NewDevelopment()
	}
	return zap.NewProduction()
}
