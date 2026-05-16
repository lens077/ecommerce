package service

import (
	"context"
	"encoding/json"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/cart/v1"
	"github.com/lens077/ecommerce/backend/api/cart/v1/cartv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
)

type CartService struct {
	uc *biz.CartUseCase
}

func (c *CartService) AddProductToCart(ctx context.Context, req *connect.Request[v1.AddProductToCartRequest]) (*connect.Response[v1.AddProductToCartResponse], error) {
	userIdStr := req.Header().Get(constants.UserIdMetadataKey)
	userId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}

	merchantId, err := uuid.Parse(req.Msg.MerchantId)
	if err != nil {
		return nil, err
	}
	skuAttributesExtra, err := json.Marshal(req.Msg.SkuAttributes.AsMap())
	cart, err := c.uc.AddProductToCart(ctx, biz.AddProductToCartRequest{
		UserID:          userId,
		MerchantID:      merchantId,
		SpuID:           req.Msg.SpuId,
		SkuID:           req.Msg.SkuId,
		Quantity:        req.Msg.Quantity,
		Selected:        req.Msg.Selected,
		SpuName:         req.Msg.SpuName,
		SkuName:         req.Msg.SkuName,
		Price:           req.Msg.Price,
		SkuAttributes:   skuAttributesExtra,
		SkuThumbnailUrl: req.Msg.SkuThumbnailUrl,
		Status:          constants.CartStatusEnum(req.Msg.Status),
	})
	if err != nil {
		return nil, err
	}

	response := connect.NewResponse(&v1.AddProductToCartResponse{
		CartTotalQuantity: uint32(cart.CartTotalQuantity),
		CartItemId:        uint64(cart.CartItemId),
	})
	return response, nil
}

func (c *CartService) RemoveProductToCart(ctx context.Context, c2 *connect.Request[v1.RemoveProductToCartRequest]) (*connect.Response[v1.RemoveProductToCartResponse], error) {
	// TODO implement me
	panic("implement me")
}

var _ cartv1connect.CartServiceHandler = (*CartService)(nil)

func NewCartService(uc *biz.CartUseCase) cartv1connect.CartServiceHandler {
	return &CartService{uc: uc}
}
