import type { Interceptor } from "@connectrpc/connect";
import { getAccessToken, getSessionId, sessionHeaderName } from "@ecommerce/utils";

// 三种凭据形态，与网关的三轨接受一一对应（control-tower ADR-0002）：
//   1. Web 端    —— 会话 cookie，由浏览器自动携带，这里无事可做；
//   2. 桌面端    —— 会话 id 走 X-CT-Session 头（Tauri 收不到浏览器 cookie）；
//   3. legacy    —— bearer 令牌，桌面端切换完成前保留。
// 三者都不存在时不加任何头，请求即匿名（公开接口照常可用）。
export const authInterceptor: Interceptor = (next) => async (req) => {
  const sessionId = getSessionId();
  if (sessionId) {
    req.header.set(sessionHeaderName(), sessionId);
    return await next(req);
  }
  const token = getAccessToken();
  if (token) {
    req.header.set("Authorization", `Bearer ${token}`);
  }
  return await next(req);
};
