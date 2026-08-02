import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 与 apps/desktop/src-tauri/src/lib.rs 中的常量一一对应 */
const OAUTH_CALLBACK_EVENT = "oauth://callback";
const OAUTH_CANCELLED_EVENT = "oauth://cancelled";

export interface OauthCallback {
  code: string;
  state: string;
}

export class OauthCancelledError extends Error {
  constructor() {
    super("用户取消了登录");
    this.name = "OauthCancelledError";
  }
}

/**
 * 在桌面端走 Casdoor 登录。
 *
 * Casdoor 只会把浏览器重定向到已白名单的 http 地址，而桌面端主窗口的源是
 * `tauri://localhost` —— 硬跳转出去就回不来了。所以这里请 Rust 侧开一个
 * 独立子窗口加载登录页，在它导航到 `redirectPrefix` 的瞬间截下 code/state。
 *
 * @param signinUrl      Casdoor 的 authorize 地址（redirect_uri 需与 redirectPrefix 一致）
 * @param redirectPrefix 回调地址前缀，命中即视为登录完成
 */
export function openCasdoorLogin(
  signinUrl: string,
  redirectPrefix: string,
): Promise<OauthCallback> {
  return new Promise<OauthCallback>((resolve, reject) => {
    const disposers: Array<() => void> = [];
    const cleanup = () => {
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    };

    Promise.all([
      listen<OauthCallback>(OAUTH_CALLBACK_EVENT, (event) => {
        cleanup();
        resolve(event.payload);
      }),
      // 用户手动关掉登录窗口时也要把 promise 收尾，否则调用方会一直挂着
      listen(OAUTH_CANCELLED_EVENT, () => {
        cleanup();
        reject(new OauthCancelledError());
      }),
    ])
      .then((unlisteners) => {
        disposers.push(...unlisteners);
        return invoke("open_login_window", { url: signinUrl, redirectPrefix });
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}
