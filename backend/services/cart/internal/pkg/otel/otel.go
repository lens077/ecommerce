package otel

// This file is a service adapter. It may only map the service's confv1 Bootstrap to
// go-connect-kit/otel options.

import (
	"time"

	"github.com/lens077/ecommerce/backend/pkg/guardconf"
	confv1 "github.com/lens077/ecommerce/backend/services/cart/internal/conf/v1"
	sharedotel "github.com/lens077/go-connect-kit/otel"
	"go.uber.org/fx"
)

var Module = fx.Module("cart-otel-adapter",
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

	if !observability.GetEnable() {
		return sharedotel.Options{}
	}

	return sharedotel.Options{
		Trace: &sharedotel.TraceOptions{
			Endpoint:    trace.GetEndpoint(),
			SampleRatio: sampleRatio,
			TLS:         tlsOptions(trace.GetTls()),
		},
		Metric: &sharedotel.MetricOptions{
			Endpoint:       metric.GetEndpoint(),
			ExportInterval: exportInterval,
			TLS:            tlsOptions(metric.GetTls()),
			// 配置中心没有 guard 段时返回 nil,由 kit 用默认值 + OTEL_GUARD_* 兜底。
			Guard: guardconf.Config(metric.GetGuard(), metric.GetGuard().GetNtfy()),
		},
		Logging: &sharedotel.LoggingOptions{
			Endpoint: logging.GetEndpoint(),
			TLS:      tlsOptions(logging.GetTls()),
		},
		RuntimeMetrics: true,
	}
}

func tlsOptions(conf *confv1.Observability_Tls) sharedotel.TLSOptions {
	return sharedotel.TLSOptions{
		Enabled:            conf.GetEnable(),
		InsecureSkipVerify: conf.GetInsecureSkipVerify(),
		CAPEM:              conf.GetCaPem(),
	}
}
