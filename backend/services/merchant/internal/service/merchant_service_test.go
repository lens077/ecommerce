package service

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/merchant/v1"
	"github.com/lens077/ecommerce/backend/pkg/identity"
	"github.com/lens077/ecommerce/backend/services/merchant/internal/biz"
)

type stubMerchantRepo struct {
	biz.MerchantRepo // 未覆写的方法被调到会 panic，测试只走 GetApplication
	err              error
}

func (r stubMerchantRepo) GetApplication(context.Context, *biz.GetApplicationRequest) (*biz.GetApplicationResponse, error) {
	return nil, r.err
}

// 2026-09-23：申请单不存在时 data 层已转成 ErrApplicationIdNotFound，service 层原样返回，
// connect 记成 rpc.code=unknown，被日志拦截器按 ERROR 上报。
func TestGetApplication_MapsBizErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"申请单不存在", biz.ErrApplicationIdNotFound, connect.CodeNotFound},
		{"未知错误", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &MerchantService{uc: biz.NewMerchantUseCase(stubMerchantRepo{err: tt.err})}
			_, err := s.GetApplication(context.Background(), connect.NewRequest(&v1.GetApplicationRequest{ApplicationId: "app-404"}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}

// 审批 RPC 的授权必须发生在业务逻辑之前，且判的是「主体是否 admin」而不是网关放没放行。
// uc 故意留 nil：若授权没先拦住，用例会因空指针 panic 而失败。
func TestApproveApplication_RequiresAdminBeforeUseCase(t *testing.T) {
	s := &MerchantService{}
	const user = "11111111-1111-4111-8111-111111111111"

	cases := []struct {
		name   string
		userID string
		anon   string
		roles  string
		want   connect.Code
	}{
		{"merchant 角色被拒", user, "", "merchant", connect.CodePermissionDenied},
		{"无角色被拒", user, "", "", connect.CodePermissionDenied},
		{"访客被拒", user, "true", "admin", connect.CodeUnauthenticated},
		{"无身份被拒", "", "", "admin", connect.CodeUnauthenticated},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := connect.NewRequest(&v1.ApproveApplicationRequest{ApplicationId: "app-1"})
			if c.userID != "" {
				req.Header().Set(identity.HeaderUserID, c.userID)
			}
			if c.anon != "" {
				req.Header().Set(identity.HeaderAnonymous, c.anon)
			}
			if c.roles != "" {
				req.Header().Set(identity.HeaderRole, c.roles)
			}
			_, err := s.ApproveApplication(context.Background(), req)
			if got := connect.CodeOf(err); got != c.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, c.want, err)
			}
		})
	}
}
