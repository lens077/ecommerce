import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthError } from "@ecommerce/api/src/interceptors/events";
import SDK from "casdoor-js-sdk";
import { useNavigate, useLocation } from "@tanstack/react-router";

// 1. 定义 Context 类型
interface AuthContextType {
    isAuthenticated: boolean;
    user: any | null;
    login: () => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 2. 这里的配置可以从你的 conf 目录引入
const casdoorConfig = {
    serverUrl: "https://casdoor.example.com",
    clientId: "your_client_id",
    organizationName: "your_org",
    appName: "your_app",
    redirectPath: "/callback",
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));
    const [user, setUser] = useState(null);

    const navigate = useNavigate();
    const location = useLocation();
    const casdoor = new SDK(casdoorConfig);

    // 核心逻辑：登录重定向
    const login = () => {
        // 记录当前页面，方便登录后跳回来
        localStorage.setItem("redirect_after_login", location.href);
        window.location.href = casdoor.getSigninUrl();
    };

    const logout = () => {
        localStorage.removeItem("token");
        setIsAuthenticated(false);
        setUser(null);
        navigate({to: "/"});
    };

    // --- 关键步骤：监听来自 packages/api 的信号 ---
    useEffect(() => {
        // 订阅你在拦截器里 emit 的信号
        const unsubscribe = onAuthError((err) => {
            console.warn("[Auth] 捕获到未登录信号，执行自动重定向...", err);

            // 清理本地过期的 token
            localStorage.removeItem("token");
            setIsAuthenticated(false);

            // 执行登录逻辑
            login();
        });

        return () => unsubscribe(); // 组件卸载时取消订阅，防止内存泄漏
    }, [location.href]);

    return (
        <AuthContext.Provider value={{isAuthenticated, user, login, logout}}>
            {children}
        </AuthContext.Provider>
    );
};

// 方便其他组件/Hooks 使用
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
