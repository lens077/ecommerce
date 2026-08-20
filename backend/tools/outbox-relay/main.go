// Command outbox-relay 是 outbox → NATS JetStream 的独立投递进程（CDC 链路第 2 跳）。
//
// 单活语义：按表名抢 PG 咨询锁，多副本部署时备实例阻塞待命；宿主服务不内嵌
// relay（对抗终裁：独立进程能单独扩缩/重启/观测，且 product 服务当前没有写路径）。
//
//	go run ./tools/outbox-relay -table products.outbox
//
// DSN 取值同 dbmigrate：-dsn > DB_URI > DB_SOURCE > 本地默认；
// NATS 地址：-nats > NATS_URL > nats://127.0.0.1:14222。
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"github.com/lens077/ecommerce/backend/pkg/outbox"
)

func main() {
	var (
		dsn       = flag.String("dsn", "", "PostgreSQL DSN（缺省 DB_URI/DB_SOURCE/本地默认）")
		natsURL   = flag.String("nats", "", "NATS 地址（缺省 NATS_URL / nats://127.0.0.1:14222）")
		table     = flag.String("table", "products.outbox", "outbox 表（schema.table）")
		stream    = flag.String("stream", "ECOMMERCE_EVENTS", "JetStream 流名")
		subjects  = flag.String("subjects", "events.>", "流的 subject 集（逗号分隔）")
		replicas  = flag.Int("replicas", 1, "流副本数（本地/可重建域 1，交易域 3）")
		batch     = flag.Int("batch", 100, "每批扫描行数")
		poll      = flag.Duration("poll", time.Second, "轮询兜底间隔")
		retention = flag.Duration("retention", 72*time.Hour, "已发布行保留时长")
	)
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, resolveDSN(*dsn))
	if err != nil {
		fatal(logger, "连接 PostgreSQL 失败", err)
	}
	defer pool.Close()

	nc, err := nats.Connect(resolveNATS(*natsURL), nats.Name("outbox-relay/"+*table))
	if err != nil {
		fatal(logger, "连接 NATS 失败", err)
	}
	defer nc.Drain() //nolint:errcheck

	js, err := jetstream.New(nc)
	if err != nil {
		fatal(logger, "初始化 JetStream 失败", err)
	}
	if _, err := outbox.EnsureStream(ctx, js, outbox.StreamOptions{
		Name:     *stream,
		Subjects: strings.Split(*subjects, ","),
		Replicas: *replicas,
	}); err != nil {
		fatal(logger, "确保流存在失败", err)
	}

	relay := &outbox.Relay{
		Pool:         pool,
		JS:           js,
		Table:        *table,
		BatchSize:    *batch,
		PollInterval: *poll,
		Retention:    *retention,
		Logger:       logger,
	}
	if err := relay.Run(ctx); err != nil && ctx.Err() == nil {
		fatal(logger, "relay 退出", err)
	}
	logger.Info("outbox-relay 正常退出")
}

func resolveDSN(v string) string {
	if v != "" {
		return v
	}
	if e := os.Getenv("DB_URI"); e != "" {
		return e
	}
	if e := os.Getenv("DB_SOURCE"); e != "" {
		return e
	}
	return "postgres://postgres:postgres@127.0.0.1:15432/ecommerce?sslmode=disable"
}

func resolveNATS(v string) string {
	if v != "" {
		return v
	}
	if e := os.Getenv("NATS_URL"); e != "" {
		return e
	}
	return "nats://127.0.0.1:14222"
}

func fatal(logger *slog.Logger, msg string, err error) {
	logger.Error(msg, "err", err)
	fmt.Fprintln(os.Stderr, msg+":", err)
	os.Exit(1)
}
