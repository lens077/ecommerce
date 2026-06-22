import { createFileRoute } from "@tanstack/react-router";

/**
 * 购物车页面
 * 
 * 遵循设计规范:
 * - 极简主义 + 高端质感
 * - 扁平化设计，细边框
 * - 充足的空间感和呼吸感
 */

import { Box, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingCart } from "lucide-react";
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
  } = useCart();

  const isEmpty = merchantGroups.length === 0;
  const allSelected = summary.totalQuantity > 0 && 
    summary.selectedQuantity === summary.totalQuantity;

  const handleCheckout = () => {
    // TODO: 跳转到结算页
    console.log("Checkout with items:", summary);
    alert("结算功能开发中...");
  };

  const handleNavigateHome = () => {
    navigate({ to: "/" });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: tokens.colors.background.primary,
      }}
    >
      {/* 顶部导航 */}
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
            maxWidth: 600,
            mx: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: tokens.spacing[4],
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: tokens.spacing[2],
            }}
          >
            <Box
              component="button"
              onClick={handleNavigateHome}
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
              }}
            >
              <ArrowLeft size={20} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: tokens.colors.text.primary,
              }}
            >
              购物车
              {summary.totalQuantity > 0 && (
                <Typography
                  component="span"
                  variant="body2"
                  sx={{
                    ml: tokens.spacing[2],
                    color: tokens.colors.text.secondary,
                    fontWeight: 400,
                  }}
                >
                  ({summary.totalQuantity})
                </Typography>
              )}
            </Typography>
          </Box>

          <Box
            component="button"
            sx={{
              border: "none",
              bgcolor: "transparent",
              cursor: "pointer",
              color: tokens.colors.text.secondary,
              fontSize: "0.875rem",
            }}
          >
            管理
          </Box>
        </Box>
      </Box>

      {/* 购物车内容 */}
      <Box
        sx={{
          maxWidth: 600,
          mx: "auto",
          py: tokens.spacing[6],
          px: tokens.spacing[4],
          pb: isEmpty ? 0 : 20, // 为结算栏留出空间
        }}
      >
        {isEmpty ? (
          <EmptyCart onNavigateHome={handleNavigateHome} />
        ) : (
          <>
            {/* 商家分组列表 */}
            {merchantGroups.map((group) => (
              <MerchantCartGroup
                key={group.merchantId}
                group={group}
                onToggleSelect={toggleSelect}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
              />
            ))}
          </>
        )}
      </Box>

      {/* 结算栏 */}
      {!isEmpty && (
        <CartSummaryCard
          summary={summary}
          allSelected={allSelected}
          onSelectAll={selectAll}
          onCheckout={handleCheckout}
        />
      )}
    </Box>
  );
}

export const Route = createFileRoute("/cart/")({
  component: CartPage,
});
