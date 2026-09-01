// Command search-indexer owns the curated product projection in Elasticsearch.
//
//	go run ./tools/search-indexer                 # durable JetStream consumer
//	go run ./tools/search-indexer -mode reindex   # rebuild and atomically move the alias
//
// The query service reads the stable alias while this process applies complete
// event-carried projection documents and PostgreSQL rebuilds.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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
		esURL      = flag.String("elasticsearch-url", "", "Elasticsearch 地址（缺省 ELASTICSEARCH_URL；无默认值）")
		esAPIKey   = flag.String("elasticsearch-api-key", "", "Elasticsearch API key（缺省 ELASTICSEARCH_API_KEY）")
		esUsername = flag.String("elasticsearch-username", "", "Elasticsearch 用户名（缺省 ELASTICSEARCH_USERNAME）")
		esPassword = flag.String("elasticsearch-password", "", "Elasticsearch 密码（缺省 ELASTICSEARCH_PASSWORD）")
		index      = flag.String("index", "ecommerce_catalog_products", "稳定的 Elasticsearch alias")
		maxDeliver = flag.Int("max-deliver", 5, "毒消息投递上限（TERM 前）")
		maxAckPend = flag.Int("max-ack-pending", 1, "在途未 ACK 上限；1=串行保序（默认），调大自担重投乱序")
		dsn        = flag.String("dsn", "", "PostgreSQL DSN（仅 reindex 用；缺省 DB_URI/DB_SOURCE/本地默认）")
	)
	flag.Parse()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	endpoint := resolveOption(*esURL, "ELASTICSEARCH_URL")
	if endpoint == "" {
		fatal(logger, "Elasticsearch 地址未配置", errorsRequired("-elasticsearch-url or ELASTICSEARCH_URL"))
	}
	catalog, err := searchindex.NewClient(searchindex.ClientConfig{
		Endpoint:       endpoint,
		APIKey:         resolveOption(*esAPIKey, "ELASTICSEARCH_API_KEY"),
		Username:       resolveOption(*esUsername, "ELASTICSEARCH_USERNAME"),
		Password:       resolveOption(*esPassword, "ELASTICSEARCH_PASSWORD"),
		RequestTimeout: 30 * time.Second,
	})
	if err != nil {
		fatal(logger, "初始化 Elasticsearch 客户端失败", err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := catalog.Close(closeCtx); err != nil {
			logger.Warn("关闭 Elasticsearch 客户端失败", "err", err)
		}
	}()

	switch *mode {
	case "reindex":
		pool, err := pgxpool.New(ctx, resolveDSN(*dsn))
		if err != nil {
			fatal(logger, "连接 PostgreSQL 失败", err)
		}
		defer pool.Close()
		if err := searchindex.Reindex(ctx, pool, catalog, *index, logger); err != nil {
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
		consumer := &searchindex.Consumer{
			JS:            js,
			Catalog:       catalog,
			Stream:        *stream,
			Durable:       *durable,
			Filter:        *filter,
			Index:         *index,
			MaxDeliver:    *maxDeliver,
			MaxAckPending: *maxAckPend,
			Logger:        logger,
		}
		if err := consumer.Run(ctx); err != nil && ctx.Err() == nil {
			fatal(logger, "消费退出", err)
		}
		logger.Info("search-indexer 正常退出")
	default:
		fatal(logger, "未知 mode", fmt.Errorf("%q", *mode))
	}
}

func resolveOption(value, environment string) string {
	if value != "" {
		return value
	}
	return os.Getenv(environment)
}

func errorsRequired(name string) error {
	return fmt.Errorf("required configuration missing: %s", name)
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
