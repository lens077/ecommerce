package log

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/lens077/ecommerce/backend/services/merchant/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/merchant/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/merchant/internal/pkg/config"
	"github.com/lens077/ecommerce/backend/services/merchant/internal/pkg/meta"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var testAppInfo = meta.AppInfo{
	ID:          "test-service-id",
	Name:        "test-service",
	Host:        "localhost",
	Environment: "dev",
	Version:     "v0.0.1",
}

// newConf 造一份只填了日志段的 Bootstrap —— NewLogger 只读 conf.Log.Application
func newConf(level, format string) *confv1.Bootstrap {
	return &confv1.Bootstrap{
		Log: &confv1.Log{
			Application: &confv1.Log_Application{Level: level, Format: format},
			Framework:   &confv1.Log_Framework{LogLevel: "info", ErrorLevel: "error"},
		},
	}
}

// captureStdout 把 os.Stdout 换成管道后执行 fn,返回期间写入的内容。
//
// NewLogger 在构造时就把 os.Stdout 包进了 WriteSyncer,所以 fn 里必须连
// 「构造 logger」一起做,替换才生效 —— 也正因如此这些用例不能 t.Parallel。
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	r, w, err := os.Pipe()
	require.NoError(t, err)

	orig := os.Stdout
	os.Stdout = w
	defer func() { os.Stdout = orig }()

	// 管道缓冲区有限,写满会阻塞,故另起 goroutine 读干净
	done := make(chan string, 1)
	go func() {
		b, _ := io.ReadAll(r)
		done <- string(b)
	}()

	fn()

	require.NoError(t, w.Close())
	out := <-done
	require.NoError(t, r.Close())
	return out
}

// logAllLevels 用给定配置建 logger 并把四个级别各打一条,返回实际落到 stdout 的内容
func logAllLevels(t *testing.T, level, format string) string {
	t.Helper()
	return captureStdout(t, func() {
		logger := NewLogger(newConf(level, format), testAppInfo)
		require.NotNil(t, logger)
		logger.Debug("msg-debug")
		logger.Info("msg-info")
		logger.Warn("msg-warn")
		logger.Error("msg-error")
	})
}

// 级别过滤是日志唯一有业务后果的行为:配 warn 却打出 debug,线上日志量会翻几十倍。
// 这里断言的是真正写到 stdout 的内容,而不是 Core().Enabled ——
// NewLogger 把 otel core Tee 了进来,只问 Core().Enabled 会把两个 core 混在一起。
func TestNewLogger_LevelFiltering(t *testing.T) {
	cases := []struct {
		level   string
		want    []string
		notWant []string
	}{
		{"debug", []string{"msg-debug", "msg-info", "msg-warn", "msg-error"}, nil},
		{"info", []string{"msg-info", "msg-warn", "msg-error"}, []string{"msg-debug"}},
		{"warn", []string{"msg-warn", "msg-error"}, []string{"msg-debug", "msg-info"}},
		{"error", []string{"msg-error"}, []string{"msg-debug", "msg-info", "msg-warn"}},
	}

	for _, c := range cases {
		t.Run(c.level, func(t *testing.T) {
			out := logAllLevels(t, c.level, constants.FormatJson)
			for _, s := range c.want {
				assert.Contains(t, out, s)
			}
			for _, s := range c.notWant {
				assert.NotContains(t, out, s)
			}
		})
	}
}

// 级别写错时 NewLogger 落到 Debug(见 log.go 的 UnmarshalText 失败分支)——
// 宁可多打也不静默吞日志。注:老用例断言的是 Info,与实现不符。
func TestNewLogger_InvalidLevelFallsBackToDebug(t *testing.T) {
	out := logAllLevels(t, "invalid-level", constants.FormatJson)
	assert.Contains(t, out, "msg-debug")
}

// 空级别不是错误:zapcore 把 "" 解析成 Info,所以配置里漏填走的是 Info 而非 Debug
func TestNewLogger_EmptyLevelIsInfo(t *testing.T) {
	out := logAllLevels(t, "", constants.FormatJson)
	assert.NotContains(t, out, "msg-debug")
	assert.Contains(t, out, "msg-info")
}

func TestNewLogger_JsonFormat(t *testing.T) {
	out := captureStdout(t, func() {
		NewLogger(newConf("info", constants.FormatJson), testAppInfo).
			Info("hello", zap.String("key", "value"), zap.Int("number", 42))
	})

	line := strings.TrimSpace(out)
	require.NotEmpty(t, line)

	var entry map[string]any
	require.NoError(t, json.Unmarshal([]byte(line), &entry), "json 格式下每行必须是可解析的 JSON")
	assert.Equal(t, "hello", entry["msg"])
	assert.Equal(t, "value", entry["key"])
	assert.EqualValues(t, 42, entry["number"])
	// AddCaller:定位问题时没有调用点的日志基本没用
	assert.Contains(t, entry["caller"], "log_test.go:")
}

