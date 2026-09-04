package data

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"time"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lens077/ecommerce/backend/constants"
	conf "github.com/lens077/ecommerce/backend/services/product/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/product/internal/data/models"
	"github.com/lens077/ecommerce/backend/services/product/internal/pkg/config"
	"github.com/lens077/go-connect-kit/dbutil"
	otelpkg "github.com/lens077/go-connect-kit/otel"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewPostgresPool,
		NewRedisClient,
		NewProductRepo,
		NewGorseClient,
		NewItemSyncConfig,
		NewCatalogRepo,
		NewItemSyncRepo,
	),
)

type contextTxKey struct{}

type Data struct {
	db           *models.Queries
	pgx          *PgPool
	rdb          *LiveRedis
	dbErrHandler *dbutil.Handler
	log          *zap.Logger
}

func NewData(db *PgPool, rdb *LiveRedis, logger *zap.Logger) *Data {
	return &Data{
		db:  models.New(db),
		pgx: db,
		rdb: rdb,
		log: logger,
		dbErrHandler: dbutil.NewHandler(
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
	// span 名取 sqlc 的查询名(形如 "query GetCartItems"),不带整段 SQL。
	// 默认行为会把带换行的完整 SQL 塞进 span name,而 span name 在后端是个索引
	// 维度,SQL 文本进去会把基数撑爆,Jaeger 的 operation 列表也没法用。
	// 完整 SQL 仍然保留在 db.statement attribute 上,不丢信息。
	// 为什么不用 otelpgx 自带的 WithTrimSQLInSpanName,见 SQLSpanName 的注释。
	// 两个选项必须一起给,少一个都不生效 —— otelpgx 的 API 在这里很反直觉:
	// tracer.go 里是 `if t.trimQuerySpanName { spanName = t.spanNameCtxFunc(...) }`,
	// 也就是说 WithTrimSQLInSpanName 才是「启用自定义 span 名」的开关,
	// 只给 WithSpanNameFunc 的话 span 名依旧是整段 SQL(实测如此)。
	pgConf.ConnConfig.Tracer = otelpgx.NewTracer(
		otelpgx.WithTrimSQLInSpanName(),
		otelpgx.WithSpanNameFunc(otelpkg.SQLSpanName),
	)

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
	// OTel 指标装配必须先于 NewClient,否则漏掉连接池 gauge(幂等,实现见 otel 包)。
	otelpkg.EnsureRedisInstrumentation(logger)

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
