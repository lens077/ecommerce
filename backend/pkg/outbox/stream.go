package outbox

import (
	"context"
	"time"

	"github.com/nats-io/nats.go/jetstream"
)

// StreamOptions 描述事件流的最小配置面。
// 副本数分级（TODO ③ 定稿）：交易域 R3、埋点/可重建域 R1；搜索索引喂养属于
// 可重建域（outbox 可重放 + Elasticsearch 投影可从 PostgreSQL 全量重建），本地/初期 R1 即可。
type StreamOptions struct {
	Name       string        // 流名，如 ECOMMERCE_EVENTS
	Subjects   []string      // 如 ["events.>"]
	Replicas   int           // 1 或 3
	Duplicates time.Duration // Nats-Msg-Id 去重窗口；默认 10m（仍只是窗口去重，非 exactly-once）
	MaxAge     time.Duration // 事件保留时长；0=不限
}

// EnsureStream 幂等地创建/更新事件流。
func EnsureStream(ctx context.Context, js jetstream.JetStream, o StreamOptions) (jetstream.Stream, error) {
	if o.Replicas <= 0 {
		o.Replicas = 1
	}
	if o.Duplicates <= 0 {
		o.Duplicates = 10 * time.Minute
	}
	return js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:       o.Name,
		Subjects:   o.Subjects,
		Storage:    jetstream.FileStorage,
		Replicas:   o.Replicas,
		Duplicates: o.Duplicates,
		MaxAge:     o.MaxAge,
		Retention:  jetstream.LimitsPolicy,
	})
}
