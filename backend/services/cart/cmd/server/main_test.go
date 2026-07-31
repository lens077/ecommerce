package main

import (
	"testing"

	"go.uber.org/fx"
)

// 只校验依赖图能不能解出来,不构造任何东西 —— 所以不需要数据库/Consul/配置中心。
//
// 装配错误(某个类型没人 provide、构造函数签名改了忘了改注入点)默认要等到
// fxApp.Start 才会暴露,而那时已经在连数据库了;这个测试把它提前到编译-测试阶段。
func TestAppOptions_GraphResolves(t *testing.T) {
	if err := fx.ValidateApp(appOptions("cart-service", "dev", "v1")...); err != nil {
		t.Fatalf("fx dependency graph is not resolvable: %v", err)
	}
}
