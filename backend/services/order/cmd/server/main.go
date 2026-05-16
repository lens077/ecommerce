package main

import (
	"context"
	"errors"
	"flag"
	"net/http"
	"os"

	"github.com/lens077/ecommerce/backend/services/order/constants"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain/events"
	"github.com/lens077/ecommerce/backend/services/order/internal/eventbus"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/env"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/kafka"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/meta"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/otel"
	"go.uber.org/fx/fxevent"
	"go.uber.org/zap/zapcore"

	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/order/internal/data"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/config"
	logger "github.com/lens077/ecommerce/backend/services/order/internal/pkg/log"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/registry"
	"github.com/lens077/ecommerce/backend/services/order/internal/server"
	"github.com/lens077/ecommerce/backend/services/order/internal/service"

	"github.com/google/uuid"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var (
	serviceName    = flag.String("serviceName", env.GetEnvString(constants.EnvServiceName, "org-service"), "应用名称, e.g.,org-service")
	serviceVersion = flag.String("serviceVersion", env.GetEnvString(constants.EnvServiceVersion, "v1"), "应用版本,e.g.,v1")
	deploymentMode = flag.String("deploymentMode", env.GetEnvString(constants.EnvDeploymentMode, "dev"), "标记应用部署的环境,e.g.,dev/prod/pre/uat")
)

func main() {
	flag.Parse()

	fxApp := NewApp(
		*serviceName,
		*deploymentMode,
		*serviceVersion,
	)

	ctx := context.Background()

	// 启动应用
	if err := fxApp.Start(ctx); err != nil {
		zap.Error(err)
		os.Exit(1)
	}

	// 等待中断信号
	<-fxApp.Done()

	// 优雅关闭
	if err := fxApp.Stop(ctx); err != nil {
		zap.Error(err)
		os.Exit(1)
	}
}

// NewApp 创建并配置 FX 应用
func NewApp(serviceName, deploymentMode, serviceVersion string) *fx.App {
	host, err := meta.GetOutboundIP()
	if err != nil {
		zap.Error(err)
	}
	appInfo := meta.AppInfo{
		ID:          uuid.New().String(),
		Name:        serviceName,
		Version:     serviceVersion,
		Host:        host,
		Environment: deploymentMode,
	}

	return fx.New(
		logger.Module, // 日志
		config.Module, // 配置
		// 注入 FX 事件日志适配器
		fx.WithLogger(func(log *zap.Logger) fxevent.Logger {
			zlog := &fxevent.ZapLogger{Logger: log}
			// 按需调整日志级别（可选）
			zlog.UseLogLevel(zapcore.InfoLevel)    // 普通事件用 Info 级别
			zlog.UseErrorLevel(zapcore.ErrorLevel) // 错误事件用 Error 级别
			return zlog
		}),

		registry.Module, // 服务注册/发现
		kafka.Module,   // Kafka 消息队列

		// 可观测性 - 根据配置决定是否启用
		fx.Provide(func(conf *confv1.Bootstrap) *confv1.Observability {
			if conf.Observability == nil {
				return &confv1.Observability{Enable: false}
			}
			return conf.Observability
		}),
		otel.Module,

		// 注入业务模块（按依赖顺序）
		data.Module,
		biz.Module,
		service.Module,
		server.MiddlewareModule, // 中间件需要在服务模块之前
		server.Module,

		// 传递全局变量
		fx.Supply(appInfo),

		// 提供事件处理器映射
		fx.Provide(events.OrderCompletedHandlers),

		// 基于处理器映射创建 EventBus
		fx.Provide(eventbus.NewEventBus),

		// 配置 EventBus 的异步模式
		fx.Invoke(func(eb *eventbus.EventBus) {
			eb.Store().Async = true // 开启异步处理，Publish 立即返回
		}),

		// 配置验证和初始化
		fx.Invoke(
			// 注册应用到注册中心
			func(_ *registry.ConsulRegistry) {},

			// 初始化并启动核心应用逻辑
			func(lc fx.Lifecycle, conf *confv1.Bootstrap, logger *zap.Logger, srv *http.Server, otelShutdown func(context.Context) error) {
				lc.Append(fx.Hook{
					// 启动服务时的操作
					OnStart: func(ctx context.Context) error {
						logger.Info("starting server",
							zap.String("addr", srv.Addr),
							zap.String("environment", deploymentMode),
						)
						go func() {
							if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
								logger.Fatal("failed to start server", zap.Error(err))
							}
						}()
						return nil
					},
					// 停止服务前的操作
					OnStop: func(ctx context.Context) error {
						logger.Info("stopping server...")
						// 优雅关闭服务器
						if err := srv.Shutdown(ctx); err != nil {
							logger.Error("failed to shutdown server gracefully", zap.Error(err))
						}
						// 关闭 Otel
						if otelShutdown != nil {
							if err := otelShutdown(ctx); err != nil {
								logger.Error("failed to shutdown otel observability", zap.Error(err))
							}
						}
						return nil
					},
				})
			},
		),
	)
}
