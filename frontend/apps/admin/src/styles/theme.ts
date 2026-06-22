/**
 * Admin Theme Configuration
 */

import { createTheme } from "@mui/material/styles";
import { tokens } from "./tokens";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: tokens.colors.text.primary,
      contrastText: "#ffffff",
    },
    secondary: {
      main: tokens.colors.accent.blue,
    },
    error: {
      main: tokens.colors.accent.red,
    },
    success: {
      main: tokens.colors.accent.green,
    },
    warning: {
      main: tokens.colors.accent.yellow,
    },
    background: {
      default: tokens.colors.background.primary,
      paper: tokens.colors.background.card,
    },
    text: {
      primary: tokens.colors.text.primary,
      secondary: tokens.colors.text.secondary,
      disabled: tokens.colors.text.disabled,
    },
    divider: tokens.colors.border.default,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
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
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          border: `1px solid ${tokens.colors.border.default}`,
          borderRadius: tokens.radius.lg,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});
