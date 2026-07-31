package biz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/pelletier/go-toml/v2"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// ConfigFormat 配置内容格式(与 proto ConfigFormat 对应,以字符串持久化)
type ConfigFormat string

const (
	FormatYAML      ConfigFormat = "yaml"
	FormatTOML      ConfigFormat = "toml"
	FormatJSON      ConfigFormat = "json"
	FormatPlaintext ConfigFormat = "plaintext"
)

var (
	ErrKeyNotFound      = errors.New("config key not found")
	ErrRevisionNotFound = errors.New("config revision not found")
	ErrInvalidFormat    = errors.New("invalid config format")
)

// ConfigEntry 配置项(键 + 当前值 + 元数据)
type ConfigEntry struct {
	ID          int64
	Namespace   string
	Environment string
	Key         string
	Format      ConfigFormat
	Value       string
	Version     int32
	IsSecret    bool
	Description string
	UpdatedBy   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// NamespaceInfo namespace 概览:该 namespace 下确实存在配置的环境与 key 总数。
// 供前端下拉选择,避免手输 namespace/environment。
type NamespaceInfo struct {
	Namespace    string
	Environments []string
	KeyCount     int32
}

// ConfigRevision 版本历史记录
type ConfigRevision struct {
	ID        int64
	EntryID   int64
	Version   int32
	Format    ConfigFormat
	Value     string
	Comment   string
	Author    string
	CreatedAt time.Time
}

// PutParams 创建/更新配置项的入参
type PutParams struct {
	Namespace   string
	Environment string
	Key         string
	Format      ConfigFormat
	Value       string
	Comment     string
	Description string
	IsSecret    bool
	Author      string
}

// ConfigRepo 数据访问接口(由 data 层实现)
type ConfigRepo interface {
	ListNamespaces(ctx context.Context) ([]*NamespaceInfo, error)
	ListEntries(ctx context.Context, namespace, environment, keyPrefix string) ([]*ConfigEntry, error)
	GetEntry(ctx context.Context, namespace, environment, key string) (*ConfigEntry, error)
	// PutEntry 在单事务内 upsert 配置项(version+1)并追加一条 revision,返回更新后的条目。
	PutEntry(ctx context.Context, in PutParams) (*ConfigEntry, error)
	DeleteEntry(ctx context.Context, namespace, environment, key string) (bool, error)
	ListRevisions(ctx context.Context, namespace, environment, key string) ([]*ConfigRevision, error)
	GetRevision(ctx context.Context, namespace, environment, key string, version int32) (*ConfigRevision, error)
}

// ConfigUseCase 配置中心用例
type ConfigUseCase struct {
	repo ConfigRepo
	log  *zap.Logger
}

func NewConfigUseCase(repo ConfigRepo, logger *zap.Logger) *ConfigUseCase {
	return &ConfigUseCase{repo: repo, log: logger.Named("ConfigUseCase")}
}

func (uc *ConfigUseCase) ListNamespaces(ctx context.Context) ([]*NamespaceInfo, error) {
	return uc.repo.ListNamespaces(ctx)
}

func (uc *ConfigUseCase) ListKeys(ctx context.Context, namespace, environment, keyPrefix string) ([]*ConfigEntry, error) {
	return uc.repo.ListEntries(ctx, namespace, environment, keyPrefix)
}

func (uc *ConfigUseCase) GetKey(ctx context.Context, namespace, environment, key string) (*ConfigEntry, error) {
	return uc.repo.GetEntry(ctx, namespace, environment, key)
}

// PutKey 保存前做服务端语法校验,再写入。
func (uc *ConfigUseCase) PutKey(ctx context.Context, in PutParams) (*ConfigEntry, error) {
	if err := ValidateFormat(in.Format, in.Value); err != nil {
		return nil, err
	}
	return uc.repo.PutEntry(ctx, in)
}

func (uc *ConfigUseCase) DeleteKey(ctx context.Context, namespace, environment, key string) (bool, error) {
	return uc.repo.DeleteEntry(ctx, namespace, environment, key)
}

func (uc *ConfigUseCase) ListRevisions(ctx context.Context, namespace, environment, key string) ([]*ConfigRevision, error) {
	return uc.repo.ListRevisions(ctx, namespace, environment, key)
}

func (uc *ConfigUseCase) GetRevision(ctx context.Context, namespace, environment, key string, version int32) (*ConfigRevision, error) {
	return uc.repo.GetRevision(ctx, namespace, environment, key, version)
}

// Rollback 用指定历史版本的值写为新版本。
func (uc *ConfigUseCase) Rollback(ctx context.Context, namespace, environment, key string, version int32, comment, author string) (*ConfigEntry, error) {
	rev, err := uc.repo.GetRevision(ctx, namespace, environment, key, version)
	if err != nil {
		return nil, err
	}
	if comment == "" {
		comment = fmt.Sprintf("rollback to v%d", version)
	}
	return uc.repo.PutEntry(ctx, PutParams{
		Namespace:   namespace,
		Environment: environment,
		Key:         key,
		Format:      rev.Format,
		Value:       rev.Value,
		Comment:     comment,
		Author:      author,
	})
}

// ValidateFormat 按 format 解析 value,校验语法合法性。plaintext 不校验。
func ValidateFormat(format ConfigFormat, value string) error {
	if value == "" {
		return nil
	}
	var v any
	switch format {
	case FormatYAML:
		if err := yaml.Unmarshal([]byte(value), &v); err != nil {
			return fmt.Errorf("%w: yaml: %v", ErrInvalidFormat, err)
		}
	case FormatTOML:
		if err := toml.Unmarshal([]byte(value), &v); err != nil {
			return fmt.Errorf("%w: toml: %v", ErrInvalidFormat, err)
		}
	case FormatJSON:
		if err := json.Unmarshal([]byte(value), &v); err != nil {
			return fmt.Errorf("%w: json: %v", ErrInvalidFormat, err)
		}
	case FormatPlaintext:
		return nil
	default:
		return fmt.Errorf("%w: unknown format %q", ErrInvalidFormat, format)
	}
	return nil
}
