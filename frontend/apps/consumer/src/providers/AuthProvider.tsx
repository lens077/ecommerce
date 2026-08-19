// src/providers/AuthProvider.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import {
  DESKTOP_REDIRECT_URI,
  WEB_REDIRECT_URI,
  configureSession,
  buildDesktopLoginUrl,
  buildLogoutUrl,
  restoreSession,
  renewSession,
  startLogin,
  stopRenew,
} from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";
import { isTauri } from "@ecommerce/tauri";
import { clearTokens, getIdToken, hasToken, subscribeToken } from "@ecommerce/utils";
import { clearAccount } from "@/store/users";

// 1. 只存放认证数据的 Context
const AuthStateContext = createContext<{ isAuthenticated: boolean } | undefined>(undefined);

// 2. 只存放操作方法的 Context
interface AuthActionsContextType {
  setIsAuthenticated: (v: boolean) => void;
  login: () => void;
  logout: () => void;
}
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

// 告诉会话模块用哪个 redirect_uri —— 授权与兑换必须逐字一致
configureSession(WEB_REDIRECT_URI);

export const AuthProvider: React.FC<{ children: React.ReactNode; router: any }> = ({
  children,
  router,
}) => {
  // 令牌只存内存（防 XSS，见 packages/utils/src/tokenStore.ts），
  // 所以刷新页面后这里必然是 false，由下面的冷启动恢复接回来。
  const [isAuthenticated, setIsAuthenticated] = useState(hasToken());

  // 🔐 编写完整的 Casdoor 登录逻辑
  const login = React.useCallback(() => {
    // 通过 router.state.location 拿到 TanStack Router 当前最新的路由路径和参数
    // 拼接成完整的 Href，以便登录后重定向回来（实现无缝回跳）
    const currentHref = window.location.origin + router.state.location.href;
    localStorage.setItem("redirect_after_login", currentHref);

    // 桌面端不能硬跳转：主窗口的源是 tauri://localhost，跳出去 Casdoor 就回不来了。
    // 改为开一个子窗口加载登录页，由 Rust 侧拦截回调地址把 code/state 送回来，
    // 再手动导航到 /callback 复用既有的兑换逻辑。
    if (isTauri()) {
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

    // Web 端：PKCE 授权跳转（生成 verifier + challenge 后整页跳 Casdoor）
    void startLogin(WEB_REDIRECT_URI);
  }, [router]);

  // 🔓 登出逻辑
  const logout = React.useCallback(() => {
    // ⚠️ 顺序：先取 id_token，再 clearTokens()。Casdoor 的 end_session_endpoint
    // 强制要求 id_token_hint，清完就拿不到了。
    const idToken = getIdToken();
    stopRenew(); // 先停掉定时续期，否则刚清完又被续回来
    clearTokens();
    localStorage.removeItem("redirect_after_login");
    // clearTokens() 已经会经令牌订阅清空 Store（见 store/users.ts），这里再显式写一次：
    // 登出是唯一一条「必须清干净」的路径，不该依赖另一个模块的副作用来保证。
    clearAccount();
    setIsAuthenticated(false);

    // 最后一步：结束 Casdoor 侧的会话。
    // 只做上面那些「本地清理」是不够的 —— Casdoor 开着「保持登录会话」+「自动登录」，
    // 它那侧的 casdoor_session_id 还在，下次 restoreSession() 会 prompt=none 静默换回令牌，
    // 用户看到的就是「登出后一刷新又登录了」。
    // 用整页跳转而不是 router.navigate：会话 cookie 是 HttpOnly + SameSite=Lax，
    // 只有顶级导航才会带上它（fetch 被 Casdoor 的 CORS 403 挡掉，iframe 带不上 cookie）。
    // 跳转本身就把用户送回首页，所以这里不再 router.navigate。
    window.location.assign(buildLogoutUrl(`${window.location.origin}/`, idToken));
  }, []);

  // ❄️ 冷启动恢复：令牌只在内存，刷新页面就没了。
  // 靠 Casdoor 的会话 Cookie 静默换一份新的（prompt=none，隐藏 iframe，无跳转闪烁）。
  // 失败不是错误 —— 只说明当前确实未登录。
  useEffect(() => {
    // callback 页面自己会完成兑换，不要和它抢（两边同时兑换会互相作废 verifier）。
    // ⚠️ 用 window.location 而不是 router.state.location：后者要等 TanStack Router
    // 初始化完才是真值，effect 首跑时可能还是 "/"，于是这道防护形同虚设 ——
    // restoreSession() 照跑，silentRenew 的 buildAuthorizeUrl 覆盖掉 startLogin 刚写的
    // state/verifier，顶层 exchangeCode 就报 "OAuth state 校验失败"。
    // 2026-08-19 本地实测复现：Casdoor 已成功回跳带 code，但兑换必失败。
    // Casdoor 开了「保持登录会话」后 silentRenew 更容易成功，这个竞态被放大。
    if (window.location.pathname.startsWith("/callback")) return;
    void restoreSession().then((ok) => setIsAuthenticated(ok));
  }, [router]);

  // 令牌被续期/清空时同步组件状态，避免 UI 与实际登录态脱节
  useEffect(() => subscribeToken((tk) => setIsAuthenticated(tk !== null)), []);

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

      // 先尝试静默续期再决定是否踢人：令牌到期是常态（而且现在只存内存，
      // 切回一个放置很久的标签页必然过期），能续上就不该打断用户。
      // 续不上才说明 Casdoor 侧会话也没了，这时跳登录才是对的。
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
