// Package searchindex 是 CDC 链路的消费端：JetStream 上的商品事件 → Meilisearch 索引。
//
// 文档 schema 在此一次定稿（清掉 TODO「搜索引擎切换」记录的三笔历史债）：
//   - id 顶层且为 spu_id（数值主键）；
//   - price 是数值型（活跃 SKU 最低价的投影，真相仍是 PG 的 DECIMAL；索引值只用于
//     展示与排序，不参与金额运算）；
//   - sale_count 顶层数值（products.spu_total_sales 视图口径），可排序。
//
// 事件契约：payload 即完整文档投影（event-carried state），消费者不回查 PG；
// upserted → AddDocuments（整文档替换，天然幂等），deleted → DeleteDocument（tombstone）。
// Meilisearch 写入是异步任务：**task succeeded 才 ACK**，enqueue(202) 不算完成。
package searchindex

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meilisearch/meilisearch-go"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// Doc 是 products 索引里的一条文档。字段名就是索引 schema，改动=索引契约变更。
type Doc struct {
	ID           int64   `json:"id"`             // spu id（主键）
	SpuCode      string  `json:"spu_code"`       // 业务编码
	Name         string  `json:"name"`           // 商品名（主搜索字段）
	Description  string  `json:"description"`    // 描述
	Status       string  `json:"status"`         // draft/online/offline/deleted（filterable）
	MainMediaURL string  `json:"main_media_url"` // 主图
	MerchantID   string  `json:"merchant_id"`    // 商家（filterable）
	Price        float64 `json:"price"`          // 活跃 SKU 最低价（sortable，展示/排序投影）
	SaleCount    int64   `json:"sale_count"`     // 总销量（sortable）
	UpdatedAt    string  `json:"updated_at"`     // RFC3339（sortable，兜底排序/新鲜度）
}

// EventTypeUpserted / EventTypeDeleted 是本链路当前消费的两类 CloudEvents type。
const (
	EventTypeUpserted = "ecommerce.product.spu.upserted"
	EventTypeDeleted  = "ecommerce.product.spu.deleted"
)

// EnsureIndex 幂等地创建索引并下发设置（filterable/sortable/searchable）。
func EnsureIndex(ctx context.Context, sm meilisearch.ServiceManager, uid string) error {
	if _, err := sm.GetIndexWithContext(ctx, uid); err != nil {
		task, err := sm.CreateIndexWithContext(ctx, &meilisearch.IndexConfig{Uid: uid, PrimaryKey: "id"})
		if err != nil {
			return fmt.Errorf("searchindex: 创建索引 %s 失败: %w", uid, err)
		}
		if err := waitTask(ctx, sm, task.TaskUID); err != nil {
			return err
		}
	}
	task, err := sm.Index(uid).UpdateSettingsWithContext(ctx, indexSettings())
	if err != nil {
		return fmt.Errorf("searchindex: 下发索引设置失败: %w", err)
	}
	return waitTask(ctx, sm, task.TaskUID)
}

func indexSettings() *meilisearch.Settings {
	return &meilisearch.Settings{
		SearchableAttributes: []string{"name", "spu_code", "description"},
		FilterableAttributes: []string{"status", "merchant_id"},
		SortableAttributes:   []string{"price", "sale_count", "updated_at"},
	}
}

func waitTask(ctx context.Context, sm meilisearch.ServiceManager, uid int64) error {
	t, err := sm.WaitForTaskWithContext(ctx, uid, 50*time.Millisecond)
	if err != nil {
		return err
	}
	if t.Status != meilisearch.TaskStatusSucceeded {
		return fmt.Errorf("searchindex: meilisearch task %d 状态 %s: %v", uid, t.Status, t.Error)
	}
	return nil
}

// Consumer 是 JetStream durable pull 消费者。
type Consumer struct {
	JS         jetstream.JetStream
	Meili      meilisearch.ServiceManager
	Stream     string // 流名，如 ECOMMERCE_EVENTS
	Durable    string // durable 名，如 search-indexer
	Filter     string // 订阅过滤，如 events.product.>
	Index      string // Meili 索引 uid，如 products
	MaxDeliver int    // 毒消息上限（含首投），默认 5
	BatchSize  int    // 每次 Fetch 条数，默认 50
	// MaxAckPending 默认 1：JetStream 的重投不会插回原顺序，并发在途时晚到的
	// 重投可能用旧投影覆盖新投影（对抗第4轮 codex t3-C4）。串行消费换顺序正确性，
	// 搜索喂养的吞吐远低于串行上限；确有吞吐需求再调大并自担乱序（幂等只保收敛不保序）。
	MaxAckPending int
	Logger        *slog.Logger
}

