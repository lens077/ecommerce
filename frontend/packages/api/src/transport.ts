import { createConnectTransport } from "@connectrpc/connect-web";
import type { ConnectTransportOptions } from "@connectrpc/connect-web";
import type { Transport } from "@connectrpc/connect";
import { authInterceptor, errorInterceptor, loggerInterceptor } from "./interceptors";
import { getAppFetch, getGatewayBaseUrl } from "./runtime";

/**
 * 创建连到网关的 Connect transport。
 *
 * 所有 app 的 api 模块都走这里，这样 baseUrl 与 fetch 实现只有一处来源
 * （见 runtime.ts），桌面端才能在启动时统一改掉。
 *
 * ⚠️ 一般不要直接调它。数据拉取走 connect-query，transport 由下面两个单例提供
 * （见 context/project/ecommerce/frontend-api/sop/connect-query.md）。
 */
export function createAppTransport(options: Partial<ConnectTransportOptions> = {}) {
  return createConnectTransport({
    baseUrl: getGatewayBaseUrl(),
    // credentials: "include" 是 BFF 会话轨的前提（ADR-0002）：
    // 会话 id 在 httpOnly cookie 里，不带上就等于匿名请求。
    // 对桌面端（仍走 bearer）无副作用——它根本没有这枚 cookie。
    fetch: (input, init) => getAppFetch()(input, { ...init, credentials: "include" }),
    interceptors: [authInterceptor, loggerInterceptor, errorInterceptor],
    ...options,
  });
}

let sharedTransport: Transport | null = null;
let publicTransport: Transport | null = null;

/**
 * 全 app 唯一的带鉴权 transport，由各 app 入口注入 `<TransportProvider>`。
 *
 * 必须是单例：connect-query 的 query key 里带 transport 引用，而它对每个对象引用
 * 生成一个不同的字符串。多建一个实例就多切一套互不相通的缓存命名空间，
 * 失效会静默打空。
 *
 * 懒初始化不能改成模块顶层常量 —— transport 创建时就固化了 baseUrl 与 fetch，
 * 桌面端要等 `setGatewayBaseUrl()` / `setAppFetch()` 跑完才能建，
 * 否则连的是默认的 localhost。
 */
export function getSharedTransport(): Transport {
  sharedTransport ??= createAppTransport();
  return sharedTransport;
}

/**
 * 免鉴权 transport，给商品浏览、搜索这类公开接口用（不挂 authInterceptor，
 * 避免未登录时被拦截器判成认证失效而触发退登）。
 *
 * 这是**唯一**允许存在的第二个实例。调用点要显式传 `{ transport: getPublicTransport() }`。
 */
export function getPublicTransport(): Transport {
  publicTransport ??= createAppTransport({
    interceptors: [loggerInterceptor, errorInterceptor],
  });
  return publicTransport;
}

/** 仅供测试：清掉单例，让下一次取用重新按当前 runtime 配置创建。 */
export function resetTransports(): void {
  sharedTransport = null;
  publicTransport = null;
}
