package biz

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"connect-go-example/internal/biz/model"
	conf "connect-go-example/internal/conf/v1"
	"connect-go-example/internal/data"

	"connectrpc.com/connect"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

type UserUseCase struct {
	repo   data.UserRepo
	cfg    *conf.Auth
	secret []byte
}

func NewUserUseCase(repo data.UserRepo, cfg *conf.Bootstrap, logger *zap.Logger) (model.UserUseCase, error) {
	var secret []byte
	if cfg.Auth.JwtSecret != "" {
		secret = []byte(cfg.Auth.JwtSecret)
	} else {
		// 生成默认密钥
		secret = make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			return nil, fmt.Errorf("generate jwt secret failed: %v", err)
		}
		logger.Warn("WARNING: Using auto-generated JWT secret, set auth.jwt_secret in config for production")
	}

	return &UserUseCase{
		repo:   repo,
		cfg:    cfg.Auth,
		secret: secret,
	}, nil
}

func (uc *UserUseCase) Register(ctx context.Context, username, passwordHash, email, salt string) (string, error) {
	// 检查用户是否已存在
	existingUser, err := uc.repo.GetUserByName(ctx, username)
	if err == nil && existingUser != nil {
		return "", connect.NewError(connect.CodeAlreadyExists, errors.New("user already exists"))
	}

	// 创建用户
	userID, err := uc.repo.CreateUser(ctx, &model.User{
		Username:     username,
		PasswordHash: passwordHash,
		Email:        email,
		Salt:         salt,
	})
	if err != nil {
		return "", connect.NewError(connect.CodeInternal, err)
	}

	return fmt.Sprintf("%d", userID), nil
}

func (uc *UserUseCase) GetAuthChallenge(ctx context.Context, username string) (*model.AuthChallenge, error) {
	// 获取用户信息
	user, err := uc.repo.GetUserByName(ctx, username)
	if err != nil {
		// 返回通用错误避免用户枚举
		return nil, errors.New("authentication failed")
	}

	// 生成随机挑战
	challenge := make([]byte, 32)
	if _, err := rand.Read(challenge); err != nil {
		return nil, fmt.Errorf("generate challenge failed: %v", err)
	}
	challengeStr := base64.StdEncoding.EncodeToString(challenge)

	// 存储挑战到缓存
	timeout := time.Duration(uc.cfg.ChallengeTimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 2 * time.Minute // 默认2分钟
	}

	if err := uc.repo.StoreAuthChallenge(ctx, username, challengeStr, timeout); err != nil {
		return nil, fmt.Errorf("store auth challenge failed: %v", err)
	}

	return &model.AuthChallenge{
		Username:  username,
		Challenge: challengeStr,
		Salt:      user.Salt,
	}, nil
}

func (uc *UserUseCase) SubmitAuth(ctx context.Context, username, hashedCredential, authRequestID, challengeResponse string) (*model.AuthResult, error) {
	// 验证挑战响应
	expectedChallenge, err := uc.repo.GetAuthChallenge(ctx, username)
	if err != nil {
		return nil, errors.New("invalid or expired challenge")
	}

	// 计算期望的挑战响应
	expectedResponse := computeChallengeResponse(expectedChallenge, username)
	if challengeResponse != expectedResponse {
		return nil, errors.New("invalid challenge response")
	}

	// 获取用户信息
	user, err := uc.repo.GetUserByName(ctx, username)
	if err != nil {
		return nil, errors.New("authentication failed")
	}

	// 验证凭证
	if !constantTimeCompare(hashedCredential, user.PasswordHash) {
		return nil, errors.New("authentication failed")
	}

	// 生成JWT令牌
	token, err := uc.generateJWT(user.ID, username)
	if err != nil {
		return nil, fmt.Errorf("generate token failed: %v", err)
	}

	return &model.AuthResult{
		Code:      "success",
		State:     "authenticated",
		AuthToken: token,
	}, nil
}

func (uc *UserUseCase) generateJWT(userID int64, username string) (string, error) {
	expireHours := uc.cfg.JwtExpireHours
	if expireHours == 0 {
		expireHours = 24 // 默认24小时
	}

	claims := jwt.MapClaims{
		"sub": userID,
		"usr": username,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(time.Duration(expireHours) * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(uc.secret)
}

func computeChallengeResponse(challenge, username string) string {
	str := fmt.Sprintf("%s:%s:%d", challenge, username, time.Now().Unix()/30)
	hash := sha256.Sum256([]byte(str))
	return hex.EncodeToString(hash[:])
}

func constantTimeCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}

	result := 0
	for i := 0; i < len(a); i++ {
		result |= int(a[i]) ^ int(b[i])
	}
	return result == 0
}
