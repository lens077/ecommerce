/**
 * 空购物车组件
 * 
 * 购物车为空时显示
 */

import { Box, Button, Typography } from "@mui/material";
import { ShoppingCart } from "lucide-react";
import { tokens } from "@/styles/tokens";

interface EmptyCartProps {
  onNavigateHome: () => void;
}

export function EmptyCart({ onNavigateHome }: EmptyCartProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: tokens.spacing[6],
        px: tokens.spacing[6],
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: tokens.colors.background.primary,
          borderRadius: tokens.radius.full,
          mb: tokens.spacing[6],
        }}
      >
        <ShoppingCart
          size={50}
          color={tokens.colors.text.disabled}
          strokeWidth={1.5}
        />
      </Box>

      <Typography
        variant="h6"
        sx={{
          color: tokens.colors.text.primary,
          fontWeight: 600,
          mb: tokens.spacing[1],
        }}
      >
        购物车是空的
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: tokens.colors.text.secondary,
          mb: tokens.spacing[3],
        }}
      >
        快去挑选心仪的商品吧
      </Typography>

      <Button
        variant="contained"
        onClick={onNavigateHome}
        sx={{
          px: tokens.spacing[8],
          height: 44,
          bgcolor: tokens.colors.accent.black,
          color: tokens.colors.text.inverse,
          borderRadius: tokens.radius.full,
          textTransform: "none",
          fontWeight: 500,
          boxShadow: "none",
          "&:hover": {
            bgcolor: tokens.colors.accent.darkGray,
            boxShadow: "none",
          },
            whiteSpace: "nowrap"
        }}
      >
        去逛逛
      </Button>
    </Box>
  );
}
