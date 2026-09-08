// Package registryconfig maps ecommerce deployment policy to registry options.
package registryconfig

import (
	"os"

	"github.com/lens077/ecommerce/backend/constants"
)

// Enabled preserves the repository's CONSUL_ENABLED override at the kit boundary.
func Enabled(address string) bool {
	return address != "" && os.Getenv(constants.EnvConsulEnabled) != "false"
}
