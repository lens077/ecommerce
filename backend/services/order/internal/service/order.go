package service

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/order/v1"
	"github.com/lens077/ecommerce/backend/api/order/v1/orderv1connect"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/application"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain"
)

// OrderService 实现 Connect 服务
type OrderService struct {
	cmd *application.OrderCommandUseCase
	qry *application.OrderQueryUseCase
}

// 显式接口检查
var _ orderv1connect.OrderServiceHandler = (*OrderService)(nil)

func NewOrderService(cmd *application.OrderCommandUseCase, qry *application.OrderQueryUseCase) orderv1connect.OrderServiceHandler {
	return &OrderService{
		cmd: cmd,
		qry: qry,
	}
}

func (s *OrderService) CreateOrder(ctx context.Context, c *connect.Request[v1.CreateOrderRequest]) (*connect.Response[v1.CreateOrderResponse], error) {
	_, err := s.cmd.CreateOrder(
		ctx,
		&domain.CreateOrderRequest{},
	)
	if err != nil { // 根据业务错误类型映射状态码
		switch {
		case errors.Is(err, domain.ErrOrderAlreadyExists):
			return nil, connect.NewError(connect.CodeAlreadyExists, err)
		case errors.Is(err, domain.ErrAuthFailed):
			return nil, connect.NewError(connect.CodeInternal, err)
		case errors.Is(err, domain.ErrNotOrderStatusPaid):
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		case errors.Is(err, domain.ErrOrderNotFound):
			return nil, connect.NewError(connect.CodeNotFound, err)
		default:
			// 可以在这里包装一个具体的 Unknown 描述，或者直接返回
			return nil, connect.NewError(connect.CodeUnknown, err)
		}
	}

	response := &v1.CreateOrderResponse{}

	return connect.NewResponse(response), nil
}

func (s *OrderService) CompleteOrder(ctx context.Context, req *connect.Request[v1.CompleteOrderRequest]) (*connect.Response[v1.CompleteOrderResponse], error) {
	// 写操作
	err := s.cmd.CompleteOrder(ctx, req.Msg.OrderNo)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// 读取最新状态
	result, err := s.qry.GetOrderByNo(ctx, req.Msg.OrderNo)
	if err != nil {
		// 这里要做好最终一致性的处理
		return nil, err
	}

	fmt.Println("result", result)

	response := &v1.CompleteOrderResponse{
		Order: &v1.Order{},
	}

	// 返回读模型给前端
	return connect.NewResponse(response), nil
}
