package healthcheck

import (
	"context"
	"crypto/tls"
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
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
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
	httpSrv := &http.Server{Handler: h2c.NewHandler(mux, &http2.Server{})}
	go func() {
		_ = httpSrv.Serve(listener)
	}()
	t.Cleanup(func() {
		require.NoError(t, httpSrv.Shutdown(context.Background()))
	})

	transport := &http2.Transport{
		AllowHTTP: true,
		DialTLSContext: func(ctx context.Context, network, address string, _ *tls.Config) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, network, address)
		},
	}
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
