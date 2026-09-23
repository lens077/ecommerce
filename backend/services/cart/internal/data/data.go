package data

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	conf "github.com/lens077/ecommerce/backend/services/cart/internal/conf/v1"
	"github.com/lens077/go-connect-kit/dbutil"
	"github.com/lens077/go-connect-kit/pgpool"
	"github.com/lens077/go-connect-kit/redisclient"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	pgpool.Module[*conf.Bootstrap](postgresOptions),
	redisclient.Module[*conf.Bootstrap](redisOptions),
	fx.Provide(
		NewData,
		NewCartRepo,
	),
)

type contextTxKey struct{}

// Data 包含所有数据源的客户端
type Data struct {
	db           *pgpool.Live
	pgx          *pgpool.Live
	rdb          *redisclient.Live
	dbErrHandler *dbutil.Handler
	log          *zap.Logger
}

// NewData 是 Data 的构造函数
func NewData(db *pgpool.Live, rdb *redisclient.Live, logger *zap.Logger) *Data {
	return &Data{
		db:  db,
		pgx: db,
		rdb: rdb,
		log: logger,
		dbErrHandler: dbutil.NewHandler(
			// dbutil.WithErrorMapping("23505", biz.ErrAlreadyExists),
			// dbutil.WithErrorMapping("23503", biz.ErrNotFound),
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

// DB 从上下文中获取事务或返回默认DB
// 通过 data.DB(ctx) 自动获取事务或普通连接
// example: db := p.data.DB(ctx)
// func (d *Data) DB(ctx context.Context) *models.Queries {
// 	if tx, ok := ctx.Value(contextTxKey{}).(pgx.Tx); ok {
// 		// 如果上下文中有事务，使用事务版 Queries
// 		return models.New(tx)
// 	}
// 	// 无事务时使用普通连接
// 	return d.db
// }

// WithTx 将事务存入上下文
func (d *Data) WithTx(ctx context.Context, tx pgx.Tx) context.Context {
	return context.WithValue(ctx, contextTxKey{}, tx)
}

// ExecTx 支持嵌套事务检测
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

// CheckDatabase 检查数据库连通性
func (d *Data) CheckDatabase(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.db.Pool().Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}
	return nil
}

// CheckCache 检查缓存连通性
func (d *Data) CheckCache(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.rdb.Client().Ping(ctx).Err(); err != nil {
		return fmt.Errorf("cache ping failed: %w", err)
	}
	return nil
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
		// RemoveCartItem 的 @statuses::cart.cart_type[] 是自定义枚举数组。pgx 对未知标量 OID 有文本回退，
		// 对数组没有，不注册就报 "unable to encode ... for unknown type (OID n)"（2026-09-23 实测）。
		TypeNames: []string{"cart.cart_type", "cart._cart_type"},
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
