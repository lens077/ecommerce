import type { Interceptor } from "@connectrpc/connect";
import { getSessionId, sessionHeaderName } from "@ecommerce/utils";

// 两种凭据形态，与网关一致（control-tower ADR-0002）：
//   1. Web 端  —— 会话 cookie，由浏览器自动携带，这里无事可做；
//   2. 桌面端  —— 会话 id 走 X-CT-Session 头（Tauri 收不到浏览器 cookie）。
// 都不存在时不加任何头，请求即匿名（公开接口照常可用）。
// legacy bearer 分支已于 P4 删除——令牌不再进浏览器。
export const authInterceptor: Interceptor = (next) => async (req) => {
  const sessionId = getSessionId();
  if (sessionId) {
    req.header.set(sessionHeaderName(), sessionId);
  }
  return await next(req);
};
