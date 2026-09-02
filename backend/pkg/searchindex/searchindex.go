// Package searchindex maintains the curated product projection in Elasticsearch.
//
// The document schema preserves three settled invariants:
//   - id is the top-level numeric SPU primary key;
//   - price is the minimum active-SKU price projection. PostgreSQL DECIMAL remains
//     the money source of truth; the indexed value is only for display and sorting;
//   - sale_count is the top-level numeric products.spu_total_sales projection.
//
// Upserts overwrite a stable Elasticsearch document ID and deletes use the same
// ID, so any redelivery on the transport layer stays idempotent. The JetStream
// consumer that once lived here was retired in 2026-09; the projection transport
// is now Debezium → Kafka → Elasticsearch Sink (docs/design/search/search.md).
package searchindex

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Doc is one curated product search document. Its JSON field names are the
// projection contract; changing them requires an index schema migration.
type Doc struct {
	ID           int64   `json:"id"`             // SPU primary key
	SpuCode      string  `json:"spu_code"`       // business code
	Name         string  `json:"name"`           // primary search field
	Description  string  `json:"description"`    // IK-analyzed product description
	Status       string  `json:"status"`         // draft/online/offline/deleted
	MainMediaURL string  `json:"main_media_url"` // primary image
	MerchantID   string  `json:"merchant_id"`    // merchant filter
	Price        float64 `json:"price"`          // display/sort projection only
	SaleCount    int64   `json:"sale_count"`     // total sales projection
	UpdatedAt    string  `json:"updated_at"`     // RFC3339 freshness/sort fallback
}

// reindexSQL derives the curated projection from PostgreSQL. Deleted rows are
// retained in the result so the post-swap watermark replay can apply tombstones.
const reindexSQL = `
SELECT s.id,
       s.spu_code,
       s.name,
       s.description,
       s.status::text,
       s.main_media_url,
       s.merchant_id::text,
       COALESCE((SELECT MIN(k.price)::float8 FROM products.skus k WHERE k.spu_id = s.id AND k.status = 'active'), 0) AS price,
       COALESCE((SELECT v.total_sales FROM products.spu_total_sales v WHERE v.spu_id = s.id), 0)::bigint             AS sale_count,
       to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')                                        AS updated_at
FROM products.spus s
WHERE s.updated_at >= $1
ORDER BY s.id`

func scanDocs(ctx context.Context, pool *pgxpool.Pool, since time.Time) (upserts []Doc, deletes []int64, err error) {
	rows, err := pool.Query(ctx, reindexSQL, since)
	if err != nil {
		return nil, nil, fmt.Errorf("searchindex: 聚合查询失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var doc Doc
		if err := rows.Scan(&doc.ID, &doc.SpuCode, &doc.Name, &doc.Description, &doc.Status, &doc.MainMediaURL, &doc.MerchantID, &doc.Price, &doc.SaleCount, &doc.UpdatedAt); err != nil {
			return nil, nil, err
		}
		if doc.Status == "deleted" {
			deletes = append(deletes, doc.ID)
			continue
		}
		upserts = append(upserts, doc)
	}
	return upserts, deletes, rows.Err()
}

const (
	reindexLockSQL      = `SELECT pg_try_advisory_lock(hashtextextended($1, 0))`
	reindexUnlockSQL    = `SELECT pg_advisory_unlock(hashtextextended($1, 0))`
	reindexWatermarkSQL = `SELECT clock_timestamp() - interval '5 seconds'`
)

type queryRowFunc func(context.Context, string, ...any) pgx.Row

func databaseWatermark(ctx context.Context, queryRow queryRowFunc) (time.Time, error) {
	var watermark time.Time
	if err := queryRow(ctx, reindexWatermarkSQL).Scan(&watermark); err != nil {
		return time.Time{}, fmt.Errorf("searchindex: 读取数据库水位失败: %w", err)
	}
	return watermark, nil
}

func acquireReindexLock(ctx context.Context, pool *pgxpool.Pool, index string, logger *slog.Logger) (func(), error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("searchindex: 获取重建锁连接失败: %w", err)
	}
	lockName := "searchindex/reindex/" + index
	var locked bool
	if err := conn.QueryRow(ctx, reindexLockSQL, lockName).Scan(&locked); err != nil {
		conn.Release()
		return nil, fmt.Errorf("searchindex: 获取重建锁失败: %w", err)
	}
	if !locked {
		conn.Release()
		return nil, fmt.Errorf("searchindex: 索引 %s 已有重建任务运行", index)
	}

	return func() {
		defer conn.Release()
		unlockCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var unlocked bool
		if err := conn.QueryRow(unlockCtx, reindexUnlockSQL, lockName).Scan(&unlocked); err != nil || !unlocked {
			logger.Error("释放重建锁失败", "index", index, "unlocked", unlocked, "err", err)
		}
	}, nil
}

