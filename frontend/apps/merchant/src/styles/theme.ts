/**
 * 设计系统 - 商家端
 * 
 * 与消费者端保持一致的设计语言
 */

import { createTheme } from "@mui/material/styles";

// 设计系统常量
export const tokens = {
  colors: {
    background: {
      primary: "#f9fafb",
      card: "#ffffff",
    },
    text: {
      primary: "#111827",
      secondary: "#6b7280",
      disabled: "#d1d5db",
      inverse: "#ffffff",
    },
    border: {
      default: "#e5e7eb",
      hover: "#d1d5db",
      focus: "#000000",
    },
    accent: {
      black: "#000000",
      darkGray: "#374151",
      red: "#ef4444",
      green: "#10b981",
      blue: "#3b82f6",
    },
  },
  spacing: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
};

// 间距常量
export const space = {
  xs: tokens.spacing[1],
  sm: tokens.spacing[2],
  md: tokens.spacing[4],
  lg: tokens.spacing[6],
  xl: tokens.spacing[8],
};

// 圆角常量
export const radius = {
  sm: tokens.radius.sm,
  md: tokens.radius.md,
  lg: tokens.radius.lg,
  xl: tokens.radius.xl,
  full: tokens.radius.full,
};

// 创建 MUI Theme
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: tokens.colors.accent.black,
      contrastText: tokens.colors.text.inverse,
    },
    secondary: {
      main: tokens.colors.accent.darkGray,
    },
    error: {
      main: tokens.colors.accent.red,
    },
    success: {
      main: tokens.colors.accent.green,
    },
    background: {
      default: tokens.colors.background.primary,
      paper: tokens.colors.background.card,
    },
    text: {
      primary: tokens.colors.text.primary,
      secondary: tokens.colors.text.secondary,
    },
    divider: tokens.colors.border.default,
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: {
      fontWeight: 700,
      fontSize: "2rem",
    },
    h2: {
      fontWeight: 600,
      fontSize: "1.5rem",
    },
    h3: {
      fontWeight: 600,
      fontSize: "1.25rem",
    },
    body1: {
      fontSize: "0.95rem",
    },
    body2: {
      fontSize: "0.875rem",
    },
  },
  shape: {
    borderRadius: tokens.radius.md,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          borderRadius: tokens.radius.full,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.lg,
          boxShadow: "none",
          border: `1px solid ${tokens.colors.border.default}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.lg,
          boxShadow: "none",
          border: `1px solid ${tokens.colors.border.default}`,
        },
      },
    },
  },
});
