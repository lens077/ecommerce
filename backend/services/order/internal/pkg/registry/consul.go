package registry

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/config"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/meta"

	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"

	"github.com/hashicorp/consul/api"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// defaultTtlPingInterval 是 discovery.consul.check.ttl.ping_interval 缺失时的兜底心跳间隔
const defaultTtlPingInterval = 10 * time.Second

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
func WithTLS(insecureSkipVerify bool, caPem string) Option {
	return func(o *options) {
		o.tlsConf = &api.TLSConfig{
			CAPem:              []byte(caPem),
			InsecureSkipVerify: insecureSkipVerify,
		}
	}
}

// Module 提供 Fx 模块
var Module = fx.Module("registry",
	fx.Provide(
		// 提供 Consul 注册中心（支持优雅降级）
		func(lc fx.Lifecycle, logger *zap.Logger, appInfo meta.AppInfo) (*ConsulRegistry, error) {
			conf := config.GetConfig()
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
			// 判空必须在解引用之前:配置里没写 tls 段时 Tls 为 nil,反过来写会直接 panic
			if consulCfg.Tls != nil && consulCfg.Tls.Enable {
				opts = append(opts, WithTLS(consulCfg.Tls.InsecureSkipVerify, consulCfg.Tls.CaPem))
			}

			reg, err := NewConsulRegistry(consulCfg.Addr, appInfo.ID, appInfo.Name, opts...)
			if err != nil {
				logger.Warn("failed to initialize Consul registry, service discovery disabled", zap.Error(err))
				return nil, nil
			}

			// 使用生命周期钩子自动注册、启动心跳和注销
			lc.Append(fx.Hook{
				OnStart: func(ctx context.Context) error {
					if err := reg.Register(appInfo); err != nil {
						logger.Warn("failed to register with Consul, service discovery disabled", zap.Error(err))
						return nil // 允许应用继续运行
					}

					// 启动 TTL 心跳 Pinger
					go reg.TtlCheckPinger(context.Background(), conf)
					return nil
				},
				OnStop: func(ctx context.Context) error {
					if reg != nil {
						// Deregister() 也会停止心跳，但我们不需要显式停止 TtlCheckPinger，
						// 因为 Deregister 是 OnStop 的一部分，当应用退出时，TtlCheckPinger 的 context 也会关闭。
						if err := reg.Deregister(); err != nil {
							logger.Warn("failed to deregister from Consul", zap.Error(err))
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
		scheme: constants.ConsulScheme,
	}
	for _, opt := range opts {
		opt(o)
	}

	consulConfig := api.Config{
		Address: addr,
		Scheme:  o.scheme,
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 5 * time.Second, // 建立连接超时
			}).DialContext,
			TLSHandshakeTimeout: 5 * time.Second, // TLS 握手超时
		},
		WaitTime: 10 * time.Second,
	}

	if o.tlsConf != nil {
		consulConfig.Scheme = constants.ConsulTlsScheme
		consulConfig.TLSConfig = *o.tlsConf
	}

	client, err := api.NewClient(&consulConfig)
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
func (r *ConsulRegistry) Register(info meta.AppInfo) error {
	conf := config.GetConfig()
	r.logger.Debug("registering service to Consul", zap.String("id", r.ID))
	// 使用服务本身的地址和端口，而不是 Consul 的地址
	host := info.Host
	// 从服务配置中获取端口
	_, portStr, err := net.SplitHostPort(conf.Server.Addr)
	if err != nil {
		return err
	}
	portNum, err := strconv.Atoi(portStr)
	if err != nil {
		return err
	}
	// 与 Tls 同理:下面要连着解引用 Check.Ttl,配置里没写 check 段就是空指针。
	// 这里返回错误而不是裸注册 —— 没有健康检查的实例会被 Consul 一直当健康的,
	// 流量照打进来,比注册失败更难发现。
	if conf.Discovery == nil || conf.Discovery.Consul == nil ||
		conf.Discovery.Consul.Check == nil || conf.Discovery.Consul.Check.Ttl == nil {
		return errors.New("consul check configuration is missing: discovery.consul.check.ttl")
	}

	reg := &api.AgentServiceRegistration{
		ID:      r.ID,
		Name:    r.Name,
		Address: host,
		Port:    portNum,
		Tags: []string{
			info.Version,
			constants.ConsulTagFx,
			constants.ConsulTagTtl,
		},
		Check: &api.AgentServiceCheck{
			// 使用 TTL 替换 HTTP/TCP 检查
			TTL: conf.Discovery.Consul.Check.Ttl.Duration,
			// 配置在检查失败后自动注销
			DeregisterCriticalServiceAfter: conf.Discovery.Consul.Check.DeregisterCriticalServiceAfter,
		},
	}
	r.logger.Debug("service registration completed", zap.String("id", r.ID))

	if err := r.client.Agent().ServiceRegister(reg); err != nil {
		r.logger.Error("failed to register service with Consul", zap.Error(err))
		return err
	}

	r.logger.Info("Service registered with Consul using TTL check", zap.String("id", r.ID), zap.String("ttl", conf.Discovery.Consul.Check.Ttl.Duration))
	return nil
}

// TtlCheckPinger 负责定期向 Consul Agent 发送心跳信号
func (r *ConsulRegistry) TtlCheckPinger(ctx context.Context, conf *confv1.Bootstrap) {
	// time.NewTicker 对 <=0 的间隔直接 panic,而这里跑在独立 goroutine 里,
	// panic 会整个进程带走。配置缺失或写成 0 时回落到默认值。
	ttlPingInterval := defaultTtlPingInterval
	if conf.Discovery != nil && conf.Discovery.Consul != nil &&
		conf.Discovery.Consul.Check != nil && conf.Discovery.Consul.Check.Ttl != nil &&
		conf.Discovery.Consul.Check.Ttl.PingInterval.AsDuration() > 0 {
		ttlPingInterval = conf.Discovery.Consul.Check.Ttl.PingInterval.AsDuration()
	}

	ticker := time.NewTicker(ttlPingInterval)
	defer ticker.Stop()

	// Consul Agent 要求 CheckID 必须是 "service:<ID>" 的格式
	checkID := fmt.Sprintf("service:%s", r.ID)

	r.logger.Info("starting ttl pinger", zap.Duration("interval", ttlPingInterval), zap.String("checkID", checkID))

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("ttl pinger stopped gracefully")
			return
		case <-ticker.C:
			// 发送 'pass' 状态的心跳
			err := r.client.Agent().UpdateTTL(checkID, "ttl check passing", api.HealthPassing)
			if err != nil {
				// 记录错误，但不退出 Pinger，因为这可能是暂时的网络问题
				// 如果长时间失败，Consul Agent 会将服务标记为 Critical
				r.logger.Error("failed to update Consul TTL", zap.Error(err), zap.String("ID", r.ID))
			}
		}
	}
}

func (r *ConsulRegistry) Deregister() error {
	r.logger.Info("deregistering service from consul", zap.String("id", r.ID))
	return r.client.Agent().ServiceDeregister(r.ID)
}
