package config

import (
	"bytes"
	"fmt"
	"os"
	"time"

	"github.com/hashicorp/consul/api"
	"github.com/spf13/viper"
)

// ConsulConfig consul配置中心配置

type ConsulConfig struct {
	// 配置中心地址
	Addr string
	// 微服务对应的配置文件路径
	Path  string
	Token string
}

// InitConsul 初始化consul配置中心
func InitConsul(cfg *ConsulConfig) (*api.Client, error) {
	// 如果环境变量存在，覆盖默认值
	if envConfigCenter := os.Getenv("CONFIG_CENTER"); envConfigCenter != "" {
		cfg.Addr = envConfigCenter
	}
	if envConfigPath := os.Getenv("CONFIG_PATH"); envConfigPath != "" {
		cfg.Path = envConfigPath
	}
	if envConfigCenterToken := os.Getenv("CONFIG_CENTER_TOKEN"); envConfigCenterToken != "" {
		cfg.Token = envConfigCenterToken
	}

	// 创建consul 客户端
	consulClient, err := api.NewClient(&api.Config{
		Address:  cfg.Addr,
		Scheme:   "http",
		WaitTime: time.Second * 15,
		Token:    cfg.Token,
	})
	if err != nil {
		return nil, fmt.Errorf("create consul client failed: %w", err)
	}

	return consulClient, nil
}

// GetConfigFromConsul 从consul获取配置
func GetConfigFromConsul(client *api.Client, path string) (map[string]interface{}, error) {
	// 从consul获取配置
	kv := client.KV()
	pair, _, err := kv.Get(path, nil)
	if err != nil {
		return nil, fmt.Errorf("get config from consul failed: %w", err)
	}

	if pair == nil {
		return nil, fmt.Errorf("config not found in consul: %s", path)
	}

	// 使用viper解析配置
	v := viper.New()
	v.SetConfigType("yaml")
	
	// 将consul返回的配置数据作为viper的配置源
	if err := v.ReadConfig(bytes.NewBuffer(pair.Value)); err != nil {
		return nil, fmt.Errorf("read config from consul failed: %w", err)
	}
	
	// 获取所有配置
	return v.AllSettings(), nil
}

// WatchConsulConfig 监听consul配置变化
func WatchConsulConfig(client *api.Client, path string, onChange func(map[string]interface{})) {
	go func() {
		kv := client.KV()
		lastIndex := uint64(0)
		
		for {
			// 使用Watch方法监听配置变化
			pair, meta, err := kv.Get(path, &api.QueryOptions{
				WaitIndex: lastIndex,
				WaitTime:  time.Second * 60,
			})
			if err != nil {
				fmt.Printf("Error watching consul config: %v\n", err)
				// 等待1秒后重试
				time.Sleep(time.Second)
				continue
			}
			
			// 更新lastIndex，用于下一次Watch
			lastIndex = meta.LastIndex
			
			if pair != nil {
				// 解析配置
				v := viper.New()
				v.SetConfigType("yaml")
				if err := v.ReadConfig(bytes.NewBuffer(pair.Value)); err != nil {
					fmt.Printf("Error parsing consul config: %v\n", err)
					continue
				}
				
				// 调用回调函数
				onChange(v.AllSettings())
			}
		}
	}()
}
