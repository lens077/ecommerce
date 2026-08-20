package outbox

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// Relay 单活地把一张 outbox 表的未发布事件按 id 序发布到 NATS JetStream。
//
// 正确性模型（对抗审阅表-第4轮 认定的四个缺口在此处落防）：
//   - 投递保证 = 轮询批扫；pg_notify 只是降低延迟的唤醒，不承担投递语义。
//   - 单活：启动即抢 PG 咨询锁（按表名哈希），备实例阻塞等待接管；
//     因此 FOR UPDATE SKIP LOCKED 只防「误配双跑」而不承担保序职责，
//     批内按 id 升序发布 + 首错即停，保住 partition_key 内的先后。
//   - 发布成功（PubAck）后才在同一事务里标 published_at；「PubAck 后进程崩、
//     事务没提交」的窗口会导致重投——Nats-Msg-Id 在流的去重窗口内挡住它，
//     超窗后由消费者幂等兜底（at-least-once 是本链路的公开契约）。
//   - 已发布行按 Retention 定期清理；最老未发布事件滞留超过 StaleWarn 记 WARN
//     （接告警的钩子，避免 outbox 静默积压）。
type Relay struct {
	Pool *pgxpool.Pool
	JS   jetstream.JetStream
	// Table 是 outbox 表名（schema.table），如 products.outbox。
	Table string
	// SubjectPrefix + CloudEvents type 去掉命名前缀 = NATS subject。
	// 例：prefix=events, type=ecommerce.product.spu.upserted → events.product.spu.upserted
	SubjectPrefix string
	// TypePrefix 是事件 type 的命名空间前缀（默认 "ecommerce."），映射 subject 时剥掉。
	TypePrefix string

	BatchSize    int           // 每批扫描行数，默认 100
	PollInterval time.Duration // 轮询兜底间隔，默认 1s
	Retention    time.Duration // 已发布行保留时长，默认 72h；<=0 不清理
	StaleWarn    time.Duration // 未发布滞留告警阈值，默认 1m
	Logger       *slog.Logger
}

func (r *Relay) defaults() error {
	if r.Pool == nil || r.JS == nil {
		return errors.New("outbox: Relay 需要 Pool 与 JS")
	}
	if err := ValidTable(r.Table); err != nil {
		return err
	}
	if r.SubjectPrefix == "" {
		r.SubjectPrefix = "events"
	}
	if r.TypePrefix == "" {
		r.TypePrefix = "ecommerce."
	}
	if r.BatchSize <= 0 {
		r.BatchSize = 100
	}
	if r.PollInterval <= 0 {
		r.PollInterval = time.Second
	}
	if r.Retention == 0 {
		r.Retention = 72 * time.Hour
	}
	if r.StaleWarn <= 0 {
		r.StaleWarn = time.Minute
	}
	if r.Logger == nil {
		r.Logger = slog.Default()
	}
	return nil
}

