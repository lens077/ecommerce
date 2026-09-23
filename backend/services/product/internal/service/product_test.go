package service

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/product/v1"
	"github.com/lens077/ecommerce/backend/services/product/internal/biz"
	conf "github.com/lens077/ecommerce/backend/services/product/internal/conf/v1"
	"go.uber.org/zap"
)

type stubProductRepo struct{ err error }

func (r stubProductRepo) GetProductDetail(context.Context, biz.GetProductDetailRequest) (*biz.GetProductDetailResponse, error) {
	return nil, r.err
}

// 2026-09-23 线上日志：商品不存在时返回 rpc.code=unknown，被日志拦截器按 ERROR 上报。
func TestGetProductDetail_MapsBizErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"商品不存在", biz.ErrProductNotFound, connect.CodeNotFound},
		{"未知错误", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := biz.NewProductUseCase(stubProductRepo{err: tt.err}, &conf.Bootstrap{}, zap.NewNop())
			s := &ProductService{uc: uc}
			_, err := s.GetProductDetail(context.Background(), connect.NewRequest(&v1.GetProductDetailRequest{SpuCode: "SPU-404"}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}
