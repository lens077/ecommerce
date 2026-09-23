package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/user/v1"
	"github.com/lens077/ecommerce/backend/services/user/internal/biz"
	conf "github.com/lens077/ecommerce/backend/services/user/internal/conf/v1"
	"go.uber.org/zap"
)

type stubUserRepo struct{ err error }

func (r stubUserRepo) SignIn(context.Context, biz.SignInRequest) (*biz.SignInResponse, error) {
	return nil, r.err
}

func (r stubUserRepo) GetUserProfile(context.Context, biz.GetUserProfileRequest) (*biz.GetUserProfileResponse, error) {
	return nil, r.err
}

func newUserSvc(err error) *UserService {
	return &UserService{uc: biz.NewUserUseCase(stubUserRepo{err: err}, &conf.Bootstrap{}, zap.NewNop())}
}

// 2026-09-23：授权码无效（Casdoor invalid_grant）被映射成 internal，按「rpc system error」报 ERROR。
func TestSignIn_MapsBizErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"授权码无效", fmt.Errorf("%w: invalid_grant", biz.ErrAuthFailed), connect.CodeUnauthenticated},
		{"用户已存在", biz.ErrUserAlreadyExists, connect.CodeAlreadyExists},
		{"Casdoor 不可达", errors.New("casdoor get oauth token: dial tcp: connection refused"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newUserSvc(tt.err).SignIn(context.Background(), connect.NewRequest(&v1.SignInRequest{Code: "c", State: "s"}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}

// 2026-09-23：UserProfile 除 not_found 外原样返回，记成 unknown。
func TestUserProfile_MapsBizErrorsToRPCCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want connect.Code
	}{
		{"用户不存在", biz.ErrUserNotFound, connect.CodeNotFound},
		{"认证失败", biz.ErrAuthFailed, connect.CodeUnauthenticated},
		{"未知错误", errors.New("boom"), connect.CodeUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := newUserSvc(tt.err).UserProfile(context.Background(), connect.NewRequest(&v1.UserProfileRequest{}))
			if got := connect.CodeOf(err); got != tt.want {
				t.Fatalf("code = %v, want %v (err=%v)", got, tt.want, err)
			}
			if !errors.Is(err, tt.err) {
				t.Fatalf("errors.Is 链被切断: %v", err)
			}
		})
	}
}
