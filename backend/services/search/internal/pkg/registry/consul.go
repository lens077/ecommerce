package registry

// This file is a service adapter. It may only map the service's confv1 Bootstrap to
// backend/pkg/registry options and retain the existing registry type name.

import (
	sharedregistry "github.com/lens077/ecommerce/backend/pkg/registry"
	confv1 "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
	"go.uber.org/fx"
)

type ConsulRegistry = sharedregistry.ConsulRegistry

var Module = fx.Module("search-registry-adapter",
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
			DeregisterCriticalServiceAfter: check.GetDeregisterCriticalServiceAfter(),
		},
	}
}
