/**
 * 管理后台首页/数据看板
 */

import { createFileRoute } from "@tanstack/react-router";
import { Box, Card, CardContent, Typography, Grid } from "@mui/material";
import { ShoppingBag, DollarSign, Users, Store, TrendingUp, ArrowUpRight } from "lucide-react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

/** 近期订单里出现的状态。用状态码而不是译文，配色和筛选才不会随语言失效。 */
type OrderStatus = "pending" | "shipped" | "completed";

const ORDER_STATUS_COLORS: Record<OrderStatus, { color: string; bg: string }> = {
  pending: { color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
  shipped: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
  completed: { color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
};

function DashboardPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();

  const stats = [
    {
      labelKey: "dashboard.stats.todayOrders",
      value: formatNumber(1234),
      change: "+12.5%",
      icon: ShoppingBag,
      color: tokens.colors.accent.blue,
    },
    {
      labelKey: "dashboard.stats.todaySales",
      value: formatCurrency(128560),
      change: "+8.3%",
      icon: DollarSign,
      color: tokens.colors.accent.green,
    },
    {
      labelKey: "dashboard.stats.activeUsers",
      value: formatNumber(8456),
      change: "+5.2%",
      icon: Users,
      color: tokens.colors.accent.yellow,
    },
    {
      labelKey: "dashboard.stats.totalMerchants",
      value: formatNumber(256),
      change: "+3",
      icon: Store,
      color: tokens.colors.accent.red,
    },
  ] as const;

  const recentOrders: {
    id: string;
    merchant: string;
    customer: string;
    amount: number;
    status: OrderStatus;
  }[] = [
    { id: "ORD001", merchant: "优品数码", customer: "张先生", amount: 2999, status: "pending" },
    { id: "ORD002", merchant: "苹果旗舰店", customer: "李女士", amount: 9999, status: "shipped" },
    { id: "ORD003", merchant: "数码专营店", customer: "王先生", amount: 599, status: "completed" },
    { id: "ORD004", merchant: "优品数码", customer: "赵女士", amount: 1299, status: "pending" },
    { id: "ORD005", merchant: "苹果旗舰店", customer: "刘先生", amount: 3799, status: "shipped" },
  ];

  const pendingMerchants = [
    { id: "m001", name: "华为官方旗舰店", category: "数码电子", applyTime: "2024-06-12 10:30" },
    { id: "m002", name: "小米智能生活馆", category: "智能家居", applyTime: "2024-06-12 09:15" },
    { id: "m003", name: "联想官方商城", category: "电脑办公", applyTime: "2024-06-11 16:45" },
  ];

  const orderColumns = [
    "dashboard.table.orderNo",
    "dashboard.table.merchant",
    "dashboard.table.customer",
    "dashboard.table.amount",
    "dashboard.table.status",
  ] as const;

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}
        >
          {t("dashboard.title")}
        </Typography>

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

        <Grid container spacing={3}>
          {/* 近期订单 */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 3,
                  }}
                >
                  <Typography
                    variant="h6"
                    component="h2"
                    sx={{ fontWeight: 600, color: "text.primary" }}
                  >
                    {t("dashboard.recentOrders")}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: tokens.colors.accent.blue,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    {t("dashboard.viewAll")} <ArrowUpRight size={14} />
                  </Typography>
                </Box>
                <Box sx={{ overflowX: "auto" }}>
                  <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                    <Box component="thead">
                      <Box
                        component="tr"
                        sx={{ borderBottom: `1px solid ${tokens.colors.border.default}` }}
                      >
                        {orderColumns.map((key) => (
                          <Box
                            component="th"
                            key={key}
                            sx={{
                              textAlign: "left",
                              py: 1.5,
                              px: 2,
                              fontWeight: 500,
                              color: "text.secondary",
                              fontSize: "0.875rem",
                            }}
                          >
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
                          sx={{
                            borderBottom: `1px solid ${tokens.colors.border.default}`,
                            "&:last-child": { borderBottom: "none" },
                          }}
                        >
                          <Box
                            component="td"
                            sx={{ py: 1.5, px: 2, color: "text.primary", fontWeight: 500 }}
                          >
                            {order.id}
                          </Box>
                          <Box component="td" sx={{ py: 1.5, px: 2, color: "text.secondary" }}>
                            {order.merchant}
                          </Box>
                          <Box component="td" sx={{ py: 1.5, px: 2, color: "text.secondary" }}>
                            {order.customer}
                          </Box>
                          <Box
                            component="td"
                            sx={{
                              py: 1.5,
                              px: 2,
                              color: tokens.colors.accent.red,
                              fontWeight: 500,
                            }}
                          >
                            {formatCurrency(order.amount)}
                          </Box>
                          <Box component="td" sx={{ py: 1.5, px: 2 }}>
                            <Box
                              component="span"
                              sx={{
                                display: "inline-block",
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 1,
                                fontSize: "0.75rem",
                                fontWeight: 500,
                                bgcolor: ORDER_STATUS_COLORS[order.status].bg,
                                color: ORDER_STATUS_COLORS[order.status].color,
                              }}
                            >
                              {t(`orders.status.${order.status}`)}
                            </Box>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* 待审核商家 */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 3,
                  }}
                >
                  <Typography
                    variant="h6"
                    component="h2"
                    sx={{ fontWeight: 600, color: "text.primary" }}
                  >
                    {t("dashboard.pendingMerchants")}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: tokens.colors.accent.blue,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    {t("dashboard.viewAll")} <ArrowUpRight size={14} />
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {pendingMerchants.map((merchant) => (
                    <Box
                      key={merchant.id}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        p: 2,
                        bgcolor: tokens.colors.background.primary,
                        borderRadius: 2,
                      }}
                    >
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, color: "text.primary", mb: 0.5 }}
                        >
                          {merchant.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {merchant.category} · {merchant.applyTime}
                        </Typography>
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          bgcolor: "rgba(245, 158, 11, 0.1)",
                          color: tokens.colors.accent.yellow,
                        }}
                      >
                        {t("dashboard.pendingBadge")}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </AdminLayout>
  );
}
