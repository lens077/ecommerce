// src/providers/AuthProvider.tsx
//
// 两条并存的登录路径（control-tower ADR-0002 / bff-migration.md）：
//
//   Web 端  → **BFF 会话**：网关跑完 OAuth，令牌全留服务端，浏览器只有一枚 httpOnly
//             session id。前端不存令牌、不做续期、不解析 JWT——登录态问 /auth/me。
//   桌面端  → **保留 PKCE + bearer**：Tauri 主窗口的源是 tauri://localhost，拿不到
//             浏览器 cookie，所以整套 pkce/tokenStore 仍在为它服务。切换见 P3。
//
// 网关同时接受两种凭据（cookie ∥ bearer），所以两条路径可以长期并存、互不影响。
import React, { createContext, useContext, useState, useEffect } from "react";
import {
  DESKTOP_REDIRECT_URI,
  WEB_REDIRECT_URI,
  bffLogout,
  buildDesktopLoginUrl,
  buildLogoutUrl,
  configureSession,
  fetchIdentity,
  renewSession,
  restoreSession,
  startBffLogin,
  stopRenew,
} from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";
import { isTauri } from "@ecommerce/tauri";
import { clearTokens, getIdToken, hasToken, subscribeToken } from "@ecommerce/utils";
import { clearAccount } from "@/store/users";

// 1. 只存放认证数据的 Context
const AuthStateContext = createContext<
  { isAuthenticated: boolean; roles: string[]; name: string | null } | undefined
>(undefined);

// 2. 只存放操作方法的 Context
interface AuthActionsContextType {
  setIsAuthenticated: (v: boolean) => void;
  login: () => void;
  logout: () => void;
}
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

// 告诉会话模块用哪个 redirect_uri —— 授权与兑换必须逐字一致（仅桌面端 PKCE 用到）
configureSession(WEB_REDIRECT_URI);

export const AuthProvider: React.FC<{ children: React.ReactNode; router: any }> = ({
  children,
  router,
}) => {
  // 桌面端令牌只存内存，刷新即空；Web 端压根没有令牌，登录态由 /auth/me 决定。
  const [isAuthenticated, setIsAuthenticated] = useState(() => (isTauri() ? hasToken() : false));
  const [roles, setRoles] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);

  // 🔐 登录
  const login = React.useCallback(() => {
    // 桌面端不能硬跳转：主窗口的源是 tauri://localhost，跳出去 Casdoor 就回不来了。
    // 改为开一个子窗口加载登录页，由 Rust 侧拦截回调地址把 code/state 送回来，
    // 再手动导航到 /callback 复用既有的兑换逻辑。
    if (isTauri()) {
      const currentHref = window.location.origin + router.state.location.href;
      localStorage.setItem("redirect_after_login", currentHref);
      void (async () => {
        const { openCasdoorLogin, OauthCancelledError } = await import("@ecommerce/tauri/auth");
        try {
          const redirectUri = DESKTOP_REDIRECT_URI.consumer;
          const { code, state } = await openCasdoorLogin(
            await buildDesktopLoginUrl(redirectUri),
            redirectUri,
          );
          // state 与 PKCE 的校验统一在 /callback 的 exchangeCode() 里做
          // （它比对 sessionStorage 里那份随机 state 并消费 verifier），
          // 桌面端不再自带一套 —— 两套校验各写各的正是漂移的来源。
          await router.navigate({ to: "/callback", search: { code, state } });
        } catch (err) {
          if (err instanceof OauthCancelledError) return;
          console.error("[Auth] 桌面端登录失败:", err);
        }
      })();
      return;
    }

    // Web 端：整页跳到网关，由它跑完 OAuth 再跳回来。
    // 回跳目标用相对路径，网关只接受相对路径或白名单来源（防开放重定向）。
    startBffLogin(router.state.location.href);
  }, [router]);

  // 🔓 登出
  const logout = React.useCallback(() => {
    if (isTauri()) {
      // ⚠️ 顺序：先取 id_token，再 clearTokens()。Casdoor 的 end_session_endpoint
      // 强制要求 id_token_hint，清完就拿不到了。
      const idToken = getIdToken();
      stopRenew(); // 先停掉定时续期，否则刚清完又被续回来
      clearTokens();
      localStorage.removeItem("redirect_after_login");
      clearAccount();
      setIsAuthenticated(false);
      // 结束 Casdoor 侧会话，否则下次静默续期又把用户"登"回来。
      window.location.assign(buildLogoutUrl(`${window.location.origin}/`, idToken));
      return;
    }

    // Web 端：一次 POST 就够——网关删会话（即时生效）并清 cookie。
    // Casdoor 侧会话是否一并结束由网关决定，前端不再拼 end_session_endpoint。
    void bffLogout().finally(() => {
      clearAccount();
      setIsAuthenticated(false);
      setRoles([]);
      setName(null);
      window.location.assign("/");
    });
  }, []);

  // ❄️ 冷启动：确定当前登录态
  useEffect(() => {
    if (isTauri()) {
      // 桌面端：令牌只在内存，刷新就没了，靠 Casdoor 会话 Cookie 静默换一份新的。
      // callback 页面自己会完成兑换，不要和它抢（两边同时兑换会互相作废 verifier）。
      if (window.location.pathname.startsWith("/callback")) return;
      void restoreSession().then((ok) => setIsAuthenticated(ok));
      return;
    }
    // Web 端：问网关。没有令牌可恢复，也没有 iframe 静默续期那套竞态。
    void fetchIdentity().then((id) => {
      setIsAuthenticated(id.authenticated);
      setRoles(id.roles ?? []);
      setName(id.name ?? null);
    });
  }, [router]);

  // 桌面端令牌被续期/清空时同步组件状态；Web 端没有令牌，无需订阅。
  useEffect(() => {
    if (!isTauri()) return;
    return subscribeToken((tk) => setIsAuthenticated(tk !== null));
  }, []);

  // 📡 集中式拦截：监听来自 packages/api 的 401 信号
  useEffect(() => {
    const unsubscribe = onAuthError((err) => {
      if (router.state.location.pathname.startsWith("/callback")) {
        console.warn("[Auth] 在 callback 页面捕获到认证错误，跳过自动重定向:", err);
        return;
      }

      if (!isTauri()) {
        // Web 端：续期是网关的事（它在请求链路上顺手做）。这里收到 401 就意味着
        // 会话真的没了（过期/被撤销/被登出），前端再"续"一次既做不到也没意义——
        // 直接跳登录。这也去掉了旧实现里"401 → 静默续期 → 竞态"那条路径。
        setIsAuthenticated(false);
        setRoles([]);
        setName(null);
        startBffLogin(router.state.location.href);
        return;
      }

      // 桌面端：仍是"先静默续期，续不上才踢人"。
      void renewSession()
        .then(() => {
          console.info("[Auth] 401 后静默续期成功，用户无感");
          setIsAuthenticated(true);
        })
        .catch((renewErr) => {
          console.warn("[Auth] 静默续期失败，跳转登录:", renewErr, "原始错误:", err);
          stopRenew();
          clearTokens();
          setIsAuthenticated(false);
          login();
        });
    });

    return () => {
      unsubscribe();
    };
  }, [login, router]);

  // 缓存 Action 对象，确保引用绝对稳定，防止下游组件无意义重绘
  const actions = React.useMemo(() => ({ setIsAuthenticated, login, logout }), [login, logout]);
  const state = React.useMemo(
    () => ({ isAuthenticated, roles, name }),
    [isAuthenticated, roles, name],
  );

  return (
    <AuthStateContext.Provider value={state}>
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
