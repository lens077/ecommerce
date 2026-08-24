// BFF 会话客户端（control-tower ADR-0002）。
//
// 浏览器端**不再持有任何令牌**：网关自己跑完 OAuth，把 access/refresh token 留在服务端，
// 只发一枚 httpOnly 的不透明 session id。因此这里没有 token 存取、没有续期调度——
// 续期由网关在请求链路上顺手做掉，前端全程无感。
//
// 与 pkce.ts 的分工：pkce.ts 现在**只服务桌面端**（Tauri 主窗口的源是 tauri://localhost，
// 拿不到浏览器 cookie，仍走 PKCE + bearer）。桌面端切到 session header 见 P3。

import { getSessionId, sessionHeaderName } from "@ecommerce/utils";

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** 桌面端把会话 id 放头里；Web 端返回空对象（cookie 由浏览器自动带）。 */
const sessionHeaders = (): Record<string, string> => {
  const id = getSessionId();
  return id ? { [sessionHeaderName()]: id } : {};
};

/** BFF 端点基地址。dev 经 vite proxy 走同源（空串），prod 指向网关域名。 */
const bffBase = (): string =>
  trimSlash(import.meta.env.VITE_BFF_BASE_URL ?? import.meta.env.VITE_GATEWAY_URL ?? "");

export interface BffIdentity {
  authenticated: boolean;
  name?: string;
  owner?: string;
  roles?: string[];
  createdAt?: string;
}

const ANONYMOUS: BffIdentity = { authenticated: false };

/** 问网关「我是谁」。cookie 是 httpOnly，前端只能这样拿登录态。 */
export const fetchIdentity = async (): Promise<BffIdentity> => {
  try {
    const resp = await fetch(`${bffBase()}/auth/me`, {
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
    await fetch(`${bffBase()}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: sessionHeaders(),
    });
  } catch (err) {
    // 请求失败也要继续本地清理：用户点了登出就该退出，不能卡在中间态。
    console.warn("[Auth] 登出请求失败，仍按本地登出处理:", err);
  }
};
