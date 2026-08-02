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
	"github.com/lens077/ecommerce/backend/pkg/gorse"
	conf "github.com/lens077/ecommerce/backend/services/behavior/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/behavior/internal/pkg/dbutil"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewPostgresPool,
		NewRedisClient,
		NewCasdoorAuthClient,
		NewGorseClient,
		NewEventRepo,
		NewRecommendRepo,
	),
)

// Data 包含所有数据源的客户端
type Data struct {
	dbErrHandler *dbutil.Handler
	db           *pgxpool.Pool
	rdb          *redis.Client
	auth         *casdoorsdk.Client
	gorse        *gorse.Client
	gorseEnabled bool
	log          *zap.Logger
}

// NewData 是 Data 的构造函数
func NewData(
	cfg *conf.Bootstrap,
	db *pgxpool.Pool,
	rdb *redis.Client,
	auth *casdoorsdk.Client,
	gorseClient *gorse.Client,
	logger *zap.Logger,
) *Data {
	return &Data{
		db:           db,
		rdb:          rdb,
		auth:         auth,
		gorse:        gorseClient,
		gorseEnabled: cfg.Recommend.GetGorse().GetEnable(),
		log:          logger,
		dbErrHandler: dbutil.NewHandler(),
	}
}

// NewPostgresPool 创建pg数据库连接池
func NewPostgresPool(lc fx.Lifecycle, cfg *conf.Bootstrap, logger *zap.Logger) (*pgxpool.Pool, error) {
	dbCfg := cfg.Data.Database.Postgres

	// 使用 ParseConfig 生成带有内部安全凭证的空模板
	pgConf, err := pgxpool.ParseConfig("")
	if err != nil {
		return nil, fmt.Errorf("parse base pool config failed: %w", err)
	}

	if pgConf.ConnConfig.RuntimeParams == nil {
		pgConf.ConnConfig.RuntimeParams = make(map[string]string)
	}
	pgConf.ConnConfig.RuntimeParams["timezone"] = dbCfg.Timezone

	pgConf.ConnConfig.Host = dbCfg.Host
	pgConf.ConnConfig.Port = uint16(dbCfg.Port)
	pgConf.ConnConfig.Database = dbCfg.DbName
	pgConf.ConnConfig.User = dbCfg.User
	pgConf.ConnConfig.Password = dbCfg.Password

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

	pgConf.ConnConfig.Tracer = otelpgx.NewTracer()

	pool, err := pgxpool.NewWithConfig(context.Background(), pgConf)
	if err != nil {
		return nil, fmt.Errorf("connect to database failed: %v", err)
	}

	if err := otelpgx.RecordStats(pool); err != nil {
		return nil, fmt.Errorf("unable to record database stats: %w", err)
	}

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

// NewRedisClient 创建 Redis 客户端。这里只用来做曝光去重,不存业务数据。
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
	logger.Info("redis connected successfully", zap.String("addr", redisCfg.Host))

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
		casdoorCfg.Endpoint,
		casdoorCfg.ClientId,
		casdoorCfg.ClientSecret,
		casdoorCfg.Certificate,
		casdoorCfg.OrganizationName,
		casdoorCfg.ApplicationName,
	)

	logger.Info(fmt.Sprintf("casdoor connected successfully to %s", casdoorCfg.Endpoint))

	return client
}

// NewGorseClient 创建 gorse 客户端。
// 这里不做探活:gorse 挂了不该拦住服务启动,行为照样得落库,等它回来再补投。
func NewGorseClient(cfg *conf.Bootstrap, logger *zap.Logger) *gorse.Client {
	gorseCfg := cfg.Recommend.GetGorse()
	if gorseCfg == nil || !gorseCfg.Enable {
		logger.Warn("gorse disabled, behavior events will only be persisted locally")
		return nil
	}

	logger.Info("gorse client initialized", zap.String("endpoint", gorseCfg.Endpoint))
	return gorse.New(gorseCfg.Endpoint, gorseCfg.ApiKey, gorseCfg.Timeout.AsDuration())
}

// CheckDatabase 检查数据库连通性
func (d *Data) CheckDatabase(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.db.Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}
	return nil
}

// CheckCache 检查缓存连通性
func (d *Data) CheckCache(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("cache ping failed: %w", err)
	}
	return nil
}

// CheckGorse 检查 gorse 连通性。
// 关掉 gorse 时视为健康 —— 此时它不是依赖项,只是没开的可选功能。
func (d *Data) CheckGorse(ctx context.Context) error {
	if !d.gorseEnabled || d.gorse == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := d.gorse.Healthz(ctx); err != nil {
		return fmt.Errorf("gorse health check failed: %w", err)
	}
	return nil
}
