package healthcheck

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	"connectrpc.com/grpchealth/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newHealthServer 起一个只挂健康检查的 connect 服务,返回测试用 HTTP server。
func newHealthServer(t *testing.T, ready ReadyFunc, services ...string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	server := connect.NewServer()
	Register(server, ready, services...)
	connecthttp.Mount(mux, server)
	s := httptest.NewServer(mux)
	t.Cleanup(s.Close)
	return s
}

func TestGRPCHandlerReportsDeepReadiness(t *testing.T) {
	var ready atomic.Bool
	s := newHealthServer(t, func(context.Context) bool {
		return ready.Load()
	}, "example.v1.ExampleService")

	client := grpchealth.NewClient(connect.NewClient(connecthttp.NewTransport(s.Client(), s.URL)))

	response, err := client.Check(t.Context(), &grpchealth.CheckRequest{})
	require.NoError(t, err)
	assert.Equal(t, grpchealth.StatusNotServing, response.Status)

	ready.Store(true)
	response, err = client.Check(t.Context(), &grpchealth.CheckRequest{Service: "example.v1.ExampleService"})
	require.NoError(t, err)
	assert.Equal(t, grpchealth.StatusServing, response.Status)
}

func TestGRPCHandlerSupportsPlaintextGRPC(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	mux := http.NewServeMux()
	server := connect.NewServer()
	Register(server, func(context.Context) bool { return true }, "example.v1.ExampleService")
	connecthttp.Mount(mux, server)
	sp := new(http.Protocols)
	sp.SetHTTP1(true)
	sp.SetUnencryptedHTTP2(true)
	httpSrv := &http.Server{Handler: mux, Protocols: sp}
	go func() {
		_ = httpSrv.Serve(listener)
	}()
	t.Cleanup(func() {
		require.NoError(t, httpSrv.Shutdown(context.Background()))
	})

	// 只开 UnencryptedHTTP2:net/http 文档明确,同时含 HTTP1 时 http:// 请求会走 HTTP/1.1,
	// 而这条测试要验的正是 prior-knowledge h2c 明文 gRPC。
	cp := new(http.Protocols)
	cp.SetUnencryptedHTTP2(true)
	transport := &http.Transport{Protocols: cp}
	client := grpchealth.NewClient(connect.NewClient(connecthttp.NewTransport(
		&http.Client{Transport: transport},
		"http://"+listener.Addr().String(),
		connecthttp.WithGRPC(),
	)))
	response, err := client.Check(t.Context(), &grpchealth.CheckRequest{})
	require.NoError(t, err)
	assert.Equal(t, grpchealth.StatusServing, response.Status)
}

func TestGRPCHandlerRejectsUnknownService(t *testing.T) {
	s := newHealthServer(t, func(context.Context) bool { return true }, "example.v1.ExampleService")

	client := grpchealth.NewClient(connect.NewClient(connecthttp.NewTransport(s.Client(), s.URL)))
	_, err := client.Check(t.Context(), &grpchealth.CheckRequest{Service: "missing.v1.Service"})
	require.Error(t, err)
	assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
}

func TestGRPCHandlerRequiresReadinessFunction(t *testing.T) {
	assert.PanicsWithValue(t, "healthcheck: nil readiness function", func() {
		Register(connect.NewServer(), nil)
	})
}
