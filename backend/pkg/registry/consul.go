package registry

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/hashicorp/consul/api"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/healthcheck"
	"github.com/lens077/ecommerce/backend/pkg/meta"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

const defaultTTLPingInterval = 10 * time.Second

// TLSOptions configures the Consul client transport.
type TLSOptions struct {
	Enabled            bool
	InsecureSkipVerify bool
	CAPEM              string
}

// TTLCheckOptions configures the process-liveness check.
type TTLCheckOptions struct {
	Enabled      bool
	Duration     string
	PingInterval time.Duration
}

// CheckOptions configures Consul health checks.
type CheckOptions struct {
	TTL                            TTLCheckOptions
	DeregisterCriticalServiceAfter string
}

// Options is the provider-neutral service-registration configuration.
type Options struct {
	Enabled       bool
	Address       string
	ServerAddress string
	TLS           TLSOptions
	Check         CheckOptions
}

// ConsulRegistry owns one Consul registration and its TTL pinger.
type ConsulRegistry struct {
	Addr       string
	ID         string
	Name       string
	client     *api.Client
	logger     *zap.Logger
	cancelPing context.CancelFunc
}

type Option func(*clientOptions)

type clientOptions struct {
	logger    *zap.Logger
	tlsConfig *api.TLSConfig
	scheme    string
}

// WithLogger injects the registry logger.
func WithLogger(logger *zap.Logger) Option {
	return func(options *clientOptions) {
		options.logger = logger
	}
}

// WithTLS configures the Consul client TLS transport.
func WithTLS(insecureSkipVerify bool, caPEM string) Option {
	return func(options *clientOptions) {
		options.tlsConfig = &api.TLSConfig{
			CAPem:              []byte(caPEM),
			InsecureSkipVerify: insecureSkipVerify,
		}
	}
}

// Module provides an optional Consul registry and owns its lifecycle.
var Module = fx.Module("registry",
	fx.Provide(func(
		lc fx.Lifecycle,
		logger *zap.Logger,
		options Options,
		appInfo meta.AppInfo,
	) (*ConsulRegistry, error) {
		if os.Getenv(constants.EnvConsulEnabled) == "false" {
			logger.Info("Consul disabled by environment variable", zap.String("env", constants.EnvConsulEnabled))
			return nil, nil
		}
		if !options.Enabled || options.Address == "" {
			logger.Info("Consul not configured, service discovery disabled")
			return nil, nil
		}

		clientOptions := []Option{WithLogger(logger)}
		if options.TLS.Enabled {
			clientOptions = append(clientOptions, WithTLS(options.TLS.InsecureSkipVerify, options.TLS.CAPEM))
		}
		registry, err := NewConsulRegistry(options.Address, appInfo.ID, appInfo.Name, clientOptions...)
		if err != nil {
			logger.Warn("failed to initialize Consul client, service discovery disabled", zap.Error(err))
			return nil, nil
		}

		lc.Append(fx.Hook{
			OnStart: func(context.Context) error {
				if err := registry.Register(options, appInfo); err != nil {
					logger.Warn("failed to register with Consul, service discovery disabled", zap.Error(err))
					return nil
				}
				pingCtx, cancel := context.WithCancel(context.Background())
				registry.cancelPing = cancel
				go registry.TTLCheckPinger(pingCtx, options)
				return nil
			},
			OnStop: func(context.Context) error {
				if registry.client == nil {
					return nil
				}
				if err := registry.Deregister(); err != nil {
					logger.Warn("failed to deregister from Consul", zap.Error(err))
				}
				return nil
			},
		})
		return registry, nil
	}),
)

// NewConsulRegistry constructs a lazy Consul API client.
func NewConsulRegistry(address, id, name string, opts ...Option) (*ConsulRegistry, error) {
	options := &clientOptions{scheme: constants.ConsulScheme}
	for _, option := range opts {
		option(options)
	}

	config := api.Config{
		Address: address,
		Scheme:  options.scheme,
		Transport: &http.Transport{
			DialContext:         (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
			TLSHandshakeTimeout: 5 * time.Second,
		},
		WaitTime: 10 * time.Second,
	}
	if options.tlsConfig != nil {
		config.Scheme = constants.ConsulTlsScheme
		config.TLSConfig = *options.tlsConfig
	}

	client, err := api.NewClient(&config)
	if err != nil {
		return nil, err
	}
	return &ConsulRegistry{
		Addr:   address,
		ID:     id,
		Name:   name,
		client: client,
		logger: options.logger,
	}, nil
}

// Register installs the TTL liveness and gRPC readiness checks.
func (r *ConsulRegistry) Register(options Options, info meta.AppInfo) error {
	r.logger.Debug("registering service to Consul", zap.String("id", r.ID))

	_, portText, err := net.SplitHostPort(options.ServerAddress)
	if err != nil {
		return err
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		return err
	}
	if !options.Check.TTL.Enabled {
		return errors.New("consul check configuration is missing: discovery.consul.check.ttl")
	}

	registration := &api.AgentServiceRegistration{
		ID:      r.ID,
		Name:    r.Name,
		Address: info.Host,
		Port:    port,
		Tags:    []string{info.Version, constants.ConsulTagFx, constants.ConsulTagTtl},
		Check: healthcheck.NewConsulTTLCheck(
			r.ID,
			options.Check.TTL.Duration,
			options.Check.DeregisterCriticalServiceAfter,
		),
		Checks: api.AgentServiceChecks{
			healthcheck.NewConsulGRPCCheck(r.ID, info.Host, port, options.Check.TTL.PingInterval),
		},
	}
	if err := r.client.Agent().ServiceRegister(registration); err != nil {
		r.logger.Error("failed to register service with Consul", zap.Error(err))
		return err
	}

	r.logger.Info("Service registered with Consul using TTL and gRPC readiness checks",
		zap.String("id", r.ID), zap.String("ttl", options.Check.TTL.Duration))
	return nil
}

// TTLCheckPinger periodically marks the explicit TTL check as passing.
func (r *ConsulRegistry) TTLCheckPinger(ctx context.Context, options Options) {
	interval := options.Check.TTL.PingInterval
	if interval <= 0 {
		interval = defaultTTLPingInterval
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	checkID := healthcheck.ConsulTTLCheckID(r.ID)

	ping := func() {
		if err := r.client.Agent().UpdateTTL(checkID, "ttl check passing", api.HealthPassing); err != nil {
			r.logger.Error("failed to update Consul TTL", zap.Error(err), zap.String("ID", r.ID))
		}
	}

	r.logger.Info("starting ttl pinger", zap.Duration("interval", interval), zap.String("checkID", checkID))
	ping()
	for {
		select {
		case <-ctx.Done():
			r.logger.Info("ttl pinger stopped gracefully")
			return
		case <-ticker.C:
			ping()
		}
	}
}

// Deregister stops the pinger before removing the service registration.
func (r *ConsulRegistry) Deregister() error {
	r.logger.Info("deregistering service from consul", zap.String("id", r.ID))
	if r.cancelPing != nil {
		r.cancelPing()
	}
	return r.client.Agent().ServiceDeregister(r.ID)
}
