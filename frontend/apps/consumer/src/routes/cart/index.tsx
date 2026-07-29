import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Box, Typography, CircularProgress } from "@mui/material";
import { ArrowLeft } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { EmptyCart } from "@/components/cart/EmptyCart";
import { CartSummaryCard } from "@/components/cart/CartSummaryCard";
import { MerchantCartGroup } from "@/components/cart/MerchantCartGroup";
import { tokens } from "@/styles/tokens";

function CartPage() {
    const navigate = useNavigate();
    const {
        summary,
        merchantGroups,
        toggleSelect,
        updateQuantity,
        removeItem,
        selectAll,
        selectByMerchant,
        isInitializing,
    } = useCart();
    console.log("merchantGroups", merchantGroups)
    const isEmpty = merchantGroups.length === 0 && !isInitializing;
    const allSelected =
        summary.totalQuantity > 0 && summary.selectedQuantity === summary.totalQuantity;

    const handleCheckout = () => {
        navigate({to: "/checkout"});
    };

    const handleNavigateHome = () => {
        navigate({to: "/"});
    };

    if (isInitializing) {
        return (
            <Box sx={{bgcolor: tokens.colors.background.primary}}>
                <CartHeader totalQuantity={0} onNavigateHome={handleNavigateHome}/>
                <Box
                    sx={{}}
                >
                    <CircularProgress sx={{color: tokens.colors.accent.black}}/>
                </Box>
            </Box>
        );
    }

    if (isEmpty) {
        return (
            <Box sx={{bgcolor: tokens.colors.background.primary}}>
                <CartHeader totalQuantity={0} onNavigateHome={handleNavigateHome}/>
                <Box
                    sx={{
                        mx: "auto",
                        px: tokens.spacing[4],
                        py: tokens.spacing[6],
                    }}
                >
                    <EmptyCart onNavigateHome={handleNavigateHome}/>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{bgcolor: tokens.colors.background.primary}}>
            <CartHeader totalQuantity={summary.totalQuantity} onNavigateHome={handleNavigateHome}/>

            <Box>
                <Typography
                    variant="h5"
                    sx={{m: tokens.spacing[1], fontWeight: 600, color: tokens.colors.text.primary,}}
                >
                    购物车商品
                </Typography>
            </Box>

            <Box>
                {merchantGroups.map((group) => (
                    <MerchantCartGroup
                        key={group.merchantId}
                        group={group}
                        onToggleSelect={toggleSelect}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeItem}
                        onSelectByMerchant={selectByMerchant}
                    />
                ))}
            </Box>


            <CartSummaryCard
                summary={summary}
                allSelected={allSelected}
                onSelectAll={selectAll}
                onCheckout={handleCheckout}
                variant="sidebar"
            />


            {/*<Box sx={{ display: { xs: "block", lg: "none" } }}>*/}
            {/*  <CartSummaryCard*/}
            {/*    summary={summary}*/}
            {/*    allSelected={allSelected}*/}
            {/*    onSelectAll={selectAll}*/}
            {/*    onCheckout={handleCheckout}*/}
            {/*    variant="bottomBar"*/}
            {/*  />*/}
            {/*</Box>*/}
        </Box>
    );
}

// 购物车导航栏
function CartHeader({totalQuantity, onNavigateHome}: {
    totalQuantity: number;
    onNavigateHome: () => void;
}) {
    return (
        <Box
            sx={{
                bgcolor: tokens.colors.background.card,
                borderBottom: `1px solid ${tokens.colors.border.default}`,

            }}
        >
            <Box
                sx={{
                    mx: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: tokens.spacing[2],
                    px: tokens.spacing[1],
                    py: tokens.spacing[1],
                }}
            >
                <Box
                    component="button"
                    onClick={onNavigateHome}
                    sx={{

                        border: "none",
                        bgcolor: "transparent",
                        borderRadius: tokens.radius.md,
                        cursor: "pointer",
                        color: tokens.colors.text.primary,
                        "&:hover": {bgcolor: tokens.colors.background.primary},
                    }}
                >
                    <ArrowLeft size={20}/>
                </Box>
                <Typography variant="h6" sx={{fontWeight: 600, color: tokens.colors.text.primary}}>
                    购物车
                    {totalQuantity > 0 && (
                        <Typography
                            component="span"
                            variant="body2"
                            sx={{color: tokens.colors.text.secondary, fontWeight: 400}}
                        >
                            ({totalQuantity})
                        </Typography>
                    )}
                </Typography>
            </Box>
        </Box>
    );
}

export const Route = createFileRoute("/cart/")({
    component: CartPage,
});
