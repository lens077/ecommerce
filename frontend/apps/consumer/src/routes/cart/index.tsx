import { createFileRoute, useNavigate } from "@tanstack/react-router";

/**
 * 购物车页面
 *
 * 响应式布局：
 * - 桌面端：双栏（左商品列表 + 右结算摘要 sticky）
 * - 移动端：单列 + 底部固定结算栏
 */

import { Box, Typography } from "@mui/material";
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
  } = useCart();

  const isEmpty = merchantGroups.length === 0;
  const allSelected =
    summary.totalQuantity > 0 && summary.selectedQuantity === summary.totalQuantity;

  const handleCheckout = () => {
    navigate({ to: "/checkout" });
  };

  const handleNavigateHome = () => {
    navigate({ to: "/" });
  };

  if (isEmpty) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: tokens.colors.background.primary }}>
        {/* 顶部导航 */}
        <CartHeader totalQuantity={0} onNavigateHome={handleNavigateHome} />
        <Box
          sx={{
            maxWidth: 1200,
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
      {/* 顶部导航 */}
      <CartHeader totalQuantity={summary.totalQuantity} onNavigateHome={handleNavigateHome} />

      {/* 主体内容：响应式双栏 */}
      <Box
        sx={{
          maxWidth: 1200,
          mx: "auto",
          px: tokens.spacing[4],
          py: tokens.spacing[6],
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: tokens.spacing[6],
          pb: { xs: 20, md: tokens.spacing[6] }, // 移动端为底部结算栏留空间
        }}
      >
        {/* 左栏：商品列表 */}
        <Box sx={{ flex: { xs: 1, md: 2 }, minWidth: 0 }}>
          <Typography
            variant="h6"
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

        {/* 右栏：结算摘要（桌面端 sticky，移动端隐藏用底部栏替代） */}
        <Box
          sx={{
            flex: { xs: 1, md: 1 },
            minWidth: 0,
            maxWidth: { md: 360 },
            display: { xs: "none", md: "block" },
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

      {/* 移动端底部结算栏 */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
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

/** 顶部导航栏 */
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
          maxWidth: 1200,
          mx: "auto",
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing[2],
          p: tokens.spacing[4],
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
