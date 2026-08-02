/**
 * 支付结果页面
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Box, Button, Typography } from "@mui/material";
import { CheckCircle, XCircle } from "lucide-react";
import { z } from "zod";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { tokens } from "@/styles/tokens";

// 不带 success 时按成功展示，见下方 isSuccess
const PaymentResultSearchSchema = z.object({
  success: z.boolean().optional(),
});

export const Route = createFileRoute("/payment/result")({
  component: PaymentResultPage,
  validateSearch: PaymentResultSearchSchema,
});

function PaymentResultPage() {
  const { success } = Route.useSearch();
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();

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
        {isSuccess ? t("payment.success.title") : t("payment.failed.title")}
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
        {isSuccess ? t("payment.success.desc") : t("payment.failed.desc")}
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
            {t("payment.amount")}
          </Typography>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: tokens.colors.accent.red, mt: 1 }}
          >
            {formatCurrency(9999)}
          </Typography>
        </Box>
      )}

      {/* 操作按钮 */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", maxWidth: 300 }}>
        <Button
          variant="contained"
          component={Link}
          to={isSuccess ? "/orders/ORD20240612001" : "/orders"}
          sx={{
            bgcolor: isSuccess ? tokens.colors.accent.red : tokens.colors.text.primary,
            "&:hover": {
              bgcolor: isSuccess ? "#dc2626" : tokens.colors.text.secondary,
            },
          }}
        >
          {isSuccess ? t("payment.viewOrder") : t("payment.viewOrders")}
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
          {t("notFound.home")}
        </Button>
      </Box>
    </Box>
  );
}
