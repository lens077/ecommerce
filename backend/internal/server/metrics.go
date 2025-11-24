package server

import (
	"fmt"
	"net/http"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.uber.org/zap"
)

// Metrics 结构体用于存储监控指标
var (
	requestCounter  metric.Int64Counter
	requestDuration metric.Float64Histogram
	errorCounter    metric.Int64Counter
)

// InitMetrics 初始化监控指标
func InitMetrics() error {
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
	if err := InitMetrics(); err != nil {
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
