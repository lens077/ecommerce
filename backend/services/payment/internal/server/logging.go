package server

import (
	"context"

	"connectrpc.com/connect"
	"github.com/lens077/ecommerce/backend/services/payment/internal/pkg/reqctx"
	"github.com/lens077/go-connect-kit/meta"
	"github.com/lens077/go-connect-kit/rpcobs"
	"go.uber.org/zap"
)

// NewLoggingInterceptor 装配 kit 的 RPC 可观测性拦截器（日志分级、error.reason、error.origin）。
// 实现在 go-connect-kit/rpcobs，十个服务共用一份；这里只追加 payment 独有的 HTTP 方法与路径。
//
// 不记支付表单：下沉前这里把整个 PostForm 以 form_data 打进 Info 日志，支付回调里的买家账号、
// 签名等随每个请求入库，违反 OBSERVABILITY.md §6「凭据不得入日志」（2026-09-24 删除）。
// 排查回调要看表单时，在 service 层按字段白名单记录，不要整包打印。
func NewLoggingInterceptor(logger *zap.Logger, info meta.AppInfo) *rpcobs.Interceptor {
	return rpcobs.New(logger, rpcobs.WithDomain(info.Name), rpcobs.WithExtraFields(
		func(ctx context.Context, _ connect.AnyRequest) []zap.Field {
			httpReq := reqctx.HTTPRequest(ctx)
			if httpReq == nil {
				return nil
			}
			return []zap.Field{
				zap.String("http_method", httpReq.Method),
				zap.String("http_path", httpReq.URL.Path),
			}
		}))
}
