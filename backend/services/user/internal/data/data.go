package data

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"time"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	conf "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"
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
		NewCasdoorAuthClient,
		NewUserRepo,
	),
)

type contextTxKey struct{}

type Data struct {
	pgx          *pgpool.Live
	dbErrHandler *dbutil.Handler
	db           *pgpool.Live
	rdb          *redisclient.Live
	auth         *casdoorsdk.Client
	log          *zap.Logger
}

func NewData(db *pgpool.Live, rdb *redisclient.Live, auth *casdoorsdk.Client, logger *zap.Logger) *Data {
	return &Data{
		db:   db,
		rdb:  rdb,
		auth: auth,
		log:  logger,
	}
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
	if err := d.db.Pool().Ping(ctx); err != nil {
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
