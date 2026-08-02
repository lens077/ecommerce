package data

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"time"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/elastic/go-elasticsearch/v9"
	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lens077/ecommerce/backend/services/address/constants"
	conf "github.com/lens077/ecommerce/backend/services/address/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/address/internal/data/models"
	"github.com/lens077/ecommerce/backend/services/address/internal/pkg/config"
	"github.com/lens077/ecommerce/backend/services/address/internal/pkg/dbutil"
	"github.com/lens077/ecommerce/backend/services/address/internal/pkg/log"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewPostgresPool,
		NewRedisClient,
		NewCasdoorAuthClient,
		NewElasticSearchClient,
		NewAddressRepo,
		NewRegionRepo,
	),
)

type contextTxKey struct{}

// Data 包含所有数据源的客户端
type Data struct {
	db           *PgPool
	queries      *models.Queries
	rdb          *LiveRedis
	auth         *casdoorsdk.Client
	es           *elasticsearch.TypedClient
	dbErrHandler *dbutil.Handler
	log          *zap.Logger
}

// NewData 是 Data 的构造函数
func NewData(db *PgPool, rdb *LiveRedis, auth *casdoorsdk.Client, es *elasticsearch.TypedClient, logger *zap.Logger) *Data {
	return &Data{
		db:      db,
		queries: models.New(db),
		rdb:     rdb,
		auth:    auth,
		es:      es,
		log:     logger,
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
	tx, err := d.db.Pool().BeginTx(ctx, pgx.TxOptions{})
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

// NewPostgresPool 创建 pg 连接池,并订阅配置变更做热重建。
//
// 返回 *PgPool 而不是 *pgxpool.Pool:池本身会在配置变更时被整个换掉,
// 调用方必须持有那个「永远指向当前池」的壳,而不是某一刻的池。
func NewPostgresPool(lc fx.Lifecycle, cfg *conf.Bootstrap, live *config.Live, logger *zap.Logger) (*PgPool, error) {
	pool, err := buildPgPool(cfg, logger)
	if err != nil {
		return nil, err
	}
	holder := NewPgPool(pool)

	// 指标注册在壳上而不是具体的池上,换池后仍然有效(见 PgPool 注释)
	if err := otelpgx.RecordStats(holder); err != nil {
		return nil, fmt.Errorf("unable to record database stats: %w", err)
	}

	unsub := live.Subscribe(func(old, cur *conf.Bootstrap) {
		if proto.Equal(old.GetData().GetDatabase(), cur.GetData().GetDatabase()) {
			return
		}
		logger.Info("database config changed, rebuilding pool",
			zap.String("host", cur.GetData().GetDatabase().GetPostgres().GetHost()))

		next, err := buildPgPool(cur, logger)
		if err != nil {
			// 新配置连不上就继续用旧池:一次配置手滑不该让在跑的流量全挂
			logger.Error("rebuild database pool failed, keeping the current one", zap.Error(err))
			return
		}
		// Ping 通过之后才换,保证任何时刻对外可见的都是一个能用的池
		prev := holder.Swap(next)
		logger.Info("database pool rebuilt")
		if prev != nil {
			// 延迟关闭:此刻可能还有查询跑在旧池上
			time.AfterFunc(drainTimeout, prev.Close)
		}
	})

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			logger.Info("closing database connection...")
			unsub()
			holder.Pool().Close()
			return nil
		},
	})

	return holder, nil
}

// buildPgPool 按给定配置建一个池并 Ping 通过。纯函数,启动与热重建共用。
func buildPgPool(cfg *conf.Bootstrap, logger *zap.Logger) (*pgxpool.Pool, error) {
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
				InsecureSkipVerify: true, // 必须为 true，以此绕过 Go 对 ServerName 的强制检查
				// Go 语言的标准库 crypto/tls 不支持这种“只验 CA 不验域名”的中间态
				// 手动实现“只验CA、不验域名”
				VerifyPeerCertificate: func(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
					opts := x509.VerifyOptions{
						Roots:         caCertPool,
						CurrentTime:   time.Now(),
						Intermediates: x509.NewCertPool(),
					}
					// 拿到服务器传过来的第一个证书
					cert, err := x509.ParseCertificate(rawCerts[0])
					if err != nil {
						return err
					}
					// 把后续的证书当作证书链辅助塞进去
					for _, rawCert := range rawCerts[1:] {
						if c, err := x509.ParseCertificate(rawCert); err == nil {
							opts.Intermediates.AddCert(c)
						}
					}
					// 校验合法性（注意：此时不校验 DNS / IP）
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
				InsecureSkipVerify: false,      // 必须为 false，严格校验证书
				ServerName:         dbCfg.Host, // 校验证书里的域名是否为该 Host
			}
		}
	}

	// 链路追踪配置
	pgConf.ConnConfig.Tracer = otelpgx.NewTracer()

	pool, err := pgxpool.NewWithConfig(context.Background(), pgConf)
	if err != nil {
		return nil, fmt.Errorf("connect to database failed: %v", err)
	}

	// 测试连接
	ctx, cancel := context.WithTimeout(context.Background(), dbCfg.Pool.PingTimeout.AsDuration())
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		// 建池失败时必须自己收尾:热重建路径上没人替我们关这个半成品
		pool.Close()
		return nil, fmt.Errorf("database ping failed: %v", err)
	}

	logger.Info(fmt.Sprintf("database connected successfully to %s", dbCfg.Host))
	return pool, nil
}