// Run 阻塞消费直到 ctx 结束。
func (c *Consumer) Run(ctx context.Context) error {
	if c.MaxDeliver <= 0 {
		c.MaxDeliver = 5
	}
	if c.BatchSize <= 0 {
		c.BatchSize = 50
	}
	if c.Logger == nil {
		c.Logger = slog.Default()
	}
	if err := EnsureIndex(ctx, c.Meili, c.Index); err != nil {
		return err
	}
	// 流由 relay（或运维）创建；消费端启动顺序不该决定成败，等到它出现为止。
	var stream jetstream.Stream
	for {
		var err error
		stream, err = c.JS.Stream(ctx, c.Stream)
		if err == nil {
			break
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		c.Logger.Info("流尚不存在，等待重试", "stream", c.Stream, "err", err)
		select {
		case <-time.After(time.Second):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	if c.MaxAckPending <= 0 {
		c.MaxAckPending = 1
	}
	cons, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       c.Durable,
		FilterSubject: c.Filter,
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    c.MaxDeliver,
		AckWait:       30 * time.Second,
		MaxAckPending: c.MaxAckPending,
		DeliverPolicy: jetstream.DeliverAllPolicy,
	})
	if err != nil {
		return fmt.Errorf("searchindex: 建 durable consumer 失败: %w", err)
	}
	c.Logger.Info("search indexer 开始消费", "stream", c.Stream, "durable", c.Durable, "filter", c.Filter)

	for ctx.Err() == nil {
		batch, err := cons.Fetch(c.BatchSize, jetstream.FetchMaxWait(2*time.Second))
		if err != nil {
			if errors.Is(err, context.Canceled) || ctx.Err() != nil {
				return ctx.Err()
			}
			if errors.Is(err, nats.ErrConnectionClosed) {
				// 连接已进入终态（重连次数用尽/主动关闭），原地重试只会刷日志，
				// 退出交给进程管理器重启。
				return fmt.Errorf("searchindex: NATS 连接已关闭: %w", err)
			}
			c.Logger.Error("fetch 失败，退避重试", "err", err)
			select {
			case <-time.After(time.Second):
			case <-ctx.Done():
				return ctx.Err()
			}
			continue
		}
		for msg := range batch.Messages() {
			c.handle(ctx, msg)
		}
		if err := batch.Error(); err != nil && !errors.Is(err, context.DeadlineExceeded) {
			c.Logger.Warn("batch 结束时有错误", "err", err)
		}
	}
	return ctx.Err()
}

func (c *Consumer) handle(ctx context.Context, msg jetstream.Msg) {
	eventType := msg.Headers().Get("ce-type")
	eventID := msg.Headers().Get("ce-id")

	// 续租：Meili 任务积压时 WaitForTask 可能贴近 AckWait，先报 InProgress
	// 重置计时，避免处理中被判超时重投（重投虽被幂等消化，但白做功）。
	_ = msg.InProgress()
	err := c.apply(ctx, eventType, msg.Data())
	if err == nil {
		if ackErr := msg.Ack(); ackErr != nil {
			c.Logger.Warn("ack 失败（消息会重投，靠幂等消化）", "event_id", eventID, "err", ackErr)
		}
		return
	}

	// 毒消息：达到 MaxDeliver 上限就 Term 出队并留痕，不再堵住后续消息。
	// （比静默丢强：留有 event_id + 原因，可回放 outbox 补数据。）
	if md, mdErr := msg.Metadata(); mdErr == nil && int(md.NumDelivered) >= c.MaxDeliver {
		c.Logger.Error("毒消息出队（TERM），需人工回放", "event_id", eventID, "type", eventType, "deliveries", md.NumDelivered, "err", err)
		_ = msg.Term()
		return
	}
	c.Logger.Warn("处理失败，NAK 延迟重投", "event_id", eventID, "type", eventType, "err", err)
	_ = msg.NakWithDelay(2 * time.Second)
}

// apply 把一条事件落到 Meilisearch，task succeeded 才算成功。
func (c *Consumer) apply(ctx context.Context, eventType string, payload []byte) error {
	idx := c.Meili.Index(c.Index)
	switch eventType {
	case EventTypeUpserted:
		var d Doc
		if err := json.Unmarshal(payload, &d); err != nil {
			return fmt.Errorf("payload 解析失败: %w", err)
		}
		if d.ID == 0 {
			return errors.New("payload 缺 id")
		}
		task, err := idx.AddDocumentsWithContext(ctx, []Doc{d}, nil)
		if err != nil {
			return err
		}
		return waitTask(ctx, c.Meili, task.TaskUID)
	case EventTypeDeleted:
		var d struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(payload, &d); err != nil {
			return fmt.Errorf("payload 解析失败: %w", err)
		}
		if d.ID == 0 {
			return errors.New("payload 缺 id")
		}
		task, err := idx.DeleteDocumentWithContext(ctx, strconv.FormatInt(d.ID, 10), nil)
		if err != nil {
			return err
		}
		return waitTask(ctx, c.Meili, task.TaskUID)
	default:
		// 未知类型直接 ACK 掉（前向兼容：新事件类型不应堵死老消费者）。
		return nil
	}
}

// reindexSQL 从 PG 聚合出文档（与事件投影同一口径）。不过滤 deleted：
// 调用方按 status 分流 upsert/delete（水位补偿需要看见删除侧）。
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

// scanDocs 按水位捞文档，按状态分流。since=零值时取全量。
func scanDocs(ctx context.Context, pool *pgxpool.Pool, since time.Time) (upserts []Doc, deletes []int64, err error) {
	rows, err := pool.Query(ctx, reindexSQL, since)
	if err != nil {
		return nil, nil, fmt.Errorf("searchindex: 聚合查询失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var d Doc
		if err := rows.Scan(&d.ID, &d.SpuCode, &d.Name, &d.Description, &d.Status, &d.MainMediaURL, &d.MerchantID, &d.Price, &d.SaleCount, &d.UpdatedAt); err != nil {
			return nil, nil, err
		}
		if d.Status == "deleted" {
			deletes = append(deletes, d.ID)
			continue
		}
		upserts = append(upserts, d)
	}
	return upserts, deletes, rows.Err()
}

// Reindex 全量重建：灌到 <index>_rebuild 临时索引，成功后原子 swap，再删临时索引，
// 最后按**水位**做一次 delta 补偿。线上索引在整个过程中持续可查。
//
// 水位竞态（对抗第4轮 codex t3-C5）：快照扫描到 swap 之间发生的变更事件会被消费者
// 应用到「旧内容」上，swap 后随旧内容一起被换出——单靠「全量=swap、增量=事件」会丢
// 这个窗口。补偿：记录扫描前水位，swap 完成后把 updated_at >= 水位的行（含转 deleted
// 的删除侧）重放到已上线的新索引；文档投影完全派生自 PG，重放即闭环，无需回拨流游标。
func Reindex(ctx context.Context, pool *pgxpool.Pool, sm meilisearch.ServiceManager, index string, logger *slog.Logger) error {
	if logger == nil {
		logger = slog.Default()
	}
	tmp := index + "_rebuild"

	// 水位取扫描前一刻并留 5s 时钟余量；delta 多补几行没关系（upsert 幂等）。
	watermark := time.Now().Add(-5 * time.Second)
	docs, _, err := scanDocs(ctx, pool, time.Time{})
	if err != nil {
		return err
	}
	logger.Info("全量重建开始", "docs", len(docs), "tmp", tmp)

	// 临时索引：先删残留再建，保证从零开始。
	if _, err := sm.GetIndexWithContext(ctx, tmp); err == nil {
		task, err := sm.DeleteIndexWithContext(ctx, tmp)
		if err != nil {
			return err
		}
		if err := waitTask(ctx, sm, task.TaskUID); err != nil {
			return err
		}
	}
	if err := EnsureIndex(ctx, sm, tmp); err != nil {
		return err
	}
	// 主索引也要存在，swap 才有对手方。
	if err := EnsureIndex(ctx, sm, index); err != nil {
		return err
	}
	if len(docs) > 0 {
		task, err := sm.Index(tmp).AddDocumentsWithContext(ctx, docs, nil)
		if err != nil {
			return err
		}
		if err := waitTask(ctx, sm, task.TaskUID); err != nil {
			return err
		}
	}
	task, err := sm.SwapIndexesWithContext(ctx, []*meilisearch.SwapIndexesParams{{Indexes: []string{index, tmp}}})
	if err != nil {
		return fmt.Errorf("searchindex: swap 失败: %w", err)
	}
	if err := waitTask(ctx, sm, task.TaskUID); err != nil {
		return err
	}
	if task, err := sm.DeleteIndexWithContext(ctx, tmp); err == nil {
		_ = func() error { return waitTask(ctx, sm, task.TaskUID) }()
	}

	// 水位补偿：重放快照期间的变更到已上线的新索引，闭掉 swap 竞态窗口。
	deltaUp, deltaDel, err := scanDocs(ctx, pool, watermark)
	if err != nil {
		return fmt.Errorf("searchindex: 水位补偿查询失败: %w", err)
	}
	live := sm.Index(index)
	if len(deltaUp) > 0 {
		task, err := live.AddDocumentsWithContext(ctx, deltaUp, nil)
		if err != nil {
			return err
		}
		if err := waitTask(ctx, sm, task.TaskUID); err != nil {
			return err
		}
	}
	for _, id := range deltaDel {
		task, err := live.DeleteDocumentWithContext(ctx, strconv.FormatInt(id, 10), nil)
		if err != nil {
			return err
		}
		if err := waitTask(ctx, sm, task.TaskUID); err != nil {
			return err
		}
	}
	logger.Info("全量重建完成（index swap 原子切换 + 水位补偿）",
		"index", index, "docs", len(docs), "delta_upserts", len(deltaUp), "delta_deletes", len(deltaDel))
	return nil
}

// SubjectForType 与 relay 的映射保持一致（TypePrefix=ecommerce.，SubjectPrefix=events）。
func SubjectForType(eventType string) string {
	return "events." + strings.TrimPrefix(eventType, "ecommerce.")
}
