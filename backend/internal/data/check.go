package data

import (
	"context"

	"connect-go-example/internal/biz/model"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type checkRepo struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
	l    *zap.Logger
}

type CheckRepo interface {
	Ready(context.Context, model.HealthCheckReq) (model.HealthCheckReply, error)
}

func NewCheckRepo(pool *pgxpool.Pool, rdb *redis.Client,
	l *zap.Logger,
) CheckRepo {
	return &checkRepo{
		pool: pool,
		rdb:  rdb,
		l:    l,
	}
}

func (c checkRepo) Ready(ctx context.Context, _ model.HealthCheckReq) (model.HealthCheckReply, error) {
	err := c.pool.Ping(ctx)
	if err != nil {
		return model.HealthCheckReply{
			Status: "Unhealthy",
			Details: map[string]string{
				"Message": err.Error(),
			},
		}, connect.NewError(connect.CodeUnavailable, err)
	}
	if err := c.rdb.Ping(ctx).Err(); err != nil {
		return model.HealthCheckReply{
			Status: "Unhealthy",
			Details: map[string]string{
				"Components": "Redis",
				"Message":    err.Error(),
			},
		}, connect.NewError(connect.CodeUnavailable, err)
	}
	return model.HealthCheckReply{
		Status:  "Ready",
		Details: nil,
	}, nil
}
