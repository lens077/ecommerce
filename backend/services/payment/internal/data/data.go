package data

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	conf "github.com/lens077/ecommerce/backend/services/payment/internal/conf/v1"
	"github.com/lens077/go-connect-kit/dbutil"
	"github.com/lens077/go-connect-kit/pgpool"
	"github.com/smartwalle/alipay/v3"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	pgpool.Module[*conf.Bootstrap](postgresOptions),
	fx.Provide(
		NewData,
		NewAlipay,
		NewPaymentRepo,
	),
)

type contextTxKey struct{}

// Data 包含所有数据源的客户端
type Data struct {
	db           *pgpool.Live
	alipay       *alipay.Client
	dbErrHandler *dbutil.Handler
	log          *zap.Logger
}

// NewData 是 Data 的构造函数
func NewData(db *pgpool.Live, alipay *alipay.Client, logger *zap.Logger) *Data {
	return &Data{
		db:     db,
		alipay: alipay,
		log:    logger,
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

// NewAlipay 支付宝客户端。未配置 pay.alipay.app_id 时返回 nil，调用方拿到 nil 必须返回错误。
func NewAlipay(c *conf.Pay, logger *zap.Logger) *alipay.Client {
	if c == nil || c.Alipay == nil || c.Alipay.AppId == "" {
		logger.Warn("alipay is not configured (pay.alipay.app_id is empty), payment gateway calls will be unavailable")
		return nil
	}

	client, err := alipay.New(c.Alipay.AppId, c.Alipay.PrivateKey, false)
	if err != nil {
		panic(fmt.Errorf("new alipay client failed: %v", err))
	}

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
	if err := d.db.Pool().Ping(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
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
