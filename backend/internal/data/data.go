package data

import (
	"context"
	"fmt"
	"time"

	conf "connect-go-example/internal/conf/v1"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewDB,
		NewCache,
		NewUserRepo,
		NewCheckRepo,
	),
)

// Data 包含所有数据源的客户端
type Data struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

// NewData 是 Data 的构造函数
func NewData(db *pgxpool.Pool, rdb *redis.Client) *Data {
	return &Data{
		db:  db,
		rdb: rdb,
	}
}

// NewDB 创建数据库连接池
func NewDB(lc fx.Lifecycle, cfg *conf.Bootstrap, logger *zap.Logger) (*pgxpool.Pool, error) {
	dbCfg := cfg.Data.Database // 从 Config 中获取 Data 配置

	connString := fmt.Sprintf("postgresql://%s:%s@%s:%d/%s?sslmode=%s&timezone=%s",
		dbCfg.User,
		dbCfg.Password,
		dbCfg.Host,
		dbCfg.Port,
		dbCfg.DbName,
		dbCfg.SslMode,
		dbCfg.Timezone,
	)

	poolCfg, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("parse database config failed: %v", err)
	}

	// 链路追踪配置
	poolCfg.ConnConfig.Tracer = otelpgx.NewTracer()

	// 创建连接池
	pool, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		return nil, fmt.Errorf("connect to database failed: %v", err)
	}

	// 记录数据库统计信息
	if err := otelpgx.RecordStats(pool); err != nil {
		return nil, fmt.Errorf("unable to record database stats: %w", err)
	}

	// 测试连接
	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("database ping failed: %v", err)
	}
	fmt.Printf("dbCfg:%+v", dbCfg)
	// 注册关闭钩子
	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			logger.Info("Closing database connection...")
			pool.Close()
			return nil
		},
	})

	return pool, nil
}

// NewCache 创建 Redis 客户端
func NewCache(lc fx.Lifecycle, cfg *conf.Bootstrap, logger *zap.Logger) (*redis.Client, error) {
	redisCfg := cfg.Data.Redis // 从 Config 中获取 Redis 配置

	rdb := redis.NewClient(&redis.Options{
		Addr:         fmt.Sprintf("%s:%d", redisCfg.Host, redisCfg.Port),
		Username:     redisCfg.Username,
		Password:     redisCfg.Password,
		DB:           int(redisCfg.Db),
		DialTimeout:  time.Duration(redisCfg.DialTimeout) * time.Second,
		ReadTimeout:  time.Duration(redisCfg.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(redisCfg.WriteTimeout) * time.Second,
		PoolSize:     int(redisCfg.PoolSize),
		MinIdleConns: int(redisCfg.MinIdleConns),
	})

	// 测试连接
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		// 关闭连接以避免资源泄漏
		err := rdb.Close()
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("redis ping failed: %v", err)
	}

	logger.Info(fmt.Sprintf("Redis connected successfully to %s", redisCfg.Host))

	// 注册关闭钩子
	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			logger.Info("Closing Redis connection...")
			return rdb.Close()
		},
	})

	return rdb, nil
}

// HealthCheck 健康检查
func (d *Data) HealthCheck(ctx context.Context) error {
	if err := d.db.Ping(ctx); err != nil {
		return fmt.Errorf("database health check failed: %v", err)
	}

	if err := d.rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis health check failed: %v", err)
	}

	return nil
}
