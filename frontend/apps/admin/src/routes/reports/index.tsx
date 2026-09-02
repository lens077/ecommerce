/**
 * 运营报表页面
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { TrendingUp, ShoppingBag, Users, DollarSign, Store } from "lucide-react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/reports/")({
  component: ReportsPage,
});

const TIME_RANGES = ["today", "last7d", "last30d", "last90d"] as const;

function ReportsPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();

  const stats = [
    {
      labelKey: "reports.stats.sales",
      value: formatCurrency(1285600),
      change: "+12.5%",
      icon: DollarSign,
      color: tokens.colors.accent.green,
    },
    {
      labelKey: "reports.stats.orders",
      value: formatNumber(12340),
      change: "+8.3%",
      icon: ShoppingBag,
      color: tokens.colors.accent.blue,
    },
    {
      labelKey: "reports.stats.visitors",
      value: formatNumber(84560),
      change: "+15.2%",
      icon: Users,
      color: tokens.colors.accent.yellow,
    },
    {
      labelKey: "reports.stats.merchants",
      value: formatNumber(256),
      change: "+3",
      icon: Store,
      color: tokens.colors.accent.red,
    },
  ] as const;

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: "text.primary" }}>
            {t("reports.title")}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="reports-time-range-label">{t("timeRange.label")}</InputLabel>
            <Select
              labelId="reports-time-range-label"
              label={t("timeRange.label")}
              defaultValue="last7d"
            >
              {TIME_RANGES.map((value) => (
                <MenuItem key={value} value={value}>
                  {t(`timeRange.${value}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* 统计卡片 */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat) => (
            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={stat.labelKey}>
              <Card sx={{ height: "100%" }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: `${stat.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <stat.icon size={24} color={stat.color} />
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        color: tokens.colors.accent.green,
                      }}
                    >
                      <TrendingUp size={14} />
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {stat.change}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography
                    variant="h4"
                    component="p"
                    sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}
                  >
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {t(stat.labelKey)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* 图表区域 */}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card sx={{ height: 400 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography
                  variant="h6"
                  component="h2"
                  sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}
                >
                  {t("reports.salesTrend")}
                </Typography>
                <Box
                  sx={{
                    height: 300,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: tokens.colors.background.primary,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {t("reports.chartPlaceholder")}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Card sx={{ height: 400 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography
                  variant="h6"
                  component="h2"
                  sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}
                >
                  {t("reports.categoryShare")}
                </Typography>
                <Box
                  sx={{
                    height: 300,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: tokens.colors.background.primary,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {t("reports.pieChartPlaceholder")}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </AdminLayout>
  );
}
