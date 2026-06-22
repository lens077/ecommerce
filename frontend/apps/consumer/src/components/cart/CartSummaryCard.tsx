/**
 * 购物车结算栏组件
 * 
 * 固定在页面底部，包含全选和结算按钮
 */

import { Box, Button, Checkbox, Typography } from "@mui/material";
import { ShoppingCart } from "lucide-react";
import type { CartSummary } from "@/store/cart";
import { tokens } from "@/styles/tokens";

interface CartSummaryCardProps {
  summary: CartSummary;
  allSelected: boolean;
  onSelectAll: (selected: boolean) => void;
  onCheckout: () => void;
}

export function CartSummaryCard({
  summary,
  allSelected,
  onSelectAll,
  onCheckout,
}: CartSummaryCardProps) {
  const hasSelectedItems = summary.selectedQuantity > 0;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: tokens.colors.background.card,
        borderTop: `1px solid ${tokens.colors.border.default}`,
        p: tokens.spacing[4],
        zIndex: tokens.zIndex.fixed,
      }}
    >
      <Box
        sx={{
          maxWidth: 600,
          mx: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tokens.spacing[4],
        }}
      >
        {/* 全选 */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: tokens.spacing[2],
          }}
          onClick={() => onSelectAll(!allSelected)}
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
          <Typography
            variant="body2"
            sx={{ color: tokens.colors.text.primary }}
          >
            全选
          </Typography>
        </Box>

        {/* 价格汇总 */}
        <Box sx={{ flex: 1, textAlign: "right" }}>
          <Typography
            component="span"
            variant="body2"
            sx={{ color: tokens.colors.text.secondary }}
          >
            合计：
          </Typography>
          <Typography
            component="span"
            variant="body1"
            sx={{
              color: tokens.colors.accent.red,
              fontWeight: 600,
              ml: tokens.spacing[1],
            }}
          >
            ¥{summary.selectedPrice.toFixed(2)}
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
            "&:hover": {
              bgcolor: tokens.colors.accent.darkGray,
              boxShadow: "none",
            },
            "&:disabled": {
              bgcolor: tokens.colors.border.default,
              color: tokens.colors.text.disabled,
            },
          }}
          startIcon={<ShoppingCart size={18} />}
        >
          结算({summary.selectedQuantity})
        </Button>
      </Box>
    </Box>
  );
}
