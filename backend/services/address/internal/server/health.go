package server

import (
	"context"

	"github.com/lens077/ecommerce/backend/services/address/internal/data"
)

type HealthStatus struct {
	Healthy bool              `json:"healthy"`
	Version string            `json:"version"`
	Build   string            `json:"build"`
	Details map[string]string `json:"details,omitempty"`
}

func healthStatus(ctx context.Context, deps *data.Data, version, build string) HealthStatus {
	details := make(map[string]string)
	healthy := true

	// 注册独立的检查项
	checks := map[string]func(context.Context) error{
		"postgres": deps.CheckDatabase,
		"redis":    deps.CheckCache,
	}

	for name, check := range checks {
		state := "ok"
		if err := check(ctx); err != nil {
			state = err.Error()
			healthy = false
		}
		details[name] = state
	}

	return HealthStatus{Healthy: healthy, Version: version, Build: build, Details: details}
}
