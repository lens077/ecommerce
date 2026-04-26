package server

import (
	"context"
	"net/http"
	"time"

	"github.com/sunmery/ecommerce/backend/api/user/v1/userv1connect"
	conf "github.com/sunmery/ecommerce/backend/application/user/internal/conf/v1"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
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
	userv1Service userv1connect.UserServiceHandler,
	logger *zap.Logger,
	connectOptions []connect.HandlerOption,
) *http.Server {

	mux := http.NewServeMux()

	// 注册 Connect 业务处理器
	// 直接展开 (Variadic) 传入所有的拦截器（Tracing, Metrics, Logging）
	userv1connectPath, userv1connectHandler := userv1connect.NewUserServiceHandler(
		userv1Service,
		connectOptions...,
	)
	mux.Handle(userv1connectPath, userv1connectHandler)

	// 注册基础路由（可选）
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// 构建处理器链
	handlerChain := withCORS(mux)

	// 配置 HTTP/2 (h2c) 允许非加密传输
	p := new(http.Protocols)
	p.SetHTTP1(true)
	p.SetUnencryptedHTTP2(true)

	server := &http.Server{
		Addr:         cfg.Server.Http.Addr,
		Handler:      h2c.NewHandler(handlerChain, &http2.Server{}),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
		Protocols:    p,
	}

	// 注册 Fx 生命周期
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			logger.Info("HTTP server starting",
				zap.String("addr", cfg.Server.Http.Addr),
				zap.String("mode", "h2c"),
			)
			return nil
		},
		OnStop: func(ctx context.Context) error {
			logger.Info("HTTP server shutting down...")
			return server.Shutdown(ctx)
		},
	})

	return server
}

// withCORS 为处理器添加跨域支持
func withCORS(h http.Handler) http.Handler {
	middleware := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"}, // 根据需要修改
		AllowedMethods:   connectcors.AllowedMethods(),
		AllowedHeaders:   connectcors.AllowedHeaders(),
		ExposedHeaders:   connectcors.ExposedHeaders(),
		AllowCredentials: true,
	})
	return middleware.Handler(h)
}
