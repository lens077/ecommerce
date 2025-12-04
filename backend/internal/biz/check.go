package biz

import (
	"context"
)

type CheckRepo interface {
	Ready(ctx context.Context, req HealthCheckReq) (HealthCheckReply, error)
}
type (
	HealthCheckReq   struct{}
	HealthCheckReply struct {
		Status  string
		Details map[string]string
	}
)

type CheckUseCase struct {
	repo CheckRepo
}

func NewCheckUseCase(repo CheckRepo) *CheckUseCase {
	return &CheckUseCase{
		repo: repo,
	}
}

func (c CheckUseCase) Ready(ctx context.Context, req HealthCheckReq) (*HealthCheckReply, error) {
	reply, err := c.repo.Ready(ctx, req)
	if err != nil {
		return nil, err
	}
	return &HealthCheckReply{
		Status:  reply.Status,
		Details: reply.Details,
	}, nil
}
