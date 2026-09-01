package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hashicorp/consul/api"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/meta"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/fx/fxtest"
	"go.uber.org/zap/zaptest"
)

var testAppInfo = meta.AppInfo{
	ID:          "registry-test-id",
	Name:        "registry-test-service",
	Host:        "10.0.0.7",
	Environment: "dev",
	Version:     "v1.2.3",
}

func testOptions(serverAddress string, pingInterval time.Duration) Options {
	return Options{
		Enabled:       true,
		ServerAddress: serverAddress,
		Check: CheckOptions{
			TTL: TTLCheckOptions{
				Enabled:      true,
				Duration:     "30s",
				PingInterval: pingInterval,
			},
			DeregisterCriticalServiceAfter: "1m",
		},
	}
}

type fakeConsulAgent struct {
	address string

	mu           sync.Mutex
	registered   *api.AgentServiceRegistration
	checkIDs     map[string]struct{}
	ttlCheckIDs  []string
	deregistered []string
}

func (agent *fakeConsulAgent) Registered() *api.AgentServiceRegistration {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	return agent.registered
}

func (agent *fakeConsulAgent) TTLUpdates() []string {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	return append([]string(nil), agent.ttlCheckIDs...)
}

func (agent *fakeConsulAgent) Deregistered() []string {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	return append([]string(nil), agent.deregistered...)
}

func startFakeConsulAgent(t *testing.T) *fakeConsulAgent {
	t.Helper()
	agent := &fakeConsulAgent{}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.URL.Path == "/v1/agent/service/register":
			registration := &api.AgentServiceRegistration{}
			if err := json.NewDecoder(request.Body).Decode(registration); err != nil {
				writer.WriteHeader(http.StatusBadRequest)
				return
			}
			checks := make(api.AgentServiceChecks, 0, 1+len(registration.Checks))
			if registration.Check != nil {
				checks = append(checks, registration.Check)
			}
			checks = append(checks, registration.Checks...)
			checkIDs := make(map[string]struct{}, len(checks))
			for index, check := range checks {
				checkID := check.CheckID
				if checkID == "" {
					checkID = "service:" + registration.ID
					if len(checks) > 1 {
						checkID += fmt.Sprintf(":%d", index+1)
					}
				}
				checkIDs[checkID] = struct{}{}
			}
			agent.mu.Lock()
			agent.registered = registration
			agent.checkIDs = checkIDs
			agent.mu.Unlock()
		case strings.HasPrefix(request.URL.Path, "/v1/agent/check/update/"):
			checkID := strings.TrimPrefix(request.URL.Path, "/v1/agent/check/update/")
			agent.mu.Lock()
			_, exists := agent.checkIDs[checkID]
			if exists {
				agent.ttlCheckIDs = append(agent.ttlCheckIDs, checkID)
			}
			agent.mu.Unlock()
			if !exists {
				writer.WriteHeader(http.StatusNotFound)
			}
		case strings.HasPrefix(request.URL.Path, "/v1/agent/service/deregister/"):
			agent.mu.Lock()
			agent.deregistered = append(agent.deregistered,
				strings.TrimPrefix(request.URL.Path, "/v1/agent/service/deregister/"))
			agent.mu.Unlock()
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	agent.address = strings.TrimPrefix(server.URL, "http://")
	return agent
}

func newRegistry(t *testing.T, address string) *ConsulRegistry {
	t.Helper()
	registry, err := NewConsulRegistry(address, testAppInfo.ID, testAppInfo.Name, WithLogger(zaptest.NewLogger(t)))
	require.NoError(t, err)
	return registry
}

func TestNewConsulRegistry(t *testing.T) {
	registry, err := NewConsulRegistry("localhost:8500", "test-id", "test-service", WithLogger(zaptest.NewLogger(t)))
	require.NoError(t, err)
	assert.Equal(t, "test-id", registry.ID)
	assert.Equal(t, "test-service", registry.Name)
	assert.Equal(t, "localhost:8500", registry.Addr)
}

func TestNewConsulRegistryTLS(t *testing.T) {
	registry, err := NewConsulRegistry("localhost:8500", "test-id", "test-service",
		WithLogger(zaptest.NewLogger(t)), WithTLS(true, ""))
	require.NoError(t, err)
	assert.NotNil(t, registry)

	registry, err = NewConsulRegistry("localhost:8500", "test-id", "test-service",
		WithLogger(zaptest.NewLogger(t)), WithTLS(false, "not-a-pem"))
	assert.Nil(t, registry)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "PEM")
}

func moduleApp(t *testing.T, options Options, output **ConsulRegistry) *fxtest.App {
	t.Helper()
	t.Setenv(constants.EnvConsulEnabled, "")
	return fxtest.New(t,
		fx.NopLogger,
		fx.Supply(options, testAppInfo, zaptest.NewLogger(t)),
		Module,
		fx.Populate(output),
	)
}

func TestModuleOwnsRegistrationLifecycle(t *testing.T) {
	agent := startFakeConsulAgent(t)
	options := testOptions("0.0.0.0:30006", 5*time.Millisecond)
	options.Address = agent.address

	var registry *ConsulRegistry
	app := moduleApp(t, options, &registry)
	app.RequireStart()
	require.NotNil(t, registry)
	assert.NotNil(t, agent.Registered())
	require.Eventually(t, func() bool { return len(agent.TTLUpdates()) > 0 }, time.Second, 5*time.Millisecond)
	app.RequireStop()
	assert.Equal(t, []string{testAppInfo.ID}, agent.Deregistered())
}

