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
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

type CartService struct {
	uc  *biz.CartUseCase
	log *zap.Logger
}

func (cs *CartService) AddProductToCart(ctx context.Context, c *connect.Request[v1.AddProductToCartRequest]) (*connect.Response[v1.AddProductToCartResponse], error) {
	req := c.Msg
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	customerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}

	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, err
	}
	skuAttributesExtra, err := json.Marshal(req.SkuAttributes.AsMap())
	cart, err := cs.uc.AddProductToCart(ctx, biz.AddProductToCartRequest{
		CustomerId:      customerId,
		MerchantId:      merchantId,
		SpuID:           req.SpuId,
		SkuID:           req.SkuId,
		Quantity:        req.Quantity,
		Selected:        req.Selected,
		SpuName:         req.SpuName,
		SkuName:         req.SkuName,
		UnitPriceCents:  req.UnitPriceCents,
		SkuAttributes:   skuAttributesExtra,
		SkuThumbnailUrl: req.SkuThumbnailUrl,
		Status:          constants.CartStatusEnum(req.Status),
	})
	if err != nil {
		return nil, err
	}

	response := connect.NewResponse(&v1.AddProductToCartResponse{
		CartItemQuantity: uint32(cart.CartItemQuantity),
		CartItemId:       cart.CartItemId,
	})
	return response, nil
}

func (cs *CartService) RemoveCartItem(ctx context.Context, c *connect.Request[v1.RemoveCartItemRequest]) (*connect.Response[v1.RemoveCartItemResponse], error) {
	req := c.Msg
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	customerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}

	merchantIds := make([]uuid.UUID, 0, len(req.MerchantIds))
	for _, id := range req.MerchantIds {
		ids, err := uuid.Parse(id)
		if err != nil {
			return nil, err
		}
		merchantIds = append(merchantIds, ids)
	}

	statuses := make([]constants.CartStatusEnum, 0, len(req.Status))
	for _, statusStr := range req.Status {
		cs.log.Sugar().Debug("statusStr: %+v\n", statusStr)
		status := CartStatusFromProto(statusStr)

		statuses = append(statuses, status)
	}
	cs.log.Sugar().Debug("status: %+v\n", statuses)

	cart, err := cs.uc.RemoveCartItem(ctx, biz.RemoveCartItemRequest{
		CustomerId:  customerId,
		MerchantIds: merchantIds,
		SpuIds:      req.SpuIds,
		SkuIds:      req.SkuIds,
		Statuses:    statuses,
	})
	if err != nil {
		return nil, err
	}
	response := connect.NewResponse(&v1.RemoveCartItemResponse{
		CartItemQuantity: cart.CartItemQuantity,
		IsCartEmpty:      cart.IsCartEmpty,
	})

	return response, nil
}

func (cs *CartService) UpdateCartItemQuantity(ctx context.Context, c *connect.Request[v1.UpdateCartItemQuantityRequest]) (*connect.Response[v1.UpdateCartItemQuantityResponse], error) {
	req := c.Msg
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	customerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}
	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, err
	}
	cart, err := cs.uc.UpdateCartItemQuantity(ctx, biz.UpdateCartItemQuantityRequest{
		CustomerId: customerId,
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
		CartItemQuantity: cart.CartItemQuantity,
	})

	return response, nil
}

func (cs *CartService) GetCart(ctx context.Context, c *connect.Request[v1.GetCartRequest]) (*connect.Response[v1.GetCartResponse], error) {
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)

	customerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}
	cart, err := cs.uc.GetCart(ctx, biz.GetCartRequest{
		CustomerId: customerId,
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
			ShopName:        item.ShopName,
			Quantity:        item.Quantity,
			Selected:        item.Selected,
			SpuName:         item.SpuName,
			SkuName:         item.SkuName,
			UnitPriceCents:  item.UnitPriceCents,
			SkuAttributes:   skuAttributes,
			SkuThumbnailUrl: item.SkuThumbnailUrl,
			// Status:          item.Status,
		})
	}

	response := connect.NewResponse(&v1.GetCartResponse{
		Items:            items,
		CartItemQuantity: cart.CartItemQuantity,
		IsCartEmpty:      wrapperspb.Bool(cart.IsCartEmpty),
	})

	return response, nil
}

var _ cartv1connect.CartServiceHandler = (*CartService)(nil)

func NewCartService(uc *biz.CartUseCase, log *zap.Logger) cartv1connect.CartServiceHandler {
	return &CartService{uc: uc, log: log}
}

// CartStatusFromProto 将 protobuf 枚举转为字符串枚举
func CartStatusFromProto(status v1.CartStatus) constants.CartStatusEnum {
	switch status {
	case v1.CartStatus_CART_STATUS_ACTIVE:
		return constants.CartStatusActive
	case v1.CartStatus_CART_STATUS_EXPIRED:
		return constants.CartStatusExpired
	case v1.CartStatus_CART_STATUS_DELETED:
		return constants.CartStatusDeleted
	default:
		return constants.CartStatusEnum("") // 未知时返回空字符串，可根据需要调整
	}
}
