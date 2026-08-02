package registry

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	confv1 "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/durationpb"
)

// fakeAgent 假扮 Consul Agent,把每次心跳请求的到达时刻推进 channel。
func fakeAgent(t *testing.T) (addr string, hits chan time.Time) {
	t.Helper()

	hits = make(chan time.Time, 8)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		select {
		case hits <- time.Now():
		default:
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	return srv.Listener.Addr().String(), hits
}

func ttlConf(pingInterval time.Duration) *confv1.Bootstrap {
	return &confv1.Bootstrap{
		Discovery: &confv1.Discovery{
			Consul: &confv1.Discovery_Consul{
				Check: &confv1.Discovery_Consul_Check{
					Ttl: &confv1.Discovery_Consul_Check_TTL{
						Duration:     "30s",
						PingInterval: durationpb.New(pingInterval),
					},
				},
			},
		},
	}
}

// TTL 检查注册后的初始状态是 critical,服务发现方用 passingOnly=true 查询。
// 如果 pinger 先等满一个 ping_interval 再发第一次心跳,实例在这段时间里对外
// 完全不可见 —— 这正是「刷新好几次才有数据」的根因。这个用例守住的就是
// 「首次心跳不等 ticker」,ping_interval 取得足够长,回归时必然超时。
func TestTtlCheckPinger_FirstPingIsImmediate(t *testing.T) {
	addr, hits := fakeAgent(t)

	reg, err := NewConsulRegistry(addr, "test-id", "test-service", WithLogger(zap.NewNop()))
	require.NoError(t, err)

	start := time.Now()
	go reg.TtlCheckPinger(t.Context(), ttlConf(30*time.Second))

	select {
	case at := <-hits:
		assert.Less(t, at.Sub(start), 2*time.Second,
			"首次心跳被 ticker 挡住了,实例会有一整个 ping_interval 的发现盲窗")
	case <-time.After(3 * time.Second):
		t.Fatal("3s 内没有收到首次心跳,首次 ping 仍在等 ticker")
	}
}

// 立即 ping 之后 ticker 循环必须照常工作,不能只发一次就哑掉。
func TestTtlCheckPinger_KeepsPingingOnTicker(t *testing.T) {
	addr, hits := fakeAgent(t)

	reg, err := NewConsulRegistry(addr, "test-id", "test-service", WithLogger(zap.NewNop()))
	require.NoError(t, err)

	go reg.TtlCheckPinger(t.Context(), ttlConf(200*time.Millisecond))

	for i := range 3 {
		select {
		case <-hits:
		case <-time.After(2 * time.Second):
			t.Fatalf("只收到 %d 次心跳,ticker 循环没有继续", i)
		}
	}
}

// context 取消后 pinger 必须停下,不能继续对着已注销的 checkID 打心跳。
func TestTtlCheckPinger_StopsOnContextCancel(t *testing.T) {
	addr, hits := fakeAgent(t)

	reg, err := NewConsulRegistry(addr, "test-id", "test-service", WithLogger(zap.NewNop()))
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	go reg.TtlCheckPinger(ctx, ttlConf(100*time.Millisecond))

	select {
	case <-hits:
	case <-time.After(2 * time.Second):
		t.Fatal("没有收到首次心跳")
	}

	cancel()
	time.Sleep(150 * time.Millisecond)
	// 取消瞬间可能正好有一次心跳在途,先排空,再确认后续彻底安静。
	for len(hits) > 0 {
		<-hits
	}

	select {
	case <-hits:
		t.Fatal("context 取消后 pinger 仍在发送心跳")
	case <-time.After(400 * time.Millisecond):
	}
}
