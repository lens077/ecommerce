package server

import (
	"context"

	"github.com/lens077/ecommerce/backend/services/behavior/internal/data"
)

type HealthStatus struct {
	Healthy bool              `json:"healthy"`
	Details map[string]string `json:"details,omitempty"`
}

func healthStatus(ctx context.Context, deps *data.Data) HealthStatus {
	details := make(map[string]string)
	healthy := true

	checks := map[string]func(context.Context) error{
		"postgres": deps.CheckDatabase,
		"redis":    deps.CheckCache,
		"gorse":    deps.CheckGorse,
	}

	for name, check := range checks {
		state := "ok"
		if err := check(ctx); err != nil {
			state = err.Error()
			healthy = false
		}
		details[name] = state
	}

	return HealthStatus{Healthy: healthy, Details: details}
}
