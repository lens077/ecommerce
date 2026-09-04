// Package configsource selects the ecommerce bootstrap provider.
package configsource

import (
	controlsource "github.com/lens077/control-tower/sdk/configsource"
	kitconfig "github.com/lens077/go-connect-kit/config"
)

// New applies the ecommerce source-selection policy to go-connect-kit.
func New() (kitconfig.Source, error) {
	return kitconfig.FromEnvironment(controlsource.NewKitSource)
}
