import { createConnectTransport } from "@connectrpc/connect-web";
import type { ConnectTransportOptions } from "@connectrpc/connect-web";
import { authInterceptor, errorInterceptor, loggerInterceptor } from "./interceptors";
import { getAppFetch, getGatewayBaseUrl } from "./runtime";

/**
 * 创建连到网关的 Connect transport。
 *
 * 所有 app 的 api 模块都走这里，这样 baseUrl 与 fetch 实现只有一处来源
 * （见 runtime.ts），桌面端才能在启动时统一改掉。
 */
export function createAppTransport(options: Partial<ConnectTransportOptions> = {}) {
  return createConnectTransport({
    baseUrl: getGatewayBaseUrl(),
    fetch: getAppFetch(),
    interceptors: [authInterceptor, loggerInterceptor, errorInterceptor],
    ...options,
  });
}