func TestNewLogger_ConsoleFormat(t *testing.T) {
	out := captureStdout(t, func() {
		NewLogger(newConf("info", constants.FormatConsole), testAppInfo).Info("hello")
	})

	assert.Contains(t, out, "hello")
	assert.NotContains(t, out, `"msg"`, "console 格式不应输出 JSON")
	// CapitalColorLevelEncoder:级别大写并带 ANSI 颜色码
	assert.Contains(t, out, "INFO")
}

// 格式写错时回落到 JSON:结构化日志是采集侧的默认预期,回落成 console 会让采集直接解析失败
func TestNewLogger_UnknownFormatFallsBackToJSON(t *testing.T) {
	out := captureStdout(t, func() {
		NewLogger(newConf("info", "invalid-format"), testAppInfo).Info("hello")
	})

	var entry map[string]any
	require.NoError(t, json.Unmarshal([]byte(strings.TrimSpace(out)), &entry))
	assert.Equal(t, "hello", entry["msg"])
}

func TestNewLogger_Sugar(t *testing.T) {
	out := captureStdout(t, func() {
		sugar := NewLogger(newConf("debug", constants.FormatJson), testAppInfo).Sugar()
		assert.NotPanics(t, func() {
			sugar.Debugw("sugar-debug", "key", "value")
			sugar.Infow("sugar-info", "key", "value")
			sugar.Warnw("sugar-warn", "key", "value")
			sugar.Errorw("sugar-error", "key", "value")
		})
	})

	assert.Contains(t, out, "sugar-debug")
	assert.Contains(t, out, "sugar-error")
}

// Module 走一遍真实的 fx 装配:光断言 Module 非空证明不了它能被解析出来
func TestModule_ProvidesLogger(t *testing.T) {
	var logger *zap.Logger

	app := fx.New(
		fx.NopLogger,
		fx.Supply(newConf("info", constants.FormatJson), testAppInfo, config.NewLive(nil)),
		Module,
		fx.Populate(&logger),
	)

	require.NoError(t, app.Err())
	assert.NotNil(t, logger)
	assert.Contains(t, Module.String(), "log")
}

// FxLogger 读的是 conf.Log.Framework,与 NewLogger 读的 Application 是两段配置;
// 级别写错时同样只回落不报错,不能让框架日志配置把整个进程卡在启动阶段。
func TestFxLogger(t *testing.T) {
	cases := []struct {
		name       string
		logLevel   string
		errorLevel string
	}{
		{"valid levels", "info", "error"},
		{"invalid levels", "not-a-level", "also-not-a-level"},
		{"empty levels", "", ""},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			conf := newConf("info", constants.FormatJson)
			conf.Log.Framework = &confv1.Log_Framework{LogLevel: c.logLevel, ErrorLevel: c.errorLevel}

			// fx 的 logger 是在装配期构造的,所以顺带把它的输出也吞掉
			_ = captureStdout(t, func() {
				app := fx.New(
					fx.Supply(conf, testAppInfo, config.NewLive(nil)),
					Module,
					FxLogger(),
				)
				assert.NoError(t, app.Err())
			})
		})
	}
}

// 日志级别热生效。这条必须真跑一遍 fx 装配后改 Live —— 订阅接错、
// 级别开关没用 AtomicLevel、或者 newLogger 把 level 吞了,都不会有任何编译错误,
// 只会表现为「改了配置中心的 level 没反应」,而那时没人会怀疑到这里。
func TestModule_LogLevelHotReload(t *testing.T) {
	live := config.NewLive(newConf("warn", constants.FormatJson))

	out := captureStdout(t, func() {
		var logger *zap.Logger
		app := fx.New(
			fx.NopLogger,
			fx.Supply(newConf("warn", constants.FormatJson), testAppInfo, live),
			Module,
			fx.Populate(&logger),
		)
		require.NoError(t, app.Err())

		logger.Debug("before-hot-reload")

		// 只改日志级别这一段,其余配置原样
		live.Set(newConf("debug", constants.FormatJson))

		logger.Debug("after-hot-reload")
	})

	assert.NotContains(t, out, "before-hot-reload", "改之前是 warn,debug 不该被打出来")
	assert.Contains(t, out, "after-hot-reload", "改成 debug 之后必须立刻生效,不能等重启")
	assert.Contains(t, out, "log level changed", "级别变更要留一行日志,否则运维无从确认它生效了")
}
