package biz

import "go.uber.org/fx"

var Module = fx.Module("biz",
	fx.Provide(
		NewProductUseCase,
		NewItemSyncUseCase,
	),
	// 同步器没有任何人依赖它,后台循环挂在 fx.Lifecycle 上,
	// 不显式 Invoke 一下 fx 根本不会构造它。
	fx.Invoke(func(*ItemSyncUseCase) {}),
)
