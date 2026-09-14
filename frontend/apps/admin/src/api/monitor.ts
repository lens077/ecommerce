import { getAppFetch, getGatewayBaseUrl } from "@ecommerce/api";

const HEALTH_PATH = "/admin/health/services";
const SERVICE_STATUSES = ["healthy", "degraded", "unavailable", "unknown"] as const;
const SERVICE_REASONS = [
  "dependency_unhealthy",
  "timeout",
  "no_instance",
  "probe_failed",
  "invalid_response",
  "not_configured",
] as const;

export type ServiceHealthStatus = (typeof SERVICE_STATUSES)[number];
export type ServiceHealthReason = (typeof SERVICE_REASONS)[number];

export interface ServiceHealth {
  name: string;
  status: ServiceHealthStatus;
  latency_ms: number | null;
  checked_at: string;
  reason?: ServiceHealthReason;
}

export interface ServiceHealthSnapshot {
  checked_at: string;
  services: ServiceHealth[];
}

export type ServiceHealthErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "unavailable"
  | "timeout"
  | "request_failed"
  | "invalid_response";

/** Safe, status-only error for the local gateway diagnostics endpoint. */
export class ServiceHealthError extends Error {
  readonly kind: ServiceHealthErrorKind;
  readonly status: number | null;

  constructor(kind: ServiceHealthErrorKind, status: number | null = null) {
    super(kind);
    this.name = "ServiceHealthError";
    this.kind = kind;
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

const normalizeStatus = (value: unknown): ServiceHealthStatus =>
  SERVICE_STATUSES.includes(value as ServiceHealthStatus)
    ? (value as ServiceHealthStatus)
    : "unknown";

const parseServiceHealth = (value: unknown): ServiceHealth | null => {
  if (!isRecord(value)) return null;
  const { name, status, latency_ms, checked_at, reason } = value;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    (latency_ms !== null &&
      (typeof latency_ms !== "number" || !Number.isFinite(latency_ms) || latency_ms < 0)) ||
    !isTimestamp(checked_at)
  ) {
    return null;
  }
  return {
    name,
    status: normalizeStatus(status),
    latency_ms,
    checked_at,
    ...(SERVICE_REASONS.includes(reason as ServiceHealthReason)
      ? { reason: reason as ServiceHealthReason }
      : {}),
  };
};

const parseServiceHealthSnapshot = (value: unknown): ServiceHealthSnapshot | null => {
  if (!isRecord(value) || !isTimestamp(value.checked_at) || !Array.isArray(value.services)) {
    return null;
  }
  const services = value.services.map(parseServiceHealth);
  return services.every((service): service is ServiceHealth => service !== null)
    ? { checked_at: value.checked_at, services }
    : null;
};

const errorKindForStatus = (status: number): ServiceHealthErrorKind => {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 503) return "unavailable";
  return "request_failed";
};

/** Fetches the gateway's single-path service health sample without exposing upstream details. */
export async function fetchServiceHealth(
  options: { signal?: AbortSignal } = {},
): Promise<ServiceHealthSnapshot> {
  const baseUrl = getGatewayBaseUrl().replace(/\/+$/, "");
  const deadline = AbortSignal.timeout(8000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const checkCancellation = () => {
    if (options.signal?.aborted) throw options.signal.reason;
    if (deadline.aborted) throw new ServiceHealthError("timeout");
  };
  let response: Response;
  try {
    response = await getAppFetch()(`${baseUrl}${HEALTH_PATH}`, {
      credentials: "include",
      signal,
    });
  } catch {
    checkCancellation();
    throw new ServiceHealthError("request_failed");
  }

  if (!response.ok) {
    throw new ServiceHealthError(errorKindForStatus(response.status), response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    checkCancellation();
    throw new ServiceHealthError("invalid_response", response.status);
  }

  const snapshot = parseServiceHealthSnapshot(payload);
  if (!snapshot) {
    throw new ServiceHealthError("invalid_response", response.status);
  }
  return snapshot;
}
