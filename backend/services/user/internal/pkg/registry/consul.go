package registry

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/user/internal/pkg/meta"

	confv1 "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"

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
	Addr   string
	ID     string
	Name   string
	client *api.Client
	logger *zap.Logger
}

type Option func(*options)
type options struct {
	logger  *zap.Logger
	tlsConf *api.TLSConfig
	scheme  string
}

// WithLogger 注入日志器
func WithLogger(logger *zap.Logger) Option {
	return func(o *options) {
		o.logger = logger
	}
}

// WithTLS Consul TLS配置
func WithTLS(insecureSkipVerify bool, caFile string) Option {
	return func(o *options) {
		o.tlsConf = &api.TLSConfig{
			CAFile:             caFile,
			InsecureSkipVerify: insecureSkipVerify,
		}
	}
}

// Module 提供 Fx 模块
var Module = fx.Module("registry",
	fx.Provide(
		// 提供 Consul 注册中心（支持优雅降级）
		func(lc fx.Lifecycle, logger *zap.Logger, conf *confv1.Bootstrap, appInfo meta.AppInfo) (*ConsulRegistry, error) {
			if os.Getenv(constants.EnvConsulEnabled) == "false" {
				logger.Info("Consul disenable by environment variable EnvConsulEnabled=false")
				return nil, nil
			}

			if conf.Discovery == nil || conf.Discovery.Consul == nil || conf.Discovery.Consul.Addr == "" {
				logger.Info("Consul not configured, service discovery disabled")
				return nil, nil
			}
			consulCfg := conf.Discovery.Consul

			opts := []Option{
				WithLogger(logger),
			}
			if consulCfg.Tls.Enable && consulCfg.Tls != nil {
				opts = append(opts, WithTLS(consulCfg.Tls.InsecureSkipVerify, consulCfg.Tls.CaFile))
			}

			reg, err := NewConsulRegistry(consulCfg.Addr, appInfo.ID, appInfo.Name, opts...)
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

func NewConsulRegistry(addr, ID, Name string, opts ...Option) (*ConsulRegistry, error) {
	o := &options{
		scheme: "http",
	}
	for _, opt := range opts {
		opt(o)
	}

	config := api.Config{
		Address: addr,
		Scheme:  o.scheme,
	}

	if o.tlsConf != nil {
		config.Scheme = "https"
		config.TLSConfig = *o.tlsConf
	}

	client, err := api.NewClient(&config)
	if err != nil {
		return nil, err
	}

	return &ConsulRegistry{
		ID:     ID,
		Name:   Name,
		Addr:   addr,
		client: client,
		logger: o.logger,
	}, nil
}

// Register 使用 TTL 健康检查注册服务
func (r *ConsulRegistry) Register() error {
	host, port, err := net.SplitHostPort(r.Addr)
	if err != nil {
		fmt.Printf("拆分失败: %v\n", err)
		return err
	}
	portNum, err := strconv.Atoi(port)
	if err != nil {
		return err
	}
	reg := &api.AgentServiceRegistration{
		ID:      r.ID,
		Name:    r.Name,
		Address: host,
		Port:    portNum,
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

func ParseToTCPAddr(rawURL string) (*net.TCPAddr, error) {
	// 1. 解析 URL 结构
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("parse url failed: %w", err)
	}

	host := u.Host
	if host == "" {
		return nil, fmt.Errorf("empty host in url")
	}

	// 2. 处理端口问题
	// SplitHostPort 如果发现字符串里没有端口会报错，所以需要判断
	finalAddr := host
	if !strings.Contains(host, ":") {
		// 根据 Scheme 补齐默认端口
		port := "80"
		if u.Scheme == "https" {
			port = "443"
		}
		finalAddr = net.JoinHostPort(host, port)
	}

	// 3. 解析为 TCPAddr (包含 DNS 查询)
	tcpAddr, err := net.ResolveTCPAddr("tcp", finalAddr)
	if err != nil {
		return nil, fmt.Errorf("resolve tcp addr failed: %w", err)
	}

	return tcpAddr, nil
}
