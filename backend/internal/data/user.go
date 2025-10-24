package data

import (
	"context"
	"fmt"
	"time"

	"connect-go-example/internal/biz/model"
	"connect-go-example/internal/data/models"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// UserRepo 用户数据访问接口
type UserRepo interface {
	GetUserByName(ctx context.Context, username string) (*model.User, error)
	CreateUser(ctx context.Context, user *model.User) (int64, error)
	StoreAuthChallenge(ctx context.Context, username, challenge string, timeout time.Duration) error
	GetAuthChallenge(ctx context.Context, username string) (string, error)
}

type userRepo struct {
	queries *models.Queries
	rdb     *redis.Client
	l       *zap.Logger
}

func NewUserRepo(data *Data, logger *zap.Logger) UserRepo {
	return &userRepo{
		queries: models.New(data.db),
		rdb:     data.rdb,
		l:       logger,
	}
}

func (r *userRepo) GetUserByName(ctx context.Context, username string) (*model.User, error) {
	dbUser, err := r.queries.GetUserByName(ctx, username)
	if err != nil {
		return nil, err
	}

	return &model.User{
		ID:           int64(dbUser.ID),
		Username:     dbUser.Username,
		PasswordHash: dbUser.PasswordHash,
		Salt:         dbUser.Salt,
		// Email:        dbUser.Email,
		// CreatedAt:    dbUser.CreatedAt.Time().Format(time.RFC3339),
	}, nil
}

func (r *userRepo) CreateUser(ctx context.Context, req *model.User) (int64, error) {
	params := models.CreateUserParams{
		Username:     req.Username,
		PasswordHash: req.PasswordHash,
		Salt:         req.Salt,
		// Email:        user.Email,
	}

	user, err := r.queries.CreateUser(ctx, params)
	if err != nil {
		return 0, err
	}

	return int64(user.ID), nil
}

func (r *userRepo) StoreAuthChallenge(ctx context.Context, username, challenge string, timeout time.Duration) error {
	key := fmt.Sprintf("auth_challenge:%s", username)
	return r.rdb.SetEx(ctx, key, challenge, timeout).Err()
}

func (r *userRepo) GetAuthChallenge(ctx context.Context, username string) (string, error) {
	key := fmt.Sprintf("auth_challenge:%s", username)
	challenge, err := r.rdb.GetDel(ctx, key).Result()
	if err != nil {
		return "", err
	}
	return challenge, nil
}
