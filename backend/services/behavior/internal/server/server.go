package server

import (
	"context"
	"encoding/json"
	"net/http"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"connectrpc.com/validate"
	"github.com/lens077/ecommerce/backend/api/behavior/v1/behaviorv1connect"
	"github.com/lens077/ecommerce/backend/api/telemetry/v1/telemetryv1connect"
	"github.com/lens077/ecommerce/backend/pkg/healthcheck"
	"github.com/lens077/go-connect-kit/meta"
	conf "github.com/lens077/ecommerce/backend/services/behavior/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/data"
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

func NewHTTPServer(
	lc fx.Lifecycle,
	cfg *conf.Bootstrap,
	behaviorv1Service behaviorv1connect.BehaviorServiceHandler,
	telemetryv1Service telemetryv1connect.TelemetryServiceHandler,
	logger *zap.Logger,
	connectOptions []connect.HandlerOption,
	deps *data.Data,
	info meta.AppInfo,
) *http.Server {

	mux := http.NewServeMux()

	combinedOptions := append(connectOptions, connect.WithInterceptors(validate.NewInterceptor()))

	behaviorv1connectPath, behaviorv1connectHandler := behaviorv1connect.NewBehaviorServiceHandler(
		behaviorv1Service,
		combinedOptions...,
	)
	mux.Handle(behaviorv1connectPath, behaviorv1connectHandler)

	// telemetry.v1 与 behavior.v1 是两个域,共享本进程只是部署上的顺带
	// (见 telemetry.proto 头注释);挂载点分开,将来搬去 analytics 只删这两行
	telemetryv1connectPath, telemetryv1connectHandler := telemetryv1connect.NewTelemetryServiceHandler(
		telemetryv1Service,
		combinedOptions...,
	)
	mux.Handle(telemetryv1connectPath, telemetryv1connectHandler)

	healthPath, healthHandler := healthcheck.NewGRPCHandler(
		func(ctx context.Context) bool { return healthStatus(ctx, deps, info.Version, meta.Version).Healthy },
		behaviorv1connect.BehaviorServiceName,
		telemetryv1connect.TelemetryServiceName,
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

	handlerChain := withCORS(mux, cfg.Server.Cors.AllowedOrigins)
	handlerChain = otelhttp.NewHandler(handlerChain, "behavior-server")

	h2s := &http2.Server{}
	handlerChain = h2c.NewHandler(handlerChain, h2s)

	server := &http.Server{
		Addr:         cfg.Server.Addr,
		Handler:      handlerChain,
		ReadTimeout:  cfg.Server.Http.ReadTimeout.AsDuration(),
		WriteTimeout: cfg.Server.Http.WriteTimeout.AsDuration(),
		IdleTimeout:  cfg.Server.Http.IdleTimeout.AsDuration(),
	}

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

// withCORS 为处理器添加跨域支持。
//
// 埋点用 navigator.sendBeacon 发出去,浏览器不允许给 beacon 带自定义请求头,
// 所以 Track 走的是不带 Connect-Protocol-Version 的简单 POST;
// 这里放行的头集合必须覆盖普通 fetch 那条路径。
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
