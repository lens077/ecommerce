// src/providers/AuthProvider.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import SDK from "casdoor-js-sdk";
import { CASDOOR_CONF } from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";
import { setAccount } from "@/store/users";

// 1. 只存放认证数据的 Context
const AuthStateContext = createContext<{ isAuthenticated: boolean } | undefined>(undefined);

// 2. 只存放操作方法的 Context
interface AuthActionsContextType {
    setIsAuthenticated: (v: boolean) => void;
    login: () => void;
    logout: () => void;
}
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

// 实例化 Casdoor SDK
const casdoor = new SDK(CASDOOR_CONF);

export const AuthProvider: React.FC<{ children: React.ReactNode; router: any }> = ({ children, router }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));

    // 🔐 编写完整的 Casdoor 登录逻辑
    const login = React.useCallback(() => {
        // 通过 router.state.location 拿到 TanStack Router 当前最新的路由路径和参数
        // 拼接成完整的 Href，以便登录后重定向回来（实现无缝回跳）
        const currentHref = window.location.origin + router.state.location.href;
        localStorage.setItem("redirect_after_login", currentHref);

        // 唤起 Casdoor 官方 SDK 提供的方法，直接改变浏览器地址栏进行硬重定向
        window.location.href = casdoor.getSigninUrl();
    }, [router]);

    // 🔓 登出逻辑
    const logout = React.useCallback(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("redirect_after_login");
        setAccount({}); // 清空全局用户 Store
        setIsAuthenticated(false);

        // 使用传递进来的全局 router 实例安全导航
        router.navigate({ to: "/" });
    }, [router]);

    // 📡 集中式拦截：监听来自 packages/api 的 Axios/Connect-Web 401 信号
    useEffect(() => {
        const unsubscribe = onAuthError((err) => {
            // 如果当前在 callback 页面，跳过自动重定向
            // callback 页面的 signIn 调用如果返回 Unauthenticated，会先触发 emitAuthError，
            // 如果不跳过，login() 会在 callback 的 catch 块处理之前就重定向到 Casdoor，导致登录死循环
            if (router.state.location.pathname.startsWith("/callback")) {
                console.warn("[Auth] 在 callback 页面捕获到认证错误，跳过自动重定向:", err);
                return;
            }

            console.warn("[Auth] 核心拦截器捕获到未登录或Token失效信号，执行自动清空并重定向...", err);
            localStorage.removeItem("token");
            setIsAuthenticated(false);
            login(); // 发现过期，自动触发上面的 Casdoor 跳转
        });

        return () => {
            unsubscribe();
        };
        // login 引用稳定（router 不变则不变），无需在路由变化时重新订阅
    }, [login]);

    // 缓存 Action 对象，确保引用绝对稳定，防止下游组件无意义重绘
    const actions = React.useMemo(() => ({ setIsAuthenticated, login, logout }), [login, logout]);

    return (
        <AuthStateContext.Provider value={{ isAuthenticated }}>
            <AuthActionsContext.Provider value={actions}>
                {children}
            </AuthActionsContext.Provider>
        </AuthStateContext.Provider>
    );
};

// 3. 细粒度、带防错提示的自定义 Hooks
export const useAuthState = () => {
    const context = useContext(AuthStateContext);
    if (!context) {
        throw new Error("useAuthState must be used within an AuthProvider");
    }
    return context;
};

export const useAuthActions = () => {
    const context = useContext(AuthActionsContext);
    if (!context) {
        throw new Error("useAuthActions must be used within an AuthProvider");
    }
    return context;
};
