package config

import (
	"fmt"
	"os"

	"github.com/caarlos0/env/v11"
	"github.com/hashicorp/consul/api"
	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
	confv1 "github.com/sunmery/ecommerce/backend/application/user/internal/conf/v1"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var (
	conf      = &confv1.Bootstrap{}
	logger, _ = zap.NewDevelopment() // 创建一个开发模式的普通 Logger
	// Module 提供 Fx 模块
	Module = fx.Module("config",
		fx.Provide(
			// 提供配置加载函数
			func() (*confv1.Bootstrap, error) {
				// 初始化配置，获取consul客户端
				conf, err := Init()
				if conf != nil {
					logger.Info("Configuration loaded successfully from consul")
					return conf, nil
				}

				return nil, err
			},
		),
	)
)

type ConsulConfig struct {
	// 配置中心地址
	Addr string `env:"CONSUL_CENTER_ADDR,required" envDefault:"localhost:8500"`
	// 微服务对应的配置文件路径
	Path string `env:"CONSUL_PATH,required"`
	// Consul token
	Token string `env:"CONSUL_CENTER_TOKEN"`
	// URL协议类型， 可选http/https, 默认http
	Scheme string `env:"CONSUL_CENTER_SCHEME,required" envDefault:"http"`

	// TLS
	// 是否跳过验证证书，仅适用于开发测试
	InsecureSkipVerify bool   `env:"CONSUL_INSECURE_SKIP_VERIFY"`
	CaFile             string `env:"CONSUL_CA_FILE"`
	CertFile           string `env:"CONSUL_CERT_FILE"`
	KeyFile            string `env:"CONSUL_KEY_FILE"`
}

// updateConfig 更新全局配置
func updateConfig(newConfig map[string]interface{}) {
	// 使用viper解析配置
	v := viper.New()
	for k, value := range newConfig {
		v.Set(k, value)
	}

	// 解码到Bootstrap结构体
	newBootstrap := &confv1.Bootstrap{}
	m := v.AllSettings()
	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		Metadata: nil,
		TagName:  "json", // 明确告诉 mapstructure 使用 json tag（Protobuf 结构体自带）
		Result:   newBootstrap,
	})
	if err != nil {
		logger.Error("Failed to create decoder when updating config", zap.Error(err))
		return
	}

	if err := decoder.Decode(m); err != nil {
		logger.Error("Unable to decode new config into struct", zap.Error(err))
		return
	}

	// 更新全局配置
	conf = newBootstrap
}

// Init 初始化配置加载，只从consul配置中心获取，并启动配置监听
func Init() (*confv1.Bootstrap, error) {
	var cfg ConsulConfig
	if err := env.Parse(&cfg); err != nil {
		return nil, fmt.Errorf("parse config failed: %w", err)
	}
	consulCfg := api.DefaultConfig()
	consulCfg.Address = cfg.Addr
	consulCfg.Token = cfg.Token
	consulCfg.Scheme = cfg.Scheme

	if cfg.Scheme == "https" {
		switch {
		case cfg.InsecureSkipVerify:
			consulCfg.TLSConfig.InsecureSkipVerify = true
		default:
			consulCfg.TLSConfig = api.TLSConfig{
				CAFile:   cfg.CaFile,
				CertFile: cfg.CertFile,
				KeyFile:  cfg.KeyFile,
			}
		}
	}
	// 初始化consul客户端
	consulClient, err := api.NewClient(consulCfg)
	if err != nil {
		return nil, fmt.Errorf("failed: to initialize consul client: %v\n", err)
	}

	// 从consul获取配置
	consulConfig, err := GetConfigFromConsul(consulClient, cfg.Path)
	if err != nil {
		return nil, fmt.Errorf("failed: get consul config err: %w", err)
	}

	// 使用viper解析配置
	v := viper.New()
	for k, value := range consulConfig {
		v.Set(k, value)
	}

	localConf := &confv1.Bootstrap{}

	// 获取 Viper 的所有配置为一个 map
	m := v.AllSettings()
	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		Metadata: nil,
		// 允许将 snake_case 键与 CamelCase 字段匹配
		TagName: "json", // 明确告诉 mapstructure 使用 json tag（Protobuf 结构体自带）
		Result:  localConf,
	})
	if err != nil {

		return nil, fmt.Errorf("failed: Failed to create decoder: %v\n", err)
	}

	if err := decoder.Decode(m); err != nil {

		return nil, fmt.Errorf("failed: Unable to decode config map into struct: %v\n", err)
	}

	// 启动配置监听
	WatchConsulConfig(consulClient, cfg.Path, func(newConfig map[string]interface{}) {
		// 更新全局配置
		updateConfig(newConfig)
	})

	return localConf, nil
}

// GetConfig 返回已加载的配置
func GetConfig() *confv1.Bootstrap {
	return conf
}

// isRunningInContainer 检查是否在容器中运行
func isRunningInContainer() bool {
	// 检查常见的容器环境指示器
	// 1. 检查/.dockerenv文件是否存在
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}

	// 2. 检查/proc/1/cgroup文件内容
	if cgroup, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		if contains(string(cgroup), "docker") || contains(string(cgroup), "kubepods") {
			return true
		}
	}

	// 3. 检查容器相关的环境变量
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" || os.Getenv("CONTAINER") != "" {
		return true
	}

	return false
}

// contains 检查字符串是否包含子字符串
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && (s[0:len(substr)] == substr || contains(s[1:], substr)))
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
	if conf.Trace == nil {
		return fmt.Errorf("trace configuration is required")
	}

	// 验证注册/发现配置
	if conf.Discovery == nil {
		return fmt.Errorf("discovery configuration is required")
	}

	return nil
}
