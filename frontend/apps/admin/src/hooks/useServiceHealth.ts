import { useQuery } from "@tanstack/react-query";
import { fetchServiceHealth, ServiceHealthError, type ServiceHealthSnapshot } from "@/api/monitor";

export const SERVICE_HEALTH_QUERY_KEY = ["admin", "service-health"] as const;
const REFRESH_INTERVAL_MS = 10_000;

interface DeniedHealthResult {
  kind: "denied";
  error: ServiceHealthError;
}

type ServiceHealthQueryData = ServiceHealthSnapshot | DeniedHealthResult;

export interface ServiceHealthQueryState {
  data: ServiceHealthSnapshot | undefined;
  error: ServiceHealthError | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  lastSuccessAt: number | null;
  refresh: () => Promise<unknown>;
}

const isSensitiveAccessError = (error: unknown): error is ServiceHealthError =>
  error instanceof ServiceHealthError &&
  (error.kind === "unauthenticated" || error.kind === "forbidden");

const isDeniedHealthResult = (value: ServiceHealthQueryData): value is DeniedHealthResult =>
  "kind" in value && value.kind === "denied";

export function useServiceHealth(): ServiceHealthQueryState {
  const query = useQuery<ServiceHealthQueryData>({
    queryKey: SERVICE_HEALTH_QUERY_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await fetchServiceHealth({ signal });
      } catch (error) {
        // Replace a previous snapshot with an explicit denied result so sensitive data
        // cannot remain in cache while the permission state stays stable on screen.
        if (isSensitiveAccessError(error)) return { kind: "denied", error };
        throw error;
      }
    },
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const denied = query.data && isDeniedHealthResult(query.data) ? query.data : undefined;
  const data = query.data && !isDeniedHealthResult(query.data) ? query.data : undefined;
  const error =
    (query.error instanceof ServiceHealthError ? query.error : undefined) ?? denied?.error;

  return {
    data,
    error,
    isLoading: query.isPending && !query.data,
    isRefreshing: query.isFetching,
    isStale: Boolean(query.error && data),
    // The gateway's checked_at is the sample time; dataUpdatedAt is only the cache write time.
    lastSuccessAt: data ? Date.parse(data.checked_at) : null,
    refresh: query.refetch,
  };
}

export function isServiceHealthAccessError(error: ServiceHealthError | undefined): boolean {
  return isSensitiveAccessError(error);
}
