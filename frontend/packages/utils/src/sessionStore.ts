// 桌面端会话标识（control-tower ADR-0002 / bff-migration.md P3）。
//
// Web 端不需要这个模块——会话 id 在 httpOnly cookie 里，JS 根本碰不到，那正是它的价值。
// 桌面端（Tauri）的源是 tauri://localhost，收不到浏览器 cookie，所以由原生层在登录时
// 经回环回调拿到会话 id，存这里并随请求以 `X-CT-Session` 头发出。
//
// 只存内存：与既有 tokenStore 同一取舍（见其头部注释）。代价是重启应用要重新登录，
// 收益是任何持久化存储的泄露面都不存在。要改成免登录，应存 OS keychain 而不是 localStorage。

const SESSION_HEADER = "X-CT-Session";

let sessionId: string | null = null;
const subscribers = new Set<(id: string | null) => void>();

export const getSessionId = (): string | null => sessionId;

export const setSessionId = (id: string | null): void => {
  sessionId = id;
  for (const fn of subscribers) fn(id);
};

export const clearSessionId = (): void => setSessionId(null);

export const hasSessionId = (): boolean => sessionId !== null;

/** 订阅会话变化，返回取消订阅函数。 */
export const subscribeSessionId = (fn: (id: string | null) => void): (() => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};

/** 请求头名。网关侧同名常量在 services/gateway 的 SESSION_HEADER 环境变量。 */
export const sessionHeaderName = (): string => SESSION_HEADER;
