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

  const isEmpty = merchantGroups.length === 0 && !isInitializing;
  const allSelected =
    summary.totalQuantity > 0 && summary.selectedQuantity === summary.totalQuantity;

  const handleCheckout = () => {
    navigate({ to: "/checkout" });
  };

  const handleNavigateHome = () => {
    navigate({ to: "/" });
  };

  if (isInitializing) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary }}>
        <CartHeader totalQuantity={0} onNavigateHome={handleNavigateHome} />
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "60vh",
          }}
        >
          <CircularProgress sx={{ color: tokens.colors.accent.black }} />
        </Box>
      </Box>
    );
  }

  if (isEmpty) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary }}>
        <CartHeader totalQuantity={0} onNavigateHome={handleNavigateHome} />
        <Box
          sx={{
            maxWidth: 800,
            mx: "auto",
            px: tokens.spacing[4],
            py: tokens.spacing[6],
          }}
        >
          <EmptyCart onNavigateHome={handleNavigateHome} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary }}>
      <CartHeader totalQuantity={summary.totalQuantity} onNavigateHome={handleNavigateHome} />

      <Box
        sx={{
          maxWidth: 1000,
          mx: "auto",
          px: tokens.spacing[4],
          py: tokens.spacing[4],
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          gap: tokens.spacing[5],
          pb: { xs: 20, lg: tokens.spacing[4] },
        }}
      >
        <Box sx={{ flex: 2, minWidth: 0 }}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: tokens.colors.text.primary, mb: tokens.spacing[4] }}
          >
            购物车商品
          </Typography>

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

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            maxWidth: 320,
            display: { xs: "none", lg: "block" },
          }}
        >
          <CartSummaryCard
            summary={summary}
            allSelected={allSelected}
            onSelectAll={selectAll}
            onCheckout={handleCheckout}
            variant="sidebar"
          />
        </Box>
      </Box>

      <Box sx={{ display: { xs: "block", lg: "none" } }}>
        <CartSummaryCard
          summary={summary}
          allSelected={allSelected}
          onSelectAll={selectAll}
          onCheckout={handleCheckout}
          variant="bottomBar"
        />
      </Box>
    </Box>
  );
}

function CartHeader({
  totalQuantity,
  onNavigateHome,
}: {
  totalQuantity: number;
  onNavigateHome: () => void;
}) {
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        bgcolor: tokens.colors.background.card,
        borderBottom: `1px solid ${tokens.colors.border.default}`,
        zIndex: tokens.zIndex.sticky,
      }}
    >
      <Box
        sx={{
          maxWidth: 1000,
          mx: "auto",
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing[2],
          px: tokens.spacing[4],
          py: tokens.spacing[3],
        }}
      >
        <Box
          component="button"
          onClick={onNavigateHome}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            border: "none",
            bgcolor: "transparent",
            borderRadius: tokens.radius.md,
            cursor: "pointer",
            color: tokens.colors.text.primary,
            "&:hover": { bgcolor: tokens.colors.background.primary },
          }}
        >
          <ArrowLeft size={20} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
          购物车
          {totalQuantity > 0 && (
            <Typography
              component="span"
              variant="body2"
              sx={{ ml: tokens.spacing[2], color: tokens.colors.text.secondary, fontWeight: 400 }}
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