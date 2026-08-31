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
  bffLogout,
  buildNativeLoginUrl,
  fetchIdentity,
  startBffLogin,
} from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";
import { isTauri } from "@ecommerce/tauri";
import { clearSessionId, setSessionId } from "@ecommerce/utils";
import { clearAccount, setAccount } from "@/store/users";

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

export const AuthProvider: React.FC<{ children: React.ReactNode; router: any }> = ({
  children,
  router,
}) => {
  // 两端都没有本地凭据可读：Web 的会话 id 在 httpOnly cookie 里，桌面端的在内存里且
  // 重启即空。登录态一律以 /auth/me 为准。
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);

  // 身份落地：组件状态 + 用户 store（顶栏读它）。
  // P4 起 store 不再由令牌订阅填充——浏览器已经没有令牌了。
  const applyIdentity = React.useCallback(
    (id: { authenticated: boolean; roles?: string[]; name?: string }) => {
      setIsAuthenticated(id.authenticated);
      setRoles(id.roles ?? []);
      setName(id.name ?? null);
      if (id.authenticated && id.name) {
        setAccount({ name: id.name, displayName: id.name });
      } else if (!id.authenticated) {
        clearAccount();
      }
    },
    [],
  );

  // 🔐 登录
  const login = React.useCallback(() => {
    // 桌面端不能硬跳转：主窗口的源是 tauri://localhost，跳出去 Casdoor 就回不来了。
    // 改为开一个子窗口加载登录页，由 Rust 侧拦截回调地址把 code/state 送回来，
    // 再手动导航到 /callback 复用既有的兑换逻辑。
    if (isTauri()) {
      void (async () => {
        const { openCasdoorLogin, OauthCancelledError } = await import("@ecommerce/tauri/auth");
        try {
          const redirectUri = DESKTOP_REDIRECT_URI.consumer;
          // 子窗口直接打网关的 native 登录地址；Rust 侧在它导航到回环回调的瞬间
          // 截下 query。native 模式下这里的 code **就是 session id**（不是授权码），
          // 所以不再需要 /callback 那步兑换——PKCE 在桌面端也退场了。
          const { code } = await openCasdoorLogin(buildNativeLoginUrl(redirectUri), redirectUri);
          setSessionId(code);
          applyIdentity(await fetchIdentity());
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
    // applyIdentity 是 deps=[] 的 useCallback，引用恒稳定；列入依赖只为满足
    // exhaustive-deps，不会引起本回调重建。
  }, [router, applyIdentity]);

  // 🔓 登出
  // 🔓 登出：两端同一条路径——一次 POST，网关删会话（即时生效）。
  // 桌面端额外清掉内存里的会话 id；Web 端的 cookie 由网关下发的 Max-Age=0 清掉。
  const logout = React.useCallback(() => {
    void bffLogout().finally(() => {
      clearSessionId();
      clearAccount();
      setIsAuthenticated(false);
      setRoles([]);
      setName(null);
      if (isTauri()) {
        // 桌面端不能整页跳转（源是 tauri://localhost），走路由回首页。
        void router.navigate({ to: "/" });
        return;
      }
      window.location.assign("/");
    });
  }, [router]);

  // ❄️ 冷启动：两端统一问网关。
  // Web 端凭 cookie，桌面端凭内存里的会话 id（重启后为空 → 判定未登录，需重新登录；
  // 要免登录应把会话 id 存 OS keychain，见 sessionStore.ts 的取舍说明）。
  useEffect(() => {
    void fetchIdentity().then(applyIdentity);
  }, [applyIdentity]);

  // 📡 集中式拦截：监听来自 packages/api 的 401 信号。
  // 两端同一处理：续期是网关的事（它在请求链路上顺手做），这里收到 401 就意味着
  // 会话真的没了（过期/被撤销/被登出）。前端再"续"一次既做不到也没意义——
  // 直接重新登录。旧实现里"401 → 静默续期 → 与 callback 抢兑换"的竞态随之消失。
  useEffect(() => {
    const unsubscribe = onAuthError((err) => {
      console.warn("[Auth] 会话失效，重新登录:", err);
      clearSessionId();
      setIsAuthenticated(false);
      setRoles([]);
      setName(null);
      if (isTauri()) {
        login(); // 桌面端开子窗口重登，不能整页跳转
        return;
      }
      startBffLogin(router.state.location.href);
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
