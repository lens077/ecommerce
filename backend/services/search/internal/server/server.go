package server

import (
	"context"
	"encoding/json"
	"net/http"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	connectcors "connectrpc.com/cors"
	"github.com/lens077/ecommerce/backend/api/search/v1/searchv1connect"
	"github.com/lens077/ecommerce/backend/pkg/healthcheck"
	conf "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/search/internal/data"
	"github.com/lens077/go-connect-kit/meta"
	"github.com/rs/cors"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
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
	searchv1Service searchv1connect.SearchServiceHandler,
	logger *zap.Logger,
	interceptors []connect.ServerInterceptor,
	deps *data.Data, // 基础设施依赖
	info meta.AppInfo,
) *http.Server {

	mux := http.NewServeMux()

	// connect v2:拦截器挂在 Server 上,对 Server 上全部服务生效;validate 已并进
	// middleware 组装(最外层)。所有 Register 必须在 Mount 之前 —— Mount 按当前
	// 过程表装配 HTTP 路由,后注册的过程不会被路由。
	server := connect.NewServer(interceptors...)

	searchv1connect.RegisterSearchServiceHandler(server, searchv1Service)

	healthcheck.Register(server,
		func(ctx context.Context) bool { return healthStatus(ctx, deps, info.Version, meta.Version).Healthy },
		searchv1connect.SearchServiceName,
	)

	connecthttp.Mount(mux, server)

	// 应用本身的健康检查
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		status := healthStatus(r.Context(), deps, info.Version, meta.Version)
		w.Header().Set("Content-Type", "application/json")
		if !status.Healthy {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(status)
	})

	handlerChain := withCORS(mux, cfg.Server.Cors.AllowedOrigins)
	handlerChain = otelhttp.NewHandler(handlerChain, "search-server")

	h2s := &http2.Server{}
	handlerChain = h2c.NewHandler(handlerChain, h2s)

	httpServer := &http.Server{
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
			return httpServer.Shutdown(ctx)
		},
	})

	return httpServer
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
