// Authorization Code + PKCE，前端直连 Casdoor，不再经 user 服务换令牌。
//
// 改这条链路的原因：user 服务在登录里的**唯一**职责是替前端保管 client_secret 去做
// code→token 交换（backend/services/user/internal/data/user.go 的 SignIn 是纯透传，
// 不建本地用户、不加业务 claim）。而网关验签用的是静态公钥，**不关心令牌从哪来**。
// 于是这一跳除了"前端起不来必须先起 user 服务"之外没有任何收益。
//
// PKCE 用 code_verifier 取代 client_secret：授权时只发 challenge（SHA-256 摘要），
// 兑换时才发 verifier 原文，中途截获 code 的人没有 verifier 也换不到令牌。
// 这是 SPA 的标准解法，OAuth 2.1 里对公开客户端是**强制**要求。
//
// 为什么不用 casdoor-js-sdk 自带的 PKCE：它把 verifier 写 sessionStorage 且没有
// prompt=none 静默续期的口子，而静默续期正是"令牌只存内存"能成立的前提。

import { CASDOOR_CONF } from "../casdoor";

const AUTHORIZE_URL = `${CASDOOR_CONF.serverUrl}/login/oauth/authorize`;
const TOKEN_URL = `${CASDOOR_CONF.serverUrl}/api/login/oauth/access_token`;
/** OIDC 的 end_session_endpoint，取自 Casdoor 的 discovery 文档（实测就是这个路径） */
const LOGOUT_URL = `${CASDOOR_CONF.serverUrl}/api/logout`;

/** verifier 与 state 的暂存位置。
 *  用 sessionStorage 而非内存：授权要整页跳转，内存变量活不过跳转。
 *  存的不是令牌 —— verifier 是一次性的、且只在"同一浏览器发起过这次授权"时才有意义，
 *  被读走也换不到令牌（还需要 Casdoor 发给回调地址的 code）。 */
const VERIFIER_KEY = "oauth_code_verifier";
const STATE_KEY = "oauth_state";
/** 授权时用的 redirect_uri 必须原样带到兑换请求，否则 Casdoor 报 redirect_uri mismatch。
 *  Web 与桌面端用的地址不同（桌面端是 Tauri 拦截用的 localhost 白名单地址），
 *  存在这里让兑换侧不必关心自己是哪一端 —— 这类"两处各拼一次"正是 mismatch 的常见来源。 */
const REDIRECT_URI_KEY = "oauth_redirect_uri";

const randomString = (bytes = 32): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  // base64url，无填充
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const sha256Base64Url = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  /** 绝对过期时刻（epoch ms） */
  expiresAt: number;
  /** OIDC id_token。登出时必须作为 id_token_hint 回传，否则 Casdoor 拒绝结束会话。 */
  idToken: string | null;
}

const buildAuthorizeUrl = async (opts: {
  redirectUri: string;
  /** prompt=none 用于静默续期：有 Casdoor 会话就直接回 code，没有就回错误，绝不弹登录页 */
  silent?: boolean;
}): Promise<string> => {
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(REDIRECT_URI_KEY, opts.redirectUri);

  const params = new URLSearchParams({
    client_id: CASDOOR_CONF.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    scope: "openid profile email",
    state,
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: "S256",
  });
  if (opts.silent) params.set("prompt", "none");
  return `${AUTHORIZE_URL}?${params.toString()}`;
};

/** 发起登录（整页跳转）。 */
export const startLogin = async (redirectUri: string): Promise<void> => {
  window.location.assign(await buildAuthorizeUrl({ redirectUri }));
};

/** 结束 Casdoor 侧的会话（OIDC end_session_endpoint）。
 *
 *  **为什么非做不可**：Casdoor 开了「保持登录会话」+「自动登录」，只清本地令牌的话
 *  它那侧的 `casdoor_session_id` 还在，下一次 `restoreSession()` 会用 `prompt=none`
 *  静默换到新令牌 —— 表现就是「登出后一刷新又登录了」。这不是前端状态没清干净，
 *  是 IdP 侧的会话根本没结束。
 *
 *  **为什么必须整页跳转，不能 fetch / iframe**（2026-08-19 实测）：
 *  - `fetch(credentials:"include")`：Casdoor 对带 `Origin` 的请求直接返回 **403**（未配 CORS）；
 *  - `<iframe>`：`casdoor_session_id` 是 `HttpOnly` 且没有 `SameSite` 属性（按 `Lax` 处理），
 *    而 Lax 只在**顶级导航**时随请求发送，子框架加载带不上它，等于登出请求是匿名的。
 *  只有顶级导航能把会话 cookie 送到 Casdoor。 */
