package config

// This file is a service adapter. It may only instantiate the shared generic
// config package for the service's confv1 type and map restart-only sections.

import (
	sharedconfig "github.com/lens077/ecommerce/backend/pkg/config"
	confv1 "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
)

// Live keeps the existing service import path while using the shared implementation.
type Live = sharedconfig.Live[*confv1.Bootstrap]

var Module = sharedconfig.Module[*confv1.Bootstrap](restartRequiredSections)

func restartRequiredSections(conf *confv1.Bootstrap) []sharedconfig.RestartRequiredSection {
	return []sharedconfig.RestartRequiredSection{
		{Name: "server", Message: conf.GetServer()},
		{Name: "discovery", Message: conf.GetDiscovery()},
		{Name: "observability", Message: conf.GetObservability()},
	}
}
