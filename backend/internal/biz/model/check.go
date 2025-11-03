package model

import "context"

type CheckUseCase interface {
	Ready(ctx context.Context, req HealthCheckReq) (HealthCheckReply, error)
}
type (
	HealthCheckReq   struct{}
	HealthCheckReply struct {
		Status  string
		Details map[string]string
	}
)
