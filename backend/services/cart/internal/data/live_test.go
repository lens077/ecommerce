package data

import (
	"context"
	"testing"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// PgPool 必须同时满足这两个接口,热重建方案整个建立在它们之上:
//   - models.DBTX:让 *Queries 在换池后依然有效,data 层调用点不用改;
//   - otelpgx.PoolStats:让连接池指标只注册一次就能一直跟着当前池。
var (
	_ models.DBTX       = (*PgPool)(nil)
	_ otelpgx.PoolStats = (*PgPool)(nil)
)

// newLazyPool 造一个不会真的去连的池(pgxpool.New 只解析配置,首次使用才拨号)。
func newLazyPool(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func TestPgPool_SwapRedirectsQueries(t *testing.T) {
	first := newLazyPool(t, "postgres://u:p@127.0.0.1:5432/a")
	second := newLazyPool(t, "postgres://u:p@127.0.0.1:5432/b")

	holder := NewPgPool(first)
	// models.New 在换池之前就构造好了,之后不再有人碰它
	queries := models.New(holder)
	require.NotNil(t, queries)

	assert.Same(t, first, holder.Pool())
	assert.Equal(t, "a", holder.Config().ConnConfig.Database)

	prev := holder.Swap(second)
	assert.Same(t, first, prev, "Swap 应把旧池交还给调用方去关闭")

	// 换池后,同一个 holder(也就是 queries 底下的 DBTX)已经指向新池
	assert.Same(t, second, holder.Pool())
	assert.Equal(t, "b", holder.Config().ConnConfig.Database)
	assert.NotNil(t, holder.Stat())
}

func TestLiveRedis_Swap(t *testing.T) {
	first := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6379"})
	second := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6380"})
	t.Cleanup(func() { _ = first.Close(); _ = second.Close() })

	holder := NewLiveRedis(first)
	assert.Same(t, first, holder.Client())

	prev := holder.Swap(second)
	assert.Same(t, first, prev)
	assert.Same(t, second, holder.Client())
	assert.Equal(t, "127.0.0.1:6380", holder.Client().Options().Addr)
}
