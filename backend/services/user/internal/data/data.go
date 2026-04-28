package data

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"time"

	conf "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
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
		NewAuth,
		NewUserRepo,
	),
)

// Data 包含所有数据源的客户端
type Data struct {
	db   *pgxpool.Pool
	rdb  *redis.Client
	auth *casdoorsdk.Client
}

// NewData 是 Data 的构造函数
func NewData(db *pgxpool.Pool, rdb *redis.Client, auth *casdoorsdk.Client) *Data {
	return &Data{
		db:   db,
		rdb:  rdb,
		auth: auth,
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

	if dbCfg.SslMode == "verify-full" || dbCfg.SslMode == "verify-ca" {
		if dbCfg.Tls.CaPem != "" {
			caCertPool := x509.NewCertPool()
			if ok := caCertPool.AppendCertsFromPEM([]byte(dbCfg.Tls.CaPem)); !ok {
				return nil, fmt.Errorf("failed to parse CA PEM")
			}

			// TODO 如果 ParseConfig 已经根据 sslmode 初始化了 TLSConfig
			if poolCfg.ConnConfig.TLSConfig == nil {
				poolCfg.ConnConfig.TLSConfig = &tls.Config{}
			}

			poolCfg.ConnConfig.TLSConfig.RootCAs = caCertPool
			// 关键点：如果你的证书域名是 server.dc1.consul，而连接地址是 IP
			// 那么需要显式指定 ServerName 否则 verify-full 会报错
			poolCfg.ConnConfig.TLSConfig.ServerName = dbCfg.Host
		}
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
	logger = logger.Named("cache")
	redisCfg := cfg.Data.Cache

	// 基础配置
	opts := &redis.Options{
		Addr:         fmt.Sprintf("%s:%d", redisCfg.Host, redisCfg.Port),
		Username:     redisCfg.Username,
		Password:     redisCfg.Password,
		DB:           int(redisCfg.Db),
		DialTimeout:  time.Duration(redisCfg.DialTimeout) * time.Second,
		ReadTimeout:  time.Duration(redisCfg.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(redisCfg.WriteTimeout) * time.Second,
		PoolSize:     int(redisCfg.PoolSize),
		MinIdleConns: int(redisCfg.MinIdleConns),
	}

	// TLS 适配
	if redisCfg.Tls != nil && redisCfg.Tls.Enable {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: redisCfg.Tls.InsecureSkipVerify,
		}

		// 处理 CA 证书字符串
		if redisCfg.Tls.CaPem != "" {
			caCertPool := x509.NewCertPool()
			// 注意：这里直接使用字符串解析，不需要 os.ReadFile
			if ok := caCertPool.AppendCertsFromPEM([]byte(redisCfg.Tls.CaPem)); !ok {
				return nil, fmt.Errorf("failed to parse redis CA certificate: invalid PEM format")
			}
			tlsConfig.RootCAs = caCertPool

			// 如果你的证书中限制了访问域名（SANs），需要匹配 Addr 中的 Host
			// 你的证书里包含：dragonfly.sumery.com
			// tlsConfig.ServerName = "dragonfly.sumery.com"
		}

		opts.TLSConfig = tlsConfig
		logger.Info("TLS connection initialized with CA string")
	}

	rdb := redis.NewClient(opts)

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

func NewAuth(conf *conf.Bootstrap, logger *zap.Logger) *casdoorsdk.Client {
	client := casdoorsdk.NewClient(
		conf.Auth.Endpoint,         // endpoint
		conf.Auth.ClientId,         // clientId
		conf.Auth.ClientSecret,     // clientSecret
		conf.Auth.Certificate,      // certificate (x509 format)
		conf.Auth.OrganizationName, // organizationName
		conf.Auth.ApplicationName,  // applicationName
	)

	logger.Info(fmt.Sprintf("Casdoor connected successfully to %s", conf.Auth.Endpoint))

	return client
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