// Reindex rebuilds a physical index, atomically moves the stable alias, deletes
// the old index, then replays rows changed since the pre-scan PostgreSQL
// watermark. The replay closes the snapshot-to-alias-swap race without moving a
// broker cursor backward.
func Reindex(ctx context.Context, pool *pgxpool.Pool, catalog *Client, index string, logger *slog.Logger) error {
	if catalog == nil {
		return errors.New("searchindex: catalog client is required")
	}
	if logger == nil {
		logger = slog.Default()
	}
	unlock, err := acquireReindexLock(ctx, pool, index, logger)
	if err != nil {
		return err
	}
	defer unlock()
	if err := catalog.EnsureIndex(ctx, index); err != nil {
		return err
	}

	watermark, err := databaseWatermark(ctx, pool.QueryRow)
	if err != nil {
		return err
	}
	docs, _, err := scanDocs(ctx, pool, time.Time{})
	if err != nil {
		return err
	}

	tmp := physicalIndexName(index, "-rebuild-"+time.Now().UTC().Format("20060102t150405000000000"))
	if err := validateIndexName(tmp); err != nil {
		return fmt.Errorf("searchindex: build physical index name: %w", err)
	}
	logger.Info("全量重建开始", "docs", len(docs), "physical_index", tmp)
	if err := catalog.createIndex(ctx, tmp, ""); err != nil {
		return err
	}
	activated := false
	defer func() {
		if activated {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.Background(), defaultRequestTimeout)
		defer cancel()
		backing, probeErr := catalog.aliasIndices(cleanupCtx, index)
		if probeErr != nil {
			// A lost alias-update response is ambiguous. Preserve a possible active
			// index rather than deleting the live projection during error cleanup.
			logger.Error("无法确认重建索引是否已激活，保留索引供人工检查", "index", tmp, "err", probeErr)
			return
		}
		for _, current := range backing {
			if current == tmp {
				logger.Error("别名已指向重建索引，跳过错误清理", "alias", index, "index", tmp)
				return
			}
		}
		if cleanupErr := catalog.deleteIndex(cleanupCtx, tmp, true); cleanupErr != nil {
			logger.Error("清理失败的重建索引", "index", tmp, "err", cleanupErr)
		}
	}()

	if err := catalog.bulkIndex(ctx, tmp, docs, false); err != nil {
		return err
	}
	if err := catalog.refreshIndex(ctx, tmp); err != nil {
		return err
	}
	previous, err := catalog.swapAlias(ctx, index, tmp)
	if err != nil {
		return err
	}
	activated = true

	deltaUpserts, deltaDeletes, err := scanDocs(ctx, pool, watermark)
	if err != nil {
		return fmt.Errorf("searchindex: 水位补偿查询失败: %w", err)
	}
	if err := catalog.bulkIndex(ctx, index, deltaUpserts, true); err != nil {
		return fmt.Errorf("searchindex: 水位补偿批量写入失败: %w", err)
	}
	for _, id := range deltaDeletes {
		if err := catalog.DeleteDocument(ctx, index, id); err != nil {
			return fmt.Errorf("searchindex: 水位补偿删除 %d 失败: %w", id, err)
		}
	}
	if err := catalog.refreshIndex(ctx, index); err != nil {
		return err
	}
	// Keep the prior backing indices until the watermark delta is visible. If
	// compensation fails, operators can still inspect or restore the old index.
	for _, old := range previous {
		if old == tmp {
			continue
		}
		if err := catalog.deleteIndex(ctx, old, true); err != nil {
			return fmt.Errorf("searchindex: delete previous index %s: %w", old, err)
		}
	}
	logger.Info("全量重建完成（alias 原子切换 + 水位补偿）",
		"alias", index,
		"physical_index", tmp,
		"docs", len(docs),
		"delta_upserts", len(deltaUpserts),
		"delta_deletes", len(deltaDeletes),
	)
	return nil
}
