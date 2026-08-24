// 通用 BFF 登录态 Provider（control-tower ADR-0002）。
//
// 给 merchant/admin 这类**纯 Web、无本地 store 纠缠**的应用直接用：
// 浏览器只有一枚 httpOnly 会话 cookie，前端不存令牌、不做续期，
// 登录态一律以网关的 /auth/me 为准。
//
// consumer 没有用这份：它还要处理 Tauri 原生登录与自己的用户 store，
// 逻辑在 apps/consumer/src/providers/AuthProvider.tsx。两者共用同一套
// @ecommerce/configs 的 bff 客户端，协议层不会漂移。
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bffLogout, fetchIdentity, startBffLogin } from "@ecommerce/configs";
import { onAuthError } from "@ecommerce/api";

export interface BffAuthState {
  isAuthenticated: boolean;
  roles: string[];
  name: string | null;
  /** 首次 /auth/me 未返回前为 true——用它避免「未登录」闪一下 */
  loading: boolean;
}

export interface BffAuthActions {
  login: () => void;
  logout: () => void;
  /** 主动重查登录态（例如某个操作后怀疑会话已变） */
  refresh: () => void;
}

const StateContext = createContext<BffAuthState | undefined>(undefined);
const ActionsContext = createContext<BffAuthActions | undefined>(undefined);

const ANON: BffAuthState = { isAuthenticated: false, roles: [], name: null, loading: false };

export interface BffAuthProviderProps {
  children: React.ReactNode;
  /** 登出后跳转的路径，默认回首页 */
  logoutRedirect?: string;
  /** 收到 401 时是否自动跳登录。默认 true；
   *  设为 false 可让页面自己决定（比如公开页不该被弹去登录）。 */
  autoLoginOn401?: boolean;
}

export const BffAuthProvider: React.FC<BffAuthProviderProps> = ({
  children,
  logoutRedirect = "/",
  autoLoginOn401 = true,
}) => {
  const [state, setState] = useState<BffAuthState>({ ...ANON, loading: true });

  const refresh = useCallback(() => {
    void fetchIdentity().then((id) =>
      setState({
        isAuthenticated: id.authenticated,
        roles: id.roles ?? [],
        name: id.name ?? null,
        loading: false,
      }),
    );
  }, []);

  useEffect(refresh, [refresh]);

  const login = useCallback(() => {
    startBffLogin(window.location.pathname + window.location.search);
  }, []);

  const logout = useCallback(() => {
    // 一次 POST 即可：网关删会话（即时生效）并清 cookie。
    void bffLogout().finally(() => {
      setState({ ...ANON });
      window.location.assign(logoutRedirect);
    });
  }, [logoutRedirect]);

  // 401 = 会话真的没了（过期/被撤销/被登出）。续期是网关的事，
  // 前端再「续」一次既做不到也没意义，直接重新登录。
  useEffect(() => {
    if (!autoLoginOn401) return;
    const unsubscribe = onAuthError(() => {
      setState({ ...ANON });
      login();
    });
    // 包一层再返回：onAuthError 的返回值不是 void（内部是 Set.delete，返回 boolean），
    // 直接 return 会被 TS 判成非法的 Destructor。
    return () => {
      unsubscribe();
    };
  }, [autoLoginOn401, login]);

  const actions = useMemo<BffAuthActions>(
    () => ({ login, logout, refresh }),
    [login, logout, refresh],
  );

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  );
};

export const useBffAuthState = (): BffAuthState => {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useBffAuthState 必须在 BffAuthProvider 内使用");
  return ctx;
};

export const useBffAuthActions = (): BffAuthActions => {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useBffAuthActions 必须在 BffAuthProvider 内使用");
  return ctx;
};
