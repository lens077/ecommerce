package main

import (
	"context"
	"errors"
	"flag"
	"net/http"
	"os"
	"time"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/biz"
	confv1 "github.com/lens077/ecommerce/backend/services/behavior/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/data"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/pkg/config"
	logger "github.com/lens077/ecommerce/backend/services/behavior/internal/pkg/log"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/pkg/otel"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/pkg/registry"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/server"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/service"
	"github.com/lens077/go-connect-kit/env"
	"github.com/lens077/go-connect-kit/meta"
	kitregistry "github.com/lens077/go-connect-kit/registry"

	"github.com/google/uuid"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var (
	serviceName    = flag.String("serviceName", env.GetEnvString(constants.EnvServiceName, "behavior"), "应用名称, e.g.,behavior")
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

	if err := fxApp.Start(context.Background()); err != nil {
		zap.Error(err)
		os.Exit(1)
	}

	<-fxApp.Done()

	// 关停留够时间给行为队列排空:队列里的事件此时还没落库,直接退就丢了
	stopCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
		// 基础模块
		logger.Module,     // 日志
		config.Module,     // 配置
		logger.FxLogger(), // Fx框架本身的日志控制器

		registry.Module, // 服务注册/发现

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

		fx.Supply(appInfo),

		fx.Invoke(
			// 打印本次启动实际生效的配置数据源,避免「改了配置没生效」时靠猜
			func(live *config.Live, logger *zap.Logger) {
				logger.Info("bootstrap config loaded",
					zap.String("source", live.SourceName()),
				)
			},

			func(reg *kitregistry.ConsulRegistry, logger *zap.Logger) {
				if reg != nil {
					logger.Info("consul service discovery component lifecycle successfully initialized")
				}
			},

			// 强制实例化 UseCase:采集队列的 worker 挂在它的生命周期钩子上,
			// 不显式引用的话 fx 只会在有人依赖时才构造它。
			func(uc *biz.BehaviorUseCase) {},

			func(lc fx.Lifecycle, conf *confv1.Bootstrap, d *data.Data, logger *zap.Logger, srv *http.Server, otelShutdown func(context.Context) error) {
				lc.Append(fx.Hook{
					OnStart: func(ctx context.Context) error {
						logger.Info("performing startup health checks...")

						if err := d.CheckDatabase(ctx); err != nil {
							return err
						}
						if err := d.CheckCache(ctx); err != nil {
							return err
						}
						// gorse 不通不阻断启动:行为照样落库,等它回来由补偿任务补投。
						// 让一个推荐系统的可用性绑住整条埋点链路是本末倒置。
						if err := d.CheckGorse(ctx); err != nil {
							logger.Warn("gorse unreachable at startup, events will be replayed later", zap.Error(err))
						}

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
					OnStop: func(ctx context.Context) error {
						logger.Info("stopping server...")
						if err := srv.Shutdown(ctx); err != nil {
							logger.Error("failed to shutdown server gracefully", zap.Error(err))
						}

						if t, ok := http.DefaultTransport.(*http.Transport); ok {
							t.CloseIdleConnections()
						}

						if otelShutdown != nil {
							return otelShutdown(ctx)
						}
						return nil
					},
				})
			},
		),
	}
}
