package registry

// This file is a service adapter. It may only map the service's confv1 Bootstrap to
// go-connect-kit/registry options.

import (
	confv1 "github.com/lens077/ecommerce/backend/services/payment/internal/conf/v1"
	sharedregistry "github.com/lens077/go-connect-kit/registry"
	"go.uber.org/fx"
)

var Module = fx.Module("payment-registry-adapter",
	fx.Provide(optionsFromBootstrap),
	sharedregistry.Module,
)

func optionsFromBootstrap(conf *confv1.Bootstrap) sharedregistry.Options {
	consul := conf.GetDiscovery().GetConsul()
	check := consul.GetCheck()
	ttl := check.GetTtl()

	return sharedregistry.Options{
		Enabled:       consul.GetAddr() != "",
		Address:       consul.GetAddr(),
		ServerAddress: conf.GetServer().GetAddr(),
		TLS: sharedregistry.TLSOptions{
			Enabled:            consul.GetTls().GetEnable(),
			InsecureSkipVerify: consul.GetTls().GetInsecureSkipVerify(),
			CAPEM:              consul.GetTls().GetCaPem(),
		},
		Check: sharedregistry.CheckOptions{
			TTL: sharedregistry.TTLCheckOptions{
				Enabled:      ttl != nil,
				Duration:     ttl.GetDuration(),
				PingInterval: ttl.GetPingInterval().AsDuration(),
			},
			GRPC: &sharedregistry.GRPCCheckOptions{
				Interval: ttl.GetPingInterval().AsDuration(),
			},
			DeregisterCriticalServiceAfter: check.GetDeregisterCriticalServiceAfter(),
		},
	}
}
