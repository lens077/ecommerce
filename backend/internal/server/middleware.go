package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// MiddlewareModule 提供 Fx 模块
var MiddlewareModule = fx.Module("server.middleware",
	fx.Provide(
		func(logger *zap.Logger) func(http.Handler) http.Handler {
			return MonitoringMiddleware(logger)
		},
		ConnectMonitoringInterceptor,
	),
)

// responseWriter 包装 http.ResponseWriter 来捕获状态码
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

// ConnectMonitoringInterceptor Connect 专用的监控拦截器
func ConnectMonitoringInterceptor(logger *zap.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			startTime := time.Now()

			// 获取 tracer
			tracer := otel.GetTracerProvider().Tracer("connect-go-example")

			// 创建 span
			spanName := fmt.Sprintf("%s.%s", req.Spec().Procedure, req.Peer().Addr)
			ctx, span := tracer.Start(ctx, spanName)
			defer span.End()

			// 设置 span 属性
			span.SetAttributes(
				attribute.String("rpc.system", "connect"),
				attribute.String("rpc.service", req.Spec().Procedure),
				attribute.String("rpc.method", req.Header().Get(":method")),
				attribute.String("rpc.peer", req.Peer().Addr),
			)

			// 调用下一个拦截器
			resp, err := next(ctx, req)

			// 计算耗时
			duration := float64(time.Since(startTime).Milliseconds())

			// 记录指标
			attributes := []attribute.KeyValue{
				attribute.String("rpc.service", req.Spec().Procedure),
				attribute.String("rpc.method", req.Header().Get(":method")),
			}

			// 记录 RPC 请求计数
			requestCounter.Add(ctx, 1, metric.WithAttributes(attributes...))
			requestDuration.Record(ctx, duration, metric.WithAttributes(attributes...))

			if err != nil {
				// 记录错误
				errorCounter.Add(ctx, 1, metric.WithAttributes(attributes...))
				span.SetStatus(codes.Error, err.Error())
				logger.Error("RPC request failed",
					zap.String("service", req.Spec().Procedure),
					zap.String("method", req.Header().Get(":method")),
					zap.Duration("duration", time.Since(startTime)),
					zap.Error(err),
				)
			} else {
				span.SetStatus(codes.Ok, "OK")
				logger.Info("RPC request completed",
					zap.String("service", req.Spec().Procedure),
					zap.String("method", req.Header().Get(":method")),
					zap.Duration("duration", time.Since(startTime)),
				)
			}

			return resp, err
		}
	}
}

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.written {
		rw.statusCode = code
		rw.written = true
		rw.ResponseWriter.WriteHeader(code)
	}
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.statusCode = http.StatusOK
		rw.written = true
	}
	return rw.ResponseWriter.Write(b)
}
