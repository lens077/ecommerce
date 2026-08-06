package config

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	configv1 "github.com/lens077/config-center/api/config/v1"
	"github.com/lens077/config-center/api/config/v1/configv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/product/internal/pkg/env"
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

// 重连退避区间。上限 30s 是在「配置中心重启后尽快恢复」与
// 「它长时间不可用时别把它压垮」之间取的折中。
const (
	watchMinBackoff = time.Second
	watchMaxBackoff = 30 * time.Second
)

// Watch 订阅本服务这一个 key 的变更,断线自动重连,直到 ctx 被取消。
//
// 服务端在每次建流时都会先推一遍当前值(SNAPSHOT),所以断连期间漏掉的变更
// 会在重连时自愈 —— 这里不需要记录版本号做补偿。
func (s *configCenterSource) Watch(ctx context.Context, onEvent func(WatchEvent)) error {
	backoff := watchMinBackoff
	for {
		// 只有真正收到过事件才认为这次连接是好的:连上就立刻断开的情况
		// (如服务端正在滚动重启)必须继续退避,否则会退化成无退避的重连风暴。
		got, err := s.watchOnce(ctx, onEvent)
		if ctx.Err() != nil {
			return nil
		}
		if got {
			backoff = watchMinBackoff
		}
		onEvent(WatchEvent{Err: fmt.Errorf(
			"config center watch stream ended (%s/%s/%s @ %s), retry in %s: %w",
			s.namespace, s.environment, s.key, s.addr, backoff, err)})

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(backoff):
		}
		if backoff *= 2; backoff > watchMaxBackoff {
			backoff = watchMaxBackoff
		}
	}
}

// watchOnce 跑一条流直到它结束,返回这条流上是否收到过事件。
func (s *configCenterSource) watchOnce(ctx context.Context, onEvent func(WatchEvent)) (bool, error) {
	stream, err := s.client.WatchKeys(ctx, connect.NewRequest(&configv1.WatchKeysRequest{
		Namespace:   s.namespace,
		Environment: s.environment,
		Keys:        []string{s.key}, // 只订阅自己这一份,别人的配置与本进程无关
	}))
	if err != nil {
		return false, err
	}
	defer func() { _ = stream.Close() }()

	var got bool
	for stream.Receive() {
		msg := stream.Msg()
		switch msg.GetType() {
		case configv1.WatchEventType_WATCH_EVENT_TYPE_HEARTBEAT:
			// 保活包,只用来证明连接还活着
			got = true

		case configv1.WatchEventType_WATCH_EVENT_TYPE_DELETE:
			got = true
			onEvent(WatchEvent{Deleted: true})

		default: // SNAPSHOT / PUT
			got = true
			value := msg.GetEntry().GetValue()
			if value == "" {
				onEvent(WatchEvent{Err: fmt.Errorf("config center pushed an empty value: %s/%s/%s",
					s.namespace, s.environment, s.key)})
				continue
			}
			raw, err := parseYAMLToMap([]byte(value))
			if err != nil {
				onEvent(WatchEvent{Err: fmt.Errorf("parse pushed config (%s/%s/%s): %w",
					s.namespace, s.environment, s.key, err)})
				continue
			}
			onEvent(WatchEvent{Raw: raw})
		}
	}
	return got, stream.Err()
}
