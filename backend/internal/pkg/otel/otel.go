package otel

import (
	"context"
	"errors"
	"time"

	confv1 "connect-go-example/internal/conf/v1"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var (
	// OTLP 端点变量
	endpoint string
	// Module 提供 Fx 模块
	Module = fx.Module("otel",
		fx.Provide(
			// 提供 OpenTelemetry 设置函数
			func(cfg *confv1.Trace, logger *zap.Logger) (func(context.Context) error, error) {
				return SetupOTelSDK(context.Background(), cfg, logger)
			},
		),
	)
)

// SetEndpoint 从配置中设置端点
func SetEndpoint(cfg *confv1.Trace, logger *zap.Logger) {
	if cfg != nil && cfg.Endpoint != "" {
		endpoint = cfg.Endpoint
		logger.Info("otlpEndpoint" + endpoint)
	} else {
		endpoint = ""
		logger.Info("OpenTelemetry disabled - no endpoint configured")
	}
}

// SetupOTelSDK bootstraps the OpenTelemetry pipeline.
func SetupOTelSDK(ctx context.Context, cfg *confv1.Trace, logger *zap.Logger) (func(context.Context) error, error) {
	var shutdownFuncs []func(context.Context) error
	var err error

	shutdown := func(ctx context.Context) error {
		var err error
		for _, fn := range shutdownFuncs {
			err = errors.Join(err, fn(ctx))
		}
		shutdownFuncs = nil
		return err
	}

	handleErr := func(inErr error) {
		err = errors.Join(inErr, shutdown(ctx))
	}

	// 从配置中设置端点
	SetEndpoint(cfg, logger)

	// 如果没有配置端点，禁用 OpenTelemetry
	if endpoint == "" {
		logger.Info("OpenTelemetry disabled - no endpoint configured")
		// 返回空地关闭函数
		return func(ctx context.Context) error { return nil }, nil
	}

	prop := newPropagator()
	otel.SetTextMapPropagator(prop)

	res, err := newResource()
	if err != nil {
		handleErr(err)
		return shutdown, err
	}

	tracerProvider, err := newTracerProvider(res)
	if err != nil {
		handleErr(err)
		return shutdown, err
	}
	shutdownFuncs = append(shutdownFuncs, tracerProvider.Shutdown)
	otel.SetTracerProvider(tracerProvider)

	meterProvider, err := newMeterProvider(res)
	if err != nil {
		handleErr(err)
		return shutdown, err
	}
	shutdownFuncs = append(shutdownFuncs, meterProvider.Shutdown)
	otel.SetMeterProvider(meterProvider)

	loggerProvider, err := newLoggerProvider(res)
	if err != nil {
		handleErr(err)
		return shutdown, err
	}
	shutdownFuncs = append(shutdownFuncs, loggerProvider.Shutdown)
	global.SetLoggerProvider(loggerProvider)

	logger.Info("OpenTelemetry enabled - sending data to %s\n" + endpoint)
	return shutdown, err
}

func newResource() (*resource.Resource, error) {
	return resource.Merge(resource.Default(),
		resource.NewWithAttributes(semconv.SchemaURL,
			semconv.ServiceName("connect-example-go"),
			semconv.ServiceVersion("1.0.0"),
		))
}

func newPropagator() propagation.TextMapPropagator {
	return propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	)
}

func newTracerProvider(res *resource.Resource) (*trace.TracerProvider, error) {
	ctx := context.Background()

	traceExporter, err := otlptracehttp.New(
		ctx,
		otlptracehttp.WithEndpoint(endpoint),
		otlptracehttp.WithInsecure(), // 如果没有 TLS，使用此选项
	)
	if err != nil {
		return nil, err
	}

	bsp := trace.NewBatchSpanProcessor(traceExporter)
	tracerProvider := trace.NewTracerProvider(
		trace.WithSampler(trace.AlwaysSample()),
		trace.WithResource(res),
		trace.WithSpanProcessor(bsp),
	)
	return tracerProvider, nil
}

func newMeterProvider(res *resource.Resource) (*metric.MeterProvider, error) {
	metricExporter, err := otlpmetrichttp.New(
		context.Background(),
		otlpmetrichttp.WithEndpoint(endpoint),
		otlpmetrichttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	meterProvider := metric.NewMeterProvider(
		metric.WithResource(res),
		metric.WithReader(metric.NewPeriodicReader(metricExporter,
			metric.WithInterval(3*time.Second))),
	)
	return meterProvider, nil
}

func newLoggerProvider(res *resource.Resource) (*log.LoggerProvider, error) {
	logExporter, err := otlploghttp.New(
		context.Background(),
		otlploghttp.WithEndpoint(endpoint),
		otlploghttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	loggerProvider := log.NewLoggerProvider(
		log.WithResource(res),
		log.WithProcessor(log.NewBatchProcessor(logExporter)),
	)
	return loggerProvider, nil
}
