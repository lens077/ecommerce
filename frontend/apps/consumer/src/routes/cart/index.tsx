import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";
import { useCart } from "@/hooks/useCart";
import { EmptyCart } from "@/components/cart/EmptyCart";
import { CartSummaryCard } from "@/components/cart/CartSummaryCard";
import { MerchantCartGroup } from "@/components/cart/MerchantCartGroup";
import { sp, tokens } from "@/styles/tokens";

function CartPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
            py: sp[16],
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
        <Container maxWidth="lg" sx={{ py: sp[6] }}>
          <EmptyCart onNavigateHome={handleNavigateHome} />
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary }}>
      <CartHeader totalQuantity={summary.totalQuantity} onNavigateHome={handleNavigateHome} />

      <Container
        maxWidth="lg"
        sx={{
          py: sp[5],
          // 移动端为底部结算栏留出空间
          pb: { xs: "96px", lg: sp[8] },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" },
            gap: sp[5],
            alignItems: "start",
          }}
        >
          {/* 左侧：商品列表 */}
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                mb: sp[4],
                color: tokens.colors.text.primary,
              }}
            >
              {t("cart.itemsTitle")}
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: sp[4] }}>
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
          </Box>

          {/* 右侧：结算侧边栏（桌面端） */}
          <Box sx={{ display: { xs: "none", lg: "block" } }}>
            <CartSummaryCard
              summary={summary}
              allSelected={allSelected}
              onSelectAll={selectAll}
              onCheckout={handleCheckout}
              variant="sidebar"
            />
          </Box>
        </Box>
      </Container>

      {/* 移动端底部结算栏 */}
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

// 购物车导航栏
function CartHeader({
  totalQuantity,
  onNavigateHome,
}: {
  totalQuantity: number;
  onNavigateHome: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: tokens.zIndex.sticky,
        bgcolor: tokens.colors.background.card,
        borderBottom: `1px solid ${tokens.colors.border.default}`,
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: sp[2],
            py: sp[3],
          }}
        >
          <Box
            component="button"
            onClick={onNavigateHome}
            aria-label={t("notFound.home")}
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
              transition: tokens.transitions.fast,
              "&:hover": { bgcolor: tokens.colors.background.primary },
            }}
          >
            <ArrowLeft size={20} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
            {t("cart.title")}
            {totalQuantity > 0 && (
              <Typography
                component="span"
                variant="body2"
                sx={{ color: tokens.colors.text.secondary, fontWeight: 400, ml: sp[1] }}
              >
                ({totalQuantity})
              </Typography>
            )}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

export const Route = createFileRoute("/cart/")({
  component: CartPage,
});
