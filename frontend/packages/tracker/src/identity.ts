const ANON_KEY = "ecommerce.anon_id";
const SESSION_KEY = "ecommerce.session_id";

/**
 * 匿名标识。跨会话保留在 localStorage —— 这是把"同一个人上周逛过什么"和
 * "今天在逛什么"串起来的唯一线索，也是 gorse 能给未登录用户算出画像的前提。
 *
 * 登录之后网关会注入 x-md-global-user-id，服务端优先用它，这个 id 就自动退居备用。
 */
export function anonId(): string {
  return persistentId(safeStorage("local"), ANON_KEY);
}

/**
 * 会话标识。只活在 sessionStorage 里，关掉标签页就没了。
 * 服务端拿它给曝光去重 —— 列表页来回滚动会把同一张卡片反复推进视口，
 * 不按会话划窗口去重，read_feedback_types 会被刷成噪声。
 */
export function sessionId(): string {
  return persistentId(safeStorage("session"), SESSION_KEY);
}

function persistentId(store: Storage | null, key: string): string {
  if (!store) return randomId();
  const existing = store.getItem(key);
  if (existing) return existing;
  const fresh = randomId();
  try {
    store.setItem(key, fresh);
  } catch {
    // 隐私模式下写入会抛异常。降级成一次性 id，埋点照发，只是串不起来。
  }
  return fresh;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Safari 隐私模式下访问 storage 会直接抛异常，不能裸用。 */
function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    const store = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__ecommerce_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}
