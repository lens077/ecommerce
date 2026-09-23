package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	inventoryv1 "github.com/lens077/ecommerce/backend/api/inventory/v1"
	"github.com/lens077/ecommerce/backend/services/inventory/internal/biz"
	"go.uber.org/zap"
)

type stubRepo struct{ err error }

func (r stubRepo) Reserve(context.Context, biz.ReserveRequest) (*biz.ReserveResponse, error) {
	return nil, r.err
}

func (r stubRepo) ReleaseReserve(context.Context, biz.ReleaseReserveRequest) (*biz.ReleaseReserveResponse, error) {
	return nil, r.err
}

// 2026-09-23 线上日志：SKU 没有库存记录时 Reserve 返回 rpc.code=unknown，
// 被日志拦截器当成「rpc system error」按 ERROR 上报。业务结果必须映射成具体错误码。
func TestReserve_MapsBizErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"sku 无库存记录", fmt.Errorf("%w: sku_id=42", biz.ErrOrderItemsSkuIdNotFound), connect.CodeNotFound},
		{"库存不足", fmt.Errorf("%w: sku_id=42", biz.ErrInsufficientStock), connect.CodeFailedPrecondition},
		{"order_no 重复", biz.ErrOrderAlreadyExists, connect.CodeAlreadyExists},
		{"未知错误", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &InventoryService{uc: biz.NewInventoryUseCase(stubRepo{err: tt.err}, zap.NewNop())}
			_, err := s.Reserve(context.Background(), connect.NewRequest(&inventoryv1.ReserveRequest{
				OrderNo:    "ORD-1",
				MerchantId: uuid.NewString(),
				Items:      []*inventoryv1.ReserveItem{{SkuId: 42, Quantity: 1}},
			}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}

func TestReserve_InvalidMerchantID(t *testing.T) {
	s := &InventoryService{uc: biz.NewInventoryUseCase(stubRepo{}, zap.NewNop())}
	_, err := s.Reserve(context.Background(), connect.NewRequest(&inventoryv1.ReserveRequest{
		OrderNo:    "ORD-1",
		MerchantId: "not-a-uuid",
		Items:      []*inventoryv1.ReserveItem{{SkuId: 42, Quantity: 1}},
	}))
	if got := connect.CodeOf(err); got != connect.CodeInvalidArgument {
		t.Fatalf("code = %v, want invalid_argument (err=%v)", got, err)
	}
}
