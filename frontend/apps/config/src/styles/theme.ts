import { createTheme } from "@mui/material/styles";
import { glassPanel } from "./glass";

// 玻璃态 MUI 主题:半透明面板 + 背景模糊 + 发丝边框。
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#3b6cf6" },
    secondary: { main: "#a855f7" },
    background: {
      default: "transparent", // 背景由 body 渐变提供
      paper: "rgba(255,255,255,0.6)",
    },
    text: {
      primary: "#111827",
      secondary: "#4b5563",
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: [
      "Roboto",
      "-apple-system",
      "BlinkMacSystemFont",
      "PingFang SC",
      "Segoe UI",
      "sans-serif",
    ].join(","),
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          ...glassPanel,
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { ...glassPanel },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(255,255,255,0.35)",
          boxShadow: "0 4px 20px rgba(31,38,135,0.08)",
          color: "#111827",
        },
      },
      defaultProps: { elevation: 0 },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: "rgba(255,255,255,0.5)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderRight: "1px solid rgba(255,255,255,0.35)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", borderRadius: 12 },
      },
    },
  },
});
