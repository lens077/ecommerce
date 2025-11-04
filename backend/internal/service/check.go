package service

import (
	"context"

	v1 "connect-go-example/api/check/v1"
	"connect-go-example/api/check/v1/checkv1connect"
	"connect-go-example/internal/biz/model"

	"connectrpc.com/connect"
)

var _ checkv1connect.CheckServiceHandler = (*CheckService)(nil)

type CheckService struct {
	uc model.CheckUseCase
}

func NewCheckService(uc model.CheckUseCase) checkv1connect.CheckServiceHandler {
	return &CheckService{
		uc: uc,
	}
}

func (c *CheckService) Ready(ctx context.Context, _ *connect.Request[v1.ReadyCheckReq]) (*connect.Response[v1.ReadyCheckReply], error) {
	ready, err := c.uc.Ready(ctx, model.HealthCheckReq{})
	if err != nil {
		return nil, err
	}
	reply := &v1.ReadyCheckReply{
		Status:  ready.Status,
		Details: ready.Details,
	}
	return connect.NewResponse(reply), err
}
