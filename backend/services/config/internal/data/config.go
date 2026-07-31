package data

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lens077/ecommerce/backend/services/config/internal/biz"
	"github.com/lens077/ecommerce/backend/services/config/internal/data/models"
	"go.uber.org/zap"
)

var _ biz.ConfigRepo = (*configRepo)(nil)

type configRepo struct {
	db      *pgxpool.Pool
	queries *models.Queries
	log     *zap.Logger
}

func NewConfigRepo(data *Data, logger *zap.Logger) biz.ConfigRepo {
	return &configRepo{
		db:      data.db,
		queries: models.New(data.db),
		log:     logger.Named("configRepo"),
	}
}

func toEntry(m models.ConfigEntry) *biz.ConfigEntry {
	return &biz.ConfigEntry{
		ID:          m.ID,
		Namespace:   m.Namespace,
		Environment: m.Environment,
		Key:         m.Key,
		Format:      biz.ConfigFormat(m.Format),
		Value:       m.Value,
		Version:     m.Version,
		IsSecret:    m.IsSecret,
		Description: m.Description,
		UpdatedBy:   m.UpdatedBy,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}
}

func toRevision(m models.ConfigRevision) *biz.ConfigRevision {
	return &biz.ConfigRevision{
		ID:        m.ID,
		EntryID:   m.EntryID,
		Version:   m.Version,
		Format:    biz.ConfigFormat(m.Format),
		Value:     m.Value,
		Comment:   m.Comment,
		Author:    m.Author,
		CreatedAt: m.CreatedAt,
	}
}

func (r *configRepo) ListEntries(ctx context.Context, namespace, environment, keyPrefix string) ([]*biz.ConfigEntry, error) {
	prefix := keyPrefix
	rows, err := r.queries.ListEntries(ctx, models.ListEntriesParams{
		Namespace:   namespace,
		Environment: environment,
		KeyPrefix:   &prefix, // 空串 -> LIKE '%' 匹配全部;必须为非 nil 指针
	})
	if err != nil {
		return nil, err
	}
	out := make([]*biz.ConfigEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, &biz.ConfigEntry{
			ID:          row.ID,
			Namespace:   row.Namespace,
			Environment: row.Environment,
			Key:         row.Key,
			Format:      biz.ConfigFormat(row.Format),
			// ListKeys 仅返回元数据,不含 value
			Version:     row.Version,
			IsSecret:    row.IsSecret,
			Description: row.Description,
			UpdatedBy:   row.UpdatedBy,
			CreatedAt:   row.CreatedAt,
			UpdatedAt:   row.UpdatedAt,
		})
	}
	return out, nil
}

func (r *configRepo) GetEntry(ctx context.Context, namespace, environment, key string) (*biz.ConfigEntry, error) {
	m, err := r.queries.GetEntry(ctx, models.GetEntryParams{
		Namespace:   namespace,
		Environment: environment,
		Key:         key,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, biz.ErrKeyNotFound
		}
		return nil, err
	}
	return toEntry(m), nil
}

// PutEntry 在单事务内 upsert 配置项(version+1)并追加一条 revision。
func (r *configRepo) PutEntry(ctx context.Context, in biz.PutParams) (*biz.ConfigEntry, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := models.New(tx)

	existing, err := q.GetEntryForUpdate(ctx, models.GetEntryForUpdateParams{
		Namespace:   in.Namespace,
		Environment: in.Environment,
		Key:         in.Key,
	})

	var saved models.ConfigEntry
	switch {
	case err == nil:
		// 已存在 -> 版本自增并更新
		newVersion := existing.Version + 1
		saved, err = q.UpdateEntry(ctx, models.UpdateEntryParams{
			ID:          existing.ID,
			Value:       in.Value,
			Format:      string(in.Format),
			Version:     newVersion,
			IsSecret:    in.IsSecret,
			Description: in.Description,
			UpdatedBy:   in.Author,
		})
		if err != nil {
			return nil, fmt.Errorf("update entry: %w", err)
		}
	case errors.Is(err, pgx.ErrNoRows):
		// 不存在 -> 新建(version=1)
		saved, err = q.InsertEntry(ctx, models.InsertEntryParams{
			Namespace:   in.Namespace,
			Environment: in.Environment,
			Key:         in.Key,
			Format:      string(in.Format),
			Value:       in.Value,
			IsSecret:    in.IsSecret,
			Description: in.Description,
			UpdatedBy:   in.Author,
		})
		if err != nil {
			return nil, fmt.Errorf("insert entry: %w", err)
		}
	default:
		return nil, fmt.Errorf("lock entry: %w", err)
	}

	// 追加历史版本
	if _, err = q.InsertRevision(ctx, models.InsertRevisionParams{
		EntryID: saved.ID,
		Version: saved.Version,
		Format:  saved.Format,
		Value:   saved.Value,
		Comment: in.Comment,
		Author:  in.Author,
	}); err != nil {
		return nil, fmt.Errorf("insert revision: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return toEntry(saved), nil
}

func (r *configRepo) DeleteEntry(ctx context.Context, namespace, environment, key string) (bool, error) {
	n, err := r.queries.DeleteEntry(ctx, models.DeleteEntryParams{
		Namespace:   namespace,
		Environment: environment,
		Key:         key,
	})
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *configRepo) ListRevisions(ctx context.Context, namespace, environment, key string) ([]*biz.ConfigRevision, error) {
	entry, err := r.GetEntry(ctx, namespace, environment, key)
	if err != nil {
		return nil, err
	}
	rows, err := r.queries.ListRevisions(ctx, entry.ID)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.ConfigRevision, 0, len(rows))
	for _, m := range rows {
		out = append(out, toRevision(m))
	}
	return out, nil
}

func (r *configRepo) GetRevision(ctx context.Context, namespace, environment, key string, version int32) (*biz.ConfigRevision, error) {
	entry, err := r.GetEntry(ctx, namespace, environment, key)
	if err != nil {
		return nil, err
	}
	m, err := r.queries.GetRevisionByVersion(ctx, models.GetRevisionByVersionParams{
		EntryID: entry.ID,
		Version: version,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, biz.ErrRevisionNotFound
		}
		return nil, err
	}
	return toRevision(m), nil
}
