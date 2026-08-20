// Command search-indexer 是 CDC 链路的消费端进程：JetStream 商品事件 → Meilisearch。
//
//	go run ./tools/search-indexer                 # 持续消费（durable pull）
//	go run ./tools/search-indexer -mode reindex   # 全量重建（临时索引 + 原子 swap）
//
// 该二进制与 search 服务解耦（search 仍在 ES→Meili 迁移卡上，CrashLoop 中）；
// 逻辑都在 backend/pkg/searchindex，search 服务接线 Meilisearch 时直接内嵌同一包。
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meilisearch/meilisearch-go"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"github.com/lens077/ecommerce/backend/pkg/searchindex"
)

func main() {
	var (
		mode       = flag.String("mode", "run", "run=持续消费；reindex=全量重建后退出")
		natsURL    = flag.String("nats", "", "NATS 地址（缺省 NATS_URL / nats://127.0.0.1:14222）")
		stream     = flag.String("stream", "ECOMMERCE_EVENTS", "JetStream 流名")
		durable    = flag.String("durable", "search-indexer", "durable consumer 名")
		filter     = flag.String("filter", "events.product.>", "订阅过滤 subject")
		meiliHost  = flag.String("meili", "", "Meilisearch 地址（缺省 MEILI_HOST / http://127.0.0.1:17700）")
		meiliKey   = flag.String("meili-key", "", "Meilisearch API key（缺省 MEILI_MASTER_KEY）")
		index      = flag.String("index", "products", "索引 uid")
		maxDeliver = flag.Int("max-deliver", 5, "毒消息投递上限（TERM 前）")
		maxAckPend = flag.Int("max-ack-pending", 1, "在途未 ACK 上限；1=串行保序（默认），调大自担重投乱序")
		dsn        = flag.String("dsn", "", "PostgreSQL DSN（仅 reindex 用；缺省 DB_URI/DB_SOURCE/本地默认）")
	)
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	key := *meiliKey
	if key == "" {
		key = os.Getenv("MEILI_MASTER_KEY")
	}
	host := *meiliHost
	if host == "" {
		if e := os.Getenv("MEILI_HOST"); e != "" {
			host = e
		} else {
			host = "http://127.0.0.1:17700"
		}
	}
	sm := meilisearch.New(host, meilisearch.WithAPIKey(key))
	defer sm.Close()

	switch *mode {
	case "reindex":
		pool, err := pgxpool.New(ctx, resolveDSN(*dsn))
		if err != nil {
			fatal(logger, "连接 PostgreSQL 失败", err)
		}
		defer pool.Close()
		if err := searchindex.Reindex(ctx, pool, sm, *index, logger); err != nil {
			fatal(logger, "全量重建失败", err)
		}
	case "run":
		nc, err := nats.Connect(resolveNATS(*natsURL), nats.Name("search-indexer"))
		if err != nil {
			fatal(logger, "连接 NATS 失败", err)
		}
		defer nc.Drain() //nolint:errcheck
		js, err := jetstream.New(nc)
		if err != nil {
			fatal(logger, "初始化 JetStream 失败", err)
		}
		c := &searchindex.Consumer{
			JS:         js,
			Meili:      sm,
			Stream:     *stream,
			Durable:    *durable,
			Filter:     *filter,
			Index:         *index,
			MaxDeliver:    *maxDeliver,
			MaxAckPending: *maxAckPend,
			Logger:        logger,
		}
		if err := c.Run(ctx); err != nil && ctx.Err() == nil {
			fatal(logger, "消费退出", err)
		}
		logger.Info("search-indexer 正常退出")
	default:
		fatal(logger, "未知 mode", fmt.Errorf("%q", *mode))
	}
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
	os.Exit(1)
}
