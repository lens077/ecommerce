/**
 * 全局 Loading 组件
 *
 * 使用 React Portal 渲染到 body
 */

import { Box, CircularProgress, Typography } from "@mui/material";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
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

// 全局加载状态，与 src/store/* 一致用 zustand（vanilla store + 模块级 action）

interface LoadingState {
  isLoading: boolean;
  message: string;
}

export const loadingStore = createStore<LoadingState>()(() => ({
  isLoading: false,
  message: "",
}));

export const showLoading = (message?: string) => {
  loadingStore.setState({
    isLoading: true,
    // 非组件环境，用 i18next 的 t 而不是 useTranslation
    message: message || i18next.t("common:state.loading"),
  });
};

export const hideLoading = () => {
  loadingStore.setState({ isLoading: false, message: "" });
};

// 全局加载 Provider：用窄 selector 订阅，任一字段变化即重渲染
export function GlobalLoadingProvider() {
  const isLoading = useStore(loadingStore, (state) => state.isLoading);
  const message = useStore(loadingStore, (state) => state.message);

  return <Loading isLoading={isLoading} message={message} fullscreen />;
}
