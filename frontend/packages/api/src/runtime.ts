/**
 * 运行时可注入的传输层配置。
 *
 * Web 端这些值来自构建期的 `VITE_GATEWAY_URL`；桌面端（Tauri）来自用户可改的本地设置，
 * 且请求要走 Rust 侧的 http 插件绕开 CORS。两边差异都收敛在这里，
 * 由各 app 的入口在渲染任何组件之前注入一次。
 */

const DEFAULT_GATEWAY_URL = "http://localhost:8080";

let gatewayBaseUrl = DEFAULT_GATEWAY_URL;
let appFetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);

/** 设置网关地址。必须在任何 transport 被创建之前调用（transport 创建时就固化了 baseUrl）。 */
export function setGatewayBaseUrl(url: string | undefined | null): void {
  if (url) {
    gatewayBaseUrl = url;
  }
}

export function getGatewayBaseUrl(): string {
  return gatewayBaseUrl;
}

/** 替换底层 fetch 实现。桌面端注入 `@tauri-apps/plugin-http` 的 fetch。 */
export function setAppFetch(fetchImpl: typeof globalThis.fetch): void {
  appFetch = fetchImpl;
}

export function getAppFetch(): typeof globalThis.fetch {
  return appFetch;
}

/** `toAppError` 决定 message 时喂给解析器的上下文 */
export interface ErrorMessageContext {
  /** 业务 reason，已经过兜底推导，保证非空 */
  reason: string;
  /** Connect 规范码字符串，如 "unavailable" */
  codeName: string;
  /** 服务端返回的 rawMessage，已 trim，可能为空 */
  serverMessage: string;
  /** rawMessage 是否是浏览器原生的网络失败文案 */
  isNetworkFailure: boolean;
}

/** 返回 undefined 表示不接管，交回 errors.ts 的默认逻辑 */
export type ErrorMessageResolver = (ctx: ErrorMessageContext) => string | undefined;

let errorMessageResolver: ErrorMessageResolver | null = null;

/**
 * 注入错误文案解析器。
 *
 * 存在的原因是网关返回的 message 是中文，英文界面下会漏出来。由 `@ecommerce/i18n`
 * 的 `createErrorMessageResolver()` 提供实现 —— 这样 `@ecommerce/api` 不必依赖
 * i18next，没接国际化的 app 行为完全不变。
 */
export function setErrorMessageResolver(resolver: ErrorMessageResolver | null): void {
  errorMessageResolver = resolver;
}

export function getErrorMessageResolver(): ErrorMessageResolver | null {
  return errorMessageResolver;
}
