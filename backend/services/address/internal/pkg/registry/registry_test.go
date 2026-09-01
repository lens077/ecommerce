package registry

import (
	"testing"
	"time"

	confv1 "github.com/lens077/ecommerce/backend/services/address/internal/conf/v1"
	"github.com/stretchr/testify/assert"
	"google.golang.org/protobuf/types/known/durationpb"
)

func TestOptionsFromBootstrap(t *testing.T) {
	bootstrap := &confv1.Bootstrap{
		Server: &confv1.Server{Addr: "0.0.0.0:30006"},
		Discovery: &confv1.Discovery{Consul: &confv1.Discovery_Consul{
			Addr: "consul:8500",
			Tls: &confv1.Discovery_Consul_Tls{
				Enable:             true,
				InsecureSkipVerify: true,
				CaPem:              "ca",
			},
			Check: &confv1.Discovery_Consul_Check{
				Ttl: &confv1.Discovery_Consul_Check_TTL{
					Duration:     "30s",
					PingInterval: durationpb.New(10 * time.Second),
				},
				DeregisterCriticalServiceAfter: "1m",
			},
		}},
	}

	options := optionsFromBootstrap(bootstrap)
	assert.True(t, options.Enabled)
	assert.Equal(t, "consul:8500", options.Address)
	assert.Equal(t, "0.0.0.0:30006", options.ServerAddress)
	assert.True(t, options.TLS.Enabled)
	assert.True(t, options.TLS.InsecureSkipVerify)
	assert.Equal(t, "ca", options.TLS.CAPEM)
	assert.True(t, options.Check.TTL.Enabled)
	assert.Equal(t, "30s", options.Check.TTL.Duration)
	assert.Equal(t, 10*time.Second, options.Check.TTL.PingInterval)
	assert.Equal(t, "1m", options.Check.DeregisterCriticalServiceAfter)
}

func TestOptionsDisableUnconfiguredConsul(t *testing.T) {
	options := optionsFromBootstrap(&confv1.Bootstrap{})
	assert.False(t, options.Enabled)
	assert.False(t, options.Check.TTL.Enabled)
}
