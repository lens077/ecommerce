/**
 * 商家端应用入口
 */

import React, { lazy, Suspense, useMemo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { enUS, zhCN } from "@mui/material/locale";
import { useLocale } from "@ecommerce/i18n";
import { isTauri } from "@ecommerce/tauri";
import { routeTree } from "./routeTree.gen";
import { createAppTheme } from "./styles/theme";

// 桌面端设置面板（Cmd/Ctrl + , 唤起）。懒加载，web 构建里这个 chunk 不会被请求。
const DesktopSettingsDialog = lazy(() => import("@ecommerce/tauri/dialog"));

// 创建 Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      retry: 1,
    },
  },
});

// 创建 Router
const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

// 全局样式
const globalStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;

// 注入全局样式
const styleSheet = document.createElement("style");
styleSheet.textContent = globalStyles;
document.head.appendChild(styleSheet);

const MUI_LOCALES = { "zh-CN": zhCN, en: enUS } as const;

/** 主题跟着语言重建，把 MUI 内置组件的文案也带上。 */
function LocalizedTheme({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const theme = useMemo(() => createAppTheme(MUI_LOCALES[locale]), [locale]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

// 渲染应用
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocalizedTheme>
        <CssBaseline />
        <RouterProvider router={router} />
        {isTauri() && (
          <Suspense fallback={null}>
            <DesktopSettingsDialog />
          </Suspense>
        )}
      </LocalizedTheme>
    </QueryClientProvider>
  </React.StrictMode>,
);
