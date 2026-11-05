package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connectinprocess"
	v1 "github.com/lens077/ecommerce/backend/api/address/v1"
	"github.com/lens077/ecommerce/backend/api/address/v1/addressv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
)

type stubAddressRepo struct{ err error }

func (r stubAddressRepo) CreateAddress(context.Context, biz.CreateAddressRequest) (*biz.CreateAddressResponse, error) {
	return nil, r.err
}

func (r stubAddressRepo) UpdateAddress(context.Context, biz.UpdateAddressRequest) (*biz.UpdateAddressResponse, error) {
	return nil, r.err
}

func (r stubAddressRepo) DeleteAddress(context.Context, biz.DeleteAddressRequest) (*biz.DeleteAddressResponse, error) {
	return nil, r.err
}

func (r stubAddressRepo) GetAddress(context.Context, biz.GetAddressRequest) (*biz.GetAddressResponse, error) {
	return nil, r.err
}

func (r stubAddressRepo) ListAddresses(context.Context, biz.ListAddressesRequest) (*biz.ListAddressesResponse, error) {
	return nil, r.err
}

func (r stubAddressRepo) SetDefaultAddress(context.Context, biz.SetDefaultAddressRequest) (*biz.SetDefaultAddressResponse, error) {
	return nil, r.err
}

// 2026-09-23：地址不存在、地址 ID 非法都以 rpc.code=unknown 返回，被日志拦截器按 ERROR 上报。
func TestGetAddress_MapsBizErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"地址不存在", fmt.Errorf("%w: no rows", biz.ErrAddressNotFound), connect.CodeNotFound},
		{"地址 ID 非法", fmt.Errorf("%w: bad uuid", biz.ErrInvalidAddressID), connect.CodeInvalidArgument},
		{"未知错误", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &AddressService{uc: biz.NewAddressUseCase(stubAddressRepo{err: tt.err})}
			_, err := s.GetAddress(context.Background(), &v1.GetAddressRequest{AddressId: "x"})
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}

// 与 CreateAddress 保持一致：请求头里没有可信用户 ID 是鉴权问题，不是 unknown。
// v2 拿不到请求包装对象，身份走 CallInfo——所以这条测试改走内存传输，
// 让客户端 header 经真实 CallInfo 传播，而不是直调 handler 伪造头。
func TestListAddresses_InvalidUserIDIsUnauthenticated(t *testing.T) {
	svc := &AddressService{uc: biz.NewAddressUseCase(stubAddressRepo{})}
	server := connect.NewServer()
	addressv1connect.RegisterAddressServiceHandler(server, svc)
	client := addressv1connect.NewAddressServiceClient(connect.NewClient(connectinprocess.New(server)))

	ctx, info := connect.NewClientContext(t.Context())
	info.RequestHeader().Set(constants.UserIdMetadataKey, "not-a-uuid")
	_, err := client.ListAddresses(ctx, &v1.ListAddressesRequest{})
	if got := connect.CodeOf(err); got != connect.CodeUnauthenticated {
		t.Fatalf("code = %v, want unauthenticated (err=%v)", got, err)
	}
}
