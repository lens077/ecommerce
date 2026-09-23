package service

import (
	"context"
	"errors"

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
	// req := c.Msg
	// userId := c.Header().Get(constants.UserNameMetadataKey)
	_, err := s.cmd.CreateOrder(
		ctx,
		&domain.CreateOrderRequest{
			CartItemIDs: nil,
			AddressID:   0,
			Remark:      "",
		},
	)
	if err != nil {
		return nil, orderError(err)
	}

	response := &v1.CreateOrderResponse{}

	return connect.NewResponse(response), nil
}

func (s *OrderService) CompleteOrder(ctx context.Context, req *connect.Request[v1.CompleteOrderRequest]) (*connect.Response[v1.CompleteOrderResponse], error) {
	// 写操作
	err := s.cmd.CompleteOrder(ctx, req.Msg.OrderNo)
	if err != nil {
		return nil, orderError(err)
	}

	// 读取最新状态
	_, err = s.qry.GetOrderByNo(ctx, req.Msg.OrderNo)
	if err != nil {
		// 这里要做好最终一致性的处理
		return nil, orderError(err)
	}

	response := &v1.CompleteOrderResponse{
		Order: &v1.Order{},
	}

	// 返回读模型给前端
	return connect.NewResponse(response), nil
}

// orderError 把领域错误映射为 RPC 错误码（docs/design/platform/error-handling.md 第 3 条），
// 全服务只此一处。2026-09-23 修正前：CompleteOrder 把所有错误（含订单不存在、状态不允许）
// 覆盖成 internal，这正是规范点名的「CodeNotFound → CodeInternal 重包」；
// 身份认证失败也被映射成 internal。
func orderError(err error) error {
	switch {
	case errors.Is(err, domain.ErrOrderNotFound),
		errors.Is(err, domain.ErrOrderGroupNotFound),
		errors.Is(err, domain.ErrAddressNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrOrderAlreadyExists):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, domain.ErrNotOrderStatusPaid),
		errors.Is(err, domain.ErrInsufficientStock),
		errors.Is(err, domain.ErrProductOffline),
		errors.Is(err, domain.ErrCartEmpty):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, domain.ErrMerchantMismatch):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrAuthFailed):
		return connect.NewError(connect.CodeUnauthenticated, err)
	default:
		return connect.NewError(connect.CodeUnknown, err)
	}
}
