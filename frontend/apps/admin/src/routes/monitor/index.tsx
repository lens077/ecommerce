/**
 * 服务监控页（第一期只放健康卡片，设计 docs/design/copilot/copilot.md §5.3）。
 *
 * 服务清单照抄 .service-matrix.yaml 的 10 个业务服务（拓扑真相源在那边，这里不能 import yaml，
 * 加删服务时同步改 SERVICES）。状态数据源尚未接入：网关是否向前端暴露各服务的 readyz 聚合
 * 还没核实，核实前一律显示「未接入」，不显示假数据。
 */

import { createFileRoute } from "@tanstack/react-router";
import { Box, Card, CardContent, Chip, Typography } from "@mui/material";
import { Activity } from "@ecommerce/icons";
import { useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/monitor/")({
  component: MonitorPage,
});

/** 与 .service-matrix.yaml `services.<name>.gateway_prefix` 一致 */
const SERVICES = [
  { name: "user", prefix: "/user*" },
  { name: "search", prefix: "/search*" },
  { name: "behavior", prefix: "/behavior*" },
  { name: "product", prefix: "/product*" },
  { name: "cart", prefix: "/cart*" },
  { name: "address", prefix: "/address*" },
  { name: "order", prefix: "/order*" },
  { name: "inventory", prefix: "/inventory*" },
  { name: "merchant", prefix: "/merchant*" },
  { name: "payment", prefix: "/payment*" },
] as const;

function MonitorPage() {
  const { t } = useTranslation();

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1200 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 700, color: "text.primary", mb: 1 }}
        >
          {t("monitor.title")}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
          {t("monitor.subtitle")}
        </Typography>

        <Box
          component="ul"
          aria-label={t("monitor.gridLabel")}
          // data-copilot：智能助手锚点（src/copilot/actions.ts）
          data-copilot="monitor.health-grid"
          sx={{
            listStyle: "none",
            p: 0,
            m: 0,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {SERVICES.map((svc) => (
            <Card component="li" key={svc.name} data-copilot="monitor.health-card">
              <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                  <Box sx={{ color: tokens.colors.text.secondary, display: "flex" }}>
                    <Activity size={18} />
                  </Box>
                  <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, flex: 1 }}>
                    {svc.name}
                  </Typography>
                  <Chip
                    size="small"
                    label={t("monitor.status.unknown")}
                    sx={{
                      bgcolor: tokens.colors.background.primary,
                      color: tokens.colors.text.secondary,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {t("monitor.gatewayPrefix", { prefix: svc.prefix })}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </AdminLayout>
  );
}
