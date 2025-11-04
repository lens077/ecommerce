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

// Metrics 结构体用于存储监控指标
var (
	requestCounter  metric.Int64Counter
	requestDuration metric.Float64Histogram
	errorCounter    metric.Int64Counter
)

// initMetrics 初始化监控指标
func initMetrics() error {
	meter := otel.GetMeterProvider().Meter("connect-go-example")

	var err error
	requestCounter, err = meter.Int64Counter(
		"http.server.request.count",
		metric.WithDescription("HTTP 请求总数"),
		metric.WithUnit("{request}"),
	)
	if err != nil {
		return fmt.Errorf("failed to create request counter: %w", err)
	}

	requestDuration, err = meter.Float64Histogram(
		"http.server.request.duration",
		metric.WithDescription("HTTP 请求耗时"),
		metric.WithUnit("ms"),
	)
	if err != nil {
		return fmt.Errorf("failed to create request duration histogram: %w", err)
	}

	errorCounter, err = meter.Int64Counter(
		"http.server.error.count",
		metric.WithDescription("HTTP 错误总数"),
		metric.WithUnit("{error}"),
	)
	if err != nil {
		return fmt.Errorf("failed to create error counter: %w", err)
	}

	return nil
}

// MonitoringMiddleware 监控中间件
func MonitoringMiddleware(logger *zap.Logger) func(http.Handler) http.Handler {
	// 初始化指标
	if err := initMetrics(); err != nil {
		logger.Error("Failed to initialize metrics", zap.Error(err))
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			startTime := time.Now()

			// 获取 tracer
			tracer := otel.GetTracerProvider().Tracer("connect-go-example")

			// 创建 span
			ctx, span := tracer.Start(r.Context(), fmt.Sprintf("%s %s", r.Method, r.URL.Path))
			defer span.End()

			// 设置 span 属性
			span.SetAttributes(
				attribute.String("http.method", r.Method),
				attribute.String("http.route", r.URL.Path),
				attribute.String("http.user_agent", r.UserAgent()),
				attribute.String("http.host", r.Host),
			)

			// 包装 ResponseWriter 来捕获状态码
			ww := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

			// 调用下一个处理器
			next.ServeHTTP(ww, r.WithContext(ctx))

			// 计算请求耗时
			duration := float64(time.Since(startTime).Milliseconds())

			// 记录指标
			attributes := []attribute.KeyValue{
				attribute.String("http.method", r.Method),
				attribute.String("http.route", r.URL.Path),
				attribute.Int("http.status_code", ww.statusCode),
			}

			// 记录请求计数
			requestCounter.Add(ctx, 1, metric.WithAttributes(attributes...))

			// 记录请求耗时
			requestDuration.Record(ctx, duration, metric.WithAttributes(attributes...))

			// 如果是错误响应，记录错误计数
			if ww.statusCode >= 400 {
				errorCounter.Add(ctx, 1, metric.WithAttributes(attributes...))
				span.SetStatus(codes.Error, http.StatusText(ww.statusCode))
				span.SetAttributes(attribute.Int("http.status_code", ww.statusCode))
				logger.Warn("HTTP request error",
					zap.String("method", r.Method),
					zap.String("path", r.URL.Path),
					zap.Int("status", ww.statusCode),
					zap.Duration("duration", time.Since(startTime)),
					zap.String("user_agent", r.UserAgent()),
				)
			} else {
				span.SetStatus(codes.Ok, "OK")
				span.SetAttributes(attribute.Int("http.status_code", ww.statusCode))
				logger.Info("HTTP request completed",
					zap.String("method", r.Method),
					zap.String("path", r.URL.Path),
					zap.Int("status", ww.statusCode),
					zap.Duration("duration", time.Since(startTime)),
				)
			}
		})
	}
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

// responseWriter 包装 http.ResponseWriter 来捕获状态码
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
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

// MiddlewareModule 提供 Fx 模块
var MiddlewareModule = fx.Module("server.middleware",
	fx.Provide(
		func(logger *zap.Logger) func(http.Handler) http.Handler {
			return MonitoringMiddleware(logger)
		},
		ConnectMonitoringInterceptor,
	),
)
