package config

import (
	"bytes"
	"context"
	"fmt"
	"sync"

	"github.com/hashicorp/consul/api"
	"github.com/hashicorp/consul/api/watch" // 【新导入】Consul 官方提供的 Watch 包
	"github.com/spf13/viper"
	"go.uber.org/zap"
)

// ConfigStore 定义了配置存储的内部状态，防止并发读写冲突
type ConfigStore struct {
	mu       sync.RWMutex
	settings map[string]interface{}
}

// parseYAMLToMap 将字节流解析为配置字典
func parseYAMLToMap(data []byte) (map[string]interface{}, error) {
	v := viper.New()
	v.SetConfigType("yaml")
	if err := v.ReadConfig(bytes.NewBuffer(data)); err != nil {
		return nil, err
	}
	return v.AllSettings(), nil
}

// GetConfigFromConsul 显式拉取配置
func GetConfigFromConsul(client *api.Client, path string) (map[string]interface{}, error) {
	kv := client.KV()
	pair, _, err := kv.Get(path, nil)
	if err != nil {
		return nil, fmt.Errorf("consul kv get failed: %w", err)
	}

	if pair == nil || len(pair.Value) == 0 {
		return nil, fmt.Errorf("config path is empty: %s", path)
	}

	return parseYAMLToMap(pair.Value)
}

// WatchConsulConfig 使用 Consul Agent 提供的 Watches 订阅机制监听配置变化
func WatchConsulConfig(ctx context.Context, consulCfg *api.Config, path string, onChange func(map[string]interface{})) error {
	// 1. 构造构建 Watch Plan 的参数，指定类型为 "key"
	params := map[string]interface{}{
		"type": "key",
		"key":  path,
	}

	plan, err := watch.Parse(params)
	if err != nil {
		return fmt.Errorf("failed to parse watch plan: %w", err)
	}

	// 2. 注册数据变更时的回调函数（Handler）
	// 当监听的 Key 发生变更，或者首次建立连接时，该函数会被触发
	plan.Handler = func(idx uint64, raw interface{}) {
		if raw == nil {
			zap.L().Warn("config deleted in consul", zap.String("path", path))
			return
		}

		// 断言为 *api.KVPair 类型
		pair, ok := raw.(*api.KVPair)
		if !ok || pair == nil {
			zap.L().Error("watch returned unexpected data type", zap.String("path", path))
			return
		}

		// 解析新配置
		zap.L().Info("watch updated in consul", zap.String("path", path))
		newSettings, err := parseYAMLToMap(pair.Value)
		if err != nil {
			zap.L().Error("failed to parse watched config", zap.Error(err))
			return
		}

		// 触发外部业务逻辑（更新全局配置变量）
		onChange(newSettings)
	}

	// 3. 在独立协程中运行 Watch Plan (内部自动处理长轮询与指数退避重试)
	go func() {
		zap.L().Info("starting Consul config watch plan", zap.String("path", path))
		if err := plan.RunWithConfig(consulCfg.Address, consulCfg); err != nil {
			zap.L().Error("Consul watch plan exited with error", zap.Error(err))
		}
	}()

	// 4. 监听 Context 状态，实现优雅退出
	go func() {
		<-ctx.Done()
		plan.Stop() // 优雅停止订阅服务
		zap.L().Info("consul watch plan stopped gracefully", zap.String("path", path))
	}()

	return nil
}
