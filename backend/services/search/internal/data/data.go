package data

import (
	"context"
	"fmt"
	"os"
	"time"

	conf "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"

	"github.com/elastic/elastic-transport-go/v8/elastictransport"
	"github.com/elastic/go-elasticsearch/v9"
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
		NewElasticSearch,
		NewSearchRepo,
	),
)

// Data 包含所有数据源的客户端
type Data struct {
	db  *pgxpool.Pool
	rdb *redis.Client
	es  *elasticsearch.TypedClient
}

// NewData 是 Data 的构造函数
func NewData(db *pgxpool.Pool, rdb *redis.Client, es *elasticsearch.TypedClient) *Data {
	return &Data{
		db:  db,
		rdb: rdb,
		es:  es,
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

	logger.Info(fmt.Sprintf("Database connected successfully to %s", dbCfg.Host))

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
		// 记录带上下文的错误日志
		logger.Error("Redis ping failed",
			zap.String("addr", redisCfg.Host),
			zap.Error(err),
		)

		// 关闭连接
		if errClose := rdb.Close(); errClose != nil {
			logger.Error("Failed to close redis connection after ping failure",
				zap.String("addr", redisCfg.Host),
				zap.Error(errClose),
			)
		}

		// 返回错误给调用方（让 Fx 知道初始化失败）
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}
	logger.Info("Redis connected successfully",
		zap.String("addr", redisCfg.Host),
	)

	// 注册关闭钩子
	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			logger.Info("Closing Redis connection...")
			return rdb.Close()
		},
	})

	return rdb, nil
}

// NewElasticSearch https://www.elastic.co/docs/reference/elasticsearch/clients/go/examples
func NewElasticSearch(lc fx.Lifecycle, conf *conf.Bootstrap, logger *zap.Logger) *elasticsearch.TypedClient {
	cfg := elasticsearch.Config{
		Addresses: conf.Search.ElasticSearch.Addresses,
		// Username:  "Username",
		// Password:  "Password",
		// CloudID:   "",
		// APIKey:    "",
		Logger: &elastictransport.ColorLogger{Output: os.Stdout},
	}

	es, err := elasticsearch.NewTypedClient(cfg)
	if err != nil {
		panic(err)
	}
	logger.Info(elasticsearch.Version)
	// logger.Info(es.Info())
	// logger.Info(es.Transport.(*elastictransport.Client).URLs())
	logger.Info("elastic search server running")
	return es
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
