package registryconfig

import (
	"testing"

	"github.com/lens077/ecommerce/backend/constants"
)

func TestEnabledPreservesDeploymentOverride(t *testing.T) {
	t.Setenv(constants.EnvConsulEnabled, "")
	if !Enabled("consul:8500") {
		t.Fatal("configured Consul must be enabled when the override is unset")
	}

	t.Setenv(constants.EnvConsulEnabled, "false")
	if Enabled("consul:8500") {
		t.Fatal("CONSUL_ENABLED=false must disable registration")
	}

	t.Setenv(constants.EnvConsulEnabled, "")
	if Enabled("") {
		t.Fatal("an empty Consul address must disable registration")
	}
}
