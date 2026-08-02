/**
 * 订单详情页面
 */

import { createFileRoute } from "@tanstack/react-router";
import { Box, Button, Card, CardContent, Divider, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/orders/$orderId")({
  component: OrderDetailPage,
});

/** 订单状态 -> 文案 key 的显式映射，不用字符串拼 key（拼出来的提取工具扫不到） */
const STATUS_LABEL_KEY = {
  pending: "common:orderStatus.pending_payment",
  paid: "common:orderStatus.pending_shipment",
  shipped: "common:orderStatus.shipped",
  completed: "common:orderStatus.completed",
} as const;

/** 订单状态 -> 状态区副标题 */
const STATUS_HINT_KEY = {
  pending: "orderDetail.hint.pending",
  paid: "orderDetail.hint.paid",
  shipped: "orderDetail.hint.shipped",
  completed: "orderDetail.hint.completed",
} as const;

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const [orderStatus, setOrderStatus] = useState<"pending" | "paid" | "shipped" | "completed">(
    "pending",
  );

  // 模拟订单数据
  const order = {
    id: orderId,
    shopName: "优品数码旗舰店",
    status: orderStatus,
    address: {
      name: "张三",
      phone: "138****1234",
      detail: "北京市朝阳区建国路88号SOHO现代城1号楼101室",
    },
    items: [
      {
        name: "iPhone 15 Pro Max 256GB 钛金色",
        price: 9999,
        quantity: 1,
        image: "",
        specs: "钛金色/256GB",
      },
    ],
    totalAmount: 9999,
    freight: 0,
    coupon: 0,
    createTime: "2024-06-12 10:30:25",
    payTime: "",
    shipTime: "",
    deliveryTime: "",
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; bg: string }> = {
      pending: { color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
      paid: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
      shipped: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
      completed: { color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
    };
    return configs[status] || configs.pending;
  };

  const statusConfig = getStatusConfig(orderStatus);

  const handleCancel = () => {
    if (confirm(t("orderDetail.cancelConfirm"))) {
      navigate({ to: "/orders" });
    }
  };

  const handlePay = () => {
    // TODO: 跳转支付
    alert(t("orderDetail.payNotReady"));
  };

  const handleConfirmReceive = () => {
    setOrderStatus("completed");
  };

  return (
    <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh", pb: 10 }}>
      {/* 顶部标题 */}
      <Box
        sx={{
          bgcolor: statusConfig.bg,
          p: 4,
          textAlign: "center",
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, color: statusConfig.color, mb: 1 }}>
          {t(STATUS_LABEL_KEY[orderStatus])}
        </Typography>
        <Typography variant="body2" sx={{ color: statusConfig.color, opacity: 0.8 }}>
          {t(STATUS_HINT_KEY[orderStatus])}
        </Typography>
      </Box>

      {/* 收货地址 */}
      <Card sx={{ mx: 2, mt: -3 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 500, color: tokens.colors.text.primary, mb: 1 }}
              >
                {order.address.name} {order.address.phone}
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                {order.address.detail}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 商品列表 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 500, color: tokens.colors.text.primary, mb: 2 }}
          >
            {order.shopName}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {order.items.map((item, index) => (
              <Box key={index} sx={{ display: "flex", gap: 2 }}>
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
                  <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                    {item.specs}
                  </Typography>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                    <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
                      x{item.quantity}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                    >
                      {formatCurrency(item.price)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* 订单信息 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {t("orderDetail.orderNo")}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary, fontWeight: 500 }}>
              {order.id}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {t("orderDetail.createTime")}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {order.createTime}
            </Typography>
          </Box>
          {order.payTime && (
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                {t("orderDetail.payTime")}
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
                {order.payTime}
              </Typography>
            </Box>
          )}
          {order.shipTime && (
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
                {t("orderDetail.shipTime")}
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
                {order.shipTime}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 金额明细 */}
      <Card sx={{ mx: 2, mt: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {t("orderDetail.goodsAmount")}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {formatCurrency(order.totalAmount)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
              {t("checkout.amount.freight")}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
              {order.freight === 0 ? t("checkout.shipping.free") : formatCurrency(order.freight)}
            </Typography>
          </Box>
          {order.coupon > 0 && (
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="body2" sx={{ color: tokens.colors.accent.green }}>
                {t("orderDetail.coupon")}
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.colors.accent.green }}>
                -{formatCurrency(order.coupon)}
              </Typography>
            </Box>
          )}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body1" sx={{ fontWeight: 500, color: tokens.colors.text.primary }}>
              {t("checkout.amount.total")}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: tokens.colors.accent.red }}>
              {formatCurrency(order.totalAmount + order.freight - order.coupon)}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 底部操作栏 */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: tokens.colors.background.card,
          borderTop: `1px solid ${tokens.colors.border.default}`,
          p: 2,
          display: "flex",
          gap: 2,
          justifyContent: "flex-end",
        }}
      >
        {orderStatus === "pending" && (
          <>
            <Button
              variant="outlined"
              onClick={handleCancel}
              sx={{ borderColor: "divider", color: "text.secondary" }}
            >
              {t("orderDetail.cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handlePay}
              sx={{ bgcolor: tokens.colors.accent.red, "&:hover": { bgcolor: "#dc2626" } }}
            >
              {t("orderDetail.payNow")}
            </Button>
          </>
        )}
        {orderStatus === "shipped" && (
          <Button
            variant="contained"
            onClick={handleConfirmReceive}
            sx={{ bgcolor: tokens.colors.accent.green, "&:hover": { bgcolor: "#059669" } }}
          >
            {t("orderDetail.confirmReceive")}
          </Button>
        )}
        {orderStatus === "completed" && (
          <Button variant="outlined" sx={{ borderColor: "divider", color: "text.primary" }}>
            {t("orderDetail.buyAgain")}
          </Button>
        )}
      </Box>
    </Box>
  );
}
