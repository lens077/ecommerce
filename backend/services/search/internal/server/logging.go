package server

import (
	"context"
	"time"

	"connectrpc.com/connect"
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

		resp, err := next(ctx, req)

		duration := time.Since(startTime)
		code := connect.CodeOf(err)
		procedure := req.Spec().Procedure

		fields := []zap.Field{
			zap.String("rpc.service", procedure),
			zap.String("rpc.code", code.String()),
			zap.Duration("duration", duration),
		}

		if err != nil {
			fields = append(fields, zap.Error(err))

			// 错误分级逻辑
			switch code {
			case connect.CodeNotFound, connect.CodeCanceled, connect.CodeInvalidArgument, connect.CodeAlreadyExists, connect.CodeUnauthenticated:
				l.logger.Warn("RPC business error", fields...)
			case connect.CodeDeadlineExceeded:
				l.logger.Warn("RPC deadline exceeded", fields...)
			default:
				// 系统级错误 (Unknown, Internal, DataLoss, etc.)
				l.logger.Error("RPC system error", fields...)
			}
		} else {
			l.logger.Info("RPC success", fields...)
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
