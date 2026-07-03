package service

import (
	"context"
	"encoding/json"
	"fmt"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/cart/v1"
	"github.com/lens077/ecommerce/backend/api/cart/v1/cartv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
	structpb "google.golang.org/protobuf/types/known/structpb"
)

type CartService struct {
	uc *biz.CartUseCase
}

func (cs *CartService) AddProductToCart(ctx context.Context, c *connect.Request[v1.AddProductToCartRequest]) (*connect.Response[v1.AddProductToCartResponse], error) {
	req := c.Msg
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	consumerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}

	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, err
	}
	skuAttributesExtra, err := json.Marshal(req.SkuAttributes.AsMap())
	cart, err := cs.uc.AddProductToCart(ctx, biz.AddProductToCartRequest{
		ConsumerId:      consumerId,
		MerchantId:      merchantId,
		SpuID:           req.SpuId,
		SkuID:           req.SkuId,
		Quantity:        req.Quantity,
		Selected:        req.Selected,
		SpuName:         req.SpuName,
		SkuName:         req.SkuName,
		Price:           req.Price,
		SkuAttributes:   skuAttributesExtra,
		SkuThumbnailUrl: req.SkuThumbnailUrl,
		Status:          constants.CartStatusEnum(req.Status),
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

func (cs *CartService) RemoveCartItem(ctx context.Context, c *connect.Request[v1.RemoveCartItemRequest]) (*connect.Response[v1.RemoveCartItemResponse], error) {
	req := c.Msg
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	consumerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}
	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, err
	}
	fmt.Printf("req: %+v\n", req)
	cart, err := cs.uc.RemoveCartItem(ctx, biz.RemoveCartItemRequest{
		ConsumerId: consumerId,
		MerchantId: merchantId,
		SpuId:      req.SpuId,
		SkuId:      req.SkuId,
		Status:     constants.CartStatusActive,
	})
	if err != nil {
		return nil, err
	}
	response := connect.NewResponse(&v1.RemoveCartItemResponse{
		CartTotalQuantity: cart.CartTotalQuantity,
		IsCartEmpty:       cart.IsCartEmpty,
	})

	return response, nil
}

func (cs *CartService) UpdateCartItemQuantity(ctx context.Context, c *connect.Request[v1.UpdateCartItemQuantityRequest]) (*connect.Response[v1.UpdateCartItemQuantityResponse], error) {
	req := c.Msg
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	consumerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}
	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, err
	}
	cart, err := cs.uc.UpdateCartItemQuantity(ctx, biz.UpdateCartItemQuantityRequest{
		ConsumerId: consumerId,
		MerchantId: merchantId,
		SpuId:      req.SpuId,
		SkuId:      req.SkuId,
		Quantity:   req.Quantity,
		Status:     constants.CartStatusActive,
	})
	if err != nil {
		return nil, err
	}
	response := connect.NewResponse(&v1.UpdateCartItemQuantityResponse{
		CartTotalQuantity: cart.CartTotalQuantity,
	})

	return response, nil
}

func (cs *CartService) GetCart(ctx context.Context, c *connect.Request[v1.GetCartRequest]) (*connect.Response[v1.GetCartResponse], error) {
	// userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	userIdStr := "88735c43-9899-44b6-9aec-74f37a8996b4"
	consumerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}
	cart, err := cs.uc.GetCart(ctx, biz.GetCartRequest{
		ConsumerId: consumerId,
		Status:     constants.CartStatusActive,
	})
	if err != nil {
		return nil, err
	}

	var items []*v1.CartItem
	for _, item := range cart.Items {
		var skuAttributes *structpb.Struct
		if len(item.SkuAttributes) > 0 {
			if err := json.Unmarshal(item.SkuAttributes, &skuAttributes); err == nil {
				// ok
			}
		}
		items = append(items, &v1.CartItem{
			CartItemId:      uint64(item.ID),
			SpuId:           item.SpuId,
			SkuId:           item.SkuId,
			MerchantId:      item.MerchantId.String(),
			Quantity:        item.Quantity,
			Selected:        item.Selected,
			SpuName:         item.SpuName,
			SkuName:         item.SkuName,
			Price:           item.Price,
			SkuAttributes:   skuAttributes,
			SkuThumbnailUrl: item.SkuThumbnailUrl,
			Status:          string(item.Status),
		})
	}

	response := connect.NewResponse(&v1.GetCartResponse{
		Items:             items,
		CartTotalQuantity: cart.CartTotalQuantity,
		IsCartEmpty:       cart.IsCartEmpty,
	})

	return response, nil
}

var _ cartv1connect.CartServiceHandler = (*CartService)(nil)

func NewCartService(uc *biz.CartUseCase) cartv1connect.CartServiceHandler {
	return &CartService{uc: uc}
}
