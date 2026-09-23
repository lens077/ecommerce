package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

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
	customerId, err := customerID(c.Header().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}

	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid merchant id: %w", err))
	}
	skuAttributesExtra, err := json.Marshal(req.SkuAttributes.AsMap())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid sku attributes: %w", err))
	}
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
		return nil, cartError(err)
	}

	response := connect.NewResponse(&v1.AddProductToCartResponse{
		CartItemQuantity: uint32(cart.CartItemQuantity),
		CartItemId:       cart.CartItemId,
	})
	return response, nil
}

func (cs *CartService) RemoveCartItem(ctx context.Context, c *connect.Request[v1.RemoveCartItemRequest]) (*connect.Response[v1.RemoveCartItemResponse], error) {
	req := c.Msg
	customerId, err := customerID(c.Header().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}

	merchantIds := make([]uuid.UUID, 0, len(req.MerchantIds))
	for _, id := range req.MerchantIds {
		ids, err := uuid.Parse(id)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid merchant id: %w", err))
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
	response := connect.NewResponse(&v1.RemoveCartItemResponse{
		CartItemQuantity: cart.CartItemQuantity,
		IsCartEmpty:      cart.IsCartEmpty,
	})

	return response, nil
}

func (cs *CartService) UpdateCartItemQuantity(ctx context.Context, c *connect.Request[v1.UpdateCartItemQuantityRequest]) (*connect.Response[v1.UpdateCartItemQuantityResponse], error) {
	req := c.Msg
	customerId, err := customerID(c.Header().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, err
	}
	merchantId, err := uuid.Parse(req.MerchantId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid merchant id: %w", err))
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
		return nil, cartError(err)
	}
	response := connect.NewResponse(&v1.UpdateCartItemQuantityResponse{
		CartItemQuantity: cart.CartItemQuantity,
	})

	return response, nil
}

func (cs *CartService) GetCart(ctx context.Context, c *connect.Request[v1.GetCartRequest]) (*connect.Response[v1.GetCartResponse], error) {
	customerId, err := customerID(c.Header().Get(constants.UserIdMetadataKey))
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
			CartItemId:      item.ID,
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

// customerID 解析网关注入的用户身份头。缺失或非法说明请求没经过网关鉴权，
// 是 unauthenticated，而不是服务故障。
func customerID(header string) (uuid.UUID, error) {
	id, err := uuid.Parse(header)
	if err != nil {
		return uuid.Nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid authenticated user id"))
	}
	return id, nil
}

// cartError 把 biz 哨兵错误映射为 RPC 错误码（docs/design/platform/error-handling.md 第 3 条）。
// 未映射时 connect 记成 unknown，日志拦截器按「rpc system error」报 ERROR（2026-09-23 修正）。
func cartError(err error) error {
	switch {
	case errors.Is(err, biz.ErrInvalidCartStatus):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeUnknown, err)
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
