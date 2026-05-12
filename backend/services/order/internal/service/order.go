package service

import (
	"context"
	"errors"

	v1 "github.com/lens077/ecommerce/backend/api/order/v1"
	"github.com/lens077/ecommerce/backend/api/order/v1/orderv1connect"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz"

	"connectrpc.com/connect"
)

// OrderService 实现 Connect 服务
type OrderService struct {
	uc *biz.OrderUseCase
}

// 显式接口检查
var _ orderv1connect.OrderServiceHandler = (*OrderService)(nil)

func NewOrderService(uc *biz.OrderUseCase) orderv1connect.OrderServiceHandler {
	return &OrderService{
		uc: uc,
	}
}

func (s *OrderService) CreateOrder(ctx context.Context, c *connect.Request[v1.CreateOrderRequest]) (*connect.Response[v1.CreateOrderResponse], error) {
	_, err := s.uc.CreateOrder(
		ctx,
		biz.CreateOrderRequest{},
	)
	if err != nil { // 根据业务错误类型映射状态码
		switch {
		case errors.Is(err, biz.ErrOrderAlreadyExists):
			return nil, connect.NewError(connect.CodeAlreadyExists, err)
		case errors.Is(err, biz.ErrAuthFailed):
			return nil, connect.NewError(connect.CodeInternal, err)
		case errors.Is(err, biz.ErrOrderNotFound):
			return nil, connect.NewError(connect.CodeNotFound, err)
		default:
			// 可以在这里包装一个具体的 Unknown 描述，或者直接返回
			return nil, connect.NewError(connect.CodeUnknown, err)
		}
	}

	response := &v1.CreateOrderResponse{}

	return connect.NewResponse(response), nil
}
