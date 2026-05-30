import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals";
import { routeTree } from "./routeTree.gen";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { Code, ConnectError } from "@connectrpc/connect";
import { AuthProvider, useAuthState, useAuthActions } from "@/providers/AuthProvider";

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
        } as any, // 👈 暂时使用 as any 占位，或者直接不加 user,
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
            // 1. 自动重试策略
            retry: (failureCount, error) => {
                const connectErr = ConnectError.from(error);
                // 如果是 404 或 权限问题，不进行重试
                if (connectErr.code === Code.NotFound || connectErr.code === Code.PermissionDenied) {
                    return false;
                }
                // 最多重试 3 次
                return failureCount < 3;
            },
            // 2. 统一错误回调
            throwOnError: false,
            refetchOnWindowFocus: false,
        },
    },
});

function InnerApp() {
    // 2. ✨ 分别获取原子状态（会触发重绘）与 动作方法（持久稳定引用）
    const state = useAuthState();
    const actions = useAuthActions();

    // 3. ✨ 将状态与方法聚合还原为一个完整的 auth 对象，下发给路由树的 context
    // 这样你的 beforeLoad 里依然可以通过 context.auth.isAuthenticated 和 context.auth.login() 正常工作
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
            <QueryClientProvider client={queryClient}>
                <AuthProvider router={router}>
                    <InnerApp/>
                </AuthProvider>
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" position="bottom"/>
            </QueryClientProvider>
        </StrictMode>,
    );
}

reportWebVitals();
