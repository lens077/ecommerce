package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"connectrpc.com/validate"
	"github.com/lens077/ecommerce/backend/api/payment/v1/paymentv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/healthcheck"
	"github.com/lens077/ecommerce/backend/pkg/meta"
	conf "github.com/lens077/ecommerce/backend/services/payment/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/payment/internal/data"
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
	paymentv1Service paymentv1connect.PaymentServiceHandler,
	logger *zap.Logger,
	connectOptions []connect.HandlerOption,
	deps *data.Data, // 基础设施依赖
	info meta.AppInfo,
) *http.Server {

	mux := http.NewServeMux()

	// 将 validate 拦截器添加到选项中
	combinedOptions := append(connectOptions, connect.WithInterceptors(validate.NewInterceptor()))

	// 注册 Connect 业务处理器
	paymentv1connectPath, paymentv1connectHandler := paymentv1connect.NewPaymentServiceHandler(
		paymentv1Service,
		combinedOptions...,
	)
	mux.Handle(paymentv1connectPath, paymentv1connectHandler)

	healthPath, healthHandler := healthcheck.NewGRPCHandler(
		func(ctx context.Context) bool { return healthStatus(ctx, deps, info.Version, meta.Version).Healthy },
		paymentv1connect.PaymentServiceName,
	)
	mux.Handle(healthPath, healthHandler)

	// 应用本身的健康检查
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		status := healthStatus(r.Context(), deps, info.Version, meta.Version)
		w.Header().Set("Content-Type", "application/json")
		if !status.Healthy {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(status)
	})

	// 构建处理器链
	// handlerChain := withCORS(mux, cfg.Server.Cors.AllowedOrigins)
	handlerChain := requestInjectorMiddleware(withCORS(mux, cfg.Server.Cors.AllowedOrigins))

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

// requestInjectorMiddleware 将 *http.Request 注入到 context 中，
// 以便在 connect 拦截器或业务处理器中可以获取到原始的 HTTP 请求。
func requestInjectorMiddleware(next http.Handler) http.Handler {

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 如果请求是表单请求，可以在这里完成表单解析
		if r.Method == http.MethodPost && r.Header.Get("Content-Type") == "application/x-www-form-urlencoded" {
			if err := r.ParseForm(); err != nil {
				fmt.Println("failed to parse form data", err.Error())
			}
		}

		// 将原始的 *http.Request 存入上下文中
		ctx := context.WithValue(r.Context(), constants.HttpRequestKey, r)
		// 使用携带了新上下文的请求，继续调用下一个处理器
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