export const buildLogoutUrl = (postLogoutRedirectUri: string, idToken: string | null): string => {
  const params = new URLSearchParams({ post_logout_redirect_uri: postLogoutRedirectUri });
  // ⚠️ id_token_hint 不是可选的：缺了它 Casdoor 返回
  // {"status":"error","msg":"Missing parameter: id_token_hint"} 并且**不结束会话**，
  // 页面还会停在那段 JSON 上（2026-08-19 实测）。
  if (idToken) params.set("id_token_hint", idToken);
  return `${LOGOUT_URL}?${params.toString()}`;
};

/** 桌面端(Tauri)用：只返回授权地址，由 Rust 侧在子窗口里打开并拦截回调。
 *  走同一个 buildAuthorizeUrl，所以桌面端**同样带 PKCE 与随机 state** ——
 *  此前桌面端是手工拼 URL、state 写死成 appName("ecommerce")，等于没有 CSRF 防护。 */
export const buildDesktopLoginUrl = (redirectUri: string): Promise<string> =>
  buildAuthorizeUrl({ redirectUri });

/** 用回调带回的 code 兑换令牌。
 *  ⚠️ 必须校验 state：它是 CSRF 防线 —— 不校验的话攻击者可以把自己的 code 塞给受害者，
 *  让受害者在自己不知情的情况下登录到攻击者的账号（会话固定）。 */
export const exchangeCode = async (code: string, state: string): Promise<TokenResult> => {
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY); // 阅后即焚，verifier 一次性
  sessionStorage.removeItem(REDIRECT_URI_KEY);

  if (!expectedState || state !== expectedState) {
    throw new Error("OAuth state 校验失败，可能是 CSRF 或会话已过期");
  }
  if (!verifier || !redirectUri) {
    throw new Error("缺少 code_verifier / redirect_uri，无法完成 PKCE 兑换");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CASDOOR_CONF.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    // 刻意不发 client_secret：本应用是公开客户端，密钥不该出现在浏览器里。
    // Casdoor 在带 code_verifier 时按 PKCE 校验，不需要密钥。
  });

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error_description || data.error || "令牌兑换失败");
  }
  return toTokenResult(data);
};

const toTokenResult = (data: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}): TokenResult => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token ?? null,
  idToken: data.id_token ?? null,
  // expires_in 缺省时给 5 分钟保底，宁可多续几次也不要拿着过期令牌打请求
  expiresAt: Date.now() + (data.expires_in ?? 300) * 1000,
});

/** 用 refresh_token 换新令牌。 */
export const refreshTokens = async (refreshToken: string): Promise<TokenResult> => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CASDOOR_CONF.clientId,
    refresh_token: refreshToken,
    scope: "openid profile email",
  });
  const resp = await fetch(`${CASDOOR_CONF.serverUrl}/api/login/oauth/refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error_description || data.error || "刷新令牌失败");
  }
  return toTokenResult(data);
};

/** 静默续期：隐藏 iframe 里跑一次 prompt=none 授权。
 *
 *  这是"令牌只存内存"能成立的关键 —— 页面刷新后内存清空，靠 Casdoor 的会话 Cookie
 *  在后台悄悄换一份新令牌，用户看不到任何跳转。
 *
 *  前提两条：
 *   1. Casdoor 应用要开 `enableSigninSession`，否则没有会话 Cookie 可用；
 *   2. 前端域名与 Casdoor 同属 apikv.com（shop.apikv.com / casdoor.apikv.com），
 *      iframe 是 same-site，Cookie 才会带上。跨站会被浏览器的三方 Cookie 策略挡掉。
 */
export const silentRenew = (redirectUri: string, timeoutMs = 8000): Promise<TokenResult> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      iframe.remove();
    };

    const onMessage = async (ev: MessageEvent) => {
      // 只认自己源发来的消息：回调页与本页同源，第三方消息一律丢弃
      if (ev.origin !== window.location.origin) return;
      const payload = ev.data as { type?: string; code?: string; state?: string; error?: string };
      if (payload?.type !== "oauth_silent_result" || settled) return;
      settled = true;
      cleanup();
      if (payload.error || !payload.code || !payload.state) {
        reject(new Error(payload.error || "静默续期未拿到 code"));
        return;
      }
      try {
        resolve(await exchangeCode(payload.code, payload.state));
      } catch (err) {
        reject(err);
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      // 超时通常意味着没有 Casdoor 会话（iframe 停在登录页不回消息），
      // 调用方据此回退到整页登录。
      reject(new Error("静默续期超时"));
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    void buildAuthorizeUrl({ redirectUri, silent: true }).then((url) => {
      iframe.src = url;
      document.body.appendChild(iframe);
    });
  });