// NewRedisClient 创建 Redis 客户端,并订阅配置变更做热重建(语义同 NewPostgresPool)。
func NewRedisClient(lc fx.Lifecycle, cfg *conf.Bootstrap, live *config.Live, logger *zap.Logger) (*LiveRedis, error) {
	rdb, err := buildRedis(cfg, logger)
	if err != nil {
		return nil, err
	}
	holder := NewLiveRedis(rdb)

	unsub := live.Subscribe(func(old, cur *conf.Bootstrap) {
		if proto.Equal(old.GetData().GetCache(), cur.GetData().GetCache()) {
			return
		}
		logger.Info("redis config changed, rebuilding client",
			zap.String("host", cur.GetData().GetCache().GetRedis().GetHost()))

		next, err := buildRedis(cur, logger)
		if err != nil {
			logger.Error("rebuild redis client failed, keeping the current one", zap.Error(err))
			return
		}
		prev := holder.Swap(next)
		logger.Info("redis client rebuilt")
		if prev != nil {
			time.AfterFunc(drainTimeout, func() {
				if err := prev.Close(); err != nil {
					logger.Warn("closing the previous redis client failed", zap.Error(err))
				}
			})
		}
	})

	lc.Append(fx.Hook{
		// 应用停止时释放资源
		OnStop: func(ctx context.Context) error {
			logger.Info("closing redis connection...")
			unsub()
			return holder.Client().Close()
		},
	})

	return holder, nil
}

// buildRedis 按给定配置建一个 Redis 客户端并 Ping 通过。启动与热重建共用。
func buildRedis(cfg *conf.Bootstrap, logger *zap.Logger) (*redis.Client, error) {
	redisCfg := cfg.Data.Cache.Redis

	// 基础配置
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
		logger.Info("tls connection initialized with CA string")
	}

	rdb := redis.NewClient(opts)

	// 测试连接
	ctx, cancel := context.WithTimeout(context.Background(), redisCfg.DialTimeout.AsDuration())
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		// 记录带上下文的错误日志
		logger.Error("redis ping failed",
			zap.String("addr", redisCfg.Host),
			zap.Error(err),
		)

		// 关闭连接
		if errClose := rdb.Close(); errClose != nil {
			logger.Error("failed to close redis connection after ping failure",
				zap.String("addr", redisCfg.Host),
				zap.Error(errClose),
			)
		}

		// 返回错误给调用方（让 Fx 知道初始化失败）
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}
	logger.Info("redis connected successfully",
		zap.String("addr", redisCfg.Host),
	)

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

// NewElasticSearchClient https://www.elastic.co/docs/reference/elasticsearch/clients/go/examples
func NewElasticSearchClient(lc fx.Lifecycle, conf *conf.Bootstrap, logger *zap.Logger) (*elasticsearch.TypedClient, error) {
	cfg := conf.Search.ElasticSearch
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Elasticsearch 通常是高频内部调用，默认的 MaxIdleConnsPerHost（默认为 2）可能太小了
	// 如果并发请求很多，这会导致连接频繁创建和销毁，造成大量 TIME_WAIT
	// transport.MaxIdleConnsPerHost = 20

	if cfg.Tls.Enable {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: cfg.Tls.InsecureSkipVerify}
		if cfg.Tls.CaPem != "" {
			pool := x509.NewCertPool()
			if pool.AppendCertsFromPEM([]byte(cfg.Tls.CaPem)) {
				transport.TLSClientConfig.RootCAs = pool
			}
		}
	}

	esCfg := elasticsearch.Config{
		Addresses: cfg.Addresses,
		Username:  cfg.Username,
		Password:  cfg.Password,
		Logger:    &log.ZapESLogger{Logger: logger, Conf: conf.Log},
		Transport: transport,
	}

	es, err := elasticsearch.NewTypedClient(esCfg)
	if err != nil {
		logger.Error("failed to initialize elasticsearch client", zap.Error(err))
		return nil, err
	}

	logger.Info("elasticsearch client initialized", zap.Strings("addresses", cfg.Addresses))

	return es, nil
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

// CheckElasticSearch 检查ES连通性
func (d *Data) CheckElasticSearch(ctx context.Context) error {
	if d.es == nil {
		return fmt.Errorf("elasticsearch client not initialized")
	}
	// 调用 Ping 方法
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := d.es.Ping().Do(ctx)
	if err != nil {
		return fmt.Errorf("elasticsearch ping failed: %w", err)
	}
	return nil
}
