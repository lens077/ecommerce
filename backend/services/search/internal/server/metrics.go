package server

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

type MetricsInterceptor struct {
	requestCounter  metric.Int64Counter
	requestDuration metric.Float64Histogram
}

// NewMetricsInterceptor 初始化并返回拦截器
func NewMetricsInterceptor() *MetricsInterceptor {
	meter := otel.GetMeterProvider().Meter("github.com/sunmery/ecommerce/backend/server")

	reqCounter, err := meter.Int64Counter(
		"rpc.server.requests_total",
		metric.WithDescription("Total number of RPC requests handled"),
		metric.WithUnit("{request}"),
	)
	if err != nil {
		panic(fmt.Errorf("failed to init counter: %w", err))
	}

	reqDuration, err := meter.Float64Histogram(
		"rpc.server.duration_ms",
		metric.WithDescription("Duration of RPC requests in milliseconds"),
		metric.WithUnit("ms"),
	)
	if err != nil {
		panic(fmt.Errorf("failed to init histogram: %w", err))
	}

	return &MetricsInterceptor{
		requestCounter:  reqCounter,
		requestDuration: reqDuration,
	}
}

func (m *MetricsInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		startTime := time.Now()

		resp, err := next(ctx, req)

		duration := float64(time.Since(startTime).Milliseconds())
		code := connect.CodeOf(err)

		attrs := []attribute.KeyValue{
			attribute.String("rpc.system", "connect"),
			attribute.String("rpc.service", req.Spec().Procedure),
			attribute.String("rpc.method", req.HTTPMethod()),
			attribute.String("rpc.connect_status_code", code.String()),
		}

		m.requestCounter.Add(ctx, 1, metric.WithAttributes(attrs...))
		m.requestDuration.Record(ctx, duration, metric.WithAttributes(attrs...))

		return resp, err
	}
}

// WrapStreamingClient 处理客户端流
func (m *MetricsInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next // 目前不做处理，直接透传
}

// WrapStreamingHandler 处理服务端流
func (m *MetricsInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next // 目前不做处理，直接透传
}
