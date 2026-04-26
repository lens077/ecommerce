package registry

import (
	"context"
	"fmt"
	"net"
	"os"
	"strconv"
	"time"

	"github.com/sunmery/ecommerce/backend/application/user/internal/pkg/meta"

	confv1 "github.com/sunmery/ecommerce/backend/application/user/internal/conf/v1"

	"github.com/hashicorp/consul/api"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

//	TtlDuration 定义了 Consul Agent 期望的心跳时间间隔。
// 建议：TTL 持续时间（如 15s）应比心跳间隔（如 5s）长，以提供冗余。
const (
	TtlDuration     = "30s"
	TtlPingInterval = 10 * time.Second
)

type ConsulRegistry struct {
	client  *api.Client
	logger  *zap.Logger
	ID      string
	Name    string
	Version string
	Host    string
	Port    int
}

// Module 提供 Fx 模块
var Module = fx.Module("registry",
	fx.Provide(
		// 提供 Consul 注册中心（支持优雅降级）
		func(lc fx.Lifecycle, logger *zap.Logger, conf *confv1.Bootstrap, appInfo meta.AppInfo) (*ConsulRegistry, error) {
			if os.Getenv("DISABLE_CONSUL") == "true" {
				logger.Info("Consul disabled by environment variable DISABLE_CONSUL=true")
				return nil, nil
			}

			if conf.Discovery == nil || conf.Discovery.Consul == nil || conf.Discovery.Consul.Addr == "" {
				logger.Info("Consul not configured, service discovery disabled")
				return nil, nil
			}

			consulAddr := conf.Discovery.Consul.Addr
			serviceScheme := conf.Discovery.Consul.Scheme

			// 解析端口
			_, portStr, err := net.SplitHostPort(conf.Server.Http.Addr)
			if err != nil {
				return nil, fmt.Errorf("failed to parse service address: %w", err)
			}
			Port, err := strconv.Atoi(portStr)
			if err != nil {
				return nil, fmt.Errorf("failed to parse service port: %w", err)
			}

			// 获取 Pod 或机器的 IP 地址
			logger.Info("Initializing Consul registry", zap.String("addr", consulAddr), zap.String("Host", appInfo.Host))

			reg, err := NewConsulRegistry(consulAddr, appInfo.ID, appInfo.Name, appInfo.Version, Port, serviceScheme, appInfo.Host, logger)
			if err != nil {
				logger.Warn("Failed to initialize Consul registry, service discovery disabled", zap.Error(err))
				return nil, nil
			}

			// 使用生命周期钩子自动注册、启动心跳和注销
			lc.Append(fx.Hook{
				OnStart: func(ctx context.Context) error {
					if err := reg.Register(); err != nil {
						logger.Warn("Failed to register with Consul, service discovery disabled", zap.Error(err))
						return nil // 允许应用继续运行
					}

					// 启动 TTL 心跳 Pinger
					go reg.TtlCheckPinger(context.Background())
					return nil
				},
				OnStop: func(ctx context.Context) error {
					if reg != nil {
						// Deregister() 也会停止心跳，但我们不需要显式停止 TtlCheckPinger，
						// 因为 Deregister 是 OnStop 的一部分，当应用退出时，TtlCheckPinger 的 context 也会关闭。
						if err := reg.Deregister(); err != nil {
							logger.Warn("Failed to deregister from Consul", zap.Error(err))
						}
					}
					return nil
				},
			})
			return reg, nil
		},
	),
)

func NewConsulRegistry(addr, ID, Name, Version string, Port int, serviceScheme string, Host string, logger *zap.Logger, ) (*ConsulRegistry, error) {
	config := &api.Config{
		Address: addr,
		Scheme:  serviceScheme,
	}
	client, err := api.NewClient(config)
	if err != nil {
		return nil, err
	}

	return &ConsulRegistry{
		client: client,
		logger: logger,
		ID:     ID,
		Name:   fmt.Sprintf("%s-%s", Name, Version),
		Port:   Port,
		Host:   Host,
	}, nil
}

// Register 使用 TTL 健康检查注册服务
func (r *ConsulRegistry) Register() error {
	reg := &api.AgentServiceRegistration{
		ID:      r.ID,
		Name:    r.Name,
		Address: r.Host,
		Port:    r.Port,
		Tags:    []string{r.Name, "fx", "ttl"}, // 增加 'ttl' tag
		Check: &api.AgentServiceCheck{
			// 1. 使用 TTL 替换 HTTP/TCP 检查
			TTL: TtlDuration,
			// 2. 配置在检查失败后自动注销
			DeregisterCriticalServiceAfter: "1m",
		},
	}

	if err := r.client.Agent().ServiceRegister(reg); err != nil {
		r.logger.Error("Failed to register service with Consul", zap.Error(err))
		return err
	}

	r.logger.Info("Service registered with Consul using TTL check", zap.String("id", r.ID), zap.String("ttl", TtlDuration))
	return nil
}

// TtlCheckPinger 负责定期向 Consul Agent 发送心跳信号
func (r *ConsulRegistry) TtlCheckPinger(ctx context.Context) {
	ticker := time.NewTicker(TtlPingInterval)
	defer ticker.Stop()

	// Consul Agent 要求 CheckID 必须是 "service:<ID>" 的格式
	checkID := fmt.Sprintf("service:%s", r.ID)

	r.logger.Info("Starting TTL pinger", zap.Duration("interval", TtlPingInterval), zap.String("checkID", checkID))

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("TTL pinger stopped gracefully")
			return
		case <-ticker.C:
			// 发送 'pass' 状态的心跳
			err := r.client.Agent().UpdateTTL(checkID, "TTL check passing", api.HealthPassing)
			if err != nil {
				// 记录错误，但不退出 Pinger，因为这可能是暂时的网络问题
				// 如果长时间失败，Consul Agent 会将服务标记为 Critical
				r.logger.Error("Failed to update Consul TTL", zap.Error(err), zap.String("ID", r.ID))
			}
		}
	}
}

func (r *ConsulRegistry) Deregister() error {
	r.logger.Info("Deregistering service from Consul", zap.String("id", r.ID))
	return r.client.Agent().ServiceDeregister(r.ID)
}
