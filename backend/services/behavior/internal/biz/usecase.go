package biz

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	confv1 "github.com/lens077/ecommerce/backend/services/behavior/internal/conf/v1"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// 召回结果要先剔掉 dislike 再截断,所以向 gorse 多要一些,免得过滤完不够数。
const recallOverFetch = 20

// TrackInput 是一次上报请求。UserID 已由 service 层解析完毕(登录态优先于 anon_id)。
type TrackInput struct {
	UserID    string
	Anonymous bool
	SessionID string
	Events    []Event
}

// RecommendInput 是一次推荐请求。
type RecommendInput struct {
	UserID    string
	Anonymous bool
	Category  string
	N         int
	Offset    int
	// 会话内的临时行为。匿名用户"漫无目的地逛"时,这是唯一的即时信号。
	SessionEvents []Event
}

// RecommendOutput 带上实际命中的策略,方便前端和排查时区分结果来源。
type RecommendOutput struct {
	Items []ScoredItem
	// personalized / session / latest / empty
	Strategy string
}

// BehaviorUseCase 把高频的行为上报和低频的推荐读取放在一起。
//
// 上报走异步:Track 只把事件塞进内存队列就返回,由后台 worker 攒批落库再投喂 gorse。
// 队列写满时直接丢事件并计数 —— 行为埋点是尽力而为的旁路,绝不能因为它拖慢或拖垮页面。
type BehaviorUseCase struct {
	events EventRepo
	rec    RecommendRepo
	cfg    *confv1.Recommend_Ingest
	log    *zap.Logger

	queue   chan Event
	dropped atomic.Uint64

	stop     chan struct{}
	stopOnce sync.Once
	done     sync.WaitGroup
}

func NewBehaviorUseCase(
	lc fx.Lifecycle,
	cfg *confv1.Bootstrap,
	events EventRepo,
	rec RecommendRepo,
	logger *zap.Logger,
) *BehaviorUseCase {
	ingest := cfg.Recommend.GetIngest()
	if ingest == nil {
		ingest = &confv1.Recommend_Ingest{}
	}

	uc := &BehaviorUseCase{
		events: events,
		rec:    rec,
		cfg:    ingest,
		log:    logger,
		queue:  make(chan Event, orDefaultUint(ingest.QueueSize, 10000)),
		stop:   make(chan struct{}),
	}

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			uc.done.Add(1)
			go uc.runFlusher()
			if interval := ingest.GetRetryInterval().AsDuration(); interval > 0 {
				uc.done.Add(1)
				go uc.runRetry(interval)
			}
			return nil
		},
		OnStop: func(ctx context.Context) error {
			// 先关 stop 让 worker 把队列里剩下的事件冲完,再等它退出。
			// 队列里的事件此时还没落库,直接退进程就丢了。
			uc.stopOnce.Do(func() { close(uc.stop) })
			finished := make(chan struct{})
			go func() {
				uc.done.Wait()
				close(finished)
			}()
			select {
			case <-finished:
				return nil
			case <-ctx.Done():
				logger.Warn("behavior flusher did not drain before shutdown deadline",
					zap.Int("queued", len(uc.queue)))
				return nil
			}
		},
	})

	return uc
}

// Track 把事件塞进队列,返回收下和丢弃的条数。永远不会阻塞。
func (uc *BehaviorUseCase) Track(_ context.Context, in TrackInput) (accepted, dropped int) {
	now := time.Now()
	skew := orDefaultDuration(uc.cfg.GetMaxClockSkew().AsDuration(), 5*time.Minute)

	for _, e := range in.Events {
		e.UserID = in.UserID
		e.Anonymous = in.Anonymous
		e.SessionID = in.SessionID
		e.OccurredAt = correctTimestamp(e.OccurredAt, now, skew)
		if e.Value <= 0 {
			e.Value = 1
		}

		select {
		case uc.queue <- e:
			accepted++
		default:
			dropped++
		}
	}

	if dropped > 0 {
		total := uc.dropped.Add(uint64(dropped))
		uc.log.Warn("behavior queue full, events dropped",
			zap.Int("dropped", dropped), zap.Uint64("total_dropped", total))
	}
	return accepted, dropped
}

