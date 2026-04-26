package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/sunmery/ecommerce/backend/application/user/internal/biz"
	"github.com/sunmery/ecommerce/backend/application/user/internal/pkg/meta"
	"github.com/sunmery/ecommerce/backend/application/user/internal/pkg/otel"

	confv1 "github.com/sunmery/ecommerce/backend/application/user/internal/conf/v1"
	"github.com/sunmery/ecommerce/backend/application/user/internal/data"
	"github.com/sunmery/ecommerce/backend/application/user/internal/pkg/config"
	logger "github.com/sunmery/ecommerce/backend/application/user/internal/pkg/log"
	"github.com/sunmery/ecommerce/backend/application/user/internal/pkg/registry"
	"github.com/sunmery/ecommerce/backend/application/user/internal/server"
	"github.com/sunmery/ecommerce/backend/application/user/internal/service"

	"github.com/google/uuid"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var (
	// 优先读取环境变量，如果没有则使用默认值
	serviceName  = flag.String("name", getEnv("SERVICE_NAME", "user-identity"), "服务名称")
	configCenter = flag.String("config-center", getEnv("CONFIG_CENTER", ""), "配置中心地址")
	configPath   = flag.String("config-path", getEnv("CONFIG_PATH", ""), "配置路径")

	serviceVersion        = flag.String("version", "v1", "服务版本号")
	deploymentEnvironment = flag.String("environment", "dev", "部署环境")
	configCenterToken     = flag.String("config-center-token", "", "配置中心令牌")
)

func main() {
	flag.Parse()
	setConsulEnv()

	fxApp := NewApp(
		*serviceName,
		*serviceVersion,
		*deploymentEnvironment,
	)

	ctx := context.Background()

	// 启动应用
	if err := fxApp.Start(ctx); err != nil {
		log.Printf("Failed to start app: %v\n", err)
		os.Exit(1)
	}

	// 等待中断信号
	<-fxApp.Done()

	// 优雅关闭
	if err := fxApp.Stop(ctx); err != nil {
		log.Printf("Failed to stop app gracefully: %v\n", err)
		os.Exit(1)
	}
}

// NewApp 创建并配置 FX 应用
func NewApp(serviceName, serviceVersion, deploymentEnvironment string) *fx.App {
	host, err := meta.GetOutboundIP()
	if err != nil {
		fmt.Printf("Warn: not get host:%v", err)
	}
	appInfo := meta.AppInfo{
		ID:          uuid.New().String(),
		Name:        serviceName,
		Host:        host,
		Version:     serviceVersion,
		Environment: deploymentEnvironment,
	}

	return fx.New(
		// 基础模块
		logger.Module,   // 日志
		config.Module,   // 配置
		registry.Module, // 服务注册/发现

		// 可观测性
		fx.Provide(func(conf *confv1.Bootstrap) *confv1.Trace {
			return conf.Trace
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

		// 配置验证和初始化
		fx.Invoke(
			// 验证配置完整性
			func(conf *confv1.Bootstrap) error {
				return config.ValidateConfig(conf)
			},

			// 注册应用到注册中心
			func(_ *registry.ConsulRegistry) {},

			// 初始化并启动核心应用逻辑
			func(lc fx.Lifecycle, conf *confv1.Bootstrap, logger *zap.Logger, srv *http.Server, otelShutdown func(context.Context) error) {
				lc.Append(fx.Hook{
					// 启动服务时的操作
					OnStart: func(ctx context.Context) error {
						logger.Info("Starting HTTP server",
							zap.String("addr", srv.Addr),
							zap.String("version", serviceVersion),
							zap.String("environment", deploymentEnvironment),
						)
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

func setConsulEnv() {
	// 设置consul 相关的环境变量
	if *configCenter != "" {
		os.Setenv("CONFIG_CENTER", *configCenter)
	}
	if *configPath != "" {
		os.Setenv("CONFIG_PATH", *configPath)
	}
	if *configCenterToken != "" {
		os.Setenv("CONFIG_CENTER_TOKEN", *configCenterToken)
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
