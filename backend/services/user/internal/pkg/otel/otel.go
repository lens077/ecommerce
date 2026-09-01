package otel

// This file is a service adapter. It may only map the service's confv1 Bootstrap to
// backend/pkg/otel options and retain compatibility aliases for existing consumers.

import (
	"time"

	sharedotel "github.com/lens077/ecommerce/backend/pkg/otel"
	confv1 "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"
	"go.uber.org/fx"
)

var (
	SQLSpanName                = sharedotel.SQLSpanName
	EnsureRedisInstrumentation = sharedotel.EnsureRedisInstrumentation
)

var Module = fx.Module("user-otel-adapter",
	fx.Provide(optionsFromBootstrap),
	sharedotel.Module,
)

func optionsFromBootstrap(conf *confv1.Bootstrap) sharedotel.Options {
	observability := conf.GetObservability()
	trace := observability.GetTrace()
	metric := observability.GetMetric()
	logging := observability.GetLog()

	var sampleRatio *float64
	if configured := trace.GetSampleRatio(); configured != nil {
		value := configured.GetValue()
		sampleRatio = &value
	}

	var exportInterval time.Duration
	if configured := metric.GetExportInterval(); configured != nil {
		exportInterval = configured.AsDuration()
	}

	return sharedotel.Options{
		Enabled: observability.GetEnable(),
		Trace: sharedotel.TraceOptions{
			Endpoint:    trace.GetEndpoint(),
			SampleRatio: sampleRatio,
			TLS:         tlsOptions(trace.GetTls()),
		},
		Metric: sharedotel.MetricOptions{
			Endpoint:       metric.GetEndpoint(),
			ExportInterval: exportInterval,
			TLS:            tlsOptions(metric.GetTls()),
		},
		Logging: sharedotel.LoggingOptions{
			Endpoint: logging.GetEndpoint(),
			TLS:      tlsOptions(logging.GetTls()),
		},
	}
}

func tlsOptions(conf *confv1.Observability_Tls) sharedotel.TLSOptions {
	return sharedotel.TLSOptions{
		Enabled:            conf.GetEnable(),
		InsecureSkipVerify: conf.GetInsecureSkipVerify(),
		CAPEM:              conf.GetCaPem(),
	}
}
