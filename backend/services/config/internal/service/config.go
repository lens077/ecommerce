package service

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/config/v1"
	"github.com/lens077/ecommerce/backend/api/config/v1/configv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/config/internal/biz"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var _ configv1connect.ConfigServiceHandler = (*ConfigService)(nil)

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
			pb.Value = "******"
		} else {
			pb.Value = e.Value
		}
	}
	return pb
}

func toPBRevision(r *biz.ConfigRevision) *v1.ConfigRevision {
	return &v1.ConfigRevision{
		Id:        r.ID,
		EntryId:   r.EntryID,
		Version:   r.Version,
		Format:    toPBFormat(r.Format),
		Value:     r.Value,
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
