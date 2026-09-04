package log

// This file is a service adapter. It may only map the service's confv1 Bootstrap to
// the provider-neutral options consumed by go-connect-kit/log.

import (
	confv1 "github.com/lens077/ecommerce/backend/services/address/internal/conf/v1"
	sharedlog "github.com/lens077/go-connect-kit/log"
	"go.uber.org/fx"
)

var Module = sharedlog.Module[*confv1.Bootstrap](optionsFromBootstrap)

func FxLogger() fx.Option {
	return sharedlog.FxLogger[*confv1.Bootstrap](optionsFromBootstrap)
}

func optionsFromBootstrap(conf *confv1.Bootstrap) sharedlog.Options {
	application := conf.GetLog().GetApplication()
	framework := conf.GetLog().GetFramework()
	return sharedlog.Options{
		Level:               application.GetLevel(),
		Format:              application.GetFormat(),
		FrameworkLogLevel:   framework.GetLogLevel(),
		FrameworkErrorLevel: framework.GetErrorLevel(),
	}
}
