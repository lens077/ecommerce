/**
 * 商家购物车分组组件
 *
 * 按商家分组的购物车项，支持商家级全选
 */

import { Box, Checkbox, Typography } from "@mui/material";
import { Store } from "lucide-react";
import { CartItemCard } from "./CartItemCard";
import type { MerchantGroup } from "@/store/cart";
import { tokens } from "@/styles/tokens";

interface MerchantCartGroupProps {
  group: MerchantGroup;
  onToggleSelect: (cartItemId: string) => void;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemove: (cartItemId: string) => void;
  onSelectByMerchant: (merchantId: string, selected: boolean) => void;
}

export function MerchantCartGroup({
  group,
  onToggleSelect,
  onUpdateQuantity,
  onRemove,
  onSelectByMerchant,
}: MerchantCartGroupProps) {
  const activeItems = group.items.filter((item) => item.status === "active");

  // 没有有效商品则不渲染
  if (activeItems.length === 0) return null;

  const allSelected = activeItems.every((item) => item.selected);
  const indeterminate =
    !allSelected && activeItems.some((item) => item.selected);

  return (
    <Box sx={{ mb: tokens.spacing[6] }}>
      {/* 商家标题栏：带全选 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing[2],
          mb: tokens.spacing[3],
          p: tokens.spacing[2],
          bgcolor: tokens.colors.background.primary,
          borderRadius: tokens.radius.md,
        }}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          onChange={() => onSelectByMerchant(group.merchantId, !allSelected)}
          size="small"
          sx={{
            p: 0,
            color: tokens.colors.border.default,
            "&.Mui-checked, &.MuiCheckbox-indeterminate": {
              color: tokens.colors.accent.black,
            },
          }}
        />
        <Store size={16} color={tokens.colors.text.secondary} />
        <Typography
          variant="body2"
          sx={{ color: tokens.colors.text.secondary, fontWeight: 500 }}
        >
          {group.merchantName}
        </Typography>
      </Box>

      {/* 商品列表 */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: tokens.spacing[3] }}>
        {activeItems.map((item) => (
          <CartItemCard
            key={item.cartItemId}
            item={item}
            onToggleSelect={onToggleSelect}
            onUpdateQuantity={onUpdateQuantity}
            onRemove={onRemove}
          />
        ))}
      </Box>
    </Box>
  );
}
