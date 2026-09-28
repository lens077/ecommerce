package gorse

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

// fakeGorse 与真 gorse 一样:/api/health/* 不校验 key,其余接口 key 不对就 401。
func fakeGorse(t *testing.T, key string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != key {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`[]`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

// 回归(2026-09-27 异构双审):验证在锁内同步进行,超时必须有上界,否则一条大 Timeout
// 配置加黑洞 endpoint 会把整条配置订阅链阻塞到超时为止。
func TestVerifyTimeoutIsBounded(t *testing.T) {
	assert.Equal(t, 5*time.Second, verifyTimeout(0))
	assert.Equal(t, 2*time.Second, verifyTimeout(2*time.Second))
	assert.Equal(t, maxVerifyTimeout, verifyTimeout(300*time.Second))
}

// 复现 2026-09-23:启动时 key 为空,之后配置中心写入正确 key。
// 修复前客户端只在启动时创建一次,推送后仍用空 key 请求、持续 401。
func TestLive_PushedKeyReplacesClientWithoutRestart(t *testing.T) {
	srv := fakeGorse(t, "right")
	ctx := context.Background()
	core, logs := observer.New(zap.InfoLevel)
	logger := zap.New(core)

	live := NewLive(Options{Enable: true, Endpoint: srv.URL, APIKey: ""})
	require.Error(t, live.Client().VerifyAuth(ctx), "启动时的空 key 客户端应当被拒")

	require.NoError(t, live.Apply(ctx, Options{Enable: true, Endpoint: srv.URL, APIKey: "right"}, logger))
	assert.NoError(t, live.Client().VerifyAuth(ctx), "推送后必须换成新 key 的客户端")
	assert.NoError(t, live.Stale())
	assert.Equal(t, 1, logs.FilterMessage("gorse client rebuilt with new config").Len(), "重建完成必须有一条可见日志")
}

// 推送了错误 key(或已只绑回环的旧地址):保留当前客户端,stale 说明原因;改回在用的值后清除。
func TestLive_BadPushKeepsCurrentClientAndReportsStale(t *testing.T) {
	srv := fakeGorse(t, "right")
	ctx := context.Background()
	good := Options{Enable: true, Endpoint: srv.URL, APIKey: "right"}
	live := NewLive(good)
	before := live.Client()

	err := live.Apply(ctx, Options{Enable: true, Endpoint: srv.URL, APIKey: "wrong"}, zap.NewNop())
	require.Error(t, err)
	assert.Same(t, before, live.Client(), "验证失败不得替换")
	require.Error(t, live.Stale())
	assert.Contains(t, live.Stale().Error(), "401")
	assert.NotContains(t, live.Stale().Error(), "wrong", "stale 会进 /healthz,不得带出 key")

	require.NoError(t, live.Apply(ctx, good, zap.NewNop()))
	assert.NoError(t, live.Stale(), "改回在用的配置应清除 stale")
	assert.Same(t, before, live.Client())
}

func TestLive_DisableAndReEnable(t *testing.T) {
	srv := fakeGorse(t, "right")
	ctx := context.Background()
	live := NewLive(Options{Enable: false})
	assert.Nil(t, live.Client())

	require.NoError(t, live.Apply(ctx, Options{Enable: true, Endpoint: srv.URL, APIKey: "right"}, zap.NewNop()))
	require.NotNil(t, live.Client(), "从关闭改为开启不需要重启")

	require.NoError(t, live.Apply(ctx, Options{Enable: false}, zap.NewNop()))
	assert.Nil(t, live.Client())
}
