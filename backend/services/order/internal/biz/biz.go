package biz

import (
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/application"
	"go.uber.org/fx"
)

var Module = fx.Module("biz",
	fx.Provide(
		application.NewOrderCommandUseCase,
		application.NewOrderQueryUseCase,
	),
)
