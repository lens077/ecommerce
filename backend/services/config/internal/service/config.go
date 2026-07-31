package service

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/config/v1"
	"github.com/lens077/ecommerce/backend/api/config/v1/configv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/config/internal/biz"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var _ configv1connect.ConfigServiceHandler = (*ConfigService)(nil)

// maskedValue 密钥对外的占位值。当前值与历史版本共用同一个,
// 免得两条读路径各写各的、其中一条忘了脱敏。
const maskedValue = "******"

type ConfigService struct {
	uc  *biz.ConfigUseCase
	log *zap.Logger
}

func NewConfigService(uc *biz.ConfigUseCase, logger *zap.Logger) configv1connect.ConfigServiceHandler {
	return &ConfigService{uc: uc, log: logger.Named("ConfigService")}
}

// actor 从网关注入的头部读取操作者(x-md-global-name)。
func actor(header interface{ Get(string) string }) string {
	if name := header.Get(constants.UserNameMetadataKey); name != "" {
		return name
	}
	return "unknown"
}

func (s *ConfigService) toErr(err error) error {
	switch {
	case errors.Is(err, biz.ErrKeyNotFound), errors.Is(err, biz.ErrRevisionNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, biz.ErrInvalidFormat):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func (s *ConfigService) ListNamespaces(ctx context.Context, _ *connect.Request[v1.ListNamespacesRequest]) (*connect.Response[v1.ListNamespacesResponse], error) {
	infos, err := s.uc.ListNamespaces(ctx)
	if err != nil {
		return nil, s.toErr(err)
	}
	pb := make([]*v1.NamespaceInfo, 0, len(infos))
	for _, n := range infos {
		pb = append(pb, &v1.NamespaceInfo{
			Namespace:    n.Namespace,
			Environments: n.Environments,
			KeyCount:     n.KeyCount,
		})
	}
	return connect.NewResponse(&v1.ListNamespacesResponse{Namespaces: pb}), nil
}

func (s *ConfigService) ListKeys(ctx context.Context, c *connect.Request[v1.ListKeysRequest]) (*connect.Response[v1.ListKeysResponse], error) {
	entries, err := s.uc.ListKeys(ctx, c.Msg.Namespace, c.Msg.Environment, c.Msg.KeyPrefix)
	if err != nil {
		return nil, s.toErr(err)
	}
	pb := make([]*v1.ConfigEntry, 0, len(entries))
	for _, e := range entries {
		pb = append(pb, toPBEntry(e, true))
	}
	return connect.NewResponse(&v1.ListKeysResponse{Entries: pb}), nil
}

func (s *ConfigService) GetKey(ctx context.Context, c *connect.Request[v1.GetKeyRequest]) (*connect.Response[v1.GetKeyResponse], error) {
	e, err := s.uc.GetKey(ctx, c.Msg.Namespace, c.Msg.Environment, c.Msg.Key)
	if err != nil {
		return nil, s.toErr(err)
	}
	return connect.NewResponse(&v1.GetKeyResponse{Entry: toPBEntry(e, false)}), nil
}

func (s *ConfigService) PutKey(ctx context.Context, c *connect.Request[v1.PutKeyRequest]) (*connect.Response[v1.PutKeyResponse], error) {
	e, err := s.uc.PutKey(ctx, biz.PutParams{
		Namespace:   c.Msg.Namespace,
		Environment: c.Msg.Environment,
		Key:         c.Msg.Key,
		Format:      fromPBFormat(c.Msg.Format),
		Value:       c.Msg.Value,
		Comment:     c.Msg.Comment,
		Description: c.Msg.Description,
		IsSecret:    c.Msg.IsSecret,
		Author:      actor(c.Header()),
	})
	if err != nil {
		return nil, s.toErr(err)
	}
	return connect.NewResponse(&v1.PutKeyResponse{Entry: toPBEntry(e, false)}), nil
}

func (s *ConfigService) DeleteKey(ctx context.Context, c *connect.Request[v1.DeleteKeyRequest]) (*connect.Response[v1.DeleteKeyResponse], error) {
	ok, err := s.uc.DeleteKey(ctx, c.Msg.Namespace, c.Msg.Environment, c.Msg.Key)
	if err != nil {
		return nil, s.toErr(err)
	}
	return connect.NewResponse(&v1.DeleteKeyResponse{Deleted: ok}), nil
}

func (s *ConfigService) ListRevisions(ctx context.Context, c *connect.Request[v1.ListRevisionsRequest]) (*connect.Response[v1.ListRevisionsResponse], error) {
	revs, err := s.uc.ListRevisions(ctx, c.Msg.Namespace, c.Msg.Environment, c.Msg.Key)
	if err != nil {
		return nil, s.toErr(err)
	}
	pb := make([]*v1.ConfigRevision, 0, len(revs))
	for _, r := range revs {
		pb = append(pb, toPBRevision(r))
	}
	return connect.NewResponse(&v1.ListRevisionsResponse{Revisions: pb}), nil
}

func (s *ConfigService) GetRevision(ctx context.Context, c *connect.Request[v1.GetRevisionRequest]) (*connect.Response[v1.GetRevisionResponse], error) {
	r, err := s.uc.GetRevision(ctx, c.Msg.Namespace, c.Msg.Environment, c.Msg.Key, c.Msg.Version)
	if err != nil {
		return nil, s.toErr(err)
	}
	return connect.NewResponse(&v1.GetRevisionResponse{Revision: toPBRevision(r)}), nil
}

func (s *ConfigService) Rollback(ctx context.Context, c *connect.Request[v1.RollbackRequest]) (*connect.Response[v1.RollbackResponse], error) {
	e, err := s.uc.Rollback(ctx, c.Msg.Namespace, c.Msg.Environment, c.Msg.Key, c.Msg.Version, c.Msg.Comment, actor(c.Header()))
	if err != nil {
		return nil, s.toErr(err)
	}
	return connect.NewResponse(&v1.RollbackResponse{Entry: toPBEntry(e, false)}), nil
}

// watchHeartbeatInterval 空闲时的保活间隔。配置可能几天不变,
// 中间的负载均衡/代理会把长时间静默的连接当成死连接掐掉。
const watchHeartbeatInterval = 30 * time.Second

// WatchKeys 订阅配置变更。建流先推一遍当前值(SNAPSHOT),之后推增量。
func (s *ConfigService) WatchKeys(
	ctx context.Context,
	req *connect.Request[v1.WatchKeysRequest],
	stream *connect.ServerStream[v1.WatchKeysResponse],
) error {
	ns, env, keys := req.Msg.GetNamespace(), req.Msg.GetEnvironment(), req.Msg.GetKeys()

	// 顺序很重要:先订阅再发快照。反过来的话,「读完快照」到「开始订阅」之间
	// 发生的变更会两头落空 —— 快照里是旧值,事件也没订上,客户端就此停在旧配置上。
	events, cancel := s.uc.WatchKeys(ns, env, keys)
	defer cancel()

	if err := s.sendSnapshot(ctx, stream, ns, env, keys); err != nil {
		return err
	}

	ticker := time.NewTicker(watchHeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// 客户端主动断开,正常收尾
			return nil

		case ev, ok := <-events:
			if !ok {
				// channel 被关闭 = 下发链路已断(见 biz.ConfigWatcher)。
				// 结束这条流让客户端重连重取快照,而不是留一条收不到事件的死流。
				return connect.NewError(connect.CodeUnavailable,
					errors.New("config change feed interrupted, reconnect to resync"))
			}
			if err := s.sendEvent(ctx, stream, ev); err != nil {
				return err
			}

		case <-ticker.C:
			if err := stream.Send(&v1.WatchKeysResponse{
				Type: v1.WatchEventType_WATCH_EVENT_TYPE_HEARTBEAT,
			}); err != nil {
				return err
			}
		}
	}
}

// sendSnapshot 推送当前值。keys 为空时覆盖该 namespace+environment 下的全部 key。
func (s *ConfigService) sendSnapshot(
	ctx context.Context,
	stream *connect.ServerStream[v1.WatchKeysResponse],
	ns, env string,
	keys []string,
) error {
	if len(keys) == 0 {
		entries, err := s.uc.ListKeys(ctx, ns, env, "")
		if err != nil {
			return s.toErr(err)
		}
		// ListKeys 只返回元数据(不含 value),这里只取 key 名,值走下面逐个回查
		keys = make([]string, 0, len(entries))
		for _, e := range entries {
			keys = append(keys, e.Key)
		}
	}

	for _, k := range keys {
		e, err := s.uc.GetKey(ctx, ns, env, k)
		if errors.Is(err, biz.ErrKeyNotFound) {
			// 点名订阅了一个还不存在的 key 不算错误:它被创建时会收到 PUT
			continue
		}
		if err != nil {
			return s.toErr(err)
		}
		if err := stream.Send(&v1.WatchKeysResponse{
			Type:  v1.WatchEventType_WATCH_EVENT_TYPE_SNAPSHOT,
			Entry: toPBEntry(e, false),
		}); err != nil {
			return err
		}
	}
	return nil
}

// sendEvent 把一条变更事件补齐成完整条目后下发。
func (s *ConfigService) sendEvent(
	ctx context.Context,
	stream *connect.ServerStream[v1.WatchKeysResponse],
	ev biz.ChangeEvent,
) error {
	deleted := &v1.WatchKeysResponse{
		Type: v1.WatchEventType_WATCH_EVENT_TYPE_DELETE,
		Entry: &v1.ConfigEntry{
			Namespace:   ev.Namespace,
			Environment: ev.Environment,
			Key:         ev.Key,
		},
	}
	if ev.Deleted {
		return stream.Send(deleted)
	}

	// 事件只带定位信息,值在这里回查(顺带保证 is_secret 的脱敏规则与 GetKey 完全一致)
	e, err := s.uc.GetKey(ctx, ev.Namespace, ev.Environment, ev.Key)
	if errors.Is(err, biz.ErrKeyNotFound) {
		// 写入后又被立刻删掉:按删除下发,别让客户端等一个永远不来的值
		return stream.Send(deleted)
	}
	if err != nil {
		return s.toErr(err)
	}
	return stream.Send(&v1.WatchKeysResponse{
		Type:  v1.WatchEventType_WATCH_EVENT_TYPE_PUT,
		Entry: toPBEntry(e, false),
	})
}

// ---- 映射 helper ----

func toPBEntry(e *biz.ConfigEntry, metaOnly bool) *v1.ConfigEntry {
	pb := &v1.ConfigEntry{
		Id:          e.ID,
		Namespace:   e.Namespace,
		Environment: e.Environment,
		Key:         e.Key,
		Format:      toPBFormat(e.Format),
		Version:     e.Version,
		IsSecret:    e.IsSecret,
		Description: e.Description,
		UpdatedBy:   e.UpdatedBy,
		CreatedAt:   timestamppb.New(e.CreatedAt),
		UpdatedAt:   timestamppb.New(e.UpdatedAt),
	}
	// 列表仅元数据;密钥值脱敏
	if !metaOnly {
		if e.IsSecret {
			pb.Value = maskedValue
		} else {
			pb.Value = e.Value
		}
	}
	return pb
}

// toPBRevision 与 toPBEntry 用同一条脱敏规则。
// 历史版本存的是写入当时的明文,若这里不脱敏,GetKey 里被打成 ****** 的密钥
// 换成 ListRevisions/GetRevision 就能原样读出来 —— 脱敏形同虚设。
func toPBRevision(r *biz.ConfigRevision) *v1.ConfigRevision {
	value := r.Value
	if r.IsSecret {
		value = maskedValue
	}
	return &v1.ConfigRevision{
		Id:        r.ID,
		EntryId:   r.EntryID,
		Version:   r.Version,
		Format:    toPBFormat(r.Format),
		Value:     value,
		Comment:   r.Comment,
		Author:    r.Author,
		CreatedAt: timestamppb.New(r.CreatedAt),
	}
}

func toPBFormat(f biz.ConfigFormat) v1.ConfigFormat {
	switch f {
	case biz.FormatYAML:
		return v1.ConfigFormat_CONFIG_FORMAT_YAML
	case biz.FormatTOML:
		return v1.ConfigFormat_CONFIG_FORMAT_TOML
	case biz.FormatJSON:
		return v1.ConfigFormat_CONFIG_FORMAT_JSON
	case biz.FormatPlaintext:
		return v1.ConfigFormat_CONFIG_FORMAT_PLAINTEXT
	default:
		return v1.ConfigFormat_CONFIG_FORMAT_UNSPECIFIED
	}
}

func fromPBFormat(f v1.ConfigFormat) biz.ConfigFormat {
	switch f {
	case v1.ConfigFormat_CONFIG_FORMAT_YAML:
		return biz.FormatYAML
	case v1.ConfigFormat_CONFIG_FORMAT_TOML:
		return biz.FormatTOML
	case v1.ConfigFormat_CONFIG_FORMAT_JSON:
		return biz.FormatJSON
	case v1.ConfigFormat_CONFIG_FORMAT_PLAINTEXT:
		return biz.FormatPlaintext
	default:
		return biz.FormatYAML
	}
}
