/**
 * 全局 Loading 组件
 * 
 * 使用 React Portal 渲染到 body
 */

import { Box, CircularProgress, Typography } from "@mui/material";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { i18next } from "@ecommerce/i18n";

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

// 全局加载状态，与 src/store/* 一致用 valtio
import { proxy, useSnapshot } from "valtio";

interface LoadingState {
  isLoading: boolean;
  message: string;
}

export const loadingStore = proxy<LoadingState>({
  isLoading: false,
  message: "",
});

export const showLoading = (message?: string) => {
  loadingStore.isLoading = true;
  // 非组件环境，用 i18next 的 t 而不是 useTranslation
  loadingStore.message = message || i18next.t("common:state.loading");
};

export const hideLoading = () => {
  loadingStore.isLoading = false;
  loadingStore.message = "";
};

// 全局加载 Provider
export function GlobalLoadingProvider() {
  const { isLoading, message } = useSnapshot(loadingStore);

  return <Loading isLoading={isLoading} message={message} fullscreen />;
}
