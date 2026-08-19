import type { Interceptor } from "@connectrpc/connect";
import { getAccessToken } from "@ecommerce/utils";

// 令牌来自内存态的 tokenStore，不再读 localStorage。
// 原因见 packages/utils/src/tokenStore.ts 头部：localStorage 里的 168h 长效令牌
// 一次 XSS 就等于 7 天账号接管，且网关离线验签、偷走后无法吊销。
export const authInterceptor: Interceptor = (next) => async (req) => {
  const token = getAccessToken();
  if (token) {
    req.header.set("Authorization", `Bearer ${token}`);
  }
  return await next(req);
};
