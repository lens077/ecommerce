package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/cart/v1"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
	"go.uber.org/zap"
)

type stubCartRepo struct{ err error }

func (r stubCartRepo) AddProductToCart(context.Context, biz.AddProductToCartRequest) (*biz.AddProductToCartResponse, error) {
	return nil, r.err
}

func (r stubCartRepo) RemoveCartItem(context.Context, biz.RemoveCartItemRequest) (*biz.RemoveCartItemResponse, error) {
	return nil, r.err
}

func (r stubCartRepo) UpdateCartItemQuantity(context.Context, biz.UpdateCartItemQuantityRequest) (*biz.UpdateCartItemQuantityResponse, error) {
	return nil, r.err
}

func (r stubCartRepo) GetCart(context.Context, biz.GetCartRequest) (*biz.GetCartResponse, error) {
	return nil, r.err
}

func newCartSvc(err error) *CartService {
	return &CartService{uc: biz.NewCartUseCase(stubCartRepo{err: err}), log: zap.NewNop()}
}

func getCartReq(userID string) *connect.Request[v1.GetCartRequest] {
	req := connect.NewRequest(&v1.GetCartRequest{})
	req.Header().Set(constants.UserIdMetadataKey, userID)
	return req
}

// 2026-09-23：缺用户身份、非法购物车状态都以 rpc.code=unknown 返回，被日志拦截器按 ERROR 上报。
func TestGetCart_MapsErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name   string
		userID string
		err    error
		want   connect.Code
	}{
		{"缺用户身份", "", nil, connect.CodeUnauthenticated},
		{"非法购物车状态", uuid.NewString(), fmt.Errorf("%w: x", biz.ErrInvalidCartStatus), connect.CodeInvalidArgument},
		{"未知错误", uuid.NewString(), errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newCartSvc(tt.err).GetCart(context.Background(), getCartReq(tt.userID))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if tt.err != nil && !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}
