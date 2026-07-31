package config

import (
	"bytes"
	"context"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	configv1 "github.com/lens077/ecommerce/backend/api/config/v1"
	"github.com/lens077/ecommerce/backend/api/config/v1/configv1connect"
	"github.com/spf13/viper"
)

// parseYAMLToMap 将 YAML 文档解析为 viper 的扁平 map,供 decodeConfig 填充 Bootstrap。
func parseYAMLToMap(data []byte) (map[string]interface{}, error) {
	v := viper.New()
	v.SetConfigType("yaml")
	if err := v.ReadConfig(bytes.NewBuffer(data)); err != nil {
		return nil, err
	}
	return v.AllSettings(), nil
}

// GetConfigFromConfigCenter 通过 ConnectRPC 从配置中心拉取整份 Bootstrap 配置。
// 配置以「一个 key 一份 YAML」的粒度存储(namespace/environment/key)。
// 服务对服务直连 config-service(集群内,不过网关),无需 JWT。
func GetConfigFromConfigCenter(ctx context.Context, addr, namespace, environment, key string) (map[string]interface{}, error) {
	client := configv1connect.NewConfigServiceClient(http.DefaultClient, addr)

	resp, err := client.GetKey(ctx, connect.NewRequest(&configv1.GetKeyRequest{
		Namespace:   namespace,
		Environment: environment,
		Key:         key,
	}))
	if err != nil {
		return nil, fmt.Errorf("config center get key failed (%s/%s/%s @ %s): %w", namespace, environment, key, addr, err)
	}

	entry := resp.Msg.GetEntry()
	if entry == nil || entry.GetValue() == "" {
		return nil, fmt.Errorf("config center key is empty: %s/%s/%s", namespace, environment, key)
	}

	return parseYAMLToMap([]byte(entry.GetValue()))
}
