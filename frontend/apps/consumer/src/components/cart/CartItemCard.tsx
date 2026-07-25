/**
 * 购物车商品卡片组件
 *
 * 设计规范:
 * - 扁平化设计，细边框
 * - 清晰的视觉层级：图片 → 商品名 → 规格 → 价格/数量
 * - 悬停时显示删除按钮，减少视觉干扰
 */

import { Box, Checkbox, Typography } from "@mui/material";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CartItem } from "@/store/cart";
import { tokens } from "@/styles/tokens";

interface CartItemCardProps {
  item: CartItem;
  onToggleSelect: (cartItemId: string) => void;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemove: (cartItemId: string) => void;
}

export function CartItemCard({
  item,
  onToggleSelect,
  onUpdateQuantity,
  onRemove,
}: CartItemCardProps) {
  const handleDecrement = () => {
    if (item.quantity > 1) {
      onUpdateQuantity(item.cartItemId, item.quantity - 1);
    }
  };

  const handleIncrement = () => {
    onUpdateQuantity(item.cartItemId, item.quantity + 1);
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: tokens.spacing[3],
        p: tokens.spacing[4],
        bgcolor: tokens.colors.background.card,
        border: `1px solid ${tokens.colors.border.default}`,
        borderRadius: tokens.radius.lg,
        transition: tokens.transitions.fast,
        "&:hover": {
          borderColor: tokens.colors.border.hover,
        },
      }}
    >
      {/* 选择框 */}
      <Checkbox
        checked={item.selected}
        onChange={() => onToggleSelect(item.cartItemId)}
        sx={{
          p: 0,
          mt: 0.5,
          color: tokens.colors.border.default,
          "&.Mui-checked": { color: tokens.colors.accent.black },
        }}
      />

      {/* 商品图片 */}
      <Box
        component="img"
        src={item.skuThumbnailUrl || "/placeholder.png"}
        alt={item.spuName}
        sx={{
          width: 88,
          height: 88,
          flexShrink: 0,
          objectFit: "cover",
          borderRadius: tokens.radius.md,
          bgcolor: tokens.colors.background.primary,
        }}
      />

      {/* 商品信息 */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* 商品名 */}
        <Typography
          variant="body2"
          sx={{
            color: tokens.colors.text.primary,
            fontWeight: 500,
            lineHeight: 1.4,
            mb: tokens.spacing[1],
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {item.spuName}
        </Typography>

        {/* 规格 */}
        {item.skuName && (
          <Typography
            variant="caption"
            sx={{
              color: tokens.colors.text.secondary,
              display: "block",
              mb: tokens.spacing[2],
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.skuName}
          </Typography>
        )}

        {/* 价格和数量操作 */}
        <Box
          sx={{
            mt: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography
            sx={{
              color: tokens.colors.accent.red,
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            ¥{item.price.toFixed(2)}
          </Typography>

          {/* 数量控制器 */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              border: `1px solid ${tokens.colors.border.default}`,
              borderRadius: tokens.radius.md,
            }}
          >
            <Box
              component="button"
              onClick={handleDecrement}
              disabled={item.quantity <= 1}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                border: "none",
                bgcolor: "transparent",
                cursor: item.quantity <= 1 ? "not-allowed" : "pointer",
                color: tokens.colors.text.secondary,
                transition: tokens.transitions.fast,
                "&:hover:not(:disabled)": { bgcolor: tokens.colors.background.primary },
                "&:disabled": { opacity: 0.4 },
              }}
            >
              <Minus size={14} />
            </Box>

            <Typography
              sx={{
                minWidth: 32,
                textAlign: "center",
                fontWeight: 500,
                color: tokens.colors.text.primary,
                fontSize: "0.875rem",
              }}
            >
              {item.quantity}
            </Typography>

            <Box
              component="button"
              onClick={handleIncrement}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                border: "none",
                bgcolor: "transparent",
                cursor: "pointer",
                color: tokens.colors.text.secondary,
                transition: tokens.transitions.fast,
                "&:hover": { bgcolor: tokens.colors.background.primary },
              }}
            >
              <Plus size={14} />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* 删除按钮 */}
      <Box
        component="button"
        onClick={() => onRemove(item.cartItemId)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          flexShrink: 0,
          mt: 0.5,
          border: "none",
          bgcolor: "transparent",
          borderRadius: tokens.radius.sm,
          cursor: "pointer",
          color: tokens.colors.text.disabled,
          transition: tokens.transitions.fast,
          "&:hover": {
            color: tokens.colors.accent.red,
            bgcolor: "rgba(239, 68, 68, 0.08)",
          },
        }}
      >
        <Trash2 size={16} />
      </Box>
    </Box>
  );
}
