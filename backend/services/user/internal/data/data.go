package data

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"time"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lens077/ecommerce/backend/constants"
	conf "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/user/internal/pkg/dbutil"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewPostgresPool,
		NewRedisClient,
		NewCasdoorAuthClient,
		NewUserRepo,
	),
)

type contextTxKey struct{}

type Data struct {
	pgx          *pgxpool.Pool
	dbErrHandler *dbutil.Handler
	db           *pgxpool.Pool
	rdb          *redis.Client
	auth         *casdoorsdk.Client
	log          *zap.Logger
}

func NewData(db *pgxpool.Pool, rdb *redis.Client, auth *casdoorsdk.Client, logger *zap.Logger) *Data {
	return &Data{
		db:   db,
		rdb:  rdb,
		auth: auth,
		log:  logger,
	}
}

// NewPostgresPool 创建pg数据库连接池
func NewPostgresPool(lc fx.Lifecycle, cfg *conf.Bootstrap, logger *zap.Logger) (*pgxpool.Pool, error) {
	dbCfg := cfg.Data.Database.Postgres // 从 Config 中获取 Data 配置

	// 使用 ParseConfig 生成带有内部安全凭证的空模板
	// 传入空字符串即可，它会生成一套标准的默认连接池参数
	pgConf, err := pgxpool.ParseConfig("")
	if err != nil {
		return nil, fmt.Errorf("parse base pool config failed: %w", err)
	}

	// PostgreSQL 启动参数
	if pgConf.ConnConfig.RuntimeParams == nil {
		pgConf.ConnConfig.RuntimeParams = make(map[string]string)
	}
	// 时区配置（例如 "Asia/Shanghai" 或 "UTC"）
	pgConf.ConnConfig.RuntimeParams["timezone"] = dbCfg.Timezone

	// 将 Consul/Viper 读取到的具体配置灌入模板中
	pgConf.ConnConfig.Host = dbCfg.Host
	pgConf.ConnConfig.Port = uint16(dbCfg.Port)
	pgConf.ConnConfig.Database = dbCfg.DbName
	pgConf.ConnConfig.User = dbCfg.User
	pgConf.ConnConfig.Password = dbCfg.Password

	// 配置连接池熔断与超时属性
	pgConf.MaxConnLifetime = dbCfg.Pool.MaxConnLifetime.AsDuration()
	pgConf.MaxConnIdleTime = dbCfg.Pool.MaxConnIdleTime.AsDuration()
	pgConf.PingTimeout = dbCfg.Pool.PingTimeout.AsDuration()
	pgConf.MaxConns = int32(dbCfg.Pool.MaxConns)
	pgConf.MinConns = int32(dbCfg.Pool.MinConns)

	// SSL 证书校验逻辑
	switch dbCfg.Tls.SslMode {
	case constants.SslModeVerifyCa:
		if dbCfg.Tls.CaPem != "" {
			caCertPool := x509.NewCertPool()
			if ok := caCertPool.AppendCertsFromPEM([]byte(dbCfg.Tls.CaPem)); !ok {
				return nil, fmt.Errorf("failed to parse CA PEM")
			}

			logger.Info("setting up ssl mode: verify-ca config")
			pgConf.ConnConfig.TLSConfig = &tls.Config{
				RootCAs:            caCertPool,
				InsecureSkipVerify: true,
				VerifyPeerCertificate: func(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
					opts := x509.VerifyOptions{
						Roots:         caCertPool,
						CurrentTime:   time.Now(),
						Intermediates: x509.NewCertPool(),
					}
					cert, err := x509.ParseCertificate(rawCerts[0])
					if err != nil {
						return err
					}
					for _, rawCert := range rawCerts[1:] {
						if c, err := x509.ParseCertificate(rawCert); err == nil {
							opts.Intermediates.AddCert(c)
						}
					}
					_, err = cert.Verify(opts)
					return err
				},
			}
		}
	case constants.SslModeVerifyFull:
		if dbCfg.Tls.CaPem != "" {
			caCertPool := x509.NewCertPool()
			if ok := caCertPool.AppendCertsFromPEM([]byte(dbCfg.Tls.CaPem)); !ok {
				return nil, fmt.Errorf("failed to parse CA PEM")
			}

			logger.Info("setting up TLS config")
			pgConf.ConnConfig.TLSConfig = &tls.Config{
				RootCAs:            caCertPool,
				InsecureSkipVerify: false,
				ServerName:         dbCfg.Host,
			}
		}
	}

	// 链路追踪配置
	pgConf.ConnConfig.Tracer = otelpgx.NewTracer()

	pool, err := pgxpool.NewWithConfig(context.Background(), pgConf)
	if err != nil {
		return nil, fmt.Errorf("connect to database failed: %v", err)
	}

	// 记录数据库统计信息
	if err := otelpgx.RecordStats(pool); err != nil {
		return nil, fmt.Errorf("unable to record database stats: %w", err)
	}

	// 测试连接
	ctx, cancel := context.WithTimeout(context.Background(), dbCfg.Pool.PingTimeout.AsDuration())
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("database ping failed: %v", err)
	}

	logger.Info(fmt.Sprintf("database connected successfully to %s", dbCfg.Host))

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			logger.Info("closing database connection...")
			pool.Close()
			return nil
		},
	})

	return pool, nil
}

