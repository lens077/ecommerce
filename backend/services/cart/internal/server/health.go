package server

import (
	"context"

	"github.com/lens077/ecommerce/backend/services/cart/internal/data"
)

type HealthStatus struct {
	Healthy bool              `json:"healthy"`
	Version string            `json:"version"`
	Build   string            `json:"build"`
	Details map[string]string `json:"details,omitempty"`
	// Warnings 列出已推送但没能生效的连接配置：新配置重建失败，旧连接仍在服务。
	// 它不影响 Healthy——所有副本收到同一份配置、同样失败，判不健康会同时摘掉全部副本，
	// 或把它们重启进那份坏配置。发现它要看这里或指标 connectkit_config_stale。
	Warnings map[string]string `json:"warnings,omitempty"`
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

	warnings := make(map[string]string)
	for name, err := range deps.StaleConfig() {
		if err != nil {
			warnings[name] = err.Error()
		}
	}

	return HealthStatus{Healthy: healthy, Version: version, Build: build, Details: details, Warnings: warnings}
}
