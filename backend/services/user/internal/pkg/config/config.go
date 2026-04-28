package config

import (
	"context"
	"fmt"
	"sync"

	"github.com/hashicorp/consul/api"
	"github.com/lens077/ecommerce/backend/constants"
	confv1 "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/user/internal/pkg/env"
	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
	"go.uber.org/fx"
)

var (
	confMu sync.RWMutex
	conf   = &confv1.Bootstrap{}

	Module = fx.Module("config",
		fx.Provide(
			func(lc fx.Lifecycle) (*confv1.Bootstrap, error) {
				// 创建一个可以取消的上下文，用于优雅关闭 Watch 协程
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

// decodeConfig 将 Map 解析为结构体（内部提取，保持逻辑一致性）
func decodeConfig(data map[string]interface{}, target interface{}) error {
	v := viper.New()
	v.SetConfigType("yaml") // 假设 Consul 中存的是 YAML
	for k, val := range data {
		v.Set(k, val)
	}

	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		TagName: "json", // Protobuf 生成的结构体使用 json tag
		Result:  target,
	})
	if err != nil {
		return err
	}
	return decoder.Decode(v.AllSettings())
}

// updateConfig 线程安全地更新全局配置
func updateConfig(newConfig map[string]interface{}) {
	newBootstrap := &confv1.Bootstrap{}
	if err := decodeConfig(newConfig, newBootstrap); err != nil {
		return
	}

	confMu.Lock()
	conf = newBootstrap
	confMu.Unlock()
}

// Init 初始化配置加载
func Init(ctx context.Context) (*confv1.Bootstrap, error) {
	// 1. 使用常量手动获取环境变量，彻底摆脱第三方库
	addr := env.GetEnvString(constants.EnvConsulAddr, "127.0.0.1:8500")
	path := env.GetEnvString(constants.EnvConsulPath, "")
	if path == "" {
		return nil, fmt.Errorf("required env %s is missing", constants.EnvConsulPath)
	}

	consulCfg := api.DefaultConfig()
	consulCfg.Address = addr
	consulCfg.Token = env.GetEnvString(constants.EnvConsulToken, "")
	consulCfg.Scheme = env.GetEnvString(constants.EnvConsulScheme, "http")

	if consulCfg.Scheme == "https" {
		if env.GetEnvBool(constants.EnvConsulInsecureSkipVerify, false) {
			consulCfg.TLSConfig.InsecureSkipVerify = true
		} else {
			consulCfg.TLSConfig = api.TLSConfig{
				CAFile:   env.GetEnvString(constants.EnvConsulCaFile, ""),
				CertFile: env.GetEnvString(constants.EnvConsulCertFile, ""),
				KeyFile:  env.GetEnvString(constants.EnvConsulKeyFile, ""),
			}
		}
	}

	consulClient, err := api.NewClient(consulCfg)
	if err != nil {
		return nil, fmt.Errorf("initialize consul client failed: %v", err)
	}

	// 2. 首次同步拉取配置
	rawConfig, err := GetConfigFromConsul(consulClient, path)
	if err != nil {
		return nil, err
	}

	localConf := &confv1.Bootstrap{}
	if err := decodeConfig(rawConfig, localConf); err != nil {
		return nil, err
	}

	// 初始化全局变量
	conf = localConf

	// 3. 启动后台监听 (集成重试与 Context)
	WatchConsulConfig(ctx, consulClient, path, updateConfig)

	return localConf, nil
}

// GetConfig 线程安全地获取当前配置
func GetConfig() *confv1.Bootstrap {
	confMu.RLock()
	defer confMu.RUnlock()
	return conf
}

// ValidateConfig 验证配置的完整性
func ValidateConfig(conf *confv1.Bootstrap) error {
	if conf == nil {
		return fmt.Errorf("configuration is nil")
	}

	// 验证服务器配置
	if conf.Server == nil || conf.Server.Http == nil {
		return fmt.Errorf("server configuration is required")
	}

	// 验证数据库配置
	if conf.Data == nil {
		return fmt.Errorf("database configuration is required")
	}

	// 验证安全配置
	if conf.Auth == nil {
		return fmt.Errorf("auth configuration is required")
	}

	// 验证链路追踪配置
	if conf.Observability == nil {
		return fmt.Errorf("trace configuration is required")
	}

	// 验证注册/发现配置
	if conf.Discovery == nil {
		return fmt.Errorf("discovery configuration is required")
	}

	return nil
}
