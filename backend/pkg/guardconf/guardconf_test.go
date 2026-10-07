package guardconf

import (
	"testing"
	"time"

	kitguard "github.com/lens077/go-connect-kit/otelguard"
	"google.golang.org/protobuf/types/known/durationpb"
)

// fakeGuard 复刻生成代码的方法集;真实生成类型是否满足接口由各服务适配层的编译保证。
type fakeGuard struct {
	disable        bool
	maxFailures    int32
	initialBackoff *durationpb.Duration
	maxBackoff     *durationpb.Duration
	multiplier     float64
	jitter         float64
	probeInterval  *durationpb.Duration
	hardShutdown   bool
	ntfy           *fakeNtfy
}

func (guard *fakeGuard) GetDisable() bool { return guard != nil && guard.disable }

func (guard *fakeGuard) GetMaxFailures() int32 {
	if guard == nil {
		return 0
	}
	return guard.maxFailures
}

func (guard *fakeGuard) GetInitialBackoff() *durationpb.Duration {
	if guard == nil {
		return nil
	}
	return guard.initialBackoff
}

func (guard *fakeGuard) GetMaxBackoff() *durationpb.Duration {
	if guard == nil {
		return nil
	}
	return guard.maxBackoff
}

func (guard *fakeGuard) GetMultiplier() float64 {
	if guard == nil {
		return 0
	}
	return guard.multiplier
}

func (guard *fakeGuard) GetJitter() float64 {
	if guard == nil {
		return 0
	}
	return guard.jitter
}

func (guard *fakeGuard) GetProbeInterval() *durationpb.Duration {
	if guard == nil {
		return nil
	}
	return guard.probeInterval
}

func (guard *fakeGuard) GetHardShutdown() bool { return guard != nil && guard.hardShutdown }

func (guard *fakeGuard) GetNtfy() *fakeNtfy {
	if guard == nil {
		return nil
	}
	return guard.ntfy
}

type fakeNtfy struct {
	url, topic, token, alertPriority, recoveryPriority string
}

func (ntfy *fakeNtfy) GetUrl() string              { return ntfy.url }
func (ntfy *fakeNtfy) GetTopic() string            { return ntfy.topic }
func (ntfy *fakeNtfy) GetToken() string            { return ntfy.token }
func (ntfy *fakeNtfy) GetAlertPriority() string    { return ntfy.alertPriority }
func (ntfy *fakeNtfy) GetRecoveryPriority() string { return ntfy.recoveryPriority }

// 配置中心没有 guard 段时必须返回 nil:否则 typed-nil 会让 kit 误以为保护被关闭。
func TestAbsentGuardReturnsNil(t *testing.T) {
	var absent *fakeGuard
	if config := Config(absent, absent.GetNtfy()); config != nil {
		t.Fatalf("absent guard must map to nil, got %+v", config)
	}
}

func TestUnsetFieldsKeepDefaults(t *testing.T) {
	t.Setenv("OTEL_GUARD_NTFY_URL", "https://ntfy.example.com")
	t.Setenv("OTEL_GUARD_NTFY_TOPIC", "env-topic")

	config := Config(&fakeGuard{disable: false}, nil)
	if config == nil {
		t.Fatal("configured guard must map to a config")
	}
	defaults := kitguard.DefaultConfig()
	if config.Disabled {
		t.Fatal("enable=true must not disable the guard")
	}
	if config.MaxFailures != defaults.MaxFailures || config.InitialBackoff != defaults.InitialBackoff ||
		config.MaxBackoff != defaults.MaxBackoff || config.Multiplier != defaults.Multiplier ||
		config.ProbeInterval != defaults.ProbeInterval {
		t.Fatalf("unset fields must keep the kit defaults, got %+v", config)
	}
	if config.Ntfy.URL != "https://ntfy.example.com" || config.Ntfy.Topic != "env-topic" {
		t.Fatalf("unset ntfy fields must fall back to the environment, got %+v", config.Ntfy)
	}
}

func TestConfiguredFieldsOverrideDefaults(t *testing.T) {
	t.Setenv("OTEL_GUARD_MAX_FAILURES", "9")

	config := Config(&fakeGuard{
		disable:        false,
		maxFailures:    3,
		initialBackoff: durationpb.New(500 * time.Millisecond),
		maxBackoff:     durationpb.New(2 * time.Minute),
		multiplier:     1.5,
		jitter:         0,
		probeInterval:  durationpb.New(30 * time.Second),
		hardShutdown:   true,
		ntfy: &fakeNtfy{
			url:              "https://ntfy.example.com",
			topic:            "otel-guard",
			token:            "s3cret",
			alertPriority:    "urgent",
			recoveryPriority: "low",
		},
	}, &fakeNtfy{
		url:              "https://ntfy.example.com",
		topic:            "otel-guard",
		token:            "s3cret",
		alertPriority:    "urgent",
		recoveryPriority: "low",
	})

	if config.MaxFailures != 3 {
		t.Fatalf("configured max_failures must win over the environment, got %d", config.MaxFailures)
	}
	if config.InitialBackoff != 500*time.Millisecond || config.MaxBackoff != 2*time.Minute {
		t.Fatalf("configured backoff not applied: %+v", config)
	}
	if config.Multiplier != 1.5 || config.ProbeInterval != 30*time.Second || !config.HardShutdown {
		t.Fatalf("configured scalar fields not applied: %+v", config)
	}
	// 裸 double 的 0 与「没配置」不可区分:必须保留默认 0.3,而不是写成 0。
	if config.Jitter != kitguard.DefaultConfig().Jitter {
		t.Fatalf("jitter=0 must keep the default %v, got %v", kitguard.DefaultConfig().Jitter, config.Jitter)
	}
	if config.Ntfy.Topic != "otel-guard" || config.Ntfy.Token != "s3cret" ||
		config.Ntfy.RecoveryPriority != "low" {
		t.Fatalf("configured ntfy fields not applied: %+v", config.Ntfy)
	}
}

func TestDisabledKeepsExplicitOff(t *testing.T) {
	config := Config(&fakeGuard{disable: true}, nil)
	if config == nil || !config.Disabled {
		t.Fatalf("enable=false must disable the guard, got %+v", config)
	}
}

// 配了 guard 段但没写 disable 时,保护必须保持开启:否则「只填 ntfy」会静默关掉保护。
func TestSectionWithoutDisableKeepsGuardOn(t *testing.T) {
	config := Config(&fakeGuard{ntfy: &fakeNtfy{topic: "otel-guard"}}, nil)
	if config == nil {
		t.Fatal("a guard section must map to a config")
	}
	if config.Disabled {
		t.Fatal("an absent enable field must not disable the guard")
	}
}