// Recommend 取推荐列表。
//
// 登录用户优先走 gorse 的个性化召回(有历史画像),匿名用户优先走会话召回
// (刚点开站点,画像还没训练出来,只有本次会话的几条行为可用)。两条路都没结果时兜底最新商品。
func (uc *BehaviorUseCase) Recommend(ctx context.Context, in RecommendInput) (RecommendOutput, error) {
	n := in.N
	if n <= 0 {
		n = 10
	}
	if !uc.rec.Enabled() {
		return RecommendOutput{Strategy: "empty"}, nil
	}

	fetch := n + recallOverFetch
	type attempt struct {
		name string
		run  func() ([]ScoredItem, error)
	}

	personalized := attempt{"personalized", func() ([]ScoredItem, error) {
		return uc.rec.Recommend(ctx, in.UserID, in.Category, fetch, in.Offset)
	}}
	session := attempt{"session", func() ([]ScoredItem, error) {
		if len(in.SessionEvents) == 0 {
			return nil, nil
		}
		return uc.rec.SessionRecommend(ctx, uc.stampSession(in), fetch)
	}}

	attempts := []attempt{personalized, session}
	if in.Anonymous {
		attempts = []attempt{session, personalized}
	}
	attempts = append(attempts, attempt{"latest", func() ([]ScoredItem, error) {
		return uc.rec.Latest(ctx, in.UserID, in.Category, fetch, in.Offset)
	}})

	for _, a := range attempts {
		items, err := a.run()
		if err != nil {
			// 单条召回路径失败不该让整个请求失败,降级到下一条
			uc.log.Warn("recall failed, falling back",
				zap.String("strategy", a.name), zap.Error(err))
			continue
		}
		items = uc.excludeDisliked(ctx, in.UserID, items)
		if len(items) == 0 {
			continue
		}
		return RecommendOutput{Items: truncate(items, n), Strategy: a.name}, nil
	}

	return RecommendOutput{Strategy: "empty"}, nil
}

// SimilarItems 取相似商品。不依赖用户画像,冷启动和未登录都能用。
func (uc *BehaviorUseCase) SimilarItems(ctx context.Context, userID, itemID, category string, n int) ([]ScoredItem, error) {
	if n <= 0 {
		n = 10
	}
	if !uc.rec.Enabled() {
		return nil, nil
	}
	items, err := uc.rec.Neighbors(ctx, itemID, category, n+recallOverFetch)
	if err != nil {
		return nil, err
	}
	items = uc.excludeDisliked(ctx, userID, items)
	return truncate(items, n), nil
}

// stampSession 把会话事件补齐成 gorse 能吃的形状。
// 会话推荐只是拿这些反馈当查询条件,不会写进 gorse 的库,所以时间戳给个当前值即可。
func (uc *BehaviorUseCase) stampSession(in RecommendInput) []Event {
	now := time.Now()
	out := make([]Event, 0, len(in.SessionEvents))
	for _, e := range in.SessionEvents {
		if !e.Type.FeedsGorse() {
			continue
		}
		e.UserID = in.UserID
		if e.OccurredAt.IsZero() {
			e.OccurredAt = now
		}
		if e.Value <= 0 {
			e.Value = 1
		}
		out = append(out, e)
	}
	return out
}

// excludeDisliked 剔掉用户明确标记过不感兴趣的商品。
// 这一步在我们这边做,因为 gorse 这个版本没有 negative_feedback_types,它不知道什么叫"不喜欢"。
func (uc *BehaviorUseCase) excludeDisliked(ctx context.Context, userID string, items []ScoredItem) []ScoredItem {
	if userID == "" || len(items) == 0 {
		return items
	}
	disliked, err := uc.events.DislikedItems(ctx, userID)
	if err != nil {
		// 过滤失败就原样返回,给用户看到几个不想看的商品,好过整个推荐位空掉
		uc.log.Warn("load disliked items failed", zap.String("user_id", userID), zap.Error(err))
		return items
	}
	if len(disliked) == 0 {
		return items
	}
	out := items[:0]
	for _, it := range items {
		if _, hit := disliked[it.ItemID]; !hit {
			out = append(out, it)
		}
	}
	return out
}

// runFlusher 攒批:攒够 batch_size 或到了 flush_interval 就冲一次。
func (uc *BehaviorUseCase) runFlusher() {
	defer uc.done.Done()

	batchSize := int(orDefaultUint(uc.cfg.BatchSize, 200))
	interval := orDefaultDuration(uc.cfg.GetFlushInterval().AsDuration(), 2*time.Second)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	batch := make([]Event, 0, batchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		uc.flush(batch)
		batch = make([]Event, 0, batchSize)
	}

	for {
		select {
		case e := <-uc.queue:
			batch = append(batch, e)
			if len(batch) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-uc.stop:
			// 收尾:把队列里积压的都冲掉再退
			for {
				select {
				case e := <-uc.queue:
					batch = append(batch, e)
					if len(batch) >= batchSize {
						flush()
					}
				default:
					flush()
					return
				}
			}
		}
	}
}