func TestModuleCanDisableRegistry(t *testing.T) {
	tests := []struct {
		name       string
		options    Options
		disableEnv bool
	}{
		{name: "options disabled", options: Options{}},
		{name: "empty address", options: testOptions("0.0.0.0:30006", time.Second)},
		{name: "environment disabled", options: func() Options {
			options := testOptions("0.0.0.0:30006", time.Second)
			options.Address = "127.0.0.1:8500"
			return options
		}(), disableEnv: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if test.disableEnv {
				t.Setenv(constants.EnvConsulEnabled, "false")
			} else {
				t.Setenv(constants.EnvConsulEnabled, "")
			}
			var registry *ConsulRegistry
			app := fxtest.New(t,
				fx.NopLogger,
				fx.Supply(test.options, testAppInfo, zaptest.NewLogger(t)),
				Module,
				fx.Populate(&registry),
			)
			require.NoError(t, app.Err())
			assert.Nil(t, registry)
			app.RequireStart()
			app.RequireStop()
		})
	}
}

func TestRegisterUsesProviderNeutralOptions(t *testing.T) {
	agent := startFakeConsulAgent(t)
	registry := newRegistry(t, agent.address)
	options := testOptions("0.0.0.0:30006", time.Second)
	require.NoError(t, registry.Register(options, testAppInfo))

	registration := agent.Registered()
	require.NotNil(t, registration)
	assert.Equal(t, testAppInfo.ID, registration.ID)
	assert.Equal(t, testAppInfo.Name, registration.Name)
	assert.Equal(t, testAppInfo.Host, registration.Address)
	assert.Equal(t, 30006, registration.Port)
	assert.ElementsMatch(t, []string{testAppInfo.Version, constants.ConsulTagFx, constants.ConsulTagTtl}, registration.Tags)
	require.NotNil(t, registration.Check)
	assert.Equal(t, "service:"+testAppInfo.ID, registration.Check.CheckID)
	assert.Equal(t, "30s", registration.Check.TTL)
	assert.Equal(t, "1m", registration.Check.DeregisterCriticalServiceAfter)
	require.Len(t, registration.Checks, 1)
	assert.Equal(t, "service:"+testAppInfo.ID+":grpc-readiness", registration.Checks[0].CheckID)
	assert.Equal(t, testAppInfo.Host+":30006", registration.Checks[0].GRPC)
	assert.Equal(t, "1s", registration.Checks[0].Interval)
}

func TestRegisterRejectsInvalidServerAndMissingTTL(t *testing.T) {
	agent := startFakeConsulAgent(t)
	registry := newRegistry(t, agent.address)

	for _, address := range []string{"", "0.0.0.0", "0.0.0.0:http"} {
		options := testOptions(address, time.Second)
		require.Error(t, registry.Register(options, testAppInfo))
	}

	options := testOptions("0.0.0.0:30006", time.Second)
	options.Check.TTL.Enabled = false
	require.Error(t, registry.Register(options, testAppInfo))
	assert.Nil(t, agent.Registered())
}

func TestTTLPingerUsesExplicitCheckIDAndStops(t *testing.T) {
	agent := startFakeConsulAgent(t)
	registry := newRegistry(t, agent.address)
	options := testOptions("0.0.0.0:30006", 5*time.Millisecond)
	require.NoError(t, registry.Register(options, testAppInfo))

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		registry.TTLCheckPinger(ctx, options)
	}()
	require.Eventually(t, func() bool { return len(agent.TTLUpdates()) > 0 }, time.Second, 5*time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("TTL pinger did not stop after cancellation")
	}
	for _, checkID := range agent.TTLUpdates() {
		assert.Equal(t, "service:"+testAppInfo.ID, checkID)
	}
}

func TestTTLPingerFirstPingIsImmediate(t *testing.T) {
	agent := startFakeConsulAgent(t)
	registry := newRegistry(t, agent.address)
	options := testOptions("0.0.0.0:30006", 30*time.Second)
	require.NoError(t, registry.Register(options, testAppInfo))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started := time.Now()
	go registry.TTLCheckPinger(ctx, options)
	require.Eventually(t, func() bool { return len(agent.TTLUpdates()) > 0 }, 2*time.Second, 5*time.Millisecond)
	assert.Less(t, time.Since(started), 2*time.Second,
		"the first heartbeat must not wait for the ticker interval")
}

func TestTTLPingerDefaultsMissingIntervalWithoutPanic(t *testing.T) {
	registry := newRegistry(t, "127.0.0.1:1")
	options := testOptions("0.0.0.0:30006", 0)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	assert.NotPanics(t, func() { registry.TTLCheckPinger(ctx, options) })
}

func TestDeregisterStopsPingerFirst(t *testing.T) {
	agent := startFakeConsulAgent(t)
	registry := newRegistry(t, agent.address)
	options := testOptions("0.0.0.0:30006", 5*time.Millisecond)
	require.NoError(t, registry.Register(options, testAppInfo))

	pingCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	registry.cancelPing = cancel
	done := make(chan struct{})
	go func() {
		defer close(done)
		registry.TTLCheckPinger(pingCtx, options)
	}()
	require.Eventually(t, func() bool { return len(agent.TTLUpdates()) > 0 }, time.Second, 5*time.Millisecond)
	require.NoError(t, registry.Deregister())
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Deregister did not stop the TTL pinger")
	}
	assert.Equal(t, []string{testAppInfo.ID}, agent.Deregistered())
}
