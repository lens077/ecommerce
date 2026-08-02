package data

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/lens077/ecommerce/backend/pkg/gorse"
	"github.com/lens077/ecommerce/backend/services/product/internal/biz"
	conf "github.com/lens077/ecommerce/backend/services/product/internal/conf/v1"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const (
	// 游标存 Redis 而不是内存:重启后从上次的位置继续,不用把整个目录重扫一遍。
	// 丢了也只是多扫一次全量,所以不值得为它单开一张表。
	syncCursorKey = "product:gorse:item_sync_cursor"

	defaultSyncInterval   = 5 * time.Minute
	defaultSyncBatchSize  = 500
	defaultCursorLookback = time.Second
)

// selectCatalog 取商品及其最低在售价。
//
// 用 LEFT JOIN 而不是 JOIN:一个 SPU 可能暂时没有在售 SKU,
// 它照样得同步给 gorse,否则它身上已有的用户反馈会全部失效。
const selectCatalog = `
SELECT s.spu_code,
       s.name,
       s.category_id,
       s.brand_id,
       s.status = 'online' AS online,
       COALESCE(MIN(k.price) FILTER (WHERE k.status = 'active'), 0)::float8 AS min_price,
       s.updated_at
FROM products.spus s
         LEFT JOIN products.skus k ON k.spu_id = s.id
`

// NewGorseClient 构造 gorse 客户端。关闭时返回 nil,调用方必须判空。
//
// 这里刻意不做探活:gorse 挂了不该拖着商品服务一起起不来,
// 同步循环自己会重试。
func NewGorseClient(cfg *conf.Bootstrap, logger *zap.Logger) *gorse.Client {
	rec := cfg.GetRecommend().GetGorse()
	if rec == nil || !rec.GetEnable() || rec.GetEndpoint() == "" {
		logger.Info("gorse client disabled")
		return nil
	}
	logger.Info("gorse client initialized", zap.String("endpoint", rec.GetEndpoint()))
	return gorse.New(rec.GetEndpoint(), rec.GetApiKey(), rec.GetTimeout().AsDuration())
}

// NewItemSyncConfig 把配置里的同步参数摊平,顺便兜住缺省值。
func NewItemSyncConfig(cfg *conf.Bootstrap) *biz.ItemSyncConfig {
	sync := cfg.GetRecommend().GetItemSync()
	out := &biz.ItemSyncConfig{
		Enable:         sync.GetEnable(),
		Interval:       sync.GetInterval().AsDuration(),
		BatchSize:      int(sync.GetBatchSize()),
		CursorLookback: sync.GetCursorLookback().AsDuration(),
	}
	if out.Interval <= 0 {
		out.Interval = defaultSyncInterval
	}
	if out.BatchSize <= 0 {
		out.BatchSize = defaultSyncBatchSize
	}
	if out.CursorLookback <= 0 {
		out.CursorLookback = defaultCursorLookback
	}
	return out
}

var _ biz.CatalogRepo = (*catalogRepo)(nil)

type catalogRepo struct {
	data *Data
	log  *zap.Logger
}

func NewCatalogRepo(data *Data, logger *zap.Logger) biz.CatalogRepo {
	return &catalogRepo{data: data, log: logger}
}

func (r *catalogRepo) ListUpdatedSince(ctx context.Context, since time.Time, limit int) ([]biz.CatalogItem, error) {
	rows, err := r.data.pgx.Query(ctx,
		selectCatalog+`
WHERE s.updated_at > $1
GROUP BY s.id
ORDER BY s.updated_at
LIMIT $2`,
		since, limit)
	if err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	return r.scan(rows)
}

func (r *catalogRepo) ListByCodes(ctx context.Context, codes []string) ([]biz.CatalogItem, error) {
	if len(codes) == 0 {
		return nil, nil
	}
	rows, err := r.data.pgx.Query(ctx,
		selectCatalog+`
WHERE s.spu_code = ANY($1)
GROUP BY s.id
ORDER BY s.updated_at`,
		codes)
	if err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	return r.scan(rows)
}

func (r *catalogRepo) scan(rows pgx.Rows) ([]biz.CatalogItem, error) {
	defer rows.Close()

	var items []biz.CatalogItem
	for rows.Next() {
		var it biz.CatalogItem
		if err := rows.Scan(
			&it.SpuCode, &it.Name, &it.CategoryID, &it.BrandID,
			&it.Online, &it.MinPrice, &it.UpdatedAt,
		); err != nil {
			return nil, r.data.dbErrHandler.MustHandleError(err)
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	return items, nil
}

var _ biz.ItemSyncRepo = (*itemSyncRepo)(nil)

type itemSyncRepo struct {
	client *gorse.Client
	rdb    *redis.Client
	log    *zap.Logger
}

func NewItemSyncRepo(client *gorse.Client, rdb *redis.Client, logger *zap.Logger) biz.ItemSyncRepo {
	return &itemSyncRepo{client: client, rdb: rdb, log: logger}
}

func (r *itemSyncRepo) Enabled() bool { return r.client != nil }

func (r *itemSyncRepo) UpsertItems(ctx context.Context, items []biz.CatalogItem) error {
	if r.client == nil || len(items) == 0 {
		return nil
	}

	payload := make([]gorse.Item, 0, len(items))
	for _, it := range items {
		payload = append(payload, gorse.Item{
			ItemId:     it.SpuCode,
			IsHidden:   !it.Online,
			Categories: []string{strconv.FormatInt(it.CategoryID, 10)},
			Labels:     labelsOf(it),
			Timestamp:  it.UpdatedAt,
			Comment:    it.Name,
		})
	}

	if _, err := r.client.UpsertItems(ctx, payload); err != nil {
		return fmt.Errorf("upsert gorse items: %w", err)
	}
	return nil
}

func (r *itemSyncRepo) LoadCursor(ctx context.Context) (time.Time, error) {
	raw, err := r.rdb.Get(ctx, syncCursorKey).Result()
	if errors.Is(err, redis.Nil) {
		// 没有游标就是首次运行,从零点开始扫全量
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, fmt.Errorf("load sync cursor: %w", err)
	}
	at, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		// 值坏了当没有,重扫一遍全量总比卡死强
		r.log.Warn("corrupt gorse sync cursor, restarting from scratch",
			zap.String("value", raw), zap.Error(err))
		return time.Time{}, nil
	}
	return at, nil
}

func (r *itemSyncRepo) SaveCursor(ctx context.Context, at time.Time) error {
	// 不设过期:过期就等于悄悄触发一次全量重扫
	if err := r.rdb.Set(ctx, syncCursorKey, at.Format(time.RFC3339Nano), 0).Err(); err != nil {
		return fmt.Errorf("save sync cursor: %w", err)
	}
	return nil
}

// labelsOf 生成 gorse 的物料标签。
// gorse 会拿标签做冷启动召回,所以这里放的是"同类商品共享"的粗粒度特征,
// 放 spu_code 这种唯一值等于没放。
func labelsOf(it biz.CatalogItem) map[string]any {
	labels := map[string]any{
		"brand":    strconv.FormatInt(it.BrandID, 10),
		"category": strconv.FormatInt(it.CategoryID, 10),
	}
	if band := priceBand(it.MinPrice); band != "" {
		labels["price_band"] = band
	}
	return labels
}

func priceBand(price float64) string {
	switch {
	case price <= 0:
		return "" // 没有在售 SKU,价格带无意义
	case price < 100:
		return "0-100"
	case price < 500:
		return "100-500"
	case price < 1000:
		return "500-1000"
	case price < 5000:
		return "1000-5000"
	default:
		return "5000+"
	}
}
