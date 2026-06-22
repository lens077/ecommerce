/**
 * 商家购物车分组组件
 * 
 * 按商家分组的购物车项
 */

import { Box, Typography } from "@mui/material";
import { Store } from "lucide-react";
import { CartItemCard } from "./CartItemCard";
import type { MerchantGroup } from "@/store/cart";
import { tokens } from "@/styles/tokens";

interface MerchantCartGroupProps {
  group: MerchantGroup;
  onToggleSelect: (cartItemId: string) => void;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemove: (cartItemId: string) => void;
}

export function MerchantCartGroup({
  group,
  onToggleSelect,
  onUpdateQuantity,
  onRemove,
}: MerchantCartGroupProps) {
  const allSelected = group.items.every((item) => item.selected);
  const hasActiveItems = group.items.some((item) => item.status === "active");

  // 没有有效商品则不渲染
  if (!hasActiveItems) {
    return null;
  }

  return (
    <Box sx={{ mb: tokens.spacing[6] }}>
      {/* 商家标题 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing[2],
          mb: tokens.spacing[3],
        }}
      >
        <Store size={16} color={tokens.colors.text.secondary} />
        <Typography
          variant="body2"
          sx={{
            color: tokens.colors.text.secondary,
            fontWeight: 500,
          }}
        >
          {group.merchantName}
        </Typography>
      </Box>

      {/* 商品列表 */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: tokens.spacing[3] }}>
        {group.items
          .filter((item) => item.status === "active")
          .map((item) => (
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
