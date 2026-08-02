package data

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/lens077/ecommerce/backend/services/behavior/internal/biz"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// 曝光去重的 Redis key 前缀
const impressionKeyPrefix = "behavior:imp:"

type eventRepo struct {
	data *Data
	log  *zap.Logger
}

var _ biz.EventRepo = (*eventRepo)(nil)

func NewEventRepo(data *Data, logger *zap.Logger) biz.EventRepo {
	return &eventRepo{data: data, log: logger}
}

// Save 批量落库,并把自增主键按顺序回填进 events[i].ID。
//
// 用一条多行 INSERT ... RETURNING id 而不是 CopyFrom:CopyFrom 快但拿不到主键,
// 而补偿投递需要主键来定位行。批次大小由 ingest.batch_size 控制(默认 200),
// 这个量级下多行 INSERT 的开销可以忽略。
func (r *eventRepo) Save(ctx context.Context, events []biz.Event) error {
	if len(events) == 0 {
		return nil
	}

	var sb strings.Builder
	sb.WriteString(`INSERT INTO behaviors.events
		(user_id, anonymous, session_id, event_type, item_id, value, source, occurred_at)
		VALUES `)

	args := make([]any, 0, len(events)*8)
	for i, e := range events {
		if i > 0 {
			sb.WriteByte(',')
		}
		base := i * 8
		fmt.Fprintf(&sb, "($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8)
		args = append(args,
			e.UserID, e.Anonymous, e.SessionID, string(e.Type),
			e.ItemID, e.Value, e.Source, e.OccurredAt)
	}
	sb.WriteString(" RETURNING id")

	rows, err := r.data.db.Query(ctx, sb.String(), args...)
	if err != nil {
		return r.data.dbErrHandler.MustHandleError(err)
	}
	defer rows.Close()

	// 单条 INSERT ... VALUES 的 RETURNING 按 VALUES 列表顺序返回,可以直接按下标回填
	i := 0
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return r.data.dbErrHandler.MustHandleError(err)
		}
		if i < len(events) {
			events[i].ID = id
		}
		i++
	}
	return r.data.dbErrHandler.MustHandleError(rows.Err())
}

// MarkSynced 标记这批事件已投喂 gorse 成功。
func (r *eventRepo) MarkSynced(ctx context.Context, events []biz.Event) error {
	ids := make([]int64, 0, len(events))
	for _, e := range events {
		if e.ID > 0 {
			ids = append(ids, e.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}

	_, err := r.data.db.Exec(ctx,
		`UPDATE behaviors.events SET synced_at = now() WHERE id = ANY($1)`, ids)
	return r.data.dbErrHandler.MustHandleError(err)
}

// PendingSync 捞出待补投的事件。
// dislike 从不投喂 gorse,它的 synced_at 永远是 NULL,所以必须在这里排除掉,
// 否则补偿任务会把同一批 dislike 反复捞出来空转。
func (r *eventRepo) PendingSync(ctx context.Context, limit int) ([]biz.Event, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := r.data.db.Query(ctx, `
		SELECT id, user_id, anonymous, session_id, event_type, item_id, value, source, occurred_at
		FROM behaviors.events
		WHERE synced_at IS NULL AND event_type <> 'dislike'
		ORDER BY id
		LIMIT $1`, limit)
	if err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	defer rows.Close()

	var out []biz.Event
	for rows.Next() {
		var e biz.Event
		var eventType string
		if err := rows.Scan(&e.ID, &e.UserID, &e.Anonymous, &e.SessionID,
			&eventType, &e.ItemID, &e.Value, &e.Source, &e.OccurredAt); err != nil {
			return nil, r.data.dbErrHandler.MustHandleError(err)
		}
		e.Type = biz.EventType(eventType)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	return out, nil
}

// FilterFreshImpressions 在 ttl 窗口内按 (session_id, item_id) 给曝光去重。
//
// 列表页一次滚动就能把同一张卡片反复推进视口,不去重会把 read_feedback_types
// 刷成噪声,gorse 会以为用户对这个商品格外感兴趣。
// 用 SET NX EX 抢占,抢到的才是窗口内第一次曝光。
func (r *eventRepo) FilterFreshImpressions(ctx context.Context, events []biz.Event, ttl time.Duration) ([]biz.Event, error) {
	if len(events) == 0 {
		return events, nil
	}
	if ttl <= 0 {
		return events, nil
	}

	// 先挑出需要判重的下标,其余事件原样保留
	type candidate struct {
		idx int
		cmd *redis.BoolCmd
	}
	var candidates []candidate

	pipe := r.data.rdb.Pipeline()
	for i, e := range events {
		// 没有 session_id 就无从划定窗口,直接放行
		if e.Type != biz.EventImpression || e.SessionID == "" {
			continue
		}
		key := impressionKeyPrefix + e.SessionID + ":" + e.ItemID
		candidates = append(candidates, candidate{idx: i, cmd: pipe.SetNX(ctx, key, 1, ttl)})
	}
	if len(candidates) == 0 {
		return events, nil
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, fmt.Errorf("impression dedup pipeline: %w", err)
	}

	dup := make(map[int]struct{}, len(candidates))
	for _, c := range candidates {
		fresh, err := c.cmd.Result()
		if err != nil || !fresh {
			dup[c.idx] = struct{}{}
		}
	}

	out := make([]biz.Event, 0, len(events))
	for i, e := range events {
		if _, skip := dup[i]; skip {
			continue
		}
		out = append(out, e)
	}
	return out, nil
}

// DislikedItems 返回用户标记过"不感兴趣"的商品集合。
func (r *eventRepo) DislikedItems(ctx context.Context, userID string) (map[string]struct{}, error) {
	rows, err := r.data.db.Query(ctx, `
		SELECT DISTINCT item_id
		FROM behaviors.events
		WHERE user_id = $1 AND event_type = 'dislike'`, userID)
	if err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	defer rows.Close()

	out := make(map[string]struct{})
	for rows.Next() {
		var itemID string
		if err := rows.Scan(&itemID); err != nil {
			return nil, r.data.dbErrHandler.MustHandleError(err)
		}
		out[itemID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, r.data.dbErrHandler.MustHandleError(err)
	}
	return out, nil
}
