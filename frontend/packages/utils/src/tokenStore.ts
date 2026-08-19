// 令牌存储：**只在内存里**，不落 localStorage / sessionStorage / cookie。
//
// 为什么改：原先 access token 存 localStorage，一次 XSS 就能把它读走并外传，
// 而令牌有效期 168h —— 等于一次 XSS 换 7 天的账号完全接管，且网关是离线验签
// （静态公钥、不查 introspect），偷走的令牌在过期前**无法吊销**。
//
// 内存态并不能让 XSS 偷不到（脚本在同一个 realm 里，运行期总能读到）。
// 它真正消掉的是另外三件事：
//   1. **落盘持久化**：令牌不再跨标签页/跨会话留存，"昨天种下的 XSS 今天来收"不成立；
//   2. **静默批量收割**：攻击脚本必须在用户**正处于登录态的那一刻**执行，
//      而不是随便找个时机读一下 storage；
//   3. **第三方脚本的顺手牵羊**：任何依赖/扩展只要能跑 JS 就能遍历 localStorage，
//      但拿不到模块闭包里的变量。
//
// 代价是刷新页面令牌就没了 —— 由 packages/configs/src/auth 的静默续期
// （prompt=none 授权请求 + Casdoor 会话 Cookie）补上，用户无感。
//
// ⚠️ 不要为了"方便"再把令牌写回 storage。真要持久化，正确做法是 httpOnly Cookie，
//    那需要一个 BFF 后端，与"前端直连 Casdoor、不依赖 user 服务"的目标冲突。

type Listener = (token: string | null) => void;

let accessToken: string | null = null;
let refreshToken: string | null = null;
/** 绝对过期时刻（epoch ms），取自 JWT 的 exp。用于提前调度续期。 */
let expiresAt = 0;

const listeners = new Set<Listener>();

const notify = () => {
  for (const fn of listeners) fn(accessToken);
};

export const getAccessToken = (): string | null => accessToken;
export const getRefreshToken = (): string | null => refreshToken;
export const getExpiresAt = (): number => expiresAt;

export const setTokens = (opts: {
  accessToken: string;
  refreshToken?: string | null;
  /** 令牌剩余有效秒数；缺省时由调用方从 JWT exp 推 */
  expiresAt?: number;
}) => {
  accessToken = opts.accessToken;
  // 刷新令牌同样只存内存：写进 storage 的话，前面那些 XSS 论证就全部作废
  // （拿到 refresh token 比拿到 access token 更糟——它能不断换新令牌）。
  if (opts.refreshToken !== undefined) refreshToken = opts.refreshToken;
  if (opts.expiresAt !== undefined) expiresAt = opts.expiresAt;
  notify();
};

export const clearTokens = () => {
  accessToken = null;
  refreshToken = null;
  expiresAt = 0;
  notify();
};

/** 订阅令牌变化（AuthProvider 用它同步 isAuthenticated） */
export const subscribeToken = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** 是否已登录。注意：页面刷新后必然为 false，需先跑一次静默续期再判断。 */
export const hasToken = (): boolean => accessToken !== null;
