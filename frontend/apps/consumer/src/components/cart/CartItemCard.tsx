import { Box, Checkbox, Typography } from "@mui/material";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CartItem } from "@/store/cart";
import { sp, tokens } from "@/styles/tokens";

interface CartItemCardProps {
    item: CartItem;
    onToggleSelect: (cartItemId: string) => void;
    onUpdateQuantity: (cartItemId: string, quantity: number) => void;
    onRemove: (cartItemId: string) => void;
}

// 单个购物车商品行（紧凑单行布局，商家信息由 MerchantCartGroup 统一展示）
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
                alignItems: "center",
                gap: sp[3],
                px: sp[4],
                py: sp[3],
                transition: tokens.transitions.fast,
                "&:hover": {bgcolor: tokens.colors.background.primary},
            }}
        >
            <Checkbox
                checked={item.selected}
                onChange={() => onToggleSelect(item.cartItemId)}
                sx={{
                    p: 0,
                    color: tokens.colors.border.default,
                    "&.Mui-checked": {color: tokens.colors.accent.black},
                }}
            />

            <Box
                component="img"
                src={item.skuThumbnailUrl || "/placeholder.png"}
                alt={item.spuName}
                sx={{
                    width: 72,
                    height: 72,
                    flexShrink: 0,
                    objectFit: "cover",
                    borderRadius: tokens.radius.md,
                    border: `1px solid ${tokens.colors.border.default}`,
                    bgcolor: tokens.colors.background.primary,
                }}
            />

            {/* 名称 + 规格 */}
            <Box sx={{flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: sp[1]}}>
                <Typography
                    variant="body2"
                    sx={{
                        color: tokens.colors.text.primary,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                    }}
                >
                    {item.spuName}
                </Typography>

                {item.skuName && (
                    <Typography
                        variant="caption"
                        sx={{
                            alignSelf: "flex-start",
                            maxWidth: "100%",
                            color: tokens.colors.text.secondary,
                            px: sp[2],
                            py: "2px",
                            borderRadius: tokens.radius.sm,
                            bgcolor: tokens.colors.background.primary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {item.skuName}
                    </Typography>
                )}
            </Box>

            {/* 价格 + 数量 + 删除 */}
            <Box sx={{display: "flex", alignItems: "center", gap: sp[3], flexShrink: 0}}>
                <Typography
                    sx={{
                        color: tokens.colors.accent.red,
                        fontWeight: 600,
                        fontSize: "1rem",
                        whiteSpace: "nowrap",
                        minWidth: 72,
                        textAlign: "right",
                    }}
                >
                    ¥{item.price.toFixed(2)}
                </Typography>

                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        border: `1px solid ${tokens.colors.border.default}`,
                        borderRadius: tokens.radius.md,
                        overflow: "hidden",
                    }}
                >
                    <Box
                        component="button"
                        onClick={handleDecrement}
                        disabled={item.quantity <= 1}
                        aria-label="减少数量"
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            border: "none",
                            bgcolor: "transparent",
                            cursor: item.quantity <= 1 ? "not-allowed" : "pointer",
                            color: tokens.colors.text.secondary,
                            transition: tokens.transitions.fast,
                            "&:hover:not(:disabled)": {bgcolor: tokens.colors.background.primary},
                            "&:disabled": {opacity: 0.4},
                        }}
                    >
                        <Minus size={14}/>
                    </Box>

                    <Typography
                        sx={{
                            minWidth: 34,
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
                        aria-label="增加数量"
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            border: "none",
                            bgcolor: "transparent",
                            cursor: "pointer",
                            color: tokens.colors.text.secondary,
                            transition: tokens.transitions.fast,
                            "&:hover": {bgcolor: tokens.colors.background.primary},
                        }}
                    >
                        <Plus size={14}/>
                    </Box>
                </Box>

                <Box
                    component="button"
                    onClick={() => onRemove(item.cartItemId)}
                    aria-label="删除商品"
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 30,
                        height: 30,
                        flexShrink: 0,
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
                    <Trash2 size={16}/>
                </Box>
            </Box>
        </Box>
    );
}
