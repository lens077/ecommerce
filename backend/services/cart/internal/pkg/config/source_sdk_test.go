package config

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"connectrpc.com/connect"
	configv1 "github.com/lens077/config-center/api/config/v1"
	"github.com/lens077/config-center/api/config/v1/configv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeConfigService is a real ConnectRPC endpoint so the Cart adapter covers
// the standalone module's generated client and request serialization.
type fakeConfigService struct {
	configv1connect.UnimplementedConfigServiceHandler
	entries map[string]*configv1.ConfigEntry
	mu      sync.Mutex
	lastReq *configv1.GetKeyRequest
}

func (f *fakeConfigService) LastReq() *configv1.GetKeyRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.lastReq
}

func (f *fakeConfigService) GetKey(
	_ context.Context, req *connect.Request[configv1.GetKeyRequest],
) (*connect.Response[configv1.GetKeyResponse], error) {
	f.mu.Lock()
	f.lastReq = req.Msg
	f.mu.Unlock()

	id := req.Msg.GetNamespace() + "/" + req.Msg.GetEnvironment() + "/" + req.Msg.GetKey()
	entry, ok := f.entries[id]
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("config not found: "+id))
	}
	return connect.NewResponse(&configv1.GetKeyResponse{Entry: entry}), nil
}

func startFakeConfigService(t *testing.T, entries map[string]*configv1.ConfigEntry) (*fakeConfigService, string) {
	t.Helper()
	svc := &fakeConfigService{entries: entries}
	mux := http.NewServeMux()
	mux.Handle(configv1connect.NewConfigServiceHandler(svc))
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return svc, server.URL
}

func useConfigCenterSource(t *testing.T, addr, namespace, environment, key string) Source {
	t.Helper()
	selector := filepath.Join(t.TempDir(), "source.yaml")
	contents := []byte("type: config_center\nconfig_center:\n" +
		"  address: " + addr + "\n" +
		"  namespace: " + namespace + "\n" +
		"  environment: " + environment + "\n" +
		"  key: " + key + "\n")
	require.NoError(t, os.WriteFile(selector, contents, 0o600))
	clearSourceEnv(t)
	t.Setenv(constants.EnvConfigSourceFile, selector)

	src, err := NewSource()
	require.NoError(t, err)
	return src
}

func TestSDKSource_Load(t *testing.T) {
	svc, addr := startFakeConfigService(t, map[string]*configv1.ConfigEntry{
		"cart/dev/bootstrap.yaml": {Value: testBootstrapYAML},
	})
	src := useConfigCenterSource(t, addr, "cart", "dev", "bootstrap.yaml")

	got, err := src.Load(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "0.0.0.0:30006", got["server"].(map[string]any)["addr"])
	assert.Equal(t, "cart", svc.LastReq().GetNamespace())
	assert.Equal(t, "dev", svc.LastReq().GetEnvironment())
	assert.Equal(t, "bootstrap.yaml", svc.LastReq().GetKey())
}