// runRetry 补偿投递:重扫 synced_at IS NULL 的事件,重新投喂 gorse。
// gorse 抖一下、重启、网络断一会儿都会走到这里。
func (uc *BehaviorUseCase) runRetry(interval time.Duration) {
	defer uc.done.Done()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	limit := int(orDefaultUint(uc.cfg.RetryBatchSize, 500))
	for {
		select {
		case <-ticker.C:
			uc.retryOnce(limit)
		case <-uc.stop:
			return
		}
	}
}

func (uc *BehaviorUseCase) retryOnce(limit int) {
	if !uc.rec.Enabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pending, err := uc.events.PendingSync(ctx, limit)
	if err != nil {
		uc.log.Error("scan pending behavior events failed", zap.Error(err))
		return
	}
	if len(pending) == 0 {
		return
	}
	if uc.push(ctx, pending) {
		uc.log.Info("replayed behavior events to gorse", zap.Int("count", len(pending)))
	}
}

func (uc *BehaviorUseCase) flush(batch []Event) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	dedupTTL := orDefaultDuration(uc.cfg.GetImpressionDedupTtl().AsDuration(), 30*time.Minute)
	fresh, err := uc.events.FilterFreshImpressions(ctx, batch, dedupTTL)
	if err != nil {
		// 去重是优化不是正确性要求,Redis 挂了就全量落库
		uc.log.Warn("impression dedup failed, keeping all events", zap.Error(err))
		fresh = batch
	}
	if len(fresh) == 0 {
		return
	}

	if err := uc.events.Save(ctx, fresh); err != nil {
		// 落库失败就整批丢:gorse 的数据必须能从 Postgres 重放,反过来不成立。
		// 先投 gorse 再落库会让两边永久对不上。
		uc.log.Error("save behavior events failed",
			zap.Int("count", len(fresh)), zap.Error(err))
		return
	}
	uc.push(ctx, fresh)
}

// push 投喂 gorse 并回写 synced_at。失败时不返回错误 —— 事件已经落库,
// synced_at 留空就够补偿任务把它捞回来重投。
func (uc *BehaviorUseCase) push(ctx context.Context, batch []Event) bool {
	if !uc.rec.Enabled() {
		return false
	}

	feed := make([]Event, 0, len(batch))
	for _, e := range batch {
		if e.Type.FeedsGorse() {
			feed = append(feed, e)
		}
	}
	if len(feed) == 0 {
		return false
	}

	if err := uc.rec.PushFeedback(ctx, feed); err != nil {
		uc.log.Warn("push feedback to gorse failed, left for retry",
			zap.Int("count", len(feed)), zap.Error(err))
		return false
	}
	if err := uc.events.MarkSynced(ctx, feed); err != nil {
		// 标记失败最多导致下一轮重投。gorse 的 feedback 主键是
		// (FeedbackType, UserId, ItemId) 三元组,重投只会覆盖同一行,不会写重。
		uc.log.Warn("mark behavior events synced failed", zap.Error(err))
	}
	return true
}

// Dropped 返回进程启动至今因队列写满而丢弃的事件数,给健康检查和监控用。
func (uc *BehaviorUseCase) Dropped() uint64 { return uc.dropped.Load() }

// correctTimestamp 用服务端时钟给客户端时间戳纠偏。
// 前端时钟不可信(用户改过系统时间、设备时区错乱都很常见),不纠正会污染
// gorse 的 positive_feedback_ttl 淘汰逻辑 —— 一条时间戳在未来的反馈会永远不过期。
func correctTimestamp(ts, now time.Time, maxSkew time.Duration) time.Time {
	if ts.IsZero() {
		return now
	}
	if d := ts.Sub(now); d > maxSkew || d < -maxSkew {
		return now
	}
	return ts
}

func truncate(items []ScoredItem, n int) []ScoredItem {
	if len(items) > n {
		return items[:n]
	}
	return items
}

func orDefaultUint(v uint32, fallback uint32) uint32 {
	if v == 0 {
		return fallback
	}
	return v
}

func orDefaultDuration(v, fallback time.Duration) time.Duration {
	if v <= 0 {
		return fallback
	}
	return v
}
