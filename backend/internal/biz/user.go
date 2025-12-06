package biz

import (
	conf "connect-go-example/internal/conf/v1"
	"context"
	"errors"

	"go.uber.org/zap"
)

var ErrUserAlreadyExists = errors.New("user Already Exists")

// UserInfo 业务层用户模型
type UserInfo struct {
	ID           int64
	Username     string
	PasswordHash string
	Salt         string
	Email        string
	CreatedAt    string
}
type SignInRequest struct {
	Code  string
	State string
}
type SignInResponse struct {
	State string
	Data  string
}

// UserRepo 用户接口
type UserRepo interface {
	SignIn(ctx context.Context, req SignInRequest) (*SignInResponse, error)
}

type UserUseCase struct {
	repo UserRepo
	cfg  *conf.Auth
}

func NewUserUseCase(repo UserRepo, cfg *conf.Bootstrap, logger *zap.Logger) *UserUseCase {
	return &UserUseCase{
		repo: repo,
		cfg:  cfg.Auth,
	}
}

func (uc *UserUseCase) SignIn(ctx context.Context, req SignInRequest) (*SignInResponse, error) {
	return uc.repo.SignIn(ctx, req)
}
