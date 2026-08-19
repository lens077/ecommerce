// ⚠️ 令牌不再落 localStorage —— 见 ./tokenStore.ts 头部的理由（XSS + 168h 长效令牌 +
// 网关离线验签导致无法吊销）。这两个函数保留是为了不破坏既有调用点，
// 内部已转发到内存态 store。
//
// 新代码请直接用 `setTokens` / `clearTokens` / `getAccessToken`（@ecommerce/utils），
// 它们能同时带上 refresh token 与过期时刻，这是无感续期所必需的。
import { clearTokens, setTokens } from "./tokenStore";
import { decodeJwtPayload } from "./jwt";

/** @deprecated 用 setTokens()，它能一并记录 refresh token 与过期时刻 */
export const setToken = (token: string) => {
  // 从 JWT 的 exp 推过期时刻；解析不出来时给 5 分钟保底，
  // 宁可多续几次，也不要抱着一个已过期的令牌打请求。
  const payload = decodeJwtPayload(token);
  const expSec = typeof payload?.exp === "number" ? payload.exp : 0;
  setTokens({
    accessToken: token,
    expiresAt: expSec > 0 ? expSec * 1000 : Date.now() + 5 * 60 * 1000,
  });
};

/** @deprecated 用 clearTokens() */
export const clearToken = () => {
  clearTokens();
};
