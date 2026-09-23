package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/order/v1"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/application"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain"
	"go.uber.org/zap"
)

// stubCommandRepo 只实现 CompleteOrder 用到的 GetOrderByNo；其余方法未覆写，被调到会 panic。
type stubCommandRepo struct {
	domain.OrderCommandRepo
	order *domain.OrderRoot
	err   error
}

func (r stubCommandRepo) GetOrderByNo(context.Context, string) (*domain.OrderRoot, error) {
	return r.order, r.err
}

// 2026-09-23：CompleteOrder 把所有错误覆盖成 internal——订单不存在、只能完成已付款订单
// 这类可预期的业务结果都被当作系统故障按 ERROR 上报（error-handling.md 点名的反例）。
func TestCompleteOrder_MapsDomainErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name  string
		order *domain.OrderRoot
		err   error
		want  connect.Code
		is    error
	}{
		{"订单不存在", nil, fmt.Errorf("query: %w", domain.ErrOrderNotFound), connect.CodeNotFound, domain.ErrOrderNotFound},
		{"订单未付款", &domain.OrderRoot{OrderStatus: constants.OrderStatusPendingPayment}, nil, connect.CodeFailedPrecondition, domain.ErrNotOrderStatusPaid},
		{"未知错误", nil, errors.New("boom"), connect.CodeUnknown, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := application.NewOrderCommandUseCase(stubCommandRepo{order: tt.order, err: tt.err}, zap.NewNop(), nil)
			s := &OrderService{cmd: cmd}
			_, err := s.CompleteOrder(context.Background(), connect.NewRequest(&v1.CompleteOrderRequest{OrderNo: "ORD-404"}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if tt.is != nil && !errors.Is(err, tt.is) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}

func TestOrderError_AuthFailedIsUnauthenticated(t *testing.T) {
	if got := connect.CodeOf(orderError(domain.ErrAuthFailed)); got != connect.CodeUnauthenticated {
		t.Fatalf("code = %v, want unauthenticated", got)
	}
}
