import { Box, Checkbox, Typography } from "@mui/material";
import { Store } from "lucide-react";

import { CartItemCard } from "./CartItemCard";
import type { MerchantGroup } from "@/store/cart";
import { sp, tokens } from "@/styles/tokens";

interface MerchantCartGroupProps {
    group: MerchantGroup;
    onToggleSelect: (cartItemId: string) => void;
    onUpdateQuantity: (cartItemId: string, quantity: number) => void;
    onRemove: (cartItemId: string) => void;
    onSelectByMerchant: (merchantId: string, selected: boolean) => void;
}

// 商家分组卡片：顶部为商家全选 + 店铺名，下方为该商家的商品列表
export function MerchantCartGroup({
                                      group,
                                      onToggleSelect,
                                      onUpdateQuantity,
                                      onRemove,
                                      onSelectByMerchant,
                                  }: MerchantCartGroupProps) {
    const allSelected = group.items.every((item) => item.selected);
    const indeterminate =
        !allSelected && group.items.some((item) => item.selected);
    const shopName = group.items[0]?.shopName || "商家";

    return (
        <Box
            sx={{
                border: `1px solid ${tokens.colors.border.default}`,
                borderRadius: tokens.radius.lg,
                bgcolor: tokens.colors.background.card,
                overflow: "hidden",
                transition: tokens.transitions.fast,
                "&:hover": {borderColor: tokens.colors.border.hover},
            }}
        >
            {/* 商家头部 */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: sp[2],
                    px: sp[4],
                    py: sp[3],
                    borderBottom: `1px solid ${tokens.colors.border.default}`,
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
                <Store size={18} color={tokens.colors.text.secondary}/>
                <Typography
                    variant="body2"
                    sx={{fontWeight: 600, color: tokens.colors.text.primary}}
                >
                    {shopName}
                </Typography>
            </Box>

            {/* 商品列表 */}
            <Box>
                {group.items.map((item, index) => (
                    <Box
                        key={item.cartItemId}
                        sx={{
                            borderTop:
                                index > 0
                                    ? `1px solid ${tokens.colors.border.default}`
                                    : "none",
                        }}
                    >
                        <CartItemCard
                            item={item}
                            onToggleSelect={onToggleSelect}
                            onUpdateQuantity={onUpdateQuantity}
                            onRemove={onRemove}
                        />
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
