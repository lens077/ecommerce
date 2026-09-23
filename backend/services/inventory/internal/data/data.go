package data

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/lens077/ecommerce/backend/services/inventory/internal/biz"
	conf "github.com/lens077/ecommerce/backend/services/inventory/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/inventory/internal/data/models"
	"github.com/lens077/go-connect-kit/dbutil"
	"github.com/lens077/go-connect-kit/pgpool"
	"github.com/lens077/go-connect-kit/redisclient"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var Module = fx.Module("data",
	pgpool.Module[*conf.Bootstrap](postgresOptions),
	redisclient.Module[*conf.Bootstrap](redisOptions),
	fx.Provide(
		NewData,
		NewInventoryRepo,
	),
)

type contextTxKey struct{}

type Data struct {
	db           *models.Queries
	pgx          *pgpool.Live
	rdb          *redisclient.Live
	dbErrHandler *dbutil.Handler
	log          *zap.Logger
}

func NewData(db *pgpool.Live, rdb *redisclient.Live, logger *zap.Logger) *Data {
	return &Data{
		db:  models.New(db),
		pgx: db,
		rdb: rdb,
		log: logger,
		dbErrHandler: dbutil.NewHandler(
			dbutil.WithErrorMapping("23505", biz.ErrOrderAlreadyExists),
			dbutil.WithErrorMapping("23503", biz.ErrOrderNotFound),
			dbutil.WithLogging(true),
			dbutil.WithLogger(func(err error, pgErr *pgconn.PgError) {
				if pgErr != nil {
					logger.Warn("database error",
						zap.String("code", pgErr.Code),
						zap.String("message", pgErr.Message),
						zap.String("detail", pgErr.Detail),
					)
				}
			}),
		),
	}
}

func (d *Data) DB(ctx context.Context) *models.Queries {
	if tx, ok := ctx.Value(contextTxKey{}).(pgx.Tx); ok {
		return models.New(tx)
	}
	return d.db
}

func (d *Data) WithTx(ctx context.Context, tx pgx.Tx) context.Context {
	return context.WithValue(ctx, contextTxKey{}, tx)
}

func (d *Data) ExecTx(ctx context.Context, fn func(context.Context) error) error {
	if _, ok := ctx.Value(contextTxKey{}).(pgx.Tx); ok {
		d.log.Debug("reuse existing transaction")
		return fn(ctx)
	}

	d.log.Info("begin transaction")
	tx, err := d.pgx.Pool().BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx failed: %w", err)
	}

	txCtx := d.WithTx(ctx, tx)

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
	}()

	if err := fn(txCtx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			return fmt.Errorf("%w (rollback err: %v)", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}
	d.log.Info("transaction committed")
	return nil
}

func (d *Data) CheckDatabase(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.pgx.Pool().Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}
	return nil
}

func (d *Data) CheckCache(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.rdb.Client().Ping(ctx).Err(); err != nil {
		return fmt.Errorf("cache ping failed: %w", err)
	}
	return nil
}

// StaleConfig 返回已推送但没能生效的连接配置（键与健康检查项同名，nil 表示已生效）。
// 重建失败时旧连接仍在服务，所以它只进健康响应的 warnings，不让健康检查失败。
func (d *Data) StaleConfig() map[string]error {
	return map[string]error{
		"database": d.pgx.Stale(),
		"cache":    d.rdb.Stale(),
	}
}

// postgresOptions maps this service's database configuration to go-connect-kit/pgpool.
func postgresOptions(c *conf.Bootstrap) pgpool.Options {
	postgres := c.GetData().GetDatabase().GetPostgres()
	pool := postgres.GetPool()
	return pgpool.Options{
		Host:            postgres.GetHost(),
		Port:            uint16(postgres.GetPort()),
		Database:        postgres.GetDbName(),
		User:            postgres.GetUser(),
		Password:        postgres.GetPassword(),
		Timezone:        postgres.GetTimezone(),
		MaxConns:        int32(pool.GetMaxConns()),
		MinConns:        int32(pool.GetMinConns()),
		MaxConnLifetime: pool.GetMaxConnLifetime().AsDuration(),
		MaxConnIdleTime: pool.GetMaxConnIdleTime().AsDuration(),
		PingTimeout:     pool.GetPingTimeout().AsDuration(),
		SSLMode:         postgres.GetTls().GetSslMode(),
		CAPEM:           postgres.GetTls().GetCaPem(),
	}
}

// redisOptions maps this service's cache configuration to go-connect-kit/redisclient.
func redisOptions(c *conf.Bootstrap) redisclient.Options {
	cache := c.GetData().GetCache().GetRedis()
	return redisclient.Options{
		Addr:         net.JoinHostPort(cache.GetHost(), strconv.FormatUint(uint64(cache.GetPort()), 10)),
		Username:     cache.GetUsername(),
		Password:     cache.GetPassword(),
		DB:           int(cache.GetDb()),
		DialTimeout:  cache.GetDialTimeout().AsDuration(),
		ReadTimeout:  cache.GetReadTimeout().AsDuration(),
		WriteTimeout: cache.GetWriteTimeout().AsDuration(),
		PoolSize:     int(cache.GetPoolSize()),
		MinIdleConns: int(cache.GetMinIdleConns()),
		TLS: redisclient.TLSOptions{
			Enabled:            cache.GetTls().GetEnable(),
			InsecureSkipVerify: cache.GetTls().GetInsecureSkipVerify(),
			CAPEM:              cache.GetTls().GetCaPem(),
		},
	}
}
