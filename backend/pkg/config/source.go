package config

import (
	"bytes"
	"context"
	"fmt"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/env"
	"github.com/spf13/viper"
)

// Source fetches one complete Bootstrap configuration document.
type Source interface {
	// Name returns the selected source identifier.
	Name() string
	// Load returns the parsed YAML document as a provider-neutral map.
	Load(ctx context.Context) (map[string]any, error)
}

// WatchEvent describes one configuration update.
type WatchEvent struct {
	Raw     map[string]any
	Deleted bool
	Err     error
}

// Watcher is the optional change-stream capability implemented by Config Center.
type Watcher interface {
	Watch(ctx context.Context, onEvent func(WatchEvent)) error
}

// NewSource selects the configured source. Normal startup uses a Config Center
// selector; file mode is an explicit local-only escape hatch.
func NewSource() (Source, error) {
	if sourceConfigFile := env.GetEnvString(constants.EnvConfigSourceFile, ""); sourceConfigFile != "" {
		return NewSDKSource(sourceConfigFile)
	}

	name := env.GetEnvString(constants.EnvConfigSource, "")
	switch name {
	case constants.ConfigSourceFile:
		return NewFileSource()
	case constants.ConfigSourceConfigCenter:
		return nil, fmt.Errorf("%s=%s is deprecated; set %s to a local SourceConfig file instead",
			constants.EnvConfigSource, constants.ConfigSourceConfigCenter, constants.EnvConfigSourceFile)
	case "":
		return nil, fmt.Errorf("required env %s is missing", constants.EnvConfigSourceFile)
	default:
		return nil, fmt.Errorf("unknown %s=%q, expect %q or set %s",
			constants.EnvConfigSource, name,
			constants.ConfigSourceFile, constants.EnvConfigSourceFile)
	}
}

func parseYAMLToMap(data []byte) (map[string]any, error) {
	v := viper.New()
	v.SetConfigType(constants.ConfigFileFormat)
	if err := v.ReadConfig(bytes.NewBuffer(data)); err != nil {
		return nil, err
	}
	return v.AllSettings(), nil
}
