package model

import (
	"context"
	"errors"
)

var ErrUserAlreadyExists = errors.New("user Already Exists")

// User 业务层用户模型
type User struct {
	ID           int64
	Username     string
	PasswordHash string
	Salt         string
	Email        string
	CreatedAt    string
}

// AuthChallenge 认证挑战
type AuthChallenge struct {
	Username  string
	Challenge string
	Salt      string
}

// AuthResult 认证结果
type AuthResult struct {
	Code      string
	State     string
	AuthToken string
}

// UserUseCase 用户用例接口
type UserUseCase interface {
	Register(ctx context.Context, username, passwordHash, email, salt string) (string, error)
	GetAuthChallenge(ctx context.Context, username string) (*AuthChallenge, error)
	SubmitAuth(ctx context.Context, username, hashedCredential, authRequestID, challengeResponse string) (*AuthResult, error)
}
