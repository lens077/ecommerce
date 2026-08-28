/**
 * 购物车结算栏组件
 *
 * 两种模式：
 * - sidebar: 桌面端右侧 sticky 侧边栏，含明细
 * - bottomBar: 移动端底部固定栏，紧凑布局
 */

import { Box, Button, Checkbox, Divider, Typography } from "@mui/material";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import type { CartSummary } from "@/store/cart";
import { sp, tokens } from "@/styles/tokens";

interface CartSummaryCardProps {
  summary: CartSummary;
  allSelected: boolean;
  onSelectAll: (selected: boolean) => void;
  onCheckout: () => void;
  variant?: "sidebar" | "bottomBar";
}

export function CartSummaryCard({
  summary,
  allSelected,
  onSelectAll,
  onCheckout,
  variant = "bottomBar",
}: CartSummaryCardProps) {
  const { t } = useTranslation();
  const { formatCurrencyCents } = useFormat();
  const hasSelectedItems = summary.selectedQuantity > 0;

  // ==================== 侧边栏模式（桌面端） ====================
  if (variant === "sidebar") {
    return (
      <Box
        sx={{
          position: "sticky",
          top: 64,
          bgcolor: tokens.colors.background.card,
          border: `1px solid ${tokens.colors.border.default}`,
          borderRadius: tokens.radius.lg,
          p: sp[4],
        }}
      >
        {/* 全选 */}
        <Box
          onClick={() => onSelectAll(!allSelected)}
          sx={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: sp[2],
            mb: sp[4],
          }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={summary.selectedQuantity > 0 && !allSelected}
            sx={{
              p: 0,
              color: tokens.colors.border.default,
              "&.Mui-checked, &.MuiCheckbox-indeterminate": {
                color: tokens.colors.accent.black,
              },
            }}
          />
          <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
            {t("cart.selectAll")}
          </Typography>
        </Box>

        <Divider sx={{ borderColor: tokens.colors.border.default, mb: sp[4] }} />

        {/* 明细 */}
        <Box sx={{ mb: sp[4] }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: tokens.colors.text.primary, mb: sp[3] }}
          >
            {t("cart.summary.title")}
          </Typography>

          <SummaryRow
            label={t("cart.summary.totalItems")}
            value={t("cart.summary.pieces", { count: summary.totalQuantity })}
          />
          <SummaryRow
            label={t("cart.summary.selectedItems")}
            value={t("cart.summary.pieces", { count: summary.selectedQuantity })}
          />
          <SummaryRow
            label={t("cart.summary.subtotal")}
            value={formatCurrencyCents(summary.totalPriceCents)}
          />
        </Box>

        <Divider sx={{ borderColor: tokens.colors.border.default, mb: sp[4] }} />

        {/* 合计 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            mb: sp[4],
          }}
        >
          <Typography variant="body1" sx={{ color: tokens.colors.text.primary, fontWeight: 500 }}>
            {t("cart.summary.total")}
          </Typography>
          <Typography variant="h5" sx={{ color: tokens.colors.accent.red, fontWeight: 700 }}>
            {formatCurrencyCents(summary.selectedPriceCents)}
          </Typography>
        </Box>

        {/* 结算按钮 */}
        <Button
          variant="contained"
          fullWidth
          disabled={!hasSelectedItems}
          onClick={onCheckout}
          sx={{
            height: 48,
            bgcolor: tokens.colors.accent.black,
            color: tokens.colors.text.inverse,
            borderRadius: tokens.radius.lg,
            textTransform: "none",
            fontWeight: 600,
            fontSize: "1rem",
            boxShadow: "none",
            "&:hover": { bgcolor: tokens.colors.accent.darkGray, boxShadow: "none" },
            "&:disabled": {
              bgcolor: tokens.colors.border.default,
              color: tokens.colors.text.disabled,
            },
          }}
        >
          {t("cart.checkoutWithCount", { count: summary.selectedQuantity })}
        </Button>
      </Box>
    );
  }

  // ==================== 底部栏模式（移动端） ====================
  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: tokens.colors.background.card,
        borderTop: `1px solid ${tokens.colors.border.default}`,
        p: sp[4],
        zIndex: tokens.zIndex.fixed,
      }}
    >
      <Box
        sx={{
          maxWidth: 960,
          mx: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: sp[4],
        }}
      >
        {/* 全选 */}
        <Box
          onClick={() => onSelectAll(!allSelected)}
          sx={{ display: "flex", alignItems: "center", gap: sp[2], cursor: "pointer" }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={summary.selectedQuantity > 0 && !allSelected}
            sx={{
              p: 0,
              color: tokens.colors.border.default,
              "&.Mui-checked, &.MuiCheckbox-indeterminate": {
                color: tokens.colors.accent.black,
              },
            }}
          />
          <Typography variant="body2" sx={{ color: tokens.colors.text.primary }}>
            {t("cart.selectAll")}
          </Typography>
        </Box>

        {/* 价格汇总 */}
        <Box sx={{ flex: 1, textAlign: "right" }}>
          <Typography component="span" variant="body2" sx={{ color: tokens.colors.text.secondary }}>
            {t("cart.summary.totalInline")}
          </Typography>
          <Typography
            component="span"
            variant="body1"
            sx={{ color: tokens.colors.accent.red, fontWeight: 600, ml: sp[1] }}
          >
            {formatCurrencyCents(summary.selectedPriceCents)}
          </Typography>
        </Box>

        {/* 结算按钮 */}
        <Button
          variant="contained"
          disabled={!hasSelectedItems}
          onClick={onCheckout}
          sx={{
            minWidth: 120,
            height: 44,
            bgcolor: tokens.colors.accent.black,
            color: tokens.colors.text.inverse,
            borderRadius: tokens.radius.full,
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.9rem",
            boxShadow: "none",
            "&:hover": { bgcolor: tokens.colors.accent.darkGray, boxShadow: "none" },
            "&:disabled": {
              bgcolor: tokens.colors.border.default,
              color: tokens.colors.text.disabled,
            },
          }}
        >
          {t("cart.checkoutWithCount", { count: summary.selectedQuantity })}
        </Button>
      </Box>
    </Box>
  );
}

/** 明细行 */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: sp[1],
      }}
    >
      <Typography variant="body2" sx={{ color: tokens.colors.text.secondary }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.colors.text.primary, fontWeight: 500 }}>
        {value}
      </Typography>
    </Box>
  );
}
