package config

import (
	"fmt"
	"os"

	confv1 "connect-go-example/internal/conf/v1"

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
				// 从环境变量获取配置路径，如果没有设置则使用默认路径
				configPath := getConfigPath()

				conf := Init(configPath)
				if conf != nil {
					fmt.Printf("Configuration loaded successfully from: %s\n", configPath)
					return conf, nil
				}

				return nil, nil
			},
		),
	)
)

// Init 初始化配置加载，仅从本地文件读取
func Init(configPath string) *confv1.Bootstrap {
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")

	localConf := &confv1.Bootstrap{}

	// 从本地文件读取配置
	if err := v.ReadInConfig(); err != nil {
		// 使用标准输出而不是logger，因为logger可能还没有初始化
		fmt.Printf("Warning: Error reading config file %s: %v\n", configPath, err)
		return nil
	}

	// 获取 Viper 的所有配置为一个 map
	m := v.AllSettings()
	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		Metadata: nil,
		// 允许将 snake_case 键与 CamelCase 字段匹配
		TagName: "json", // 明确告诉 mapstructure 使用 json tag（Protobuf 结构体自带）
		Result:  localConf,
	})
	if err != nil {
		fmt.Printf("Warning: Failed to create decoder: %v\n", err)
		return nil
	}

	if err := decoder.Decode(m); err != nil {
		fmt.Printf("Warning: Unable to decode config map into struct: %v\n", err)
		return nil
	}

	// 3. (可选) 监听本地文件变化 - 在生产环境中禁用
	// v.WatchConfig()
	// v.OnConfigChange(func(e fsnotify.Event) {
	// 	logger.Error("Config file changed:" + e.Name)
	// 	if err := v.Unmarshal(conf); err != nil {
	// 		logger.Error("Unable to decode into struct on change, %v" + err.Error())
	// 	}
	// })

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
	if conf.Data == nil || conf.Data.Database == nil {
		return fmt.Errorf("database configuration is required")
	}

	return nil
}
