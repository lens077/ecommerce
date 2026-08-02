package data

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// drainTimeout 换池后旧池的宽限期。
// 立刻 Close 会掐断还在执行的查询,等一会儿再关,in-flight 请求得以正常收尾。
const drainTimeout = 30 * time.Second

// PgPool 持有「当前」连接池,支持整体原子替换。
//
// 它实现了 models.DBTX(只有 Exec/Query/QueryRow 三个方法),所以交给
// models.New() 之后,底层池被换掉时 *Queries 依然有效 —— data 层所有
// c.queries.* 调用点一行都不用改。
//
// 同时实现 otelpgx.PoolStats(Stat/Config),这样连接池指标只需注册一次
// 就能一直跟着当前池走 —— otelpgx 没有反注册接口,每次换池都注册会重复上报。
type PgPool struct{ p atomic.Pointer[pgxpool.Pool] }

func NewPgPool(pool *pgxpool.Pool) *PgPool {
	h := &PgPool{}
	h.p.Store(pool)
	return h
}

// Pool 返回当前池,供需要 *pgxpool.Pool 本身的调用方(开事务、Ping)使用。
func (h *PgPool) Pool() *pgxpool.Pool { return h.p.Load() }

// Swap 换上新池并返回旧池。
func (h *PgPool) Swap(pool *pgxpool.Pool) *pgxpool.Pool { return h.p.Swap(pool) }

func (h *PgPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return h.p.Load().Exec(ctx, sql, args...)
}

func (h *PgPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return h.p.Load().Query(ctx, sql, args...)
}

func (h *PgPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return h.p.Load().QueryRow(ctx, sql, args...)
}

func (h *PgPool) Stat() *pgxpool.Stat     { return h.p.Load().Stat() }
func (h *PgPool) Config() *pgxpool.Config { return h.p.Load().Config() }

// LiveRedis 持有「当前」Redis 客户端,语义同 PgPool。
//
// redis.Client 的方法太多,不做转发,取值一律走 Client() —— 每次取都拿最新的,
// 不要把它的返回值存进结构体字段,那样又变回了「启动时抓一次」。
type LiveRedis struct{ c atomic.Pointer[redis.Client] }

func NewLiveRedis(client *redis.Client) *LiveRedis {
	l := &LiveRedis{}
	l.c.Store(client)
	return l
}

func (l *LiveRedis) Client() *redis.Client { return l.c.Load() }

func (l *LiveRedis) Swap(client *redis.Client) *redis.Client { return l.c.Swap(client) }
