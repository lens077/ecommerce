// BFF 会话客户端（control-tower ADR-0002）。
//
// 浏览器端**不再持有任何令牌**：网关自己跑完 OAuth，把 access/refresh token 留在服务端，
// 只发一枚 httpOnly 的不透明 session id。因此这里没有 token 存取、没有续期调度——
// 续期由网关在请求链路上顺手做掉，前端全程无感。
//
// 与 pkce.ts 的分工：pkce.ts 现在**只服务桌面端**（Tauri 主窗口的源是 tauri://localhost，
// 拿不到浏览器 cookie，仍走 PKCE + bearer）。桌面端切到 session header 见 P3。

const trimSlash = (s: string) => s.replace(/\/+$/, "");

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
    const resp = await fetch(`${bffBase()}/auth/me`, { credentials: "include" });
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

/** 登出：删服务端会话并清 cookie。
 *  POST 受网关 CSRF 校验（浏览器自动带 Origin），不能改成 no-cors。 */
export const bffLogout = async (): Promise<void> => {
  try {
    await fetch(`${bffBase()}/auth/logout`, { method: "POST", credentials: "include" });
  } catch (err) {
    // 请求失败也要继续本地清理：用户点了登出就该退出，不能卡在中间态。
    console.warn("[Auth] 登出请求失败，仍按本地登出处理:", err);
  }
};
