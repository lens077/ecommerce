package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/payment/v1"
	"github.com/lens077/ecommerce/backend/services/payment/internal/biz"
	"go.uber.org/zap"
)

type stubPaymentRepo struct{ err error }

func (r stubPaymentRepo) CreatePayment(context.Context, *biz.CreatePaymentReq) (*biz.CreatePaymentResp, error) {
	return nil, r.err
}

func (r stubPaymentRepo) GetPaymentStatus(context.Context, *biz.GetPaymentStatusReq) (*biz.GetPaymentStatusResp, error) {
	return nil, r.err
}

func (r stubPaymentRepo) HandlePaymentNotify(context.Context, url.Values) (*biz.PaymentNotifyResp, error) {
	return nil, r.err
}

func (r stubPaymentRepo) HandlePaymentCallback(context.Context, *biz.PaymentCallbackReq) (*biz.PaymentCallbackResp, error) {
	return nil, r.err
}

func (r stubPaymentRepo) GetPaymentByOrderID(context.Context, *biz.GetPaymentByOrderIDRequest) (*biz.Payment, error) {
	return nil, r.err
}

func newPaymentSvc(err error) *PaymentService {
	return &PaymentService{uc: biz.NewPaymentUseCase(stubPaymentRepo{err: err}), log: zap.NewNop().Sugar()}
}

// 2026-09-23：参数错误用 gRPC status.Error 构造，connect 不认，被记成 rpc.code=unknown 按 ERROR 上报。
func TestCreatePayment_InvalidArgumentsAreNotUnknown(t *testing.T) {
	tests := []struct {
		name string
		req  *v1.CreatePaymentRequest
	}{
		{"用户 ID 非法", &v1.CreatePaymentRequest{CustomerId: "not-a-uuid", OrderId: 1}},
		{"订单 ID 为空", &v1.CreatePaymentRequest{CustomerId: uuid.NewString(), OrderId: 0}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newPaymentSvc(nil).CreatePayment(context.Background(), connect.NewRequest(tt.req))
			if got := connect.CodeOf(err); got != connect.CodeInvalidArgument {
				t.Fatalf("code = %v, want invalid_argument (err=%v)", got, err)
			}
		})
	}
}

// data 层返回的 connect 错误（当前全是 Unimplemented）必须原样透传，不能被外层包成 unknown。
func TestGetPaymentStatus_MapsRepoErrors(t *testing.T) {
	unimplemented := connect.NewError(connect.CodeUnimplemented, errors.New("not implemented yet"))
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"未实现原样透传", unimplemented, connect.CodeUnimplemented},
		{"包装过的 connect 错误", fmt.Errorf("repo: %w", unimplemented), connect.CodeUnimplemented},
		{"普通错误标为 unknown", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newPaymentSvc(tt.err).GetPaymentStatus(context.Background(), connect.NewRequest(&v1.GetPaymentStatusRequest{PaymentId: 1}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}
