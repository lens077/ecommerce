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
import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from "react";
import { goHome } from "@/lib/home";
import {
  DESKTOP_REDIRECT_URI,
  bffLogout,
  buildNativeLoginUrl,
  fetchIdentity,
  startBffLogin,
} from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";
import { isTauri } from "@ecommerce/tauri";
import { tracker } from "@ecommerce/tracker";
import { clearSessionId, getSessionId, setSessionId } from "@ecommerce/utils";
import type { RegisteredRouter } from "@tanstack/react-router";
import { clearAccount, setAccount } from "@/store/users";

// 1. 只存放认证数据的 Context
const AuthStateContext = createContext<
  { isAuthenticated: boolean; loading: boolean; roles: string[]; name: string | null } | undefined
>(undefined);

// 2. 只存放操作方法的 Context
interface AuthActionsContextType {
  login: () => void;
  logout: () => void;
}
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

type AuthRouter = Pick<RegisteredRouter, "navigate"> & {
  state: { location: Pick<RegisteredRouter["state"]["location"], "href"> };
};

export const AuthProvider: React.FC<{ children: React.ReactNode; router: AuthRouter }> = ({
  children,
  router,
}) => {
  // 两端都没有本地凭据可读：Web 的会话 id 在 httpOnly cookie 里，桌面端的在内存里且
  // 重启即空。登录态一律以 /auth/me 为准。
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);

  // 「当前是否已登录」的实时快照，专供 onAuthError 回调读取。
  // 用 ref 而不是把 isAuthenticated 放进那个 effect 的依赖数组：后者会让监听器
  // 随每次登录态变化重订阅，而回调只需要读到最新值。
  const isAuthenticatedRef = React.useRef(false);

  // 登录、登出和卸载都会淘汰旧异步结果，包括尚未返回的原生登录窗口。
  const identityVersion = React.useRef(0);
  const invalidateIdentity = React.useCallback(() => ++identityVersion.current, []);

  const resetToAnonymous = React.useCallback((expiredIdentity: boolean) => {
    // 在 React commit 前就关闭 401 入口：同一批失败请求不能重复导航或开登录窗口。
    isAuthenticatedRef.current = false;
    if (expiredIdentity) tracker().resetIdentity({ discardQueuedEvents: true });
    clearSessionId();
    clearAccount();
    setIsAuthenticated(false);
    setRoles([]);
    setName(null);
    setLoading(false);
  }, []);

  // 身份落地：组件状态 + 用户 store（顶栏读它）。
  // P4 起 store 不再由令牌订阅填充——浏览器已经没有令牌了。
  const applyIdentity = React.useCallback(
    (id: { authenticated: boolean; roles?: string[]; name?: string }) => {
      if (!id.authenticated) {
        // 匿名冷启动没有旧身份，保留匿名浏览连续性；桌面已有 session id 或已登录
        // 快照则说明旧身份失效。Web httpOnly cookie 无法读取，不凭展示资料猜测登录态。
        resetToAnonymous(isAuthenticatedRef.current || getSessionId() !== null);
        return;
      }
      setIsAuthenticated(true);
      setRoles(id.roles ?? []);
      setName(id.name ?? null);
      setLoading(false);
      if (id.name) setAccount({ name: id.name, displayName: id.name });
    },
    [resetToAnonymous],
  );

  // 🔐 登录
  const login = React.useCallback(() => {
    const version = ++identityVersion.current;
    // 桌面端不能硬跳转：主窗口的源是 tauri://localhost，跳出去 Casdoor 就回不来了。
    // 改为开一个子窗口加载登录页，由 Rust 侧拦截回调地址把 code/state 送回来，
    // 再手动导航到 /callback 复用既有的兑换逻辑。
    if (isTauri()) {
      setLoading(true);
      void (async () => {
        const { openCasdoorLogin, OauthCancelledError } = await import("@ecommerce/tauri/auth");
        if (version !== identityVersion.current) return;
        try {
          const redirectUri = DESKTOP_REDIRECT_URI.consumer;
          // 子窗口直接打网关的 native 登录地址；Rust 侧在它导航到回环回调的瞬间
          // 截下 query。native 模式下这里的 code **就是 session id**（不是授权码），
          // 所以不再需要 /callback 那步兑换——PKCE 在桌面端也退场了。
          const { code } = await openCasdoorLogin(buildNativeLoginUrl(redirectUri), redirectUri);
          if (version !== identityVersion.current) return;
          setSessionId(code);
          const id = await fetchIdentity();
          if (version === identityVersion.current) applyIdentity(id);
        } catch (err) {
          if (version !== identityVersion.current || err instanceof OauthCancelledError) return;
          console.error("[Auth] 桌面端登录失败:", err);
        } finally {
          if (version === identityVersion.current) setLoading(false);
        }
      })();
      return;
    }

    // Web 端：整页跳到网关，由它跑完 OAuth 再跳回来。
    // 回跳目标用相对路径，网关只接受相对路径或白名单来源（防开放重定向）。
    startBffLogin(router.state.location.href);
  }, [router, applyIdentity]);

  // 🔓 登出：两端同一条路径——一次 POST，网关删会话（即时生效）。
  // 桌面端额外清掉内存里的会话 id；Web 端的 cookie 由网关下发的 Max-Age=0 清掉。
  const logout = React.useCallback(() => {
    const version = ++identityVersion.current;
    // 换掉埋点的匿名身份，防止共享设备上下一个登录的人继承本人登出后的浏览记录
    // （behavior 会把登录请求里带的 anonId 之前的匿名行为并进该用户画像）。
    // 必须在 bffLogout 之前：积压事件此刻发出，会话 cookie 还在，仍归属当前用户。
    tracker().resetIdentity();
    const pendingLogout = bffLogout();
    // bffLogout 已同步读取桌面 session header，此后立即清本地状态；不能等网络结束
    // 才挡住迟到的身份查询或 401。tracker 已在上面处理，这里不再轮换。
    resetToAnonymous(false);
    const finish = () => {
      if (version !== identityVersion.current) return;
      if (isTauri()) {
        // 桌面端不能整页跳转（源是 tauri://localhost），走路由回首页。
        goHome(router.navigate);
        return;
      }
      window.location.assign("/");
    };
    void pendingLogout.then(finish, finish);
  }, [router, resetToAnonymous]);

  // ❄️ 冷启动：两端统一问网关。
  // Web 端凭 cookie，桌面端凭内存里的会话 id（重启后为空 → 判定未登录，需重新登录；
  // 要免登录应把会话 id 存 OS keychain，见 sessionStore.ts 的取舍说明）。
  useEffect(() => {
    const version = ++identityVersion.current;
    void fetchIdentity().then((id) => {
      if (version === identityVersion.current) applyIdentity(id);
    });
    return () => {
      invalidateIdentity();
    };
  }, [applyIdentity, invalidateIdentity]);

  // 登录态变化时同步快照，供上面那个 ref 的读取方使用。
  // 必须是 useLayoutEffect：它在 commit 阶段同步执行，快照与 DOM 同一时刻落地。
  // 用 useEffect 时快照会落后 DOM 一个 passive-effect tick——GitLab 慢 runner 上实测
  // （2026-09-02 pipeline #77）：DOM 已渲染 isAuthenticated=true，此时到达的 401 读到
  // ref=false，被当成匿名请求吞掉，不跳登录。
  useLayoutEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  // 📡 集中式拦截：监听来自 packages/api 的 401 信号。
  // 两端同一处理：续期是网关的事（它在请求链路上顺手做），这里收到 401 就意味着
  // 会话真的没了（过期/被撤销/被登出）。前端再"续"一次既做不到也没意义——
  // 直接重新登录。旧实现里"401 → 静默续期 → 与 callback 抢兑换"的竞态随之消失。
  //
  // ⚠️ 但「401 = 会话失效」这个前提**只在用户曾经登录过时成立**。匿名用户根本没有
  // 会话，它收到的 401 只意味着「这个接口需要登录」——此时跳登录是错的：匿名逛
  // 商城会被强制拉走（实测：首页顶栏的 GetCart 拿 401 → 整页跳 /auth/login）。
  // 所以跳转前先看登录态快照；未登录时只静默复位，不劫持导航。
  useEffect(() => {
    const unsubscribe = onAuthError((err) => {
      if (!isAuthenticatedRef.current) {
        console.warn("[Auth] 匿名请求收到 401（接口需要登录），不跳转:", err);
        return;
      }
      console.warn("[Auth] 会话失效，重新登录:", err);
      ++identityVersion.current;
      resetToAnonymous(true);
      if (isTauri()) {
        login(); // 桌面端开子窗口重登，不能整页跳转
        return;
      }
      startBffLogin(router.state.location.href);
    });

    return () => {
      unsubscribe();
    };
  }, [login, router, resetToAnonymous]);

  // 缓存 Action 对象，确保引用绝对稳定，防止下游组件无意义重绘
  const actions = React.useMemo(() => ({ login, logout }), [login, logout]);
  const state = React.useMemo(
    () => ({ isAuthenticated, loading, roles, name }),
    [isAuthenticated, loading, roles, name],
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
