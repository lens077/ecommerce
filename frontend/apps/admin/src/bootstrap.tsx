import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Code, ConnectError } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { BffAuthProvider } from "@ecommerce/ui";
import { getSharedTransport } from "@ecommerce/api";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { routeTree } from "./routeTree.gen";
import { theme } from "./styles/theme";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// 创建 Query Client。retry/refetchOnWindowFocus 是全 app 默认值，单个查询不要重复设
// （见 context/project/ecommerce/frontend-api/sop/connect-query.md），与 consumer 保持一致：
// 只有网关不可达/超时才重试一次。
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* TransportProvider 必须在 QueryClientProvider 外层：connect-query 的 hook
          先取 transport 再算 query key。transport 是全 app 单例（见 packages/api/src/transport.ts）。 */}
      <TransportProvider transport={getSharedTransport()}>
        <QueryClientProvider client={queryClient}>
          {/* BFF 登录态：会话在 httpOnly cookie 里，401 自动跳登录（ADR-0002） */}
          <BffAuthProvider>
            <RouterProvider router={router} />
          </BffAuthProvider>
        </QueryClientProvider>
      </TransportProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
