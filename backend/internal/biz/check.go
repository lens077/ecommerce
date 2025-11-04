package biz

import (
	"context"

	"connect-go-example/internal/biz/model"
	"connect-go-example/internal/data"
)

type CheckUseCase struct {
	repo data.CheckRepo
}

func NewCheckUseCase(repo data.CheckRepo) (model.CheckUseCase, error) {
	return &CheckUseCase{
		repo: repo,
	}, nil
}

func (c CheckUseCase) Ready(ctx context.Context, req model.HealthCheckReq) (model.HealthCheckReply, error) {
	reply, err := c.repo.Ready(ctx, req)
	if err != nil {
		return model.HealthCheckReply{}, err
	}
	return model.HealthCheckReply{
		Status:  reply.Status,
		Details: reply.Details,
	}, nil
}
