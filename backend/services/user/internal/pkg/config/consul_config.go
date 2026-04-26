package config

import (
	"bytes"
	"fmt"
	"time"

	"github.com/hashicorp/consul/api"
	"github.com/spf13/viper"
	"go.uber.org/zap"
)

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
				logger.Error("Error watching consul config", zap.Error(err))
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
					logger.Error("Error parsing consul config", zap.Error(err))
					continue
				}

				// 调用回调函数
				onChange(v.AllSettings())
			}
		}
	}()
}
