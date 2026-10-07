// Package guardconf 把各服务 Bootstrap 里的 Observability.Metric.Guard 映射成
// go-connect-kit/otelguard 的断路器配置。
//
// 十个服务的 conf.proto 里 guard 段的字段与生成的 getter 完全一致,但生成类型分属
// 各自的 confv1 包;按方法集接收就不必把同一份映射抄十遍(抄十遍正是 kit 存在的理由)。
// 映射逻辑只有一个真相源,服务侧适配层只留一行调用。
package guardconf

import (
	kitguard "github.com/lens077/go-connect-kit/otelguard"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

// Guard 是 Observability.Metric.Guard 在各服务 confv1 里的共同方法集。
type Guard interface {
	GetEnable() *wrapperspb.BoolValue
	GetMaxFailures() int32
	GetInitialBackoff() *durationpb.Duration
	GetMaxBackoff() *durationpb.Duration
	GetMultiplier() float64
	GetJitter() *wrapperspb.DoubleValue
	GetProbeInterval() *durationpb.Duration
	GetHardShutdown() bool
}

// Ntfy 是内层 Observability.Metric.Ntfy 的共同方法集。生成类型的 GetNtfy() 返回
// 各自包的指针类型,方法返回值不满足接口的协变,所以由调用方把它单独传进来。
type Ntfy interface {
	GetUrl() string
	GetTopic() string
	GetToken() string
	GetAlertPriority() string
	GetRecoveryPriority() string
}

// guardMessage 让 Config 同时拿到 Guard 的方法集与可比性,从而能用零值判断
// 「配置中心里没有 guard 段」。没有这道判断,typed-nil 会让 GetEnable() 返回
// false,把一个「没配置」的服务静默关掉保护。
type guardMessage interface {
	Guard
	comparable
}

// Config 返回 kit 的断路器配置:先取环境变量与 kit 默认值,再用配置中心里的非零
// 字段覆盖。因此「配置中心没配」时仍然吃 OTEL_GUARD_* 与默认值,配了就由配置中心
// 说了算(便于不发版调整阈值)。
//
// guard 为 nil(配置中心没有 guard 段)时返回 nil,由 kit 自己按默认值兜底。
// 调用方式:guardconf.Config(metric.GetGuard(), metric.GetGuard().GetNtfy())。
// 生成代码的 getter 对 nil 接收者安全,所以第二次调用不需要判空。
func Config[G guardMessage](guard G, ntfy Ntfy) *kitguard.Config {
	var absent G
	if guard == absent {
		return nil
	}

	config := kitguard.ConfigFromEnv()

	// enable 用 wrapper:kit 默认已开启保护,所以只有「显式配了 false」才关闭。
	// 配了 guard 段但没写 enable(或写 true)时保持开启,避免只填 ntfy 反而把
	// 保护静默关掉。
	if value := guard.GetEnable(); value != nil && !value.GetValue() {
		config.Disabled = true
	}

	if value := guard.GetMaxFailures(); value > 0 {
		config.MaxFailures = int(value)
	}
	if value := guard.GetInitialBackoff(); value != nil && value.AsDuration() > 0 {
		config.InitialBackoff = value.AsDuration()
	}
	if value := guard.GetMaxBackoff(); value != nil && value.AsDuration() > 0 {
		config.MaxBackoff = value.AsDuration()
	}
	if value := guard.GetMultiplier(); value >= 1 {
		config.Multiplier = value
	}
	// jitter 用 wrapper:配了 0 就是「不抖动」,必须覆盖默认的 0.3,不能按零值跳过。
	if value := guard.GetJitter(); value != nil {
		config.Jitter = value.GetValue()
	}
	if value := guard.GetProbeInterval(); value != nil && value.AsDuration() > 0 {
		config.ProbeInterval = value.AsDuration()
	}
	// 裸 bool 没有 presence:配置中心里有 guard 段就以它为准。
	config.HardShutdown = guard.GetHardShutdown()

	if ntfy != nil {
		if value := ntfy.GetUrl(); value != "" {
			config.Ntfy.URL = value
		}
		if value := ntfy.GetTopic(); value != "" {
			config.Ntfy.Topic = value
		}
		if value := ntfy.GetToken(); value != "" {
			config.Ntfy.Token = value
		}
		if value := ntfy.GetAlertPriority(); value != "" {
			config.Ntfy.AlertPriority = value
		}
		if value := ntfy.GetRecoveryPriority(); value != "" {
			config.Ntfy.RecoveryPriority = value
		}
	}

	return &config
}
