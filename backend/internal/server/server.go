package server

import (
	"context"
	"net/http"
	"time"

	"connect-go-example/api/check/v1/checkv1connect"

	"connect-go-example/api/greet/v1/greetv1connect"
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
	greetv1Service greetv1connect.GreetServiceHandler,
	checkv1Service checkv1connect.CheckServiceHandler,
	logger *zap.Logger,
	monitoringMiddleware func(http.Handler) http.Handler,
	connectInterceptor connect.UnaryInterceptorFunc,
) *http.Server {
	// 1. 创建 OTel Connect 拦截器实例
	otelInterceptor, err := otelconnect.NewInterceptor(
		otelconnect.WithoutServerPeerAttributes(),
	)
	if err != nil {
		logger.Fatal("failed to create otel interceptor", zap.Error(err))
	}

	// 2. 将 OTel 拦截器和监控拦截器加入到 Connect 拦截器列表中
	interceptors := connect.WithInterceptors(otelInterceptor, connectInterceptor)

	// 3. 将拦截器传递给 Service Handler
	greetv1connectPath, greetv1connectHandler := greetv1connect.NewGreetServiceHandler(
		greetv1Service,
		interceptors,
	)
	checkv1connectPath, checkv1connectHandler := checkv1connect.NewCheckServiceHandler(
		checkv1Service,
		interceptors,
	)

	mux := http.NewServeMux()
	mux.Handle(greetv1connectPath, greetv1connectHandler)
	mux.Handle(checkv1connectPath, checkv1connectHandler)

	// CORS 配置
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   connectcors.AllowedMethods(),
		AllowedHeaders:   connectcors.AllowedHeaders(),
		ExposedHeaders:   connectcors.ExposedHeaders(),
		MaxAge:           7200,
		AllowCredentials: false,
	})

	// 创建处理器链：监控中间件 -> CORS -> HTTP/2
	handlerChain := monitoringMiddleware(corsHandler.Handler(mux))

	server := &http.Server{
		Addr:         cfg.Server.Http.Addr,
		Handler:      h2c.NewHandler(handlerChain, &http2.Server{}),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
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
