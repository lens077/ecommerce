package biz

import (
	"context"
	"time"
)

// EventType 是落库和投喂 gorse 时用的事件名。
// 这些字符串必须和 gorse config.toml [recommend.data_source] 里的
// positive_feedback_types / read_feedback_types 逐字一致,否则 gorse 会静默忽略这些反馈。
type EventType string

const (
	EventImpression EventType = "impression"
	EventRead       EventType = "read"
	EventDwell      EventType = "dwell"
	EventCart       EventType = "cart"
	EventFavorite   EventType = "favorite"
	EventPurchase   EventType = "purchase"
	EventDislike    EventType = "dislike"
)

// FeedsGorse 报告该事件是否应该投喂 gorse。
//
// dislike 不投:当前 gorse 版本的 config.toml 里没有 negative_feedback_types,
// 一个既不在 positive 也不在 read 列表里的类型投进去只会白占存储,不会变成负信号。
// 所以它只落 behaviors.events,由我们自己在读取侧把命中的商品剔掉。
func (t EventType) FeedsGorse() bool {
	return t != "" && t != EventDislike
}

// Accumulates 报告写 gorse 时该用 POST(Value 累加)还是 PUT(Value 覆盖)。
//
// 只有曝光/点击这类"计次"语义需要累加 —— config.toml 用 "read>=3" 把点满三次的商品
// 提升为正样本,不累加就永远够不到阈值。
// dwell 是绝对秒数、cart/favorite/purchase 是布尔事实,累加都会得出错误的量纲。
func (t EventType) Accumulates() bool {
	return t == EventRead || t == EventImpression
}

// Positive 报告该事件是否属于强信号。仅用于本地判断(比如挑会话推荐的种子),
// gorse 那边的正样本判定以 config.toml 为准。
func (t EventType) Positive() bool {
	switch t {
	case EventCart, EventFavorite, EventPurchase:
		return true
	default:
		return false
	}
}

// Event 是一条已规整过的行为事件。
type Event struct {
	// 落库后由 EventRepo.Save 回填,补偿投递靠它定位行
	ID int64
	// 登录用户为 casdoor user id,未登录为 "anon:<前端 id>"
	UserID     string
	Anonymous  bool
	SessionID  string
	Type       EventType
	ItemID     string
	Value      float64
	Source     string
	OccurredAt time.Time
}

// ScoredItem 是一条召回结果。
type ScoredItem struct {
	ItemID string
	Score  float64
}

// EventRepo 是行为事件的本地存储。Postgres 存事实,Redis 只用来做曝光去重。
type EventRepo interface {
	// Save 批量落库,并把自增主键回填进 events[i].ID
	Save(ctx context.Context, events []Event) error
	// MarkSynced 标记这些事件已成功投喂 gorse
	MarkSynced(ctx context.Context, events []Event) error
	// PendingSync 捞出投喂失败、等待补偿重投的事件
	PendingSync(ctx context.Context, limit int) ([]Event, error)
	// FilterFreshImpressions 在 ttl 窗口内按 (session_id, item_id) 去重,
	// 只返回窗口内首次出现的曝光;非曝光事件原样返回。
	FilterFreshImpressions(ctx context.Context, events []Event, ttl time.Duration) ([]Event, error)
	// DislikedItems 返回用户标记过"不感兴趣"的商品集合
	DislikedItems(ctx context.Context, userID string) (map[string]struct{}, error)
}

// RecommendRepo 是 gorse 侧的读写。
type RecommendRepo interface {
	// Enabled 报告 gorse 投喂/召回是否开启。关掉时主链路照常落库。
	Enabled() bool
	// PushFeedback 批量投喂反馈,内部按累加/覆盖语义拆成 POST 与 PUT 两批
	PushFeedback(ctx context.Context, events []Event) error
	// Recommend 个性化召回
	Recommend(ctx context.Context, userID, category string, n, offset int) ([]ScoredItem, error)
	// SessionRecommend 用本次会话的临时反馈换推荐,不落 gorse 的库,不等离线训练
	SessionRecommend(ctx context.Context, events []Event, n int) ([]ScoredItem, error)
	// Neighbors 相似商品召回,不依赖用户画像
	Neighbors(ctx context.Context, itemID, category string, n int) ([]ScoredItem, error)
	// Latest 最新商品,完全没有信号时的兜底
	Latest(ctx context.Context, userID, category string, n, offset int) ([]ScoredItem, error)
	// Healthz 探活
	Healthz(ctx context.Context) error
}
