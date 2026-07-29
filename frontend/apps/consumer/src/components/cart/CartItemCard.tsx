import { Box, Checkbox, Typography } from "@mui/material";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CartItem } from "@/store/cart";
import { tokens } from "@/styles/tokens";
import { Store } from "lucide-react";

interface CartItemCardProps {
    item: CartItem;
    onToggleSelect: (cartItemId: string) => void;
    onUpdateQuantity: (cartItemId: string, quantity: number) => void;
    onRemove: (cartItemId: string) => void;
}

// 购物车商品详情列表
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
                flexDirection: "column",
                border: `1px solid ${tokens.colors.border.default}`,
                borderRadius: tokens.radius.lg,
                bgcolor: tokens.colors.background.card,
                transition: tokens.transitions.fast,
                "&:hover": {
                    borderColor: tokens.colors.accent.black,
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                },
            }}
        >
            <Box sx={{
                display: "flex",
                alignItems: "flex-start"
            }}>
                <Store size={16} color={tokens.colors.text.secondary}/>
                <Typography>{item.shopName}</Typography>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    p: tokens.spacing[2],

                }}
            >
                <Checkbox
                    checked={item.selected}
                    onChange={() => onToggleSelect(item.cartItemId)}
                    sx={{
                        p: 0,
                        mt: 0,
                        color: tokens.colors.border.default,
                        "&.Mui-checked": {color: tokens.colors.accent.black},
                    }}
                />

                <Box
                    component="img"
                    src={item.skuThumbnailUrl || "/placeholder.png"}
                    alt={item.spuName}
                    sx={{
                        width: {xs: 80, lg: 90},
                        height: {xs: 80, lg: 90},
                        flexShrink: 0,
                        objectFit: "cover",
                        borderRadius: tokens.radius.md,
                        bgcolor: tokens.colors.background.primary,
                    }}
                />

                <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography
                        variant="body1"
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

                    {item.skuName && (
                        <Typography
                            variant="caption"
                            sx={{
                                color: tokens.colors.text.secondary,
                                display: "block",
                                mb: tokens.spacing[3],
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {item.skuName}
                        </Typography>
                    )}

                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <Typography
                            sx={{
                                color: tokens.colors.accent.red,
                                fontWeight: 600,
                                fontSize: "1.125rem",
                            }}
                        >
                            ¥{item.price.toFixed(2)}
                        </Typography>

                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: tokens.spacing[4],
                            }}
                        >
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
                                        width: 32,
                                        height: 32,
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
                                        width: 32,
                                        height: 32,
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
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 32,
                                    height: 32,
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
                </Box>
            </Box>
        </Box>
    );
}
