import { createTheme, ThemeProvider } from "@mui/material/styles";
import { enUS, zhCN } from "@mui/material/locale";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { lazy, StrictMode, Suspense, useMemo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { useLocale } from "@ecommerce/i18n";
import { isTauri } from "@ecommerce/tauri";
import { getGatewayBaseUrl } from "@ecommerce/api";
import { initPerf } from "@ecommerce/perf";
import { routeTree } from "./routeTree.gen";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { Code, ConnectError } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { getSharedTransport } from "@ecommerce/api";
import { AuthProvider, useAuthState, useAuthActions } from "@/providers/AuthProvider";

// 桌面端设置面板（Cmd/Ctrl + , 唤起）。懒加载，web 构建里这个 chunk 不会被请求。
const DesktopSettingsDialog = lazy(() => import("@ecommerce/tauri/dialog"));

// Create a new router instance
const router = createRouter({
  routeTree,
  // 注入初始的 context 类型占位
  context: {
    auth: {
      isAuthenticated: false,
      setIsAuthenticated: () => {},
      login: () => {},
      logout: () => {},
    } as any, // 暂时使用 as any 占位，或者直接不加 user,
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const connectErr = ConnectError.from(error);
        return (
          failureCount < 1 &&
          (connectErr.code === Code.Unavailable || connectErr.code === Code.DeadlineExceeded)
        );
      },
      retryDelay: 300,
      throwOnError: false,
      refetchOnWindowFocus: false,
    },
  },
});

const MUI_LOCALES = { "zh-CN": zhCN, en: enUS } as const;

/**
 * consumer 原本没有 ThemeProvider，用的是 MUI 默认主题 + src/styles/tokens.ts。
 * 这里用空对象建主题，spacing 因子仍然是默认的 8，样式行为不变；加它只是为了把
 * MUI 内置文案（Autocomplete/TablePagination 之类）也跟着语言切换。
 */
function LocalizedTheme({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const theme = useMemo(() => createTheme({}, MUI_LOCALES[locale]), [locale]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

function InnerApp() {
  // 获取原子状态（会触发重绘）与 动作方法（持久稳定引用）
  const state = useAuthState();
  const actions = useAuthActions();

  // 将状态与方法聚合还原为一个完整的 auth 对象，下发给路由树的 context
  // 这样 beforeLoad 里依然可以通过 context.auth.isAuthenticated 和 context.auth.login() 正常工作
  const auth = {
    ...state,
    ...actions,
  };

  return <RouterProvider router={router} context={{ auth }} />;
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <StrictMode>
      <LocalizedTheme>
        {/* TransportProvider 必须在 QueryClientProvider 外层：connect-query 的 hook
            先取 transport 再算 query key。这里取的是单例，全 app 只有这一个引用。 */}
        <TransportProvider transport={getSharedTransport()}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider router={router}>
              <InnerApp />
            </AuthProvider>
            {isTauri() && (
              <Suspense fallback={null}>
                <DesktopSettingsDialog />
              </Suspense>
            )}
            <ReactQueryDevtools
              initialIsOpen={false}
              buttonPosition="bottom-right"
              position="bottom"
            />
          </QueryClientProvider>
        </TransportProvider>
      </LocalizedTheme>
    </StrictMode>,
  );
}

// 性能监控:采集 Web Vitals/长任务/接口耗时,经网关 telemetry.v1 落 VM/Loki。
// getRoute 返回**路由模式**(/product/$spuCode)而不是具体 URL —— 它是 metric 的
// label,传具体 URL 会让 VictoriaMetrics 的序列数跟着商品数走。
initPerf({
  // 用运行时地址：桌面端的网关来自用户设置，构建期 env 在那儿是相对路径（/api）。
  gatewayUrl: getGatewayBaseUrl(),
  getRoute: () => {
    const matches = router.state.matches;
    const last = matches[matches.length - 1];
    return last?.routeId ?? window.location.pathname;
  },
});
