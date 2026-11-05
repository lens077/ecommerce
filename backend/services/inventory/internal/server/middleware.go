package server

import (
	"connectrpc.com/connect/v2"
	"connectrpc.com/otelconnect"
	"connectrpc.com/validate"
	confv1 "github.com/lens077/ecommerce/backend/services/inventory/internal/conf/v1"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var MiddlewareModule = fx.Module("server.middleware",
	fx.Provide(
		// 提供拦截器实例
		NewLoggingInterceptor,

		// 组装成一个拦截器切片，或者直接返回 Connect Option
		NewConnectOptions,
	),
)

func NewConnectOptions(
	logger *zap.Logger,
	logging connect.ServerInterceptor,
	observability *confv1.Observability,
) []connect.ServerInterceptor {
	var interceptors []connect.ServerInterceptor

	// 请求体校验始终启用,放在最外层:坏消息在记日志/开 span 之前就被打回。
	// v2 的 validate 包装 ServerStream,在消息进入业务 handler 之前完成校验。
	interceptors = append(interceptors, validate.NewServerInterceptor())

	// 只有当 observability 启用时才添加 otel 拦截器
	if observability != nil && observability.Enable {
		// WithTrustRemote:采信上游传来的 traceparent,把本 span 挂成它的子 span。
		// 不加这个选项时 otelconnect 会强制 WithNewRoot(),把上游 context 降级成
		// 一条 link —— 结果是网关和本服务在 Jaeger 里是两条独立的 trace,点不进去。
		// 本服务只从网关入站(网关已做 JWT 鉴权),这个信任边界成立。
		otelInterceptor, err := otelconnect.NewServerInterceptor(
			otelconnect.WithTrustRemote(),
		)
		if err != nil {
			logger.Fatal("failed to init otel interceptor", zap.Error(err))
		}
		interceptors = append(interceptors, otelInterceptor)
	}

	// 添加日志拦截器
	interceptors = append(interceptors, logging)

	return interceptors
}
