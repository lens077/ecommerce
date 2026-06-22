/**
 * 支付结果页面
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Box, Button, Typography } from "@mui/material";
import { CheckCircle, XCircle } from "lucide-react";
import { tokens } from "@/styles/tokens";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/payment/result")({
  component: PaymentResultPage,
});

function PaymentResultPage() {
  const { success } = Route.useSearch();
  const navigate = useNavigate();

  const isSuccess = success !== false;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: tokens.colors.background.primary,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
      }}
    >
      {/* 状态图标 */}
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          bgcolor: isSuccess ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 3,
        }}
      >
        {isSuccess ? (
          <CheckCircle size={48} color={tokens.colors.accent.green} />
        ) : (
          <XCircle size={48} color={tokens.colors.accent.red} />
        )}
      </Box>

      {/* 标题 */}
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          color: tokens.colors.text.primary,
          mb: 1,
          textAlign: "center",
        }}
      >
        {isSuccess ? "支付成功" : "支付失败"}
      </Typography>

      {/* 描述 */}
      <Typography
        variant="body2"
        sx={{
          color: tokens.colors.text.secondary,
          mb: 4,
          textAlign: "center",
          maxWidth: 300,
        }}
      >
        {isSuccess
          ? "感谢您的购买，商品正在准备发货中"
          : "支付未能完成，订单已保留，请稍后重试"}
      </Typography>

      {/* 订单金额 */}
      {isSuccess && (
        <Box
          sx={{
            bgcolor: tokens.colors.background.card,
            borderRadius: 2,
            p: 3,
            mb: 4,
            minWidth: 200,
            textAlign: "center",
            border: `1px solid ${tokens.colors.border.default}`,
          }}
        >
          <Typography variant="caption" sx={{ color: tokens.colors.text.secondary }}>
            支付金额
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: tokens.colors.accent.red, mt: 1 }}
          >
            ¥9,999.00
          </Typography>
        </Box>
      )}

      {/* 操作按钮 */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", maxWidth: 300 }}>
        <Button
          variant="contained"
          component={Link}
          to={isSuccess ? "/orders/ORD20240612001" : "/orders/"}
          sx={{
            bgcolor: isSuccess ? tokens.colors.accent.red : tokens.colors.text.primary,
            "&:hover": {
              bgcolor: isSuccess ? "#dc2626" : tokens.colors.text.secondary,
            },
          }}
        >
          {isSuccess ? "查看订单详情" : "查看我的订单"}
        </Button>
        <Button
          variant="outlined"
          component={Link}
          to="/"
          sx={{
            borderColor: tokens.colors.border.default,
            color: tokens.colors.text.primary,
            "&:hover": {
              borderColor: tokens.colors.text.primary,
              bgcolor: "transparent",
            },
          }}
        >
          返回首页
        </Button>
      </Box>
    </Box>
  );
}
