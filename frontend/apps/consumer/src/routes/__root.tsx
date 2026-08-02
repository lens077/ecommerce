import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Box } from "@mui/material";
import AppBar from "@/components/AppBar";
import PrivacyConsent from "@/components/PrivacyConsent";
import Footer from "@/components/Footer";

// 1. 定义你期望在全局路由上下文中拿到的类型
interface MyRouterContext {
    auth: {
        isAuthenticated: boolean
        setIsAuthenticated: (v: boolean) => void
        login: () => void
        logout: () => void
    };
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    component: () => {
        const handleConsent = (settings: any) => {
            console.log("Privacy consent settings:", settings);
            // 这里可以根据用户的隐私设置执行相应的操作
        };

        return (
            <Box sx={{display: "flex", flexDirection: "column", minHeight: "100vh"}}>
                <AppBar/>
                <Box component="main" sx={{flex: 1}}>
                    <Outlet/>
                </Box>
                <Footer/>
                <PrivacyConsent onConsent={handleConsent}/>
                {/* 只在 dev 挂载：devtools 的 client bus 会连 ws://<host>/__devtools/ws，
                    桌面端生产包的 CSP 里没有开 ws，挂上去只会刷两条 violation；
                    顺带也别让发布包里出现那个悬浮调试按钮。 */}
                {import.meta.env.DEV && (
                    <TanStackDevtools
                        config={{
                            position: "bottom-right",
                        }}
                        plugins={[
                            {
                                name: "Tanstack Router",
                                render: <TanStackRouterDevtoolsPanel/>,
                            },
                        ]}
                    />
                )}
            </Box>
        );
    },
});
