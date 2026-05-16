package biz

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/lens077/ecommerce/backend/constants"
)

type (
	AddProductToCartRequest struct {
		UserID          uuid.UUID
		MerchantID      uuid.UUID
		SpuID           uint64
		SkuID           uint64
		Quantity        uint32
		Selected        bool
		SpuName         string
		SkuName         string
		Price           float64
		SkuAttributes   json.RawMessage
		SkuThumbnailUrl string
		Status          constants.CartStatusEnum
	}

	AddProductToCartResponse struct {
		CartTotalQuantity int32
		CartItemId        int64
	}
)

// CartRepo 用户接口
type CartRepo interface {
	AddProductToCart(ctx context.Context, req AddProductToCartRequest) (*AddProductToCartResponse, error)
}

type CartUseCase struct {
	repo CartRepo
}

func NewCartUseCase(repo CartRepo) *CartUseCase {
	return &CartUseCase{
		repo: repo,
	}
}

func (uc *CartUseCase) AddProductToCart(ctx context.Context, req AddProductToCartRequest) (*AddProductToCartResponse, error) {
	return uc.repo.AddProductToCart(ctx, req)
}
