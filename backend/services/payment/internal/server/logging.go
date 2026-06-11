package server

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/lens077/ecommerce/backend/services/payment/internal/pkg/meta"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

type LoggingInterceptor struct {
	logger *zap.Logger
}

func NewLoggingInterceptor(logger *zap.Logger) *LoggingInterceptor {
	return &LoggingInterceptor{logger: logger.Named("LoggingInterceptor")}
}

func (l *LoggingInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		resp, err := next(ctx, req)
		duration := time.Since(start)

		// 从 otelconnect 已经注入好的 ctx 中获取 SpanContext
		span := trace.SpanFromContext(ctx)
		traceID := span.SpanContext().TraceID().String()
		spanID := span.SpanContext().SpanID().String()

		// 基础字段
		fields := []zap.Field{
			zap.String("rpc.code", connect.CodeOf(err).String()),
			zap.String("span_id", spanID),
			zap.String("trace_id", traceID),
			zap.Int64("duration_ms", duration.Milliseconds()),
		}

		// 从 context 中获取原始 HTTP 请求并读取表单数据
		if httpReq := meta.GetHTTPRequest(ctx); httpReq != nil {
			// 确保表单已解析（中间件可能已解析，但再调用一次也无害）
			_ = httpReq.ParseForm()

			// 提取你关心的表单字段（例如从 PostForm 中读取）
			// 注意：PostForm 只包含 application/x-www-form-urlencoded 或 multipart/form-data 的表单参数
			if len(httpReq.PostForm) > 0 {
				// 方法一：将整个 PostForm 转为 zap.Object 或 zap.Any（如果字段不多）
				fields = append(fields, zap.Any("form_data", httpReq.PostForm))

				// 方法二：挑选特定字段（更安全，避免敏感信息泄漏）
				// 例如：userID := httpReq.PostForm.Get("user_id")
				// fields = append(fields, zap.String("user_id", userID))
			}

			// 同时可以记录请求的 method, path 等（Connect 路径已包含在 req.Spec() 中，但有时需要原始路径）
			fields = append(fields,
				zap.String("http_method", httpReq.Method),
				zap.String("http_path", httpReq.URL.Path),
			)
		} else {
			// 没有 HTTP 上下文（例如来自测试或直接调用），可忽略或记录 debug 日志
			l.logger.Debug("no http request in context, cannot read form data")
		}

		if err != nil {
			switch connect.CodeOf(err) {
			case connect.CodeInternal, connect.CodeUnknown, connect.CodeDataLoss:
				l.logger.Error("rpc system error", append(fields, zap.Error(err))...)
			case connect.CodeDeadlineExceeded, connect.CodeUnavailable, connect.CodeAborted:
				l.logger.Warn("rpc infrastructure warning", append(fields, zap.Error(err))...)
			case connect.CodeCanceled:
				l.logger.Debug("rpc request canceled by client", append(fields, zap.Error(err))...)
			default:
				l.logger.Info("rpc business exception", fields...)
			}
		} else {
			l.logger.Info("rpc completed", fields...)
		}

		return resp, err
	}
}

func (l *LoggingInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (l *LoggingInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
