package otel

import (
	"testing"
	"time"

	confv1 "github.com/lens077/ecommerce/backend/services/cart/internal/conf/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

func TestOptionsFromBootstrap(t *testing.T) {
	bootstrap := &confv1.Bootstrap{Observability: &confv1.Observability{
		Enable: true,
		Trace: &confv1.Observability_Trace{
			Endpoint:    "trace:4318",
			SampleRatio: wrapperspb.Double(0.25),
			Tls:         &confv1.Observability_Tls{Enable: true, CaPem: "trace-ca"},
		},
		Metric: &confv1.Observability_Metric{
			Endpoint:       "metric:4318",
			ExportInterval: durationpb.New(45 * time.Second),
		},
		Log: &confv1.Observability_Logging{Endpoint: "log:4318"},
	}}

	options := optionsFromBootstrap(bootstrap)
	assert.True(t, options.Enabled)
	assert.Equal(t, "trace:4318", options.Trace.Endpoint)
	require.NotNil(t, options.Trace.SampleRatio)
	assert.Equal(t, 0.25, *options.Trace.SampleRatio)
	assert.True(t, options.Trace.TLS.Enabled)
	assert.Equal(t, "trace-ca", options.Trace.TLS.CAPEM)
	assert.Equal(t, 45*time.Second, options.Metric.ExportInterval)
	assert.Equal(t, "log:4318", options.Logging.Endpoint)
}

func TestOptionsPreserveUnsetSampleRatio(t *testing.T) {
	options := optionsFromBootstrap(&confv1.Bootstrap{})
	assert.False(t, options.Enabled)
	assert.Nil(t, options.Trace.SampleRatio)
}

func TestCompatibilityAliases(t *testing.T) {
	assert.Equal(t, "GetThing", SQLSpanName("-- name: GetThing :one\nSELECT 1"))
	assert.NotNil(t, EnsureRedisInstrumentation)
}
