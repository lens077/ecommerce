package biz

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/lens077/ecommerce/backend/constants"
)

var ErrInvalidCartStatus = errors.New("invalid cart status")

type (
	AddProductToCartRequest struct {
		ConsumerId      uuid.UUID
		MerchantId      uuid.UUID
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
		CartItemQuantity int32
		CartItemId       uint64 // 新增/更新的购物车项ID（前端下单需要真实ID）
	}
)
type (
	RemoveCartItem struct {
	}
	RemoveCartItemRequest struct {
		ConsumerId  uuid.UUID
		MerchantIds []uuid.UUID
		SpuIds      []int64
		SkuIds      []int64
		Statuses    []constants.CartStatusEnum
	}
	RemoveCartItemResponse struct {
		CartItemQuantity uint32
		IsCartEmpty      bool
	}
)

type (
	UpdateCartItemQuantityRequest struct {
		ConsumerId uuid.UUID
		MerchantId uuid.UUID
		SpuId      uint64
		SkuId      uint64
		Quantity   uint32
		Status     constants.CartStatusEnum
	}
	UpdateCartItemQuantityResponse struct {
		CartItemQuantity uint32
	}
)

type CartItem struct {
	ID              int64
	MerchantId      uuid.UUID
	ShopName        string
	SpuId           uint64
	SkuId           uint64
	Quantity        uint32
	Selected        bool
	SpuName         string
	SkuName         string
	Price           float64
	SkuAttributes   json.RawMessage
	SkuThumbnailUrl string
	Status          constants.CartStatusEnum
}

type (
	GetCartRequest struct {
		ConsumerId uuid.UUID
		Status     constants.CartStatusEnum
	}
	GetCartResponse struct {
		Items            []*CartItem
		CartItemQuantity uint32
		IsCartEmpty      bool
	}
)

// CartRepo 用户接口
type CartRepo interface {
	AddProductToCart(ctx context.Context, req AddProductToCartRequest) (*AddProductToCartResponse, error)
	RemoveCartItem(ctx context.Context, req RemoveCartItemRequest) (*RemoveCartItemResponse, error)
	UpdateCartItemQuantity(ctx context.Context, req UpdateCartItemQuantityRequest) (*UpdateCartItemQuantityResponse, error)
	GetCart(ctx context.Context, req GetCartRequest) (*GetCartResponse, error)
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

func (uc *CartUseCase) RemoveCartItem(ctx context.Context, req RemoveCartItemRequest) (*RemoveCartItemResponse, error) {
	return uc.repo.RemoveCartItem(ctx, req)
}

func (uc *CartUseCase) UpdateCartItemQuantity(ctx context.Context, req UpdateCartItemQuantityRequest) (*UpdateCartItemQuantityResponse, error) {
	return uc.repo.UpdateCartItemQuantity(ctx, req)
}

func (uc *CartUseCase) GetCart(ctx context.Context, req GetCartRequest) (*GetCartResponse, error) {
	return uc.repo.GetCart(ctx, req)
}
