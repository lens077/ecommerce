package server

import (
	"connect-go-example/api/search/v1/searchv1connect"
	"connect-go-example/api/user/v1/userv1connect"
	"context"
	"net/http"
	"time"

	"connect-go-example/api/check/v1/checkv1connect"

	conf "connect-go-example/internal/conf/v1"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"connectrpc.com/otelconnect"
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
	userv1Service userv1connect.UserServiceHandler,
	checkv1Service checkv1connect.CheckServiceHandler,
	searchv1Service searchv1connect.SearchServiceHandler,
	logger *zap.Logger,
	monitoringMiddleware func(http.Handler) http.Handler,
	connectInterceptor connect.UnaryInterceptorFunc,
) *http.Server {
	// 创建 OTel Connect 拦截器实例
	otelInterceptor, err := otelconnect.NewInterceptor(
		otelconnect.WithoutServerPeerAttributes(),
	)
	if err != nil {
		logger.Fatal("failed to create otel interceptor", zap.Error(err))
	}

	// 将 OTel 拦截器和监控拦截器加入到 Connect 拦截器列表中
	interceptors := connect.WithInterceptors(otelInterceptor, connectInterceptor)

	// 将拦截器传递给 Service Handler
	userv1connectPath, userv1connectHandler := userv1connect.NewUserServiceHandler(
		userv1Service,
		interceptors,
	)
	checkv1connectPath, checkv1connectHandler := checkv1connect.NewCheckServiceHandler(
		checkv1Service,
		interceptors,
	)
	searchv1connectPath, searchv1connectHandler := searchv1connect.NewSearchServiceHandler(
		searchv1Service,
		interceptors,
	)

	mux := http.NewServeMux()
	mux.Handle(userv1connectPath, userv1connectHandler)
	mux.Handle(checkv1connectPath, checkv1connectHandler)
	mux.Handle(searchv1connectPath, searchv1connectHandler)

	// 创建处理器链：监控中间件 -> CORS -> HTTP/2
	handlerChain := monitoringMiddleware(withCORS(mux))

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
