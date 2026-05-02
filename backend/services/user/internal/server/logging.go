package server

import (
	"context"
	"fmt"
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
		start := time.Now()
		span := trace.SpanFromContext(ctx)
		resp, err := next(ctx, req)
		duration := time.Since(start)

		// 只记录一条统一的调用完成日志
		fields := []zap.Field{
			zap.String("rpc.procedure", req.Spec().Procedure),
			zap.String("rpc.code", connect.CodeOf(err).String()),
			zap.Duration("duration", duration),
			zap.String("trace_id", span.SpanContext().TraceID().String()),
		}

		if err != nil {
			l.logger.Warn(fmt.Sprintf("rpc call finished with error: %v", err),
				append(fields, zap.Error(err))...)
		} else {
			l.logger.Info("rpc call finished", fields...)
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
