package gorse

// live.go: 让 gorse 客户端跟上配置中心的热更新。
//
// 触发事故(2026-09-23):behavior/dev 写入 api_key 后,写入前启动的进程仍拿着启动时创建的
// 空 key 客户端,持续 401;product/dev 改完 endpoint 同样不生效。日志只有一行通用的
// `config updated`,/healthz 一直是绿的,只能靠人记得重启。
//
// 语义与 go-connect-kit 的 pgpool/redisclient 保持一致:
//   - 新配置先验证、通过了才替换;失败保留当前客户端,Stale() 说明原因,/healthz 的
//     warnings 与指标 connectkit_config_stale{component="gorse"} 同步变 1;
//   - 比较对象是「正在用的配置」,所以失败后下一次不同的推送会重试,改回在用的值会清掉 stale;
//   - 不让健康检查失败:所有副本收到同一份推送、同样失败,判不健康只会摘掉全部副本。
// 与连接池不同的是:构造 Client 不发网络请求,所以验证要真的带上新 key 请求一次鉴权接口。

import (
	"context"
	"fmt"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.uber.org/zap"
)

// StaleMetricName 与 go-connect-kit 的同名指标一致,一条告警规则覆盖 pgpool/redisclient/gorse。
const StaleMetricName = "connectkit.config.stale"

// Options 是会影响客户端的全部配置。可比较:相等即无需重建。
type Options struct {
	Enable   bool
	Endpoint string
	APIKey   string
	Timeout  time.Duration
}

// Live 持有当前客户端(关闭时为 nil)并在配置变化时整体替换。
// 调用方每次通过 Client() 取,不要把返回值存进字段——那又变回「启动时抓一次」。
type Live struct {
	c       atomic.Pointer[Client]
	stale   atomic.Pointer[error]
	mu      sync.Mutex
	applied Options
}

// NewLive 按启动配置创建。不做探活:gorse 挂了不该拦住服务启动。
func NewLive(opts Options) *Live {
	l := &Live{applied: opts}
	if opts.Enable && opts.Endpoint != "" {
		l.c.Store(New(opts.Endpoint, opts.APIKey, opts.Timeout))
	}
	return l
}

// Client 返回当前客户端;gorse 关闭时为 nil,调用方必须判空。
func (l *Live) Client() *Client { return l.c.Load() }

// Stale 说明最近一次推送的配置为什么没有生效;nil 表示已生效。
func (l *Live) Stale() error {
	if p := l.stale.Load(); p != nil {
		return *p
	}
	return nil
}

func (l *Live) setStale(err error) {
	if err == nil {
		l.stale.Store(nil)
		return
	}
	l.stale.Store(&err)
}

// Apply 处理一次配置推送。返回值只用于测试;日志与 stale 状态已在内部落好。
func (l *Live) Apply(ctx context.Context, next Options, logger *zap.Logger) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if next == l.applied {
		l.setStale(nil) // 也覆盖「失败的推送被改回」的情况
		return nil
	}
	host := endpointHost(next.Endpoint)

	if !next.Enable || next.Endpoint == "" {
		l.c.Store(nil)
		l.applied = next
		l.setStale(nil)
		logger.Warn("gorse disabled by config update; feedback is persisted locally and replayed after re-enable")
		return nil
	}

	logger.Info("gorse config changed, rebuilding client", zap.String("endpoint_host", host))
	candidate := New(next.Endpoint, next.APIKey, next.Timeout)
	if err := candidate.VerifyAuth(ctx); err != nil {
		err = fmt.Errorf("latest gorse config not applied, previous client still in use: %w", err)
		l.setStale(err)
		logger.Error("rebuild gorse client failed, keeping the current one", zap.Error(err))
		return err
	}
	l.c.Store(candidate)
	l.applied = next
	l.setStale(nil)
	// 用 WARN:热生效是少见且需要人确认的事件,要在默认日志级别里一眼可见。
	logger.Warn("gorse client rebuilt with new config", zap.String("endpoint_host", host))
	return nil
}

// maxVerifyTimeout 限制一次热更新验证最多拖住订阅链多久。Apply 持锁同步做 VerifyAuth,
// 而配置里的 Timeout 没有上界:推送 300s 加一个黑洞 endpoint,就能让同批订阅者
// (pgpool、redisclient 等)阻塞 5 分钟(2026-09-27 异构双审)。只约束验证请求,
// 客户端自身的请求超时仍按配置。
const maxVerifyTimeout = 10 * time.Second

func verifyTimeout(configured time.Duration) time.Duration {
	if configured <= 0 {
		return 5 * time.Second
	}
	return min(configured, maxVerifyTimeout)
}

// Update 是配置订阅回调里用的入口:按新配置做一次 Apply。
// 订阅回调是同步串行的,验证请求受 verifyTimeout 的上界约束,不会长时间拖住后续订阅者。
func (l *Live) Update(next Options, logger *zap.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), verifyTimeout(next.Timeout))
	defer cancel()
	_ = l.Apply(ctx, next, logger)
}

// RegisterStaleMetric 注册 connectkit_config_stale{component="gorse"}。
func (l *Live) RegisterStaleMetric() error {
	meter := otel.Meter("github.com/lens077/ecommerce/backend/pkg/gorse")
	attrs := metric.WithAttributes(attribute.String("component", "gorse"))
	_, err := meter.Int64ObservableGauge(StaleMetricName,
		metric.WithDescription("1 while the component keeps its previous connection because rebuilding with the latest configuration failed"),
		metric.WithInt64Callback(func(_ context.Context, o metric.Int64Observer) error {
			var v int64
			if l.Stale() != nil {
				v = 1
			}
			o.Observe(v, attrs)
			return nil
		}),
	)
	if err != nil {
		return fmt.Errorf("gorse: register %s gauge: %w", StaleMetricName, err)
	}
	return nil
}

func endpointHost(endpoint string) string {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}
