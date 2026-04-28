package config

import (
	"fmt"
	"os"

	confv1 "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"

	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
	"go.uber.org/fx"
)

var (
	conf = &confv1.Bootstrap{}
	// Module 提供 Fx 模块
	Module = fx.Module("config",
		fx.Provide(
			// 提供配置加载函数
			func() (*confv1.Bootstrap, error) {
				conf := Init()
				if conf != nil {
					fmt.Printf("Configuration loaded successfully from consul\n")
					return conf, nil
				}

				return nil, fmt.Errorf("failed to load configuration from consul")
			},
		),
	)
)

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
		fmt.Printf("Error: Failed to create decoder when updating config: %v\n", err)
		return
	}

	if err := decoder.Decode(m); err != nil {
		fmt.Printf("Error: Unable to decode new config into struct: %v\n", err)
		return
	}

	// 更新全局配置
	conf = newBootstrap
}

// Init 初始化配置加载，只从consul配置中心获取，并启动配置监听
func Init() *confv1.Bootstrap {
	// 从环境变量获取consul配置
	consulAddr := os.Getenv("CONFIG_CENTER")
	if consulAddr == "" {
		fmt.Printf("Error: CONFIG_CENTER environment variable is required\n")
		return nil
	}

	consulPath := os.Getenv("CONFIG_PATH")
	if consulPath == "" {
		consulPath = "configs/config.yaml"
	}
	consulToken := os.Getenv("CONFIG_CENTER_TOKEN")

	// 初始化consul客户端
	consulClient, err := InitConsul(&ConsulConfig{
		Addr:  consulAddr,
		Path:  consulPath,
		Token: consulToken,
	})
	if err != nil {
		fmt.Printf("Error: Failed to initialize consul client: %v\n", err)
		return nil
	}

	// 从consul获取配置
	consulConfig, err := GetConfigFromConsul(consulClient, consulPath)
	if err != nil {
		fmt.Printf("Error: Failed to get config from consul: %v\n", err)
		return nil
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
		fmt.Printf("Error: Failed to create decoder: %v\n", err)
		return nil
	}

	if err := decoder.Decode(m); err != nil {
		fmt.Printf("Error: Unable to decode config map into struct: %v\n", err)
		return nil
	}

	// 启动配置监听
	WatchConsulConfig(consulClient, consulPath, func(newConfig map[string]interface{}) {
		// 更新全局配置
		updateConfig(newConfig)
	})

	return localConf
}

// GetConfig 返回已加载的配置
func GetConfig() *confv1.Bootstrap {
	return conf
}

// getConfigPath 从环境变量获取配置路径
func getConfigPath() string {
	// 优先使用环境变量 CONFIG_PATH
	if configPath := os.Getenv("CONFIG_PATH"); configPath != "" {
		return configPath
	}

	// 如果没有设置环境变量，根据运行环境返回默认路径
	// 在Docker容器中，配置文件位于/app/configs/config.yaml
	// 在开发环境中，配置文件位于configs/config.yaml
	if isRunningInContainer() {
		return "/app/configs/config.yaml"
	}

	return "configs/config.yaml"
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
