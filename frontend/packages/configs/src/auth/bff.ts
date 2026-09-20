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

/** 把任意 redirect 输入收敛成**本源**的绝对地址，可疑输入一律回落首页。
 *
 *  ⚠️ 不要退回「拼 origin + parsed.pathname」那种写法：`new URL()` 对 opaque scheme
 *  （`javascript:` `data:` 以及任意 `x:`）不做相对解析，pathname 不带前导斜杠，拼出来
 *  就是主机注入——`javascript:@evil.com/x` → `https://shop.apikv.com@evil.com/x`，
 *  浏览器解析出的 host 是 evil.com。异构双审两侧独立命中同一条，Node 实测复现。
 *  按 origin 比对能一次盖住三类：opaque scheme（origin 为 "null"）、协议相对
 *  `//evil.com`、以及完整外站地址。 */
const sameOriginTarget = (redirectTo: string): string => {
  const home = `${window.location.origin}/`;
  let parsed: URL;
  try {
    parsed = new URL(redirectTo, window.location.origin);
  } catch {
    return home;
  }
  return parsed.origin === window.location.origin ? parsed.href : home;
};

/** 发起登录。必须整页跳转——OAuth 是 302 链，fetch 跟不了。
 *
 *  ⚠️ redirect 必须是**绝对地址**，不能传相对路径。网关的 redirectAllowed() 放行
 *  任何以 `/` 开头的目标，回调末尾又直接 `http.Redirect(w, r, sp.Redirect)` ——
 *  相对路径会按**网关自己的源**解析。生产上前端在 shop.apikv.com、网关在
 *  gateway.apikv.com，传 `/cart` 登完就落到 `gateway.apikv.com/cart`（404）。
 *  dev 里两者靠 vite proxy 同源，所以这个坑在本地永远不显形。
 *
 *  归一化按**源比对**，不按字符串拼接（见 sameOriginTarget）：调用方传什么都跳不出本源，
 *  客户端这一侧的开放重定向面一并关死（网关侧仍有白名单复验，两层都留着）。
 *
 *  ⚠️ 前端的源必须在网关 BFF_ALLOWED_REDIRECTS 里。改成绝对地址之后，不在白名单的
 *  前端源（127.0.0.1:3000、局域网 IP、预览域名）会被网关**静默**换成 defaultRedirect——
 *  不报错，表现为登完跳去别处。本地开发请用 localhost:3000，或把新源加进白名单。 */
export const startBffLogin = (
  redirectTo: string = window.location.pathname + window.location.search,
): void => {
  const target = sameOriginTarget(redirectTo);
  window.location.assign(`${bffBase()}/auth/login?redirect=${encodeURIComponent(target)}`);
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
