// src/providers/AuthProvider.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import SDK from "casdoor-js-sdk";
import { CASDOOR_CONF, DESKTOP_REDIRECT_URI, getDesktopSigninUrl } from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";
import { isTauri } from "@ecommerce/tauri";
import { isTokenExpired } from "@ecommerce/utils";
import { setAccount } from "@/store/users";

// 死循环保护窗口：若在自动跳转登录后的该毫秒数内仍收到认证失败，
// 说明换到的 token 依然无效（残留坏 token / 令牌签名证书与网关不一致），
// 此时停止再次自动跳转，退回登录页，避免与 Casdoor 活动会话构成无限重定向。
const LOGIN_LOOP_GUARD_MS = 15000;
const LAST_LOGIN_REDIRECT_KEY = "last_login_redirect";

// 校验本地 token：存在且未过期才算已认证；否则清除，避免带着坏 token 进入首页触发死循环。
const hasValidToken = (): boolean => {
  const token = localStorage.getItem("token");
  if (!token) return false;
  try {
    if (isTokenExpired(token)) {
      localStorage.removeItem("token");
      return false;
    }
    return true;
  } catch {
    localStorage.removeItem("token");
    return false;
  }
};

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

export const AuthProvider: React.FC<{ children: React.ReactNode; router: any }> = ({
  children,
  router,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(hasValidToken);

  // 🔐 编写完整的 Casdoor 登录逻辑
  const login = React.useCallback(() => {
    // 通过 router.state.location 拿到 TanStack Router 当前最新的路由路径和参数
    // 拼接成完整的 Href，以便登录后重定向回来（实现无缝回跳）
    const currentHref = window.location.origin + router.state.location.href;
    localStorage.setItem("redirect_after_login", currentHref);

    // 记录本次自动跳转登录的时间戳，用于死循环保护（见下方 onAuthError）
    sessionStorage.setItem(LAST_LOGIN_REDIRECT_KEY, String(Date.now()));

    // 桌面端不能硬跳转：主窗口的源是 tauri://localhost，跳出去 Casdoor 就回不来了。
    // 改为开一个子窗口加载登录页，由 Rust 侧拦截回调地址把 code/state 送回来，
    // 再手动导航到 /callback 复用既有的兑换逻辑。
    if (isTauri()) {
      void (async () => {
        const { openCasdoorLogin, OauthCancelledError } = await import("@ecommerce/tauri/auth");
        try {
          const redirectUri = DESKTOP_REDIRECT_URI.config;
          const { code, state } = await openCasdoorLogin(
            getDesktopSigninUrl(redirectUri),
            redirectUri,
          );
          await router.navigate({ to: "/callback", search: { code, state } });
        } catch (err) {
          if (err instanceof OauthCancelledError) return;
          console.error("[Auth] 桌面端登录失败:", err);
        }
      })();
      return;
    }

    // 唤起 Casdoor 官方 SDK 提供的方法，直接改变浏览器地址栏进行硬重定向
    window.location.href = casdoor.getSigninUrl();
  }, [router]);

  // 🔓 登出逻辑
  const logout = React.useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("redirect_after_login");
    sessionStorage.removeItem(LAST_LOGIN_REDIRECT_KEY);
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

      console.warn("[Auth] 核心拦截器捕获到未登录或Token失效信号，执行自动清空...", err);
      localStorage.removeItem("token");
      setIsAuthenticated(false);

      // 死循环保护：若距离上次自动跳转登录很近（说明刚从 Casdoor 回来、换到的 token 仍然认证失败），
      // 则不再自动跳转，停留在“请先登录”页，避免与 Casdoor 活动会话构成无限重定向。
      // 常见诱因：残留的旧/坏签名 token、令牌签名证书与网关 public.pem 不一致、或后端未放行该角色。
      const lastRedirect = Number(sessionStorage.getItem(LAST_LOGIN_REDIRECT_KEY) || 0);
      if (lastRedirect && Date.now() - lastRedirect < LOGIN_LOOP_GUARD_MS) {
        sessionStorage.removeItem(LAST_LOGIN_REDIRECT_KEY);
        console.error(
          "[Auth] 登录后仍认证失败，已停止自动重定向以避免死循环；请重新点击登录，或检查令牌签名/后端鉴权。",
        );
        return; // 停在“请先登录”页，由用户手动点击登录重试
      }

      login(); // 首次失效：自动触发 Casdoor 跳转登录
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
      <AuthActionsContext.Provider value={actions}>{children}</AuthActionsContext.Provider>
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
