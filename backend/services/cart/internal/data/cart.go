package data

import (
	"github.com/elastic/go-elasticsearch/v9"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
	"github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/money"
	"github.com/redis/go-redis/v9"

	// "github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
	"context"

	"go.uber.org/zap"
)

var _ biz.CartRepo = (*cartRepo)(nil)

type cartRepo struct {
	queries *models.Queries
	es      *elasticsearch.TypedClient
	rdb     *redis.Client
	log     *zap.Logger
}

func (c cartRepo) AddProductToCart(ctx context.Context, req biz.AddProductToCartRequest) (*biz.AddProductToCartResponse, error) {
	price, err := money.Float64ToNumeric(req.Price)
	if err != nil {
		return nil, err
	}
	cart, err := c.queries.AddProductToCart(ctx, models.AddProductToCartParams{
		UserID:          req.UserID,
		MerchantID:      req.MerchantID,
		SpuID:           int64(req.SpuID),
		SkuID:           int64(req.SkuID),
		Quantity:        int32(req.Quantity),
		Selected:        req.Selected,
		SpuName:         req.SpuName,
		SkuName:         req.SkuName,
		Price:           price,
		SkuAttributes:   req.SkuAttributes,
		SkuThumbnailUrl: req.SkuThumbnailUrl,
		Status:          models.CartCartType(req.Status),
	})
	if err != nil {
		return nil, err
	}

	return &biz.AddProductToCartResponse{
		CartTotalQuantity: cart.Quantity,
		CartItemId:        cart.ID,
	}, nil
}

func NewCartRepo(data *Data, logger *zap.Logger, es *elasticsearch.TypedClient) biz.CartRepo {
	return &cartRepo{
		queries: models.New(data.db),
		es:      es,
		rdb:     data.rdb,
		log:     logger,
	}
}
