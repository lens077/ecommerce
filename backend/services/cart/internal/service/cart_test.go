package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connectinprocess"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/cart/v1"
	"github.com/lens077/ecommerce/backend/api/cart/v1/cartv1connect"
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

// getCartClient 起一个内存传输的 cart 客户端;userID 非空时写进客户端请求头,
// 经 CallInfo 传播到服务端——v2 的身份不再挂在请求消息上。
func getCartClient(t *testing.T, repoErr error, userID string) (context.Context, cartv1connect.CartServiceClient) {
	t.Helper()
	svc := &CartService{uc: biz.NewCartUseCase(stubCartRepo{err: repoErr}), log: zap.NewNop()}
	server := connect.NewServer()
	cartv1connect.RegisterCartServiceHandler(server, svc)
	client := cartv1connect.NewCartServiceClient(connect.NewClient(connectinprocess.New(server)))
	ctx, info := connect.NewClientContext(t.Context())
	if userID != "" {
		info.RequestHeader().Set(constants.UserIdMetadataKey, userID)
	}
	return ctx, client
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
			ctx, client := getCartClient(t, tt.err, tt.userID)
			_, err := client.GetCart(ctx, &v1.GetCartRequest{})
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if tt.err != nil && !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}
