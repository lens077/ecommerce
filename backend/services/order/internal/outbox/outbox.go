// Package outbox 是 order 服务的**事务性发件箱写入侧**。
//
// 它只在「与业务写同一个事务」里被调用：事件行与订单状态变更一起提交、一起回滚。
// 搬运由 Debezium Outbox Event Router 从 WAL 完成（TECH-RADAR §1.8），本包不发布、
// 不重试、不做簿记——游标就是 WAL 位点，按提交序推进。
//
// 这样就消掉了进程内总线时代的四个窗口：
//   - W1（提交后、发布前崩溃 → 订单在、事件永久丢）：事件与状态同事务，提交即双可见；
//   - W2（事件只在内存环里、进程退出即丢）：没有内存环，写在 WAL 里；
//   - W3（反序发布 → 下游处理不存在的订单）：行只可能随成功提交出现；
//   - W0（handler 失败只加计数器、不可见）：没有进程内 handler；投递失败表现为
//     connector task 状态 / consumer lag（外部告警项，见 services/order/outbox.md）。
package outbox

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"go.opentelemetry.io/otel/trace"
)

// Execer 是 outbox 唯一需要的数据库能力：pgx.Tx、*pgxpool.Pool 都满足。
//
// 生产调用方必须传**事务**（TODO 里的 outbox 条目与 order/data/order.go 的 SaveOrder 是参照实现）。
// 显式收窄接口而不是直接收 pgx.Tx，是为了让单元测试能用一个小 fake 断言 SQL 与参数，
// 不需要真库。
type Execer interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// Event 是一行 outbox：列按 CloudEvents 属性设计（TECH-RADAR §1.6），
// 同时保留 Debezium Outbox Event Router 的默认列名（aggregatetype/aggregateid/type/payload）。
type Event struct {
	ID            uuid.UUID
	Source        string
	Type          string
	Subject       string
	AggregateType string
	AggregateID   string
	PartitionKey  string
	Payload       []byte
	Headers       map[string]string
	OccurredAt    time.Time
}

// insertSQL 手写：本仓 sqlc 生成需要在线 schema（sqlc.yaml 的 uri 指向运行库），
// 事件目录落地时把它并进 queries/query.sql 重新生成。
const insertSQL = `INSERT INTO orders.outbox
	(id, source, type, subject, aggregatetype, aggregateid, partitionkey, payload, headers, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

// Append 把事件写成 outbox 行。调用方必须已经在一个事务里（见包注释）：
// 事务失败时这行随之回滚，这正是 W1 的修法。
func Append(ctx context.Context, ex Execer, ev Event) error {
	if ev.ID == uuid.Nil {
		return fmt.Errorf("outbox: event id is empty")
	}
	headers := ev.Headers
	if headers == nil {
		headers = map[string]string{}
	}
	if _, ok := headers["traceparent"]; !ok {
		if tp := TraceParent(ctx); tp != "" {
			headers["traceparent"] = tp
		}
	}
	rawHeaders, err := json.Marshal(headers)
	if err != nil {
		return fmt.Errorf("outbox: marshal headers: %w", err)
	}

	occurredAt := ev.OccurredAt
	if occurredAt.IsZero() {
		occurredAt = time.Now()
	}

	if _, err := ex.Exec(ctx, insertSQL,
		ev.ID,
		ev.Source,
		ev.Type,
		ev.Subject,
		ev.AggregateType,
		ev.AggregateID,
		ev.PartitionKey,
		ev.Payload,
		rawHeaders,
		occurredAt,
	); err != nil {
		return fmt.Errorf("outbox: append %s: %w", ev.Type, err)
	}
	return nil
}

// TraceParent 把当前 span 渲染成 W3C traceparent 头（binary CE 模式下 CE 属性走 Kafka header）。
// 没有 span 时返回空串：不伪造 trace 关系。
func TraceParent(ctx context.Context) string {
	sc := trace.SpanContextFromContext(ctx)
	if !sc.IsValid() {
		return ""
	}
	return fmt.Sprintf("00-%s-%s-%02x", sc.TraceID().String(), sc.SpanID().String(), byte(sc.TraceFlags()))
}
