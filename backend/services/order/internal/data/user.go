package data

import (
	"context"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var _ biz.OrderRepo = (*orderRepo)(nil)

type orderRepo struct {
	// queries *models.Queries
	rdb  *redis.Client
	auth *casdoorsdk.Client
	l    *zap.SugaredLogger
}

func (u orderRepo) CreateOrder(ctx context.Context, req biz.CreateOrderRequest) (*biz.CreateOrderResponse, error) {
	// TODO implement me
	panic("implement me")
}

func NewOrderRepo(data *Data, logger *zap.Logger) biz.OrderRepo {
	return &orderRepo{
		// queries: models.New(data.db),
		rdb:  data.rdb,
		auth: data.auth,
		l:    logger.Sugar(),
	}
}
