package main

import (
	"connect-go-example/internal/biz"
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"

	confv1 "connect-go-example/internal/conf/v1"
	"connect-go-example/internal/data"
	"connect-go-example/internal/pkg/config"
	logger "connect-go-example/internal/pkg/log"
	"connect-go-example/internal/pkg/otel"
	"connect-go-example/internal/pkg/registry"
	"connect-go-example/internal/server"
	"connect-go-example/internal/service"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

var serviceName = "connect-example-go"

func main() {
	flag.Parse()

	fxApp := NewApp()

	// 启动应用
	if err := fxApp.Start(context.Background()); err != nil {
		log.Printf("Failed to start app: %v\n", err)
		os.Exit(1)
	}

	// 等待中断信号
	<-fxApp.Done()

	// 优雅关闭
	if err := fxApp.Stop(context.Background()); err != nil {
		log.Printf("Failed to stop app gracefully: %v\n", err)
		os.Exit(1)
	}
}

// NewApp 创建并配置 FX 应用
func NewApp() *fx.App {
	return fx.New(
		// 基础模块
		config.Module,   // 配置
		logger.Module,   // 日志
		registry.Module, // 服务注册/发现

		// 注入业务模块（按依赖顺序）
		data.Module,
		biz.Module,
		service.Module,
		server.MiddlewareModule, // 中间件需要在服务模块之前
		server.Module,

		// 传递全局变量
		fx.Supply(serviceName),

		// 配置验证和初始化
		fx.Invoke(
			// 验证配置完整性
			func(conf *confv1.Bootstrap) error {
				return config.ValidateConfig(conf)
			},

			// 注册应用到注册中心
			func(_ *registry.ConsulRegistry) {},

			// 初始化并启动核心应用逻辑
			func(lc fx.Lifecycle, conf *confv1.Bootstrap, logger *zap.Logger, srv *http.Server) {
				// 初始化 Otel
				otelShutdown, err := otel.SetupOTelSDK(context.Background(), conf.Trace, logger)
				if err != nil {
					logger.Fatal("Failed to setup OTel SDK", zap.Error(err))
				}

				lc.Append(fx.Hook{
					// 启动服务时的操作
					OnStart: func(ctx context.Context) error {
						logger.Info("Starting HTTP server", zap.String("addr", srv.Addr))
						go func() {
							if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
								logger.Fatal("Failed to start HTTP server", zap.Error(err))
							}
						}()
						return nil
					},
					// 停止服务前的操作
					OnStop: func(ctx context.Context) error {
						logger.Info("Stopping HTTP server...")
						// 优雅关闭服务器
						if err := srv.Shutdown(ctx); err != nil {
							logger.Error("Failed to shutdown server gracefully", zap.Error(err))
						}
						// 关闭 Otel
						if otelShutdown != nil {
							if err := otelShutdown(ctx); err != nil {
								logger.Error("Failed to shutdown OTel", zap.Error(err))
							}
						}
						return nil
					},
				})
			},
		),
	)
}
