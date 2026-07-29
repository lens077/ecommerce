import { Box, Checkbox } from "@mui/material";

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

// 外部的勾选框
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

    return (
        <Box sx={{mb: tokens.spacing[4]}}>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    // gap: tokens.spacing[2],
                    // mb: tokens.spacing[3],
                    // px: tokens.spacing[1],
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
            </Box>

            <Box sx={{display: "flex", flexDirection: "column", gap: tokens.spacing[3]}}>
                {group.items.map((item) => (
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
