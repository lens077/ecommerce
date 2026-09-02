// Package outbox 实现事务性发件箱（transactional outbox）的生产侧：与业务写同事务落一行
// 领域事件。本包只保证「事件存在 ⇔ 业务变更已提交」这一条原子性；搬运层不在本包——
// 目标态由 Debezium Outbox Event Router 读 WAL 投递到 Kafka（自写 relay 与 NATS JetStream
// 已于 2026-09 退役，见 docs/TECH-RADAR.md §1.8）。投递语义为 at-least-once，**消费者必须幂等**。
//
// 用法（生产侧，与业务写同一事务）：
//
//	tx, _ := pool.Begin(ctx)
//	// ... 业务写 ...
//	_, err := outbox.Insert(ctx, tx, "products.outbox", outbox.Message{
//	    Source: "/service/product",
//	    Type:   "ecommerce.product.spu.upserted",
//	    Subject: "spu:42",
//	    Payload: docJSON,
//	})
//	tx.Commit(ctx)
package outbox

import (
	"context"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// Message 是一条待发布的领域事件（CloudEvents 1.0 属性子集 + 保序键）。
type Message struct {
	EventID      uuid.UUID // 缺省自动生成；CloudEvents id，消费端幂等键
	Source       string    // CloudEvents source，如 "/service/product"
	Type         string    // CloudEvents type，如 "ecommerce.product.spu.upserted"
	Subject      string    // CloudEvents subject：聚合标识，如 "spu:42"
	PartitionKey string    // 保序键；空则取 Subject
	Payload      []byte    // CloudEvents data（JSON）
	OccurredAt   time.Time // CloudEvents time；零值=数据库 now()
}

// DBTX 是 Insert 需要的最小执行接口，pgx.Tx / *pgxpool.Pool / *pgx.Conn 都满足。
// 生产代码必须传**业务事务**进来——outbox 的全部意义就是与业务写同事务。
type DBTX interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// tableRe 约束 outbox 表名必须是 schema.table 形式的合法标识符（表名会拼进 SQL）。
var tableRe = regexp.MustCompile(`^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$`)

// ValidTable 校验 outbox 表名。
func ValidTable(table string) error {
	if !tableRe.MatchString(table) {
		return fmt.Errorf("outbox: 非法表名 %q（要求 schema.table 小写标识符）", table)
	}
	return nil
}

// Insert 在给定事务里写入一条 outbox 事件，返回 event_id。
func Insert(ctx context.Context, db DBTX, table string, m Message) (uuid.UUID, error) {
	if err := ValidTable(table); err != nil {
		return uuid.Nil, err
	}
	if m.Source == "" || m.Type == "" || m.Subject == "" {
		return uuid.Nil, fmt.Errorf("outbox: source/type/subject 不能为空")
	}
	if m.EventID == uuid.Nil {
		m.EventID = uuid.New()
	}
	if m.PartitionKey == "" {
		m.PartitionKey = m.Subject
	}
	if len(m.Payload) == 0 {
		m.Payload = []byte("{}")
	}

	occurred := "now()"
	args := []any{m.EventID, m.Source, m.Type, m.Subject, m.PartitionKey, m.Payload}
	if !m.OccurredAt.IsZero() {
		occurred = "$7"
		args = append(args, m.OccurredAt)
	}
	//nolint:gosec // 表名经 ValidTable 白名单校验
	sql := fmt.Sprintf(`INSERT INTO %s (event_id, source, type, subject, partition_key, payload, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, %s)`, table, occurred)
	if _, err := db.Exec(ctx, sql, args...); err != nil {
		return uuid.Nil, fmt.Errorf("outbox: 写入 %s 失败: %w", table, err)
	}
	return m.EventID, nil
}
