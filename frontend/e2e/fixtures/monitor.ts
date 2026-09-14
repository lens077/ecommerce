/** Fixed control-tower health endpoint fixtures for browser-seam tests. */
import type { Page } from "@playwright/test";

export interface MonitorService {
  name: string;
  status: "healthy" | "degraded" | "unavailable" | "unknown";
  latency_ms: number | null;
  checked_at: string;
  reason?:
    | "dependency_unhealthy"
    | "timeout"
    | "no_instance"
    | "probe_failed"
    | "invalid_response"
    | "not_configured";
}

export interface MonitorHealthResponse {
  checked_at: string;
  services: MonitorService[];
}

export type MonitorStubResponse =
  | { status: 200; body: MonitorHealthResponse }
  | { status: 401 | 403 | 404 | 503; body?: Record<string, string> };

export const HEALTH_FIXTURE: MonitorHealthResponse = {
  checked_at: "2026-09-12T10:00:00Z",
  services: [
    {
      name: "user",
      status: "healthy",
      latency_ms: 18,
      checked_at: "2026-09-12T10:00:00Z",
    },
    {
      name: "order",
      status: "degraded",
      latency_ms: 245,
      checked_at: "2026-09-12T10:00:00Z",
      reason: "dependency_unhealthy",
    },
    {
      name: "payment",
      status: "unavailable",
      latency_ms: null,
      checked_at: "2026-09-12T10:00:00Z",
      reason: "timeout",
    },
  ],
};

export const COPILOT_HEALTH_FIXTURE: MonitorHealthResponse = {
  checked_at: "2026-09-12T10:00:00Z",
  services: [
    "user",
    "search",
    "behavior",
    "product",
    "cart",
    "address",
    "order",
    "inventory",
    "merchant",
    "payment",
  ].map((name) => ({
    name,
    status: "healthy" as const,
    latency_ms: 20,
    checked_at: "2026-09-12T10:00:00Z",
  })),
};

export const EMPTY_HEALTH_FIXTURE: MonitorHealthResponse = {
  checked_at: "2026-09-12T10:01:00Z",
  services: [],
};

export const RECOVERY_HEALTH_FIXTURE: MonitorHealthResponse = {
  checked_at: "2026-09-12T10:02:00Z",
  services: [
    {
      name: "catalog",
      status: "healthy",
      latency_ms: 32,
      checked_at: "2026-09-12T10:02:00Z",
    },
  ],
};

/** Route only the public control-tower HTTP seam, never app RPC paths. */
export async function stubMonitorHealth(page: Page, initial: MonitorStubResponse) {
  // Fixture changes follow user actions, not StrictMode-dependent request counts.
  let response = initial;
  await page.route(
    (url) => ["/api/admin/health/services", "/admin/health/services"].includes(url.pathname),
    async (route) => {
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(response.body ?? { code: "unavailable" }),
      });
    },
  );
  return (next: MonitorStubResponse) => {
    response = next;
  };
}

export const SERVICE_HEALTH_503: MonitorStubResponse = {
  status: 503,
  body: { code: "unavailable" },
};

export const SERVICE_HEALTH_403: MonitorStubResponse = {
  status: 403,
  body: { code: "permission_denied" },
};
