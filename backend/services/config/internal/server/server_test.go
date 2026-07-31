package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

const (
	testWriteTimeout = 300 * time.Millisecond
	// testStreamGap 必须大于 testWriteTimeout,才能踩到写截止时间
	testStreamGap = 3 * testWriteTimeout
)

// streamingHandler 模拟 WatchKeys:先发一帧(相当于快照),隔一会儿再发一帧(相当于心跳)。
// 第二帧写失败与否,正是「流能不能活过 WriteTimeout」的判据。
func streamingHandler(t *testing.T, secondWriteErr chan<- error) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc := http.NewResponseController(w)

		if _, err := io.WriteString(w, "snapshot\n"); err != nil {
			secondWriteErr <- err
			return
		}
		if err := rc.Flush(); err != nil {
			secondWriteErr <- err
			return
		}

		time.Sleep(testStreamGap)

		// 写只是进 bufio,错误要等 Flush 真正落到 socket 才暴露出来
		if _, err := io.WriteString(w, "heartbeat\n"); err != nil {
			secondWriteErr <- err
			return
		}
		secondWriteErr <- rc.Flush()
	})
}

func serveWithWriteTimeout(t *testing.T, h http.Handler) string {
	t.Helper()
	srv := httptest.NewUnstartedServer(h)
	srv.Config.WriteTimeout = testWriteTimeout
	srv.Start()
	t.Cleanup(srv.Close)
	return srv.URL
}

// 没有 withoutWriteTimeout 的话,长连接流会在 WriteTimeout 之后的第一次写上断掉。
// 这条测试先把「病」钉住,下一条才能证明「药」有效。
func TestWriteTimeout_KillsLongLivedStream(t *testing.T) {
	writeErr := make(chan error, 1)
	url := serveWithWriteTimeout(t, streamingHandler(t, writeErr))

	resp, err := http.Get(url + "/config.v1.ConfigService/WatchKeys")
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	_, _ = io.ReadAll(resp.Body)

	select {
	case err := <-writeErr:
		require.Error(t, err, "WriteTimeout 之后的写本应失败")
	case <-time.After(5 * time.Second):
		t.Fatal("handler 没有跑完")
	}
}

func TestWithoutWriteTimeout_KeepsStreamAlive(t *testing.T) {
	writeErr := make(chan error, 1)
	h := withoutWriteTimeout(streamingHandler(t, writeErr), zap.NewNop(),
		"/config.v1.ConfigService/WatchKeys")
	url := serveWithWriteTimeout(t, h)

	resp, err := http.Get(url + "/config.v1.ConfigService/WatchKeys")
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Equal(t, "snapshot\nheartbeat\n", string(body), "心跳帧必须送达")

	select {
	case err := <-writeErr:
		assert.NoError(t, err, "清掉写截止时间后,晚到的写不该失败")
	case <-time.After(5 * time.Second):
		t.Fatal("handler 没有跑完")
	}
}

// 一元接口不在豁免名单里,必须继续受 WriteTimeout 保护 ——
// 否则一个卡住的 handler 会永久占住连接。
func TestWithoutWriteTimeout_LeavesUnaryProceduresProtected(t *testing.T) {
	writeErr := make(chan error, 1)
	h := withoutWriteTimeout(streamingHandler(t, writeErr), zap.NewNop(),
		"/config.v1.ConfigService/WatchKeys")
	url := serveWithWriteTimeout(t, h)

	resp, err := http.Get(url + "/config.v1.ConfigService/GetKey")
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	_, _ = io.ReadAll(resp.Body)

	select {
	case err := <-writeErr:
		require.Error(t, err, "非流式路由应保留 WriteTimeout")
	case <-time.After(5 * time.Second):
		t.Fatal("handler 没有跑完")
	}
}
