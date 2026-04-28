package server

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

type LoggingInterceptor struct {
	logger *zap.Logger
}

func NewLoggingInterceptor(logger *zap.Logger) *LoggingInterceptor {
	return &LoggingInterceptor{logger: logger}
}

func (l *LoggingInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		startTime := time.Now()

		// 从 context 获取当前的 Span 信息
		span := trace.SpanFromContext(ctx)

		resp, err := next(ctx, req)

		duration := time.Since(startTime)
		code := connect.CodeOf(err)
		procedure := req.Spec().Procedure

		fields := []zap.Field{
			zap.String("rpc.service", procedure),
			zap.String("rpc.code", code.String()),
			zap.Duration("duration", duration),
			zap.String("trace_id", span.SpanContext().TraceID().String()), // 提取 TraceID 存入日志字段
		}

		if err != nil {
			fields = append(fields, zap.Error(err))

			// 错误分级逻辑
			switch code {
			case connect.CodeNotFound, connect.CodeCanceled, connect.CodeInvalidArgument, connect.CodeAlreadyExists, connect.CodeUnauthenticated:
				l.logger.Warn(err.Error(), fields...)
			case connect.CodeDeadlineExceeded:
				l.logger.Warn(err.Error(), fields...)
			default:
				// 系统级错误 (Unknown, Internal, DataLoss, etc.)
				l.logger.Error(err.Error(), fields...)
			}
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