// Run 阻塞运行直到 ctx 结束。抢到咨询锁前不消费（备实例语义）。
func (r *Relay) Run(ctx context.Context) error {
	if err := r.defaults(); err != nil {
		return err
	}
	// 专用会话：持锁 + LISTEN。锁随会话生存，进程死锁自动释放。
	conn, err := r.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	lockID := hashLockID("outbox:" + r.Table)
	r.Logger.Info("outbox relay 等待抢主", "table", r.Table, "lock_id", lockID)
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", lockID); err != nil {
		return fmt.Errorf("outbox: 抢咨询锁失败: %w", err)
	}
	r.Logger.Info("outbox relay 已成为主实例", "table", r.Table)

	if _, err := conn.Exec(ctx, "LISTEN "+WakeChannel); err != nil {
		return fmt.Errorf("outbox: LISTEN 失败: %w", err)
	}

	lastCleanup := time.Time{}
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// 先把积压清空（每批之间不等待）。
		for {
			n, err := r.publishBatch(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				r.Logger.Error("outbox 批发布失败，退避后重试", "table", r.Table, "err", err)
				break
			}
			if n < r.BatchSize {
				break
			}
		}

		r.warnIfStale(ctx)
		if r.Retention > 0 && time.Since(lastCleanup) > time.Hour {
			r.cleanup(ctx)
			lastCleanup = time.Now()
		}

		// 等唤醒或轮询超时。错过通知无所谓：下一轮扫描兜底。
		waitCtx, cancel := context.WithTimeout(ctx, r.PollInterval)
		_, waitErr := conn.Conn().WaitForNotification(waitCtx)
		cancel()
		if waitErr != nil && !errors.Is(waitErr, context.DeadlineExceeded) && ctx.Err() == nil {
			// 持锁会话坏死（PG 重启/网络断）就退出交给进程管理器重启——
			// 咨询锁与 LISTEN 都绑在这条会话上，原地续跑既丢锁又丢唤醒；
			// 其他瞬时错误睡一个轮询周期，避免热旋转刷日志（实测踩过）。
			if conn.Conn().IsClosed() {
				return fmt.Errorf("outbox: 持锁会话已断开: %w", waitErr)
			}
			select {
			case <-time.After(r.PollInterval):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
}

type pendingRow struct {
	id           int64
	eventID      uuid.UUID
	source       string
	typ          string
	subject      string
	partitionKey string
	payload      []byte
	occurredAt   time.Time
}

// publishBatch 取一批未发布行、按 id 序发布、成功者标记 published_at，返回处理行数。
func (r *Relay) publishBatch(ctx context.Context) (int, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // commit 之后的 rollback 是空操作

	//nolint:gosec // 表名经 ValidTable 校验
	rows, err := tx.Query(ctx, fmt.Sprintf(`SELECT id, event_id, source, type, subject, partition_key, payload, occurred_at
FROM %s WHERE published_at IS NULL ORDER BY id LIMIT %d FOR UPDATE SKIP LOCKED`, r.Table, r.BatchSize))
	if err != nil {
		return 0, err
	}
	var batch []pendingRow
	for rows.Next() {
		var p pendingRow
		if err := rows.Scan(&p.id, &p.eventID, &p.source, &p.typ, &p.subject, &p.partitionKey, &p.payload, &p.occurredAt); err != nil {
			rows.Close()
			return 0, err
		}
		batch = append(batch, p)
	}
	rows.Close()
	if rows.Err() != nil {
		return 0, rows.Err()
	}
	if len(batch) == 0 {
		return 0, tx.Commit(ctx)
	}

	var published []int64
	var pubErr error
	var failed *pendingRow
	for i := range batch {
		p := &batch[i]
		if err := r.publishOne(ctx, p); err != nil {
			// 首错即停：同一 partition_key 的后续事件不能越过失败者，
			// 整批停下最简单且不破坏顺序（付出的只是延迟）。
			pubErr, failed = err, p
			break
		}
		published = append(published, p.id)
	}

	if len(published) > 0 {
		//nolint:gosec // 表名经 ValidTable 校验
		if _, err := tx.Exec(ctx, fmt.Sprintf(
			`UPDATE %s SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = ANY($1)`, r.Table),
			published); err != nil {
			return 0, err
		}
	}
	if failed != nil {
		//nolint:gosec // 表名经 ValidTable 校验
		if _, err := tx.Exec(ctx, fmt.Sprintf(
			`UPDATE %s SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, r.Table),
			failed.id, pubErr.Error()); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	if len(published) > 0 {
		r.Logger.Info("outbox 批发布完成", "table", r.Table, "published", len(published))
	}
	if pubErr != nil {
		return len(published), fmt.Errorf("发布 id=%d event=%s 失败: %w", failed.id, failed.eventID, pubErr)
	}
	return len(batch), nil
}

// publishOne 把一行发成 CloudEvents(binary mode) 消息并等待 PubAck。
func (r *Relay) publishOne(ctx context.Context, p *pendingRow) error {
	subject := r.subjectFor(p.typ)
	msg := &nats.Msg{
		Subject: subject,
		Data:    p.payload,
		Header: nats.Header{
			"content-type":    []string{"application/json"},
			"ce-specversion":  []string{"1.0"},
			"ce-id":           []string{p.eventID.String()},
			"ce-source":       []string{p.source},
			"ce-type":         []string{p.typ},
			"ce-subject":      []string{p.subject},
			"ce-time":         []string{p.occurredAt.UTC().Format(time.RFC3339Nano)},
			"ce-partitionkey": []string{p.partitionKey},
		},
	}
	pubCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err := r.JS.PublishMsg(pubCtx, msg, jetstream.WithMsgID(p.eventID.String()))
	return err
}

func (r *Relay) subjectFor(eventType string) string {
	t := eventType
	if len(r.TypePrefix) > 0 && len(t) > len(r.TypePrefix) && t[:len(r.TypePrefix)] == r.TypePrefix {
		t = t[len(r.TypePrefix):]
	}
	return r.SubjectPrefix + "." + t
}

func (r *Relay) warnIfStale(ctx context.Context) {
	//nolint:gosec // 表名经 ValidTable 校验
	row := r.Pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT COALESCE(EXTRACT(EPOCH FROM now() - MIN(occurred_at)), 0), COUNT(*) FROM %s WHERE published_at IS NULL`, r.Table))
	var oldestSec float64
	var pending int64
	if err := row.Scan(&oldestSec, &pending); err != nil {
		return
	}
	if oldest := time.Duration(oldestSec * float64(time.Second)); oldest > r.StaleWarn {
		// 告警锚点：接 OTel/日志告警时以这条 WARN 为准（outbox 静默积压是本链路最危险的故障态）。
		r.Logger.Warn("outbox 积压滞留", "table", r.Table, "pending", pending, "oldest", oldest.Round(time.Second))
	}
}

func (r *Relay) cleanup(ctx context.Context) {
	//nolint:gosec // 表名经 ValidTable 校验
	tag, err := r.Pool.Exec(ctx, fmt.Sprintf(
		`DELETE FROM %s WHERE published_at IS NOT NULL AND published_at < now() - $1::interval`, r.Table),
		fmt.Sprintf("%f seconds", r.Retention.Seconds()))
	if err != nil {
		r.Logger.Error("outbox 清理失败", "table", r.Table, "err", err)
		return
	}
	if tag.RowsAffected() > 0 {
		r.Logger.Info("outbox 清理", "table", r.Table, "deleted", tag.RowsAffected())
	}
}

// hashLockID 与 tools/dbmigrate 相同的 FNV-1a 折叠，落在正整数域。
func hashLockID(key string) int64 {
	const (
		offset64 = 14695981039346656037
		prime64  = 1099511628211
	)
	var h uint64 = offset64
	for i := 0; i < len(key); i++ {
		h ^= uint64(key[i])
		h *= prime64
	}
	return int64(h & 0x7fffffffffffffff)
}

var _ = pgx.ErrNoRows // 保持 pgx 显式依赖（Query/Scan 语义属于 pgx v5）
