package data

import (
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
	"github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/dbutil"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/money"
	"github.com/redis/go-redis/v9"

	// "github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
	"context"

	"go.uber.org/zap"
)

var _ biz.CartRepo = (*cartRepo)(nil)

type cartRepo struct {
	queries *models.Queries
	rdb     *redis.Client
	log     *zap.Logger
}

func (c cartRepo) RemoveCartItem(ctx context.Context, req biz.RemoveCartItemRequest) (*biz.RemoveCartItemResponse, error) {
	status := models.CartCartType(req.Status)
	var cart, err = c.queries.RemoveCartItem(ctx, models.RemoveCartItemParams{
		MerchantID: pgtype.UUID{
			Bytes: req.MerchantId,
			Valid: true,
		},
		UserID: pgtype.UUID{
			Bytes: req.ConsumerId,
			Valid: true,
		},
		SpuID:  new(int64(req.SpuId)),
		SkuID:  new(int64(req.SkuId)),
		Status: &status,
	})
	if err != nil {
		return nil, err
	}
	return &biz.RemoveCartItemResponse{
		CartTotalQuantity: uint32(cart.CartTotalQuantity),
		IsCartEmpty:       cart.IsCartEmpty,
	}, nil
}

func (c cartRepo) UpdateCartItemQuantity(ctx context.Context, req biz.UpdateCartItemQuantityRequest) (*biz.UpdateCartItemQuantityResponse, error) {
	status := models.CartCartType(req.Status)
	var cartTotalQuantity, err = c.queries.UpdateCartItemQuantity(ctx, models.UpdateCartItemQuantityParams{
		MerchantID: pgtype.UUID{
			Bytes: req.MerchantId,
			Valid: true,
		},
		UserID: pgtype.UUID{
			Bytes: req.ConsumerId,
			Valid: true,
		},
		SpuID:  new(int64(req.SpuId)),
		SkuID:  new(int64(req.SkuId)),
		Status: &status,
	})
	if err != nil {
		return nil, err
	}
	return &biz.UpdateCartItemQuantityResponse{
		CartTotalQuantity: uint32(cartTotalQuantity),
	}, nil
}

func (c cartRepo) GetCart(ctx context.Context, req biz.GetCartRequest) (*biz.GetCartResponse, error) {
	status := models.CartCartType(req.Status)
	rows, err := c.queries.GetCartItems(ctx, models.GetCartItemsParams{
		UserID: req.ConsumerId,
		Status: status,
	})
	if err != nil {
		return nil, err
	}

	var totalQuantity uint32
	var items []*biz.CartItem

	for _, row := range rows {
		price, _ := money.NumericToFloat(row.Price)
		statusEnum, statusEnumErr := dbutil.ToCartStatusEnum(row.Status)
		if statusEnumErr != nil {
			return nil, statusEnumErr
		}
		items = append(items, &biz.CartItem{
			ID:              row.ID,
			MerchantId:      row.MerchantID,
			SpuId:           uint64(row.SpuID),
			SkuId:           uint64(row.SkuID),
			Quantity:        uint32(row.Quantity),
			Selected:        row.Selected,
			SpuName:         row.SpuName,
			SkuName:         row.SkuName,
			Price:           price,
			SkuAttributes:   row.SkuAttributes,
			SkuThumbnailUrl: row.SkuThumbnailUrl,
			Status:          statusEnum,
		})
		totalQuantity += uint32(row.Quantity)
	}

	return &biz.GetCartResponse{
		Items:             items,
		CartTotalQuantity: totalQuantity,
		IsCartEmpty:       len(items) == 0,
	}, nil
}

func (c cartRepo) AddProductToCart(ctx context.Context, req biz.AddProductToCartRequest) (*biz.AddProductToCartResponse, error) {
	price, err := money.Float64ToNumeric(req.Price)
	if err != nil {
		return nil, err
	}
	cart, err := c.queries.AddProductToCart(ctx, models.AddProductToCartParams{
		UserID:          req.ConsumerId,
		MerchantID:      req.MerchantId,
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

func NewCartRepo(data *Data, logger *zap.Logger) biz.CartRepo {
	return &cartRepo{
		queries: models.New(data.db),
		rdb:     data.rdb,
		log:     logger,
	}
}
