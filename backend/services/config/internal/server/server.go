package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"connectrpc.com/validate"
	"github.com/lens077/ecommerce/backend/api/config/v1/configv1connect"
	conf "github.com/lens077/ecommerce/backend/services/config/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/config/internal/data"
	"github.com/rs/cors"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

var Module = fx.Module("server",
	fx.Provide(
		NewHTTPServer,
	),
)

// NewHTTPServer 构造函数已重构
func NewHTTPServer(
	lc fx.Lifecycle,
	cfg *conf.Bootstrap,
	configv1Service configv1connect.ConfigServiceHandler,
	logger *zap.Logger,
	connectOptions []connect.HandlerOption,
	deps *data.Data, // 基础设施依赖
) *http.Server {

	mux := http.NewServeMux()

	// 将 validate 拦截器添加到选项中
	combinedOptions := append(connectOptions, connect.WithInterceptors(validate.NewInterceptor()))

	// 注册 Connect 业务处理器
	configv1connectPath, configv1connectHandler := configv1connect.NewConfigServiceHandler(
		configv1Service,
		combinedOptions...,
	)
	mux.Handle(configv1connectPath, configv1connectHandler)

	// 应用本身的健康检查
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		status := healthStatus(r.Context(), deps)
		w.Header().Set("Content-Type", "application/json")
		if !status.Healthy {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(status)
	})

	// 构建处理器链
	handlerChain := withCORS(mux, cfg.Server.Cors.AllowedOrigins)

	// WatchKeys 是长连接流,必须排在 WriteTimeout 之外(见 withoutWriteTimeout)
	handlerChain = withoutWriteTimeout(handlerChain, logger,
		configv1connect.ConfigServiceWatchKeysProcedure)

	// 配置 HTTP/2 (H2C - 明文 HTTP/2)
	h2s := &http2.Server{}
	// 使用 h2c 包装处理器，支持同时处理 HTTP/1.1 和 HTTP/2
	handlerChain = h2c.NewHandler(handlerChain, h2s)

	server := &http.Server{
		Addr:         cfg.Server.Addr,
		Handler:      handlerChain,
		ReadTimeout:  cfg.Server.Http.ReadTimeout.AsDuration(),
		WriteTimeout: cfg.Server.Http.WriteTimeout.AsDuration(),
		IdleTimeout:  cfg.Server.Http.IdleTimeout.AsDuration(),
	}

	// 注册 Fx 生命周期
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			logger.Info("http server starting",
				zap.String("addr", cfg.Server.Addr),
			)
			return nil
		},
		OnStop: func(ctx context.Context) error {
			logger.Info("http server shutting down...")
			return server.Shutdown(ctx)
		},
	})

	return server
}

// withoutWriteTimeout 清掉指定路由的写截止时间。
//
// http.Server.WriteTimeout 在请求开始时就把整个响应的写截止时间钉死,
// 它衡量的是「一元请求多久必须答完」,对长连接流则是致命的:
// 快照能写出去,之后第一个心跳(30s)必然踩到 5s 的截止时间而失败,
// 流就此断掉,客户端每 30s 重连一次并重收一遍快照 —— 功能看似正常,实则一直在抖。
//
// 只对流式路由清掉,其余接口继续受 WriteTimeout 保护。
func withoutWriteTimeout(h http.Handler, logger *zap.Logger, procedures ...string) http.Handler {
	streaming := make(map[string]struct{}, len(procedures))
	for _, p := range procedures {
		streaming[p] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := streaming[r.URL.Path]; ok {
			// 零值 = 不设截止时间;流的存活由 ctx(客户端断开)与心跳负责
			if err := http.NewResponseController(w).SetWriteDeadline(time.Time{}); err != nil {
				// 不中断请求:退化成「流最多活 WriteTimeout 那么久」,靠客户端重连兜底
				logger.Warn("无法清除流式响应的写截止时间,该流会受 WriteTimeout 限制",
					zap.String("procedure", r.URL.Path), zap.Error(err))
			}
		}
		h.ServeHTTP(w, r)
	})
}

// withCORS 为处理器添加跨域支持
func withCORS(h http.Handler, allowedOrigins []string) http.Handler {
	middleware := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   connectcors.AllowedMethods(),
		AllowedHeaders:   connectcors.AllowedHeaders(),
		ExposedHeaders:   connectcors.ExposedHeaders(),
		AllowCredentials: true,
	})
	return middleware.Handler(h)
}
