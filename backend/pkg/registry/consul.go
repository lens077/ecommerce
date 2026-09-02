package registry

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/hashicorp/consul/api"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/healthcheck"
	"github.com/lens077/go-connect-kit/meta"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

const (
	defaultTTLPingInterval = 10 * time.Second

	// Registration retry backoff. Starts small so a Consul that is merely slow
	// to come up (cluster reboot, CNI policy still programming) is caught within
	// seconds; caps at 30s so a Consul that is down for hours costs two log
	// lines a minute, not a flood.
	defaultRetryBase = time.Second
	defaultRetryMax  = 30 * time.Second
)

// ErrInvalidOptions marks registration failures caused by configuration rather
// than by Consul. They cannot heal on their own, so Maintain does not retry them.
var ErrInvalidOptions = errors.New("registry: invalid options")

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

// ConsulRegistry owns one Consul registration and the loop that keeps it alive.
type ConsulRegistry struct {
	Addr       string
	ID         string
	Name       string
	client     *api.Client
	logger     *zap.Logger
	cancelPing context.CancelFunc

	// registered is true between a successful ServiceRegister and Deregister.
	// Deregister skips the Consul call when nothing was ever registered, so a
	// service that never reached Consul does not log a spurious failure on exit.
	registered atomic.Bool

	retryBase time.Duration
	retryMax  time.Duration
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
			// Fail-open: the process serves whether or not Consul is reachable.
			// Registration is owned by Maintain, which retries until it succeeds
			// and re-registers if Consul later forgets us. It used to be a single
			// synchronous attempt here; a Consul that was unreachable for the five
			// seconds around a cluster reboot then silently dropped the service
			// from discovery for the rest of the process lifetime.
			OnStart: func(context.Context) error {
				ctx, cancel := context.WithCancel(context.Background())
				registry.cancelPing = cancel
				go registry.Maintain(ctx, options, appInfo)
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
		Addr:      address,
		ID:        id,
		Name:      name,
		client:    client,
		logger:    options.logger,
		retryBase: defaultRetryBase,
		retryMax:  defaultRetryMax,
	}, nil
}

// Register installs the TTL liveness and gRPC readiness checks.
// Configuration problems are wrapped in ErrInvalidOptions; everything else is
// a Consul/transport error and is worth retrying.
func (r *ConsulRegistry) Register(options Options, info meta.AppInfo) error {
	r.logger.Debug("registering service to Consul", zap.String("id", r.ID))

	_, portText, err := net.SplitHostPort(options.ServerAddress)
	if err != nil {
		return fmt.Errorf("%w: server address: %v", ErrInvalidOptions, err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		return fmt.Errorf("%w: server port: %v", ErrInvalidOptions, err)
	}
	if !options.Check.TTL.Enabled {
		return fmt.Errorf("%w: consul check configuration is missing: discovery.consul.check.ttl", ErrInvalidOptions)
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
		return err
	}
	r.registered.Store(true)

	r.logger.Info("Service registered with Consul using TTL and gRPC readiness checks",
		zap.String("id", r.ID), zap.String("ttl", options.Check.TTL.Duration))
	return nil
}

// Maintain keeps the registration alive until ctx is cancelled.
//
// State machine: register (retry with exponential backoff on transport errors)
// → heartbeat the TTL check → on any heartbeat failure, go back to register.
// Re-registering is idempotent (same service ID overwrites), so treating every
// heartbeat error as "Consul may have forgotten us" costs one extra PUT in the
// worst case and recovers from a Consul restart in the common one.
//
// Returns early only when the options are invalid (ErrInvalidOptions): that is
// a deploy bug, and retrying it forever would just hide the bug in log noise.
func (r *ConsulRegistry) Maintain(ctx context.Context, options Options, info meta.AppInfo) {
	base, maxDelay := r.retryBase, r.retryMax
	if base <= 0 {
		base = defaultRetryBase
	}
	if maxDelay < base {
		maxDelay = base
	}

	attempt := 0
	delay := base
	for {
		err := r.Register(options, info)
		if err == nil {
			if attempt > 0 {
				r.logger.Info("registered with Consul after retries", zap.Int("attempts", attempt+1))
			}
			attempt, delay = 0, base

			pingErr := r.TTLCheckPinger(ctx, options)
			if pingErr == nil {
				return // ctx cancelled: clean shutdown
			}
			r.logger.Warn("Consul TTL heartbeat failed; re-registering", zap.Error(pingErr))
			err = pingErr
		} else if errors.Is(err, ErrInvalidOptions) {
			r.logger.Error("Consul registration options are invalid; not retrying", zap.Error(err))
			return
		}

		attempt++
		r.logger.Warn("Consul registration not established; will retry",
			zap.Error(err), zap.Int("attempt", attempt), zap.Duration("retry_in", delay))
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		if delay < maxDelay {
			delay *= 2
			if delay > maxDelay {
				delay = maxDelay
			}
		}
	}
}

// TTLCheckPinger marks the TTL check as passing on every interval.
//
// It returns nil when ctx is cancelled and the first heartbeat error otherwise.
// A heartbeat error is the only signal a service gets that Consul no longer
// holds its registration (Consul returns 404 for an unknown check ID after a
// restart), so the caller must treat it as "register again", not "log and hope".
func (r *ConsulRegistry) TTLCheckPinger(ctx context.Context, options Options) error {
	interval := options.Check.TTL.PingInterval
	if interval <= 0 {
		interval = defaultTTLPingInterval
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	checkID := healthcheck.ConsulTTLCheckID(r.ID)

	ping := func() error {
		return r.client.Agent().UpdateTTL(checkID, "ttl check passing", api.HealthPassing)
	}

	r.logger.Info("starting ttl pinger", zap.Duration("interval", interval), zap.String("checkID", checkID))
	if err := ping(); err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			r.logger.Info("ttl pinger stopped gracefully")
			return nil
		case <-ticker.C:
			if err := ping(); err != nil {
				return err
			}
		}
	}
}

// Deregister stops the maintenance loop before removing the service registration.
func (r *ConsulRegistry) Deregister() error {
	if r.cancelPing != nil {
		r.cancelPing()
	}
	if !r.registered.Load() {
		r.logger.Info("skipping Consul deregistration; never registered", zap.String("id", r.ID))
		return nil
	}
	r.logger.Info("deregistering service from consul", zap.String("id", r.ID))
	if err := r.client.Agent().ServiceDeregister(r.ID); err != nil {
		return err
	}
	r.registered.Store(false)
	return nil
}
