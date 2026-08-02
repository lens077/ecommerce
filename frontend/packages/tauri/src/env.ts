/**
 * 是否运行在 Tauri 外壳里。
 *
 * 三个 app 同时跑 web 和桌面两种形态，所有桌面专属分支都以此为开关。
 * `__TAURI_INTERNALS__` 由 Tauri 在页面加载前注入，同步可读。
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
