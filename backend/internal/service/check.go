package service

import (
	"connect-go-example/internal/biz"
	"context"

	v1 "connect-go-example/api/check/v1"
	"connect-go-example/api/check/v1/checkv1connect"

	"connectrpc.com/connect"
)

var _ checkv1connect.CheckServiceHandler = (*CheckService)(nil)

type CheckService struct {
	uc *biz.CheckUseCase
}

func NewCheckService(uc *biz.CheckUseCase) checkv1connect.CheckServiceHandler {
	return &CheckService{
		uc: uc,
	}
}

func (c *CheckService) Ready(ctx context.Context, _ *connect.Request[v1.ReadyCheckReq]) (*connect.Response[v1.ReadyCheckReply], error) {
	ready, err := c.uc.Ready(ctx, biz.HealthCheckReq{})
	if err != nil {
		return nil, err
	}
	reply := &v1.ReadyCheckReply{
		Status:  ready.Status,
		Details: ready.Details,
	}
	return connect.NewResponse(reply), err
}
