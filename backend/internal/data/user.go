package data

import (
	"connect-go-example/internal/biz"
	"connect-go-example/internal/data/models"
	"context"
	"errors"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var _ biz.UserRepo = (*userRepo)(nil)

type userRepo struct {
	queries *models.Queries
	rdb     *redis.Client
	auth    *casdoorsdk.Client
	l       *zap.Logger
}

func NewUserRepo(data *Data, logger *zap.Logger) biz.UserRepo {
	return &userRepo{
		queries: models.New(data.db),
		rdb:     data.rdb,
		auth:    data.auth,
		l:       logger,
	}
}

func (u userRepo) SignIn(ctx context.Context, req biz.SignInRequest) (biz.SignInResponse, error) {
	if u.auth == nil {
		return biz.SignInResponse{}, errors.New("auth client is nil")
	}
	token, err := u.auth.GetOAuthToken(req.Code, req.State)
	if err != nil {
		return biz.SignInResponse{}, err
	}
	return biz.SignInResponse{
		State: "ok",
		Data:  token.AccessToken,
	}, err
}
