package config

import (
	"context"
	"fmt"
	"reflect"
	"sync"
	"time"

	"github.com/lens077/ecommerce/backend/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/cart/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/env"
	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
	"go.uber.org/fx"
	"google.golang.org/protobuf/types/known/durationpb"
)

var (
	confMu sync.RWMutex
	conf   = &confv1.Bootstrap{}

	Module = fx.Module("config",
		fx.Provide(
			func(lc fx.Lifecycle) (*confv1.Bootstrap, error) {
				ctx, cancel := context.WithCancel(context.Background())

				lc.Append(fx.Hook{
					OnStop: func(ctx context.Context) error {
						cancel()
						return nil
					},
				})

				bootstrap, err := Init(ctx)
				if err != nil {
					return nil, err
				}

				return bootstrap, nil
			},
		),
	)
)

func decodeConfig(data map[string]any, target any) error {
	v := viper.New()
	v.SetConfigType(constants.ConsulFileFormat)
	for k, val := range data {
		v.Set(k, val)
	}

	stringToProtoDurationHook := func(f reflect.Type, t reflect.Type, data any) (any, error) {
		if f.Kind() != reflect.String {
			return data, nil
		}
		if t != reflect.TypeOf(&durationpb.Duration{}) {
			return data, nil
		}

		d, err := time.ParseDuration(data.(string))
		if err != nil {
			return nil, err
		}
		return durationpb.New(d), nil
	}

	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		TagName: "json",
		DecodeHook: mapstructure.ComposeDecodeHookFunc(
			stringToProtoDurationHook,
		),
		Result: target,
	})
	if err != nil {
		return err
	}
	return decoder.Decode(v.AllSettings())
}

// Init 从配置中心(而非 Consul KV)拉取整份 Bootstrap 配置。
// 引导参数(config-service 地址、namespace/environment/key)来自环境变量;
// 其余全部配置(含 Consul 发现地址、DB、Redis 等)由配置中心下发。
func Init(ctx context.Context) (*confv1.Bootstrap, error) {
	addr := env.GetEnvString(constants.EnvConfigCenterAddr, constants.ConfigCenterAddr)
	namespace := env.GetEnvString(constants.EnvConfigCenterNamespace, "")
	environment := env.GetEnvString(constants.EnvConfigCenterEnv, "")
	key := env.GetEnvString(constants.EnvConfigCenterKey, constants.ConfigCenterKey)
	if namespace == "" || environment == "" {
		return nil, fmt.Errorf("required env %s and %s must be set",
			constants.EnvConfigCenterNamespace, constants.EnvConfigCenterEnv)
	}

	rawConfig, err := GetConfigFromConfigCenter(ctx, addr, namespace, environment, key)
	if err != nil {
		return nil, err
	}

	localConf := &confv1.Bootstrap{}
	if err := decodeConfig(rawConfig, localConf); err != nil {
		return nil, err
	}

	conf = localConf
	return localConf, nil
}

func GetConfig() *confv1.Bootstrap {
	confMu.RLock()
	defer confMu.RUnlock()
	return conf
}
