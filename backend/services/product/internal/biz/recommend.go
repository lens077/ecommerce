package biz

import (
	"context"
	"time"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

// CatalogItem 是同步给 gorse 的商品快照,只保留召回需要的字段。
type CatalogItem struct {
	SpuCode    string
	Name       string
	CategoryID int64
	BrandID    int64
	// Online 为 false 时在 gorse 里标成 IsHidden 而不是删除,
	// 删除会连带作废这个商品上已经积累的全部反馈,重新上架就得从零开始学。
	Online bool
	// MinPrice 是该 SPU 下在售 SKU 的最低价,用来打价格带标签。没有在售 SKU 时为 0。
	MinPrice  float64
	UpdatedAt time.Time
}

// CatalogRepo 读商品目录。
type CatalogRepo interface {
	// ListUpdatedSince 按 updated_at 升序取 since 之后变更的商品。
	// 包含已下架和已删除的,gorse 需要知道它们不再可推。
	ListUpdatedSince(ctx context.Context, since time.Time, limit int) ([]CatalogItem, error)
	// ListByCodes 按 spu_code 精确取,供写路径即时同步。
	ListByCodes(ctx context.Context, codes []string) ([]CatalogItem, error)
}

// ItemSyncRepo 写 gorse 侧的物料,以及记住扫到哪了。
type ItemSyncRepo interface {
	// Enabled 为 false 时所有写操作都是空转。
	Enabled() bool
	UpsertItems(ctx context.Context, items []CatalogItem) error
	// LoadCursor 返回上次扫到的 updated_at。首次运行返回零值,即全量。
	LoadCursor(ctx context.Context) (time.Time, error)
	SaveCursor(ctx context.Context, at time.Time) error
}

// ItemSyncUseCase 把商品目录持续对账到 gorse。
//
// 之所以是轮询对账而不是写路径钩子:商品服务当前没有 SPU 的写入 RPC,
// 没有地方能挂钩子。而且即使有,单靠写路径也补不回 gorse 重装、
// 网络抖动、投喂失败造成的缺口 —— 缺一个 item,它身上所有的用户反馈都会被 gorse 丢弃。
type ItemSyncUseCase struct {
	catalog CatalogRepo
	sink    ItemSyncRepo
	cfg     *ItemSyncConfig
	log     *zap.Logger
}

type ItemSyncConfig struct {
	Enable         bool
	Interval       time.Duration
	BatchSize      int
	CursorLookback time.Duration
}

func NewItemSyncUseCase(
	lc fx.Lifecycle,
	catalog CatalogRepo,
	sink ItemSyncRepo,
	cfg *ItemSyncConfig,
	logger *zap.Logger,
) *ItemSyncUseCase {
	uc := &ItemSyncUseCase{
		catalog: catalog,
		sink:    sink,
		cfg:     cfg,
		log:     logger,
	}

	if !cfg.Enable || !sink.Enabled() {
		logger.Info("gorse item sync disabled")
		return uc
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			// 不在 OnStart 里做首轮同步:全量扫描可能有几万行,
			// 卡住启动会让 Consul 健康检查在服务能干活之前就判失败。
			go uc.loop(ctx, done)
			return nil
		},
		OnStop: func(stopCtx context.Context) error {
			cancel()
			select {
			case <-done:
			case <-stopCtx.Done():
				logger.Warn("gorse item sync did not stop in time")
			}
			return nil
		},
	})

	return uc
}

// SyncByCodes 立即把指定商品同步给 gorse。
// 留给将来的 SPU 写入路径直接调用,让新品不必等到下一轮轮询才可推。
func (uc *ItemSyncUseCase) SyncByCodes(ctx context.Context, codes []string) error {
	if !uc.sink.Enabled() || len(codes) == 0 {
		return nil
	}
	items, err := uc.catalog.ListByCodes(ctx, codes)
	if err != nil {
		return err
	}
	return uc.sink.UpsertItems(ctx, items)
}

func (uc *ItemSyncUseCase) loop(ctx context.Context, done chan<- struct{}) {
	defer close(done)

	ticker := time.NewTicker(uc.cfg.Interval)
	defer ticker.Stop()

	for {
		// 一轮扫满一批说明还有积压,不等下一个 tick 直接继续,
		// 否则积压 N 批就要拖 N 个 interval 才追得上。
		for {
			drained, err := uc.syncOnce(ctx)
			if err != nil {
				uc.log.Warn("gorse item sync round failed", zap.Error(err))
				break
			}
			if drained || ctx.Err() != nil {
				break
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// syncOnce 扫一批并推进游标,返回是否已经追平。
func (uc *ItemSyncUseCase) syncOnce(ctx context.Context) (drained bool, err error) {
	cursor, err := uc.sink.LoadCursor(ctx)
	if err != nil {
		return false, err
	}

	// 游标回拨:updated_at 相同的行可能被批次边界切开,回拨一点重扫。
	// upsert 是幂等的,重复同步的代价远小于漏掉一个商品。
	if !cursor.IsZero() && uc.cfg.CursorLookback > 0 {
		cursor = cursor.Add(-uc.cfg.CursorLookback)
	}

	items, err := uc.catalog.ListUpdatedSince(ctx, cursor, uc.cfg.BatchSize)
	if err != nil {
		return false, err
	}
	if len(items) == 0 {
		return true, nil
	}

	if err := uc.sink.UpsertItems(ctx, items); err != nil {
		// 不推进游标,下一轮从同一个位置重来
		return false, err
	}

	// items 按 updated_at 升序,最后一条就是新游标
	newest := items[len(items)-1].UpdatedAt
	if err := uc.sink.SaveCursor(ctx, newest); err != nil {
		// 游标存不下只影响下次的起点,这批已经同步成功了,不算失败
		uc.log.Warn("failed to persist gorse sync cursor", zap.Error(err))
	}

	uc.log.Info("gorse item sync batch done",
		zap.Int("count", len(items)),
		zap.Time("cursor", newest),
	)

	return len(items) < uc.cfg.BatchSize, nil
}
