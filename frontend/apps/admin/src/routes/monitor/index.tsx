import { createFileRoute } from "@tanstack/react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Typography,
} from "@mui/material";
import { Activity } from "@ecommerce/icons";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { isServiceHealthAccessError, useServiceHealth } from "@/hooks/useServiceHealth";
import type { ServiceHealth, ServiceHealthStatus } from "@/api/monitor";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/monitor/")({
  component: MonitorPage,
});

const STATUS_COLORS: Record<ServiceHealthStatus, "success" | "warning" | "error" | "default"> = {
  healthy: "success",
  degraded: "warning",
  unavailable: "error",
  unknown: "default",
};

function MonitorPage() {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const { data, error, isLoading, isRefreshing, isStale, lastSuccessAt, refresh } =
    useServiceHealth();
  const accessError = isServiceHealthAccessError(error) ? error : undefined;
  const operationalError = error && !accessError ? error : undefined;
  const services = data?.services ?? [];
  const hasSnapshot = data !== undefined;
  const hasOperationalError = Boolean(operationalError);
  const showInitialLoading = isLoading && !hasSnapshot && !error;
  const showEmpty =
    !showInitialLoading && !accessError && !hasOperationalError && services.length === 0;

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1200 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 2,
            mb: 1,
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: "text.primary" }}>
            {t("monitor.title")}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            data-monitor="refresh"
            aria-label={t("monitor.refresh")}
            aria-busy={isRefreshing}
          >
            {isRefreshing ? t("monitor.refreshing") : t("monitor.refresh")}
          </Button>
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, maxWidth: "70ch" }}>
          {t("monitor.subtitle")}
        </Typography>

        {showInitialLoading && (
          <Box
            role="status"
            aria-live="polite"
            data-monitor="loading"
            sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, color: "text.secondary" }}
          >
            <CircularProgress size={18} aria-hidden="true" />
            <Typography variant="body2">{t("monitor.loading")}</Typography>
          </Box>
        )}

        {accessError && (
          <Alert
            severity={accessError.kind === "forbidden" ? "warning" : "info"}
            data-monitor="permission"
          >
            {t(`monitor.error.${accessError.kind}`)}
          </Alert>
        )}

        {operationalError && !hasSnapshot && (
          <Alert severity="error" data-monitor="error" sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <span>{t(`monitor.error.${operationalError.kind}`)}</span>
              <Button size="small" color="inherit" onClick={() => void refresh()}>
                {t("monitor.retry")}
              </Button>
            </Box>
          </Alert>
        )}

        {isStale && (
          <Alert severity="warning" data-monitor="stale" sx={{ mb: 2 }}>
            {t("monitor.stale", {
              time: lastSuccessAt
                ? formatDate(lastSuccessAt, "datetime")
                : t("monitor.unknownTime"),
            })}
          </Alert>
        )}

        {hasOperationalError && hasSnapshot && (
          <Alert severity="error" data-monitor="error" sx={{ mb: 2 }}>
            {t("monitor.error.refreshFailed")}
          </Alert>
        )}

        <Box
          component="ul"
          aria-label={t("monitor.gridLabel")}
          // data-copilot：智能助手锚点（src/copilot/actions.ts）
          data-copilot="monitor.health-grid"
          data-monitor="health-grid"
          sx={{
            listStyle: "none",
            p: 0,
            m: 0,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {services.map((service) => (
            <HealthCard
              key={`${service.name}-${service.checked_at}`}
              service={service}
              formatDate={formatDate}
              formatNumber={formatNumber}
              t={t}
            />
          ))}
        </Box>

        {showEmpty && (
          <Box
            data-monitor="empty"
            sx={{
              border: `1px dashed ${tokens.colors.border.default}`,
              borderRadius: 2,
              px: 3,
              py: 4,
              mt: 2,
              textAlign: "center",
            }}
          >
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t("monitor.empty.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("monitor.empty.description")}
            </Typography>
          </Box>
        )}

        <Typography
          component="p"
          variant="caption"
          data-monitor="sampling-note"
          sx={{ display: "block", color: "text.secondary", mt: 3 }}
        >
          {t("monitor.samplingNote")}
        </Typography>
      </Box>
    </AdminLayout>
  );
}

interface HealthCardProps {
  service: ServiceHealth;
  formatDate: (
    value: Date | number | string | null | undefined,
    style?: "date" | "datetime" | "time",
  ) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function HealthCard({ service, formatDate, formatNumber, t }: HealthCardProps) {
  const statusLabel = t(`monitor.status.${service.status}`);
  return (
    <Card
      component="li"
      data-copilot="monitor.health-card"
      data-monitor="health-card"
      aria-label={t("monitor.cardLabel", { name: service.name, status: statusLabel })}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
          <Box sx={{ color: tokens.colors.text.secondary, display: "flex" }}>
            <Activity size={18} aria-hidden="true" />
          </Box>
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
          >
            {service.name}
          </Typography>
          <Chip
            size="small"
            color={STATUS_COLORS[service.status]}
            label={statusLabel}
            data-monitor="status"
            aria-label={statusLabel}
          />
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {service.latency_ms === null
            ? t("monitor.latencyUnavailable")
            : t("monitor.latency", { ms: formatNumber(service.latency_ms) })}
        </Typography>
        {service.reason && (
          <Typography
            variant="body2"
            data-monitor="reason"
            sx={{ color: "text.secondary", mt: 0.5 }}
          >
            {t(`monitor.reason.${service.reason}`)}
          </Typography>
        )}
        <Typography
          variant="caption"
          data-monitor="checked-at"
          sx={{ display: "block", mt: 1.5, color: "text.secondary" }}
        >
          {t("monitor.checkedAt", { time: formatDate(service.checked_at, "datetime") })}
        </Typography>
      </CardContent>
    </Card>
  );
}
