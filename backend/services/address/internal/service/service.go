package service

import (
	"go.uber.org/fx"

	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
	"github.com/lens077/ecommerce/backend/services/address/internal/data"
)

var Module = fx.Module("service",
	fx.Provide(NewAddressService),
	fx.Provide(data.NewAddressRepo),
	fx.Provide(biz.NewAddressUseCase),
)