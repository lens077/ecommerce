package service

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	telemetryv1 "github.com/lens077/ecommerce/backend/api/telemetry/v1"
	"github.com/lens077/ecommerce/backend/api/telemetry/v1/telemetryv1connect"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.uber.org/zap"
)

// slowAPIThresholdMs 之上的 API 耗时逐条进日志(带路径),之下的只进 histogram。
// path 是高基数的,只能当日志字段,不能当 metric attribute —— 这条界线是
// telemetry 域的基数纪律,放松它 VM 的序列数会跟着前端路由数 × 状态码组合爆炸。
const slowAPIThresholdMs = 1000

// TelemetryService 把前端性能数据转发进可观测性栈:
// 指标 → OTel histogram(→ VictoriaMetrics),明细 → zap(经 otelzap → Loki)。
//
// 刻意无队列无 DB:OTel SDK 自带批处理(PeriodicReader 3s / BatchProcessor),
// handler 里每条数据只是一次内存内的 Record/Info,不值得再垫一层削峰。
// 这与 Track 不同 —— Track 要落 Postgres 和投喂 gorse,才需要那套 chan+flusher。
type TelemetryService struct {
	log *zap.Logger

	vitalHist map[telemetryv1.WebVitalName]metric.Float64Histogram
	apiHist   metric.Float64Histogram
}

var _ telemetryv1connect.TelemetryServiceHandler = (*TelemetryService)(nil)

// vitalInstruments 每个指标一个 histogram。桶按各自的及格线铺:Go SDK 的默认桶
// (0,5,10,25,...,10000)对 CLS(<1 的分数)和 LCP(秒级)都不合身。
var vitalInstruments = []struct {
	name    telemetryv1.WebVitalName
	metric  string
	unit    string
	desc    string
	buckets []float64
}{
	{telemetryv1.WebVitalName_WEB_VITAL_NAME_LCP, "web_vitals.lcp", "ms",
		"Largest Contentful Paint", []float64{500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 8000, 12000}},
	{telemetryv1.WebVitalName_WEB_VITAL_NAME_CLS, "web_vitals.cls", "1",
		"Cumulative Layout Shift score", []float64{0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1}},
	{telemetryv1.WebVitalName_WEB_VITAL_NAME_INP, "web_vitals.inp", "ms",
		"Interaction to Next Paint", []float64{50, 100, 200, 300, 500, 800, 1500, 3000}},
	{telemetryv1.WebVitalName_WEB_VITAL_NAME_FCP, "web_vitals.fcp", "ms",
		"First Contentful Paint", []float64{300, 600, 1000, 1500, 1800, 2500, 4000, 8000}},
	{telemetryv1.WebVitalName_WEB_VITAL_NAME_TTFB, "web_vitals.ttfb", "ms",
		"Time to First Byte", []float64{100, 200, 400, 800, 1200, 2000, 4000}},
	{telemetryv1.WebVitalName_WEB_VITAL_NAME_LONG_TASK, "web_vitals.long_task", "ms",
		"Main thread long task duration", []float64{50, 100, 200, 400, 800, 1600, 3200}},
}

func NewTelemetryService(logger *zap.Logger) (telemetryv1connect.TelemetryServiceHandler, error) {
	meter := otel.GetMeterProvider().Meter("github.com/lens077/ecommerce/backend/services/behavior/telemetry")

	hists := make(map[telemetryv1.WebVitalName]metric.Float64Histogram, len(vitalInstruments))
	for _, ins := range vitalInstruments {
		h, err := meter.Float64Histogram(ins.metric,
			metric.WithDescription(ins.desc),
			metric.WithUnit(ins.unit),
			metric.WithExplicitBucketBoundaries(ins.buckets...),
		)
		if err != nil {
			return nil, fmt.Errorf("init histogram %s: %w", ins.metric, err)
		}
		hists[ins.name] = h
	}

	apiHist, err := meter.Float64Histogram("frontend.api.duration",
		metric.WithDescription("Frontend-observed API request duration (Resource Timing)"),
		metric.WithUnit("ms"),
		metric.WithExplicitBucketBoundaries(50, 100, 200, 400, 800, 1500, 3000, 6000, 12000),
	)
	if err != nil {
		return nil, fmt.Errorf("init histogram frontend.api.duration: %w", err)
	}

	return &TelemetryService{
		log:       logger.Named("telemetry"),
		vitalHist: hists,
		apiHist:   apiHist,
	}, nil
}

func (s *TelemetryService) CollectWebVitals(
	ctx context.Context,
	req *connect.Request[telemetryv1.CollectWebVitalsRequest],
) (*connect.Response[telemetryv1.CollectWebVitalsResponse], error) {
	msg := req.Msg

	// protovalidate 只做了字段级校验;「至少有一样数据」是跨字段约束,在这里拦。
	// 空请求不是攻击就是客户端 bug,拒收比静默 200 更能暴露问题。
	if len(msg.Vitals) == 0 && len(msg.ApiTimings) == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("either vitals or api_timings must be non-empty"))
	}

	// 身份仅用于日志排查(某个用户说"卡"时能捞到他的记录),不进 metric attribute
	// —— user id 是无界基数。
	userID, _ := identity(req, msg.AnonId)

	var accepted uint32

	for _, v := range msg.Vitals {
		h, ok := s.vitalHist[v.Name]
		if !ok {
			// defined_only 校验过了还进不了表,只可能是 proto 加了新枚举而这里没跟上
			s.log.Warn("web vital without instrument, dropped",
				zap.String("name", v.Name.String()))
			continue
		}
		h.Record(ctx, v.Value, metric.WithAttributes(
			attribute.String("page", v.Page),
			attribute.String("rating", v.Rating),
		))

		// 明细进 Loki:归因(哪个 DOM/哪段脚本)是排查用的,只在日志里有意义
		s.log.Info("web_vital",
			zap.String("metric", v.Name.String()),
			zap.Float64("value", v.Value),
			zap.String("rating", v.Rating),
			zap.String("page", v.Page),
			zap.String("attribution", v.Attribution),
			zap.String("nav_type", v.NavType),
			zap.String("user_id", userID),
			zap.String("session_id", msg.SessionId),
		)
		accepted++
	}

	for _, t := range msg.ApiTimings {
		s.apiHist.Record(ctx, t.DurationMs, metric.WithAttributes(
			// 只挂低基数维度;path 在下面的慢日志里
			attribute.Bool("slow", t.DurationMs >= slowAPIThresholdMs),
		))

		if t.DurationMs >= slowAPIThresholdMs {
			s.log.Warn("slow_frontend_api",
				zap.String("path", t.Path),
				zap.Float64("duration_ms", t.DurationMs),
				zap.Float64("ttfb_ms", t.TtfbMs),
				zap.Float64("dns_ms", t.DnsMs),
				zap.Float64("tcp_ms", t.TcpMs),
				zap.Int64("transfer_size", t.TransferSize),
				zap.String("user_id", userID),
				zap.String("session_id", msg.SessionId),
			)
		}
		accepted++
	}

	return connect.NewResponse(&telemetryv1.CollectWebVitalsResponse{Accepted: accepted}), nil
}
