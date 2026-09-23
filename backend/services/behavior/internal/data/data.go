package data

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/lens077/ecommerce/backend/pkg/gorse"
	conf "github.com/lens077/ecommerce/backend/services/behavior/internal/conf/v1"
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
		NewCasdoorAuthClient,
		NewGorseClient,
		NewEventRepo,
		NewRecommendRepo,
	),
)

// Data 包含所有数据源的客户端
type Data struct {
	dbErrHandler *dbutil.Handler
	db           *pgpool.Live
	rdb          *redisclient.Live
	auth         *casdoorsdk.Client
	gorse        *gorse.Client
	gorseEnabled bool
	log          *zap.Logger
}

// NewData 是 Data 的构造函数
func NewData(
	cfg *conf.Bootstrap,
	db *pgpool.Live,
	rdb *redisclient.Live,
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

// StaleConfig 返回已推送但没能生效的连接配置（键与健康检查项同名，nil 表示已生效）。
// 重建失败时旧连接仍在服务，所以它只进健康响应的 warnings，不让健康检查失败。
func (d *Data) StaleConfig() map[string]error {
	return map[string]error{
		"postgres": d.db.Stale(),
		"redis":    d.rdb.Stale(),
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
