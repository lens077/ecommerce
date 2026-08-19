// 会话生命周期：无感续期的调度中枢。
//
// 三条触发路径，共用同一把"单飞"锁（避免并发请求同时触发 N 次续期）：
//   1. **定时**：令牌到期前 60s 主动换新，用户全程无感；
//   2. **冷启动**：页面刷新后内存里没有令牌，先静默续一次再决定是否算已登录；
//   3. **兜底**：请求收到 401 时续一次，成功就重放，失败才跳登录页。
//
// 续期优先用 refresh_token（一次 POST，最快）；没有或失败再退到 prompt=none
// 静默授权（依赖 Casdoor 会话 Cookie）。两条都失败才认定会话真的结束。

import { clearTokens, getExpiresAt, getRefreshToken, hasToken, setTokens } from "@ecommerce/utils";
import { refreshTokens, silentRenew, type TokenResult } from "./pkce";

/** 提前量：留足一次网络往返 + 网关 60s 的 leeway 之外的余量 */
const RENEW_LEAD_MS = 60_000;

let renewTimer: ReturnType<typeof setTimeout> | null = null;
/** 单飞：并发调用共享同一个 Promise，避免 N 个 401 触发 N 次续期 */
let inflight: Promise<TokenResult> | null = null;
let redirectUri = "";

export const configureSession = (uri: string) => {
  redirectUri = uri;
};

const applyAndSchedule = (t: TokenResult) => {
  setTokens({
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: t.expiresAt,
    idToken: t.idToken,
  });
  scheduleRenew();
  return t;
};

/** 续期一次。并发安全：同一时刻只会真的续一次。 */
export const renewSession = (): Promise<TokenResult> => {
  if (inflight) return inflight;

  inflight = (async () => {
    const rt = getRefreshToken();
    if (rt) {
      try {
        return applyAndSchedule(await refreshTokens(rt));
      } catch (err) {
        // refresh_token 可能已被 Casdoor 作废，不当致命错误，继续走静默授权
        console.warn("[Auth] refresh_token 续期失败，回退静默授权:", err);
      }
    }
    return applyAndSchedule(await silentRenew(redirectUri));
  })();

  // 无论成败都要释放锁，否则一次失败会把后续所有续期都钉死在同一个 rejected Promise 上
  void inflight
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/** 按当前令牌的到期时间安排下一次续期 */
export const scheduleRenew = () => {
  if (renewTimer) clearTimeout(renewTimer);
  const exp = getExpiresAt();
  if (!exp) return;
  // 已经很接近过期（或已过期）时立刻续，但至少隔 1s，避免失败时打成忙循环
  const delay = Math.max(exp - Date.now() - RENEW_LEAD_MS, 1000);
  renewTimer = setTimeout(() => {
    void renewSession().catch((err) => console.warn("[Auth] 定时续期失败:", err));
  }, delay);
};

export const stopRenew = () => {
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = null;
  inflight = null;
};

/** 冷启动恢复：页面刷新后内存空了，靠 Casdoor 会话把登录态接回来。
 *  返回是否恢复成功；失败**不是错误**，只表示当前确实未登录。 */
export const restoreSession = async (): Promise<boolean> => {
  if (hasToken()) return true;
  try {
    await renewSession();
    return true;
  } catch {
    clearTokens();
    return false;
  }
};
