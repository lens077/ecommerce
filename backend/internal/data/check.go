package data

import (
	"connect-go-example/internal/biz"
	"context"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var _ biz.CheckRepo = (*checkRepo)(nil)

type checkRepo struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
	l    *zap.Logger
}

func NewCheckRepo(pool *pgxpool.Pool, rdb *redis.Client,
	l *zap.Logger,
) biz.CheckRepo {
	return &checkRepo{
		pool: pool,
		rdb:  rdb,
		l:    l,
	}
}

func (c checkRepo) Ready(ctx context.Context, _ biz.HealthCheckReq) (biz.HealthCheckReply, error) {
	err := c.pool.Ping(ctx)
	if err != nil {
		return biz.HealthCheckReply{
			Status: "Unhealthy",
			Details: map[string]string{
				"Message": err.Error(),
			},
		}, connect.NewError(connect.CodeUnavailable, err)
	}
	if err := c.rdb.Ping(ctx).Err(); err != nil {
		return biz.HealthCheckReply{
			Status: "Unhealthy",
			Details: map[string]string{
				"Components": "Redis",
				"Message":    err.Error(),
			},
		}, connect.NewError(connect.CodeUnavailable, err)
	}
	return biz.HealthCheckReply{
		Status:  "Ready",
		Details: nil,
	}, nil
}
