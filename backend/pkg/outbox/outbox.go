// Package outbox 实现事务性发件箱（transactional outbox）+ 自写 relay → NATS JetStream。
//
// 选型背景（2026-08-21 终裁，判定规则见 context/team/db-migrations.md）：
// 不用 Debezium/逻辑复制做主链——上游要的是**领域事件**而不是行变更，且 outbox 才是
// 可重放的真相源；NATS JetStream 的 Nats-Msg-Id 只在去重窗口（默认 2 分钟）内有效，
// 因此本包只承诺 at-least-once，**消费者必须幂等**。
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
//
// relay 侧见 Relay；部署形态是每张 outbox 表一个单活 relay（PG 咨询锁抢主，
// 备实例阻塞等待），独立二进制在 backend/tools/outbox-relay。
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
	EventID      uuid.UUID // 缺省自动生成；既是 CloudEvents id 也是 Nats-Msg-Id
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

// WakeChannel 是 relay 的唤醒通道名。Insert 在同事务里 pg_notify 一下（事务提交才投递），
// relay 把它当**纯唤醒**信号：错过通知没关系，轮询兜底扫描才是投递保证。
const WakeChannel = "outbox_wake"

// tableRe 约束 outbox 表名必须是 schema.table 形式的合法标识符（表名会拼进 SQL）。
var tableRe = regexp.MustCompile(`^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$`)

// ValidTable 校验 outbox 表名。
func ValidTable(table string) error {
	if !tableRe.MatchString(table) {
		return fmt.Errorf("outbox: 非法表名 %q（要求 schema.table 小写标识符）", table)
	}
	return nil
}

// Insert 在给定事务里写入一条 outbox 事件并发出唤醒通知，返回 event_id。
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
	// 同事务 notify：提交后才会投递给 LISTEN 端，天然不会为回滚的事务发唤醒。
	if _, err := db.Exec(ctx, "SELECT pg_notify($1, $2)", WakeChannel, table); err != nil {
		return uuid.Nil, fmt.Errorf("outbox: pg_notify 失败: %w", err)
	}
	return m.EventID, nil
}
