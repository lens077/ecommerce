// BFF 会话客户端（control-tower ADR-0002）。
//
// 浏览器端**不再持有任何令牌**：网关自己跑完 OAuth，把 access/refresh token 留在服务端，
// 只发一枚 httpOnly 的不透明 session id。因此这里没有 token 存取、没有续期调度——
// 续期由网关在请求链路上顺手做掉，前端全程无感。
//
// 与 pkce.ts 的分工：pkce.ts 现在**只服务桌面端**（Tauri 主窗口的源是 tauri://localhost，
// 拿不到浏览器 cookie，仍走 PKCE + bearer）。桌面端切到 session header 见 P3。

import { getAppFetch, getGatewayBaseUrl } from "@ecommerce/api";
import { getSessionId, sessionHeaderName } from "@ecommerce/utils";

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** 桌面端把会话 id 放头里；Web 端返回空对象（cookie 由浏览器自动带）。 */
const sessionHeaders = (): Record<string, string> => {
  const id = getSessionId();
  return id ? { [sessionHeaderName()]: id } : {};
};

/** BFF 端点基地址。
 *
 * 取**运行时**网关地址（initTransport 注入）而不是构建期 env——桌面端的地址来自
 * 用户设置，且 Tauri 主窗口的源是 tauri://localhost，相对路径会解析成
 * tauri://localhost/... 根本打不到网关。VITE_BFF_BASE_URL 仅作显式覆盖用。 */
const bffBase = (): string => {
  const override = import.meta.env.VITE_BFF_BASE_URL;
  if (override) return trimSlash(override);
  return trimSlash(getGatewayBaseUrl());
};

export interface BffIdentity {
  authenticated: boolean;
  name?: string;
  owner?: string;
  roles?: string[];
  createdAt?: string;
}

const ANONYMOUS: BffIdentity = { authenticated: false };

/** 问网关「我是谁」。cookie 是 httpOnly，前端只能这样拿登录态。
 *
 *  用 getAppFetch() 而不是全局 fetch：桌面端注入的是 Rust 侧 http 插件的 fetch，
 *  它绕开 CORS——Tauri 主窗口的源是 tauri://localhost，不在网关允许列表里，
 *  用全局 fetch 会被预检直接挡掉。 */
export const fetchIdentity = async (): Promise<BffIdentity> => {
  try {
    const resp = await getAppFetch()(`${bffBase()}/auth/me`, {
      credentials: "include",
      headers: sessionHeaders(),
    });
    if (!resp.ok) return ANONYMOUS;
    return (await resp.json()) as BffIdentity;
  } catch (err) {
    // 网关不可达按未登录处理：一次网络抖动不该让整个 UI 崩在启动阶段。
    console.warn("[Auth] 获取登录态失败，按未登录处理:", err);
    return ANONYMOUS;
  }
};

/** 发起登录。必须整页跳转——OAuth 是 302 链，fetch 跟不了。 */
export const startBffLogin = (
  redirectTo: string = window.location.pathname + window.location.search,
): void => {
  window.location.assign(`${bffBase()}/auth/login?redirect=${encodeURIComponent(redirectTo)}`);
};

/** 桌面端（Tauri）登录地址：native 模式让网关把会话 id 经**回环回调**交回原生层，
 *  而不是下发 cookie——原生窗口的源是 tauri://localhost，收不到浏览器 cookie。
 *
 *  回调参数沿用 `code`/`state` 是刻意的：Tauri 的 Rust 拦截器就认这两个 key，
 *  于是桌面端切到会话轨**不需要改 Rust、不需要重建原生层**。
 *  拿到的 `code` 就是 session id，交给 setSessionId() 即可。 */
export const buildNativeLoginUrl = (loopbackRedirect: string): string =>
  `${bffBase()}/auth/login?mode=native&redirect=${encodeURIComponent(loopbackRedirect)}`;

/** 登出：删服务端会话并清 cookie。
 *  POST 受网关 CSRF 校验（浏览器自动带 Origin），不能改成 no-cors。 */
export const bffLogout = async (): Promise<void> => {
  try {
    await getAppFetch()(`${bffBase()}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: sessionHeaders(),
    });
  } catch (err) {
    // 请求失败也要继续本地清理：用户点了登出就该退出，不能卡在中间态。
    console.warn("[Auth] 登出请求失败，仍按本地登出处理:", err);
  }
};
