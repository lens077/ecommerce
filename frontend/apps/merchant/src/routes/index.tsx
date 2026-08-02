/**
 * 商家端首页/仪表盘
 */

import { createFileRoute } from "@tanstack/react-router";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { ShoppingBag, DollarSign, Users, Package, TrendingUp, TrendingDown } from "lucide-react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { tokens } from "@/styles/theme";

const s = { xs: 0.5, sm: 1, md: 2, lg: 3, xl: 4 };

/** 近期订单表头。key 显式列出，不用下标拼。 */
const ORDER_COLUMNS = [
  "dashboard.table.orderNo",
  "dashboard.table.customer",
  "dashboard.table.amount",
  "dashboard.table.status",
] as const;

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();

  const stats = [
    { labelKey: "dashboard.stats.todayOrders", value: formatNumber(128), change: "+12%", trend: "up", icon: ShoppingBag },
    { labelKey: "dashboard.stats.todaySales", value: formatCurrency(12580), change: "+8%", trend: "up", icon: DollarSign },
    { labelKey: "dashboard.stats.pendingOrders", value: formatNumber(24), change: "-3%", trend: "down", icon: Package },
    { labelKey: "dashboard.stats.customers", value: formatNumber(1234), change: "+5%", trend: "up", icon: Users },
  ] as const;

  // status 存状态码而不是中文 —— 下面既要拿它渲染文案又要拿它判色，存文案会在切语言时判错
  const recentOrders = [
    { id: "ORD001", customer: "张先生", amount: 299, status: "pending_shipment" },
    { id: "ORD002", customer: "李女士", amount: 1280, status: "pending_shipment" },
    { id: "ORD003", customer: "王先生", amount: 89, status: "completed" },
    { id: "ORD004", customer: "赵女士", amount: 456, status: "pending_shipment" },
    { id: "ORD005", customer: "刘先生", amount: 2100, status: "completed" },
  ] as const;

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: s.lg }}>
        {t("dashboard.title")}
      </Typography>

      {/* 统计卡片 */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: s.lg }}>
        {stats.map((stat) => (
          <Card key={stat.labelKey} sx={{ height: "100%" }}>
            <CardContent sx={{ p: s.md }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box>
                  <Typography variant="body2" sx={{ color: "text.secondary", mb: s.xs }}>
                    {t(stat.labelKey)}
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: s.xs }}>
                    {stat.value}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {stat.trend === "up" ? (
                      <TrendingUp size={14} color={tokens.colors.accent.green} />
                    ) : (
                      <TrendingDown size={14} color={tokens.colors.accent.red} />
                    )}
                    <Typography
                      variant="caption"
                      sx={{ color: stat.trend === "up" ? tokens.colors.accent.green : tokens.colors.accent.red }}
                    >
                      {t("dashboard.changeVsYesterday", { change: stat.change })}
                    </Typography>
                  </Box>
                </Box>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 1,
                    bgcolor: "background.default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <stat.icon size={24} color={tokens.colors.text.secondary} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* 近期订单 */}
      <Card>
        <CardContent sx={{ p: s.md }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: s.md }}>
            {t("dashboard.recentOrders")}
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
              <Box component="thead">
                <Box component="tr" sx={{ borderBottom: `1px solid ${tokens.colors.border.default}` }}>
                  {ORDER_COLUMNS.map((key) => (
                    <Box component="th" key={key} sx={{ textAlign: "left", py: s.sm, px: s.md, fontWeight: 500, color: "text.secondary", fontSize: "0.875rem" }}>
                      {t(key)}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {recentOrders.map((order) => (
                  <Box
                    component="tr"
                    key={order.id}
                    sx={{ borderBottom: `1px solid ${tokens.colors.border.default}`, "&:last-child": { borderBottom: "none" } }}
                  >
                    <Box component="td" sx={{ py: s.sm, px: s.md, color: "text.primary", fontWeight: 500 }}>
                      {order.id}
                    </Box>
                    <Box component="td" sx={{ py: s.sm, px: s.md, color: "text.secondary" }}>
                      {order.customer}
                    </Box>
                    <Box component="td" sx={{ py: s.sm, px: s.md, color: tokens.colors.accent.red, fontWeight: 500 }}>
                      {formatCurrency(order.amount)}
                    </Box>
                    <Box component="td" sx={{ py: s.sm, px: s.md }}>
                      <Box
                        component="span"
                        sx={{
                          display: "inline-block",
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 5,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          bgcolor: order.status === "pending_shipment" ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                          color: order.status === "pending_shipment" ? tokens.colors.accent.red : tokens.colors.accent.green,
                        }}
                      >
                        {t(`common:orderStatus.${order.status}`)}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
