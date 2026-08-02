/**
 * 订单列表页面
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Box, Card, CardContent, Typography, Chip, Tabs, Tab } from "@mui/material";
import { useState } from "react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
});

/**
 * 订单状态 -> 文案 key 的显式映射。
 * 不用字符串拼 key：拼出来的 key 提取工具扫不到，将来漏翻检测不出来。
 */
const STATUS_LABEL_KEY: Record<string, string> = {
  pending: "common:orderStatus.pending_payment",
  paid: "common:orderStatus.pending_shipment",
  shipped: "common:orderStatus.shipped",
  completed: "common:orderStatus.completed",
};

function OrdersPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const [tab, setTab] = useState(0);

  // 模拟订单数据
  const orders = [
    {
      id: "ORD20240612001",
      shopName: "优品数码旗舰店",
      status: "pending",
      items: [{ name: "iPhone 15 Pro Max 256GB", price: 9999, quantity: 1, image: "" }],
      totalAmount: 9999,
      createTime: "2024-06-12 10:30:25",
    },
    {
      id: "ORD20240612002",
      shopName: "苹果官方旗舰店",
      status: "paid",
      items: [{ name: "AirPods Pro 2", price: 1899, quantity: 2, image: "" }],
      totalAmount: 3798,
      createTime: "2024-06-12 09:15:00",
    },
    {
      id: "ORD20240611001",
      shopName: "优品数码旗舰店",
      status: "shipped",
      items: [{ name: "MacBook Air M2", price: 7999, quantity: 1, image: "" }],
      totalAmount: 7999,
      createTime: "2024-06-11 16:45:30",
    },
    {
      id: "ORD20240610001",
      shopName: "苹果官方旗舰店",
      status: "completed",
      items: [{ name: "iPad Pro 12.9", price: 8499, quantity: 1, image: "" }],
      totalAmount: 8499,
      createTime: "2024-06-10 11:05:55",
    },
  ];

  const tabs = [
    { label: t("orders.tabs.all"), value: "all" },
    { label: t("common:orderStatus.pending_payment"), value: "pending" },
    { label: t("common:orderStatus.pending_shipment"), value: "paid" },
    { label: t("orders.tabs.pendingReceipt"), value: "shipped" },
    { label: t("common:orderStatus.completed"), value: "completed" },
  ];

  const filteredOrders = orders.filter((order) => {
    if (tab === 0) return true;
    return order.status === tabs[tab].value;
  });

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bg: string }> = {
      pending: { color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
      paid: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
      shipped: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
      completed: { color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
    };
    return configs[status] || configs.pending;
  };

  return (
    <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh", pb: 6 }}>
      {/* 顶部标题 */}
      <Box
        sx={{
          bgcolor: tokens.colors.background.card,
          p: 3,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.colors.text.primary }}>
          {t("orders.title")}
        </Typography>
      </Box>

      {/* 状态 Tab */}
      <Box
        sx={{
          bgcolor: tokens.colors.background.card,
          borderBottom: `1px solid ${tokens.colors.border.default}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, newValue) => setTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 48,
            "& .MuiTab-root": {
              minHeight: 48,
              textTransform: "none",
              fontWeight: 500,
            },
          }}
        >
          {tabs.map((item) => (
            <Tab key={item.value} label={item.label} />
          ))}
        </Tabs>
      </Box>

      {/* 订单列表 */}
      <Box sx={{ p: 2 }}>
        {filteredOrders.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="body1" sx={{ color: tokens.colors.text.secondary }}>
              {t("orders.empty")}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredOrders.map((order) => {
              const statusConfig = getStatusConfig(order.status);
              return (
                <Card key={order.id}>
                  <CardContent sx={{ p: 2 }}>
                    {/* 订单头部 */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        pb: 2,
                        borderBottom: `1px solid ${tokens.colors.border.default}`,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, color: tokens.colors.text.primary }}
                      >
                        {order.shopName}
                      </Typography>
                      <Chip
                        label={t(STATUS_LABEL_KEY[order.status] ?? "common:state.empty")}
                        size="small"
                        sx={{
                          bgcolor: statusConfig.bg,
                          color: statusConfig.color,
                          fontWeight: 500,
                        }}
                      />
                    </Box>

                    {/* 商品列表 */}
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
                      {order.items.map((item, index) => (
                        <Link
                          key={index}
                          to="/orders/$orderId"
                          params={{ orderId: order.id }}
                          // Link 渲染的是原生 <a>，没有 sx；gap: 2 对应主题的 16px
                          style={{
                            display: "flex",
                            gap: 16,
                            textDecoration: "none",
                          }}
                        >
                          <Box
                            sx={{
                              width: 80,
                              height: 80,
                              borderRadius: 1,
                              bgcolor: tokens.colors.background.primary,
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                color: tokens.colors.text.primary,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: tokens.colors.text.secondary }}
                            >
                              x{item.quantity}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                          >
                            {formatCurrency(item.price)}
                          </Typography>
                        </Link>
                      ))}
                    </Box>

                    {/* 订单底部 */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                        {order.createTime}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                          {t("checkout.amount.totalInline")}
                        </Typography>
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                        >
                          {formatCurrency(order.totalAmount)}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