func NewRedisClient(lc fx.Lifecycle, cfg *conf.Bootstrap, logger *zap.Logger) (*redis.Client, error) {
	redisCfg := cfg.Data.Cache.Redis

	opts := &redis.Options{
		Addr:         fmt.Sprintf("%s:%d", redisCfg.Host, redisCfg.Port),
		Username:     redisCfg.Username,
		Password:     redisCfg.Password,
		DB:           int(redisCfg.Db),
		DialTimeout:  redisCfg.DialTimeout.AsDuration(),
		ReadTimeout:  redisCfg.ReadTimeout.AsDuration(),
		WriteTimeout: redisCfg.WriteTimeout.AsDuration(),
		PoolSize:     int(redisCfg.PoolSize),
		MinIdleConns: int(redisCfg.MinIdleConns),
	}

	if redisCfg.Tls != nil && redisCfg.Tls.Enable {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: redisCfg.Tls.InsecureSkipVerify,
		}

		if redisCfg.Tls.CaPem != "" {
			caCertPool := x509.NewCertPool()
			if ok := caCertPool.AppendCertsFromPEM([]byte(redisCfg.Tls.CaPem)); !ok {
				return nil, fmt.Errorf("failed to parse redis CA certificate: invalid PEM format")
			}
			tlsConfig.RootCAs = caCertPool
		}

		opts.TLSConfig = tlsConfig
		logger.Info("tls connection initialized with CA string")
	}

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), redisCfg.DialTimeout.AsDuration())
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Error("redis ping failed",
			zap.String("addr", redisCfg.Host),
			zap.Error(err),
		)

		if errClose := rdb.Close(); errClose != nil {
			logger.Error("failed to close redis connection after ping failure",
				zap.String("addr", redisCfg.Host),
				zap.Error(errClose),
			)
		}

		return nil, fmt.Errorf("redis ping failed: %w", err)
	}
	logger.Info("redis connected successfully",
		zap.String("addr", redisCfg.Host),
	)

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			logger.Info("closing redis connection...")
			return rdb.Close()
		},
	})

	return rdb, nil
}

func NewCasdoorAuthClient(conf *conf.Bootstrap, logger *zap.Logger) *casdoorsdk.Client {
	casdoorCfg := conf.Auth.Casdoor
	client := casdoorsdk.NewClient(
		casdoorCfg.Endpoint,         // endpoint
		casdoorCfg.ClientId,         // clientId
		casdoorCfg.ClientSecret,     // clientSecret
		casdoorCfg.Certificate,      // certificate (x509 format)
		casdoorCfg.OrganizationName, // organizationName
		casdoorCfg.ApplicationName,  // applicationName
	)

	logger.Info(fmt.Sprintf("casdoor connected successfully to %s", casdoorCfg.Endpoint))

	return client
}

func (d *Data) CheckDatabase(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.db.Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}
	return nil
}

func (d *Data) CheckCache(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("cache ping failed: %w", err)
	}
	return nil
}
