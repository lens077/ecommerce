package service

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	telemetryv1 "github.com/lens077/ecommerce/backend/api/telemetry/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.uber.org/zap"
)

// newTelemetryWithReader 用 ManualReader 建一套真实的 SDK MeterProvider。
// 不 mock meter:这层要验证的恰恰是「Record 之后 VM 那头真能收到数」——
// mock 只能证明我们调了 Record,证明不了 histogram 建对了(桶、单位、attributes)。
func newTelemetryWithReader(t *testing.T) (*TelemetryService, *sdkmetric.ManualReader) {
	t.Helper()

	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	prev := otel.GetMeterProvider()
	otel.SetMeterProvider(mp)
	t.Cleanup(func() { otel.SetMeterProvider(prev) })

	h, err := NewTelemetryService(zap.NewNop())
	require.NoError(t, err)
	return h.(*TelemetryService), reader
}

func collect(t *testing.T, reader *sdkmetric.ManualReader) map[string]metricdata.Metrics {
	t.Helper()
	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))

	out := map[string]metricdata.Metrics{}
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			out[m.Name] = m
		}
	}
	return out
}

func TestCollectWebVitals_RecordsHistogram(t *testing.T) {
	svc, reader := newTelemetryWithReader(t)

	resp, err := svc.CollectWebVitals(context.Background(),
		connect.NewRequest(&telemetryv1.CollectWebVitalsRequest{
			AnonId: "a-1",
			Vitals: []*telemetryv1.WebVital{
				{
					Name:   telemetryv1.WebVitalName_WEB_VITAL_NAME_LCP,
					Value:  2300,
					Rating: "good",
					Page:   "/product/$spuCode",
				},
				{
					Name:  telemetryv1.WebVitalName_WEB_VITAL_NAME_CLS,
					Value: 0.02,
					Page:  "/",
				},
			},
		}))
	require.NoError(t, err)
	assert.Equal(t, uint32(2), resp.Msg.Accepted)

	metrics := collect(t, reader)
	lcp, ok := metrics["web_vitals.lcp"].Data.(metricdata.Histogram[float64])
	require.True(t, ok, "web_vitals.lcp 必须是 float64 histogram")
	require.Len(t, lcp.DataPoints, 1)
	assert.Equal(t, uint64(1), lcp.DataPoints[0].Count)
	assert.Equal(t, 2300.0, lcp.DataPoints[0].Sum)
	// attributes 只允许 page/rating —— 多一个都是基数事故的开端
	assert.Equal(t, 2, lcp.DataPoints[0].Attributes.Len())

	cls, ok := metrics["web_vitals.cls"].Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	// CLS 的桶必须是分数刻度:0.02 应落在第 2 个桶(0.01, 0.05]
	require.Len(t, cls.DataPoints, 1)
	assert.Equal(t, uint64(1), cls.DataPoints[0].BucketCounts[1],
		"0.02 应落在 (0.01, 0.05] 桶 —— 落错了说明用了默认的 ms 级桶")
}

func TestCollectWebVitals_ApiTimings(t *testing.T) {
	svc, reader := newTelemetryWithReader(t)

	resp, err := svc.CollectWebVitals(context.Background(),
		connect.NewRequest(&telemetryv1.CollectWebVitalsRequest{
			AnonId: "a-1",
			ApiTimings: []*telemetryv1.ApiTiming{
				{Path: "/cart.v1.CartService/GetCart", DurationMs: 120, TtfbMs: 80},
				{Path: "/order.v1.OrderService/CreateOrder", DurationMs: 2400, TtfbMs: 2300},
			},
		}))
	require.NoError(t, err)
	assert.Equal(t, uint32(2), resp.Msg.Accepted)

	metrics := collect(t, reader)
	h, ok := metrics["frontend.api.duration"].Data.(metricdata.Histogram[float64])
	require.True(t, ok)
	// slow 与非 slow 是两个 attribute set,各一个 datapoint
	assert.Len(t, h.DataPoints, 2)
}

func TestCollectWebVitals_RejectsEmptyRequest(t *testing.T) {
	svc, _ := newTelemetryWithReader(t)

	_, err := svc.CollectWebVitals(context.Background(),
		connect.NewRequest(&telemetryv1.CollectWebVitalsRequest{AnonId: "a-1"}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err),
		"空请求要显式拒绝 —— 静默 200 会把客户端 bug 藏起来")
}
