package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"connectrpc.com/connect/v2"
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

func (cs *CartService) AddProductToCart(ctx context.Context, c *v1.AddProductToCartRequest) (*v1.AddProductToCartResponse, error) {
	info, _ := connect.CallInfoForServerContext(ctx)
	if info == nil {
		info = &connect.CallInfo{} // 直调(单测)无 CallInfo;经 Server.Call 时必有
	}
	req := c
	customerId, err := customerID(info.RequestHeader().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}

	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid merchant id: %w", err).Error())
	}
	skuAttributesExtra, err := json.Marshal(req.SkuAttributes.AsMap())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid sku attributes: %w", err).Error())
	}
	cart, err := cs.uc.AddProductToCart(ctx, biz.AddProductToCartRequest{
		CustomerId:      customerId,
		MerchantId:      merchantId,
		SpuID:           int64(req.SpuId),
		SkuID:           int64(req.SkuId),
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
		return nil, cartError(err)
	}

	response := &v1.AddProductToCartResponse{
		CartItemQuantity: uint32(cart.CartItemQuantity),
		CartItemId:       uint64(cart.CartItemId),
	}
	return response, nil
}

func (cs *CartService) RemoveCartItem(ctx context.Context, c *v1.RemoveCartItemRequest) (*v1.RemoveCartItemResponse, error) {
	info, _ := connect.CallInfoForServerContext(ctx)
	if info == nil {
		info = &connect.CallInfo{} // 直调(单测)无 CallInfo;经 Server.Call 时必有
	}
	req := c
	customerId, err := customerID(info.RequestHeader().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}

	merchantIds := make([]uuid.UUID, 0, len(req.MerchantIds))
	for _, id := range req.MerchantIds {
		ids, err := uuid.Parse(id)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid merchant id: %w", err).Error())
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
		return nil, cartError(err)
	}
	response := &v1.RemoveCartItemResponse{
		CartItemQuantity: cart.CartItemQuantity,
		IsCartEmpty:      cart.IsCartEmpty,
	}

	return response, nil
}

func (cs *CartService) UpdateCartItemQuantity(ctx context.Context, c *v1.UpdateCartItemQuantityRequest) (*v1.UpdateCartItemQuantityResponse, error) {
	info, _ := connect.CallInfoForServerContext(ctx)
	if info == nil {
		info = &connect.CallInfo{} // 直调(单测)无 CallInfo;经 Server.Call 时必有
	}
	req := c
	customerId, err := customerID(info.RequestHeader().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}
	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid merchant id: %w", err).Error())
	}
	cart, err := cs.uc.UpdateCartItemQuantity(ctx, biz.UpdateCartItemQuantityRequest{
		CustomerId: customerId,
		MerchantId: merchantId,
		SpuId:      int64(req.SpuId),
		SkuId:      int64(req.SkuId),
		Quantity:   req.Quantity,
		Status:     constants.CartStatusActive,
	})
	if err != nil {
		return nil, cartError(err)
	}
	response := &v1.UpdateCartItemQuantityResponse{
		CartItemQuantity: cart.CartItemQuantity,
	}

	return response, nil
}

func (cs *CartService) GetCart(ctx context.Context, c *v1.GetCartRequest) (*v1.GetCartResponse, error) {
	info, _ := connect.CallInfoForServerContext(ctx)
	if info == nil {
		info = &connect.CallInfo{} // 直调(单测)无 CallInfo;经 Server.Call 时必有
	}
	customerId, err := customerID(info.RequestHeader().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}
	cart, err := cs.uc.GetCart(ctx, biz.GetCartRequest{
		CustomerId: customerId,
		Status:     constants.CartStatusActive,
	})
	if err != nil {
		return nil, cartError(err)
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
			SpuId:           uint64(item.SpuId),
			SkuId:           uint64(item.SkuId),
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

	response := &v1.GetCartResponse{
		Items:            items,
		CartItemQuantity: cart.CartItemQuantity,
		IsCartEmpty:      wrapperspb.Bool(cart.IsCartEmpty),
	}

	return response, nil
}

var _ cartv1connect.CartServiceHandler = (*CartService)(nil)

func NewCartService(uc *biz.CartUseCase, log *zap.Logger) cartv1connect.CartServiceHandler {
	return &CartService{uc: uc, log: log}
}

// customerID 解析网关注入的用户身份头。缺失或非法说明请求没经过网关鉴权，
// 是 unauthenticated，而不是服务故障。
func customerID(header string) (uuid.UUID, error) {
	id, err := uuid.Parse(header)
	if err != nil {
		return uuid.Nil, connect.Errorf(connect.CodeUnauthenticated, "invalid authenticated user id")
	}
	return id, nil
}

// cartError 把 biz 哨兵错误映射为 RPC 错误码（docs/design/platform/error-handling.md 第 3 条）。
// 未映射时 connect 记成 unknown，日志拦截器按「rpc system error」报 ERROR（2026-09-23 修正）。
func cartError(err error) error {
	switch {
	case errors.Is(err, biz.ErrInvalidCartStatus):
		return connect.NewError(connect.CodeInvalidArgument, err.Error()).WithCause(err)
	default:
		return connect.NewError(connect.CodeUnknown, err.Error()).WithCause(err)
	}
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
