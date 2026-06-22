/**
 * 全局 Loading 组件
 * 
 * 使用 React Portal 渲染到 body
 */

import { Box, CircularProgress, Typography } from "@mui/material";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface LoadingProps {
  isLoading: boolean;
  message?: string;
  fullscreen?: boolean;
}

export function Loading({ isLoading, message, fullscreen = false }: LoadingProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isLoading) return null;

  const content = (
    <Box
      sx={{
        position: fullscreen ? "fixed" : "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: fullscreen ? "rgba(255, 255, 255, 0.9)" : "transparent",
        backdropFilter: fullscreen ? "blur(4px)" : "none",
        zIndex: 9999,
      }}
    >
      <CircularProgress size={48} sx={{ color: "primary.main" }} />
      {message && (
        <Typography
          variant="body2"
          sx={{
            mt: 2,
            color: "text.secondary",
          }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );

  return createPortal(content, document.body);
}

// 全局加载状态 Hook
import { create } from "zustand";

interface LoadingStore {
  isLoading: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
}

export const useLoadingStore = create<LoadingStore>((set) => ({
  isLoading: false,
  message: "",
  show: (message) => set({ isLoading: true, message: message || "加载中..." }),
  hide: () => set({ isLoading: false, message: "" }),
}));

// 全局加载 Provider
export function GlobalLoadingProvider() {
  const { isLoading, message } = useLoadingStore();

  return <Loading isLoading={isLoading} message={message} fullscreen />;
}
