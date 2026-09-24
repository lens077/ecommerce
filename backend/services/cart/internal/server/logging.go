package server

import (
	"github.com/lens077/go-connect-kit/meta"
	"github.com/lens077/go-connect-kit/rpcobs"
	"go.uber.org/zap"
)

// NewLoggingInterceptor 装配 kit 的 RPC 可观测性拦截器（日志分级、error.reason、error.origin）。
// 实现在 go-connect-kit/rpcobs，十个服务共用一份；服务名作为返回给客户端的 ErrorInfo.Domain。
func NewLoggingInterceptor(logger *zap.Logger, info meta.AppInfo) *rpcobs.Interceptor {
	return rpcobs.New(logger, rpcobs.WithDomain(info.Name))
}
