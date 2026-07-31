package config

import (
	"context"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	configv1 "github.com/lens077/ecommerce/backend/api/config/v1"
	"github.com/lens077/ecommerce/backend/api/config/v1/configv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/env"
)

var _ Source = (*configCenterSource)(nil)

// configCenterSource 经 ConnectRPC 从 config-service 拉整份 Bootstrap。
// 配置以「一个 key 一份 YAML」的粒度存储,由 namespace/environment/key 三元组定位。
type configCenterSource struct {
	client      configv1connect.ConfigServiceClient
	addr        string
	namespace   string
	environment string
	key         string
}

// NewConfigCenterSource 由 CONFIG_CENTER_* 环境变量构造:
// CONFIG_CENTER_ADDR / CONFIG_CENTER_NAMESPACE / CONFIG_CENTER_ENV / CONFIG_CENTER_KEY。
//
// namespace 与 environment 没有合理的默认值(猜错了只会静默读到空配置),故强制必填。
// 服务对服务直连 config-service(集群内,不过网关),因此不需要 JWT。
func NewConfigCenterSource() (Source, error) {
	addr := env.GetEnvString(constants.EnvConfigCenterAddr, constants.ConfigCenterAddr)
	namespace := env.GetEnvString(constants.EnvConfigCenterNamespace, "")
	environment := env.GetEnvString(constants.EnvConfigCenterEnv, "")
	key := env.GetEnvString(constants.EnvConfigCenterKey, constants.ConfigCenterKey)

	if namespace == "" || environment == "" {
		return nil, fmt.Errorf("required env %s and %s must be set when %s=%s",
			constants.EnvConfigCenterNamespace, constants.EnvConfigCenterEnv,
			constants.EnvConfigSource, constants.ConfigSourceConfigCenter)
	}

	return &configCenterSource{
		client:      configv1connect.NewConfigServiceClient(http.DefaultClient, addr),
		addr:        addr,
		namespace:   namespace,
		environment: environment,
		key:         key,
	}, nil
}

func (s *configCenterSource) Name() string { return constants.ConfigSourceConfigCenter }

func (s *configCenterSource) Load(ctx context.Context) (map[string]any, error) {
	resp, err := s.client.GetKey(ctx, connect.NewRequest(&configv1.GetKeyRequest{
		Namespace:   s.namespace,
		Environment: s.environment,
		Key:         s.key,
	}))
	if err != nil {
		return nil, fmt.Errorf("config center get key failed (%s/%s/%s @ %s): %w",
			s.namespace, s.environment, s.key, s.addr, err)
	}

	entry := resp.Msg.GetEntry()
	if entry == nil || entry.GetValue() == "" {
		return nil, fmt.Errorf("config center key is empty: %s/%s/%s @ %s",
			s.namespace, s.environment, s.key, s.addr)
	}

	return parseYAMLToMap([]byte(entry.GetValue()))
}
