package main

import (
	"context"
	"errors"
	"flag"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/env"
	"github.com/lens077/ecommerce/backend/pkg/meta"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain/events"
	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/order/internal/data"
	"github.com/lens077/ecommerce/backend/services/order/internal/eventbus"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/config"
	logger "github.com/lens077/ecommerce/backend/services/order/internal/pkg/log"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/otel"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/registry"
	"github.com/lens077/ecommerce/backend/services/order/internal/server"
	"github.com/lens077/ecommerce/backend/services/order/internal/service"
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

	// 启动应用
	if err := fxApp.Start(context.Background()); err != nil {
		zap.Error(err)
		os.Exit(1)
	}

	// 等待中断信号
	<-fxApp.Done()

	// 优雅关闭
	// 定制一个超时的 Context
	// 确保所有微服务的 OnStop 钩子（包括 Consul 注销、HTTP 关闭、OTel 刷盘）必须在定义的值内收尾
	stopCtx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()
	if err := fxApp.Stop(stopCtx); err != nil {
		zap.Error(err)
		os.Exit(1)
	}
}

// NewApp 创建并配置 FX 应用
func NewApp(serviceName, deploymentMode, serviceVersion string) *fx.App {
	return fx.New(appOptions(serviceName, deploymentMode, serviceVersion)...)
}

// appOptions 单独拆出来是为了能用 fx.ValidateApp 静态校验整张依赖图。
func observabilityFromBootstrap(conf *confv1.Bootstrap) *confv1.Observability {
	if conf.Observability == nil {
		return &confv1.Observability{Enable: false}
	}
	return conf.Observability
}

func appOptions(serviceName, deploymentMode, serviceVersion string) []fx.Option {
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

	return []fx.Option{
		logger.Module, // 业务日志

		config.Module,     // 配置
		logger.FxLogger(), // Fx框架本身的日志控制器

		registry.Module, // 服务注册/发现

		// 可观测性 - 根据配置决定是否启用
		fx.Provide(observabilityFromBootstrap),
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
			// 打印本次启动实际生效的配置数据源,避免「改了配置没生效」时靠猜
			func(live *config.Live, logger *zap.Logger) {
				logger.Info("bootstrap config loaded",
					zap.String("source", live.SourceName()),
				)
			},

			// 启动之前初始化 Consul 注册中心
			func(reg *registry.ConsulRegistry, logger *zap.Logger) {
				if reg != nil {
					logger.Info("consul service discovery component lifecycle successfully initialized")
				}
			},

			// 初始化并启动核心应用逻辑
			func(lc fx.Lifecycle, logger *zap.Logger, srv *http.Server, otelShutdown func(context.Context) error) {
				lc.Append(fx.Hook{
					// 启动服务时的操作
					// 这里仅需要启动全局的服务, 例如HTTP, 对于模块, 在实现它们的地方添加OnStart即可
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
					// 这里仅需要停止全局的服务, 例如HTTP, 对于模块, 在实现它们的地方添加OnStop即可
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
	}
}
