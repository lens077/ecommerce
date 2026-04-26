package server

import (
	"context"
	"net/http"
	"time"

	"github.com/sunmery/ecommerce/backend/api/search/v1/searchv1connect"

	conf "github.com/sunmery/ecommerce/backend/application/search/internal/conf/v1"

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

func NewHTTPServer(
	lc fx.Lifecycle,
	cfg *conf.Bootstrap,
	searchv1Service searchv1connect.SearchServiceHandler,

	logger *zap.Logger,
	connectOptions []connect.HandlerOption,
) *http.Server {
	// 将拦截器传递给 Service Handler
	userv1connectPath, userv1connectHandler := searchv1connect.NewSearchServiceHandler(
		searchv1Service,
		connectOptions...,
	)

	mux := http.NewServeMux()
	mux.Handle(userv1connectPath, userv1connectHandler)

	// 创建处理器链：监控中间件 -> CORS -> HTTP/2
	handlerChain := withCORS(mux)

	p := new(http.Protocols)
	p.SetHTTP1(true)
	// Use h2c so we can serve HTTP/2 without TLS.
	p.SetUnencryptedHTTP2(true)
	server := &http.Server{
		Addr:         cfg.Server.Http.Addr,
		Handler:      h2c.NewHandler(handlerChain, &http2.Server{}),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
		Protocols:    p,
	}

	// 注册生命周期钩子
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			logger.Info("HTTP server starting", zap.String("addr", cfg.Server.Http.Addr))
			return nil
		},
		OnStop: func(ctx context.Context) error {
			logger.Info("HTTP server shutting down...")
			return server.Shutdown(ctx)
		},
	})

	return server
}

// withCORS adds CORS support to a Connect HTTP handler.
func withCORS(h http.Handler) http.Handler {
	middleware := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   connectcors.AllowedMethods(),
		AllowedHeaders:   connectcors.AllowedHeaders(),
		ExposedHeaders:   connectcors.ExposedHeaders(),
		AllowCredentials: true,
	})
	return middleware.Handler(h)
}
