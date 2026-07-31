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
	conf "github.com/lens077/ecommerce/backend/services/payment/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/payment/internal/pkg/dbutil"
	"github.com/smartwalle/alipay/v3"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewPostgresPool,
		NewAlipay,
		NewPaymentRepo,
	),
)

type contextTxKey struct{}

// Data 包含所有数据源的客户端
type Data struct {
	db           *pgxpool.Pool
	alipay       *alipay.Client
	dbErrHandler *dbutil.Handler
	log          *zap.Logger
}

// NewData 是 Data 的构造函数
func NewData(db *pgxpool.Pool, alipay *alipay.Client, logger *zap.Logger) *Data {
	return &Data{
		db:     db,
		alipay: alipay,
		log:    logger,
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
	tx, err := d.db.BeginTx(ctx, pgx.TxOptions{})
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

// NewAlipay 支付宝
//
// 没配 pay.alipay(或 app_id 为空)时返回 nil 而不是 panic:支付宝的应用私钥/证书
// 是真实凭据,不可能放进仓库或本地环境的 KV 里,而 fx 的 provider 一 panic 整个
// 进程就起不来 —— 服务注册不进 Consul,网关的 /payment* 永远没有节点。
// 当前 paymentRepo 是桩实现,不会解引用这个 client;真实实现恢复时,拿到 nil
// 应当直接返回错误,而不是继续往下走。
func NewAlipay(c *conf.Pay, logger *zap.Logger) *alipay.Client {
	if c == nil || c.Alipay == nil || c.Alipay.AppId == "" {
		logger.Warn("alipay is not configured (pay.alipay.app_id is empty), payment gateway calls will be unavailable")
		return nil
	}

	// log.Debugf("config Pay: %+v", c)
	client, err := alipay.New(c.Alipay.AppId, c.Alipay.PrivateKey, false)
	if err != nil {
		panic(fmt.Errorf("new alipay client failed: %v", err))
	}

	// 证书方式
	// 加载应用公钥证书
	// if err := client.LoadAppCertPublicKeyFromFile("/app/appPublicCert.crt"); err != nil {
	// if err := client.LoadAppCertPublicKeyFromFile("./appPublicCert.crt"); err != nil {
	// 	panic(fmt.Errorf("load app public cert failed: %v", err))
	// }
	// // 加载支付宝根证书
	// // if err := client.LoadAliPayRootCertFromFile("/app/alipayRootCert.crt"); err != nil {
	// if err := client.LoadAliPayRootCertFromFile("./alipayRootCert.crt"); err != nil {
	// 	panic(fmt.Errorf("load alipay root cert failed: %v", err))
	// }
	// // 加载支付宝公钥证书
	// // if err := client.LoadAlipayCertPublicKeyFromFile("/app/alipayPublicCert.crt"); err != nil {
	// if err := client.LoadAlipayCertPublicKeyFromFile("./alipayPublicCert.crt"); err != nil {
	// 	// 	panic(fmt.Errorf("load alipay public cert failed: %v", err))
	// }

	// 加载应用公钥证书
	if err := client.LoadAppCertPublicKey(c.Alipay.AppPublicCert); err != nil {
		panic(fmt.Errorf("load app public cert failed: %v", err))
	}

	// 加载支付宝根证书
	if err := client.LoadAliPayRootCert(c.Alipay.AlipayRootCert); err != nil {
		panic(fmt.Errorf("load alipay root cert failed: %v", err))
	}

	// 加载支付宝公钥证书
	if err := client.LoadAlipayCertPublicKey(c.Alipay.AlipayPublicKey); err != nil {
		panic(fmt.Errorf("load alipay public cert failed: %v", err))
	}

	// 设置加密密钥
	if err := client.SetEncryptKey(c.Alipay.Secret); err != nil {
		panic("设置加密密钥失败")
	}

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
