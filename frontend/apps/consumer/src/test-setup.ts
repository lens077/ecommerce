/**
 * jsdom 测试环境的必要补丁。
 *
 * 为什么需要它：jsdom 31（2026-11-17 依赖批升级由 30.1.3 升上来）的 window 上不再
 * 提供 `matchMedia`（实测 `new JSDOM("").window.matchMedia === undefined`）。
 * MUI 的响应式 `sx`（`display: { xs, md }` 等）经 `useMediaQuery` 调用它，缺失时
 * 任何断点都判定不匹配，于是 `display: { xs: "flex", md: "none" }` 的分支整段不渲染
 * ——AppBar 移动端那套按钮直接消失，AppBar.test 里「两个 signIn 按钮」与「show more」
 * 两条断言同时变红。补一个最小实现即可；只影响 jsdom 测试，浏览器与真实环境不受影响。
 *
 * 匹配语义：本项目测试不关心具体断点，`matches` 一律返回 false（等价于「所有
 * min-width 查询都不命中的窄屏」）。若将来有测试依赖某个断点命中，在这里按 query
 * 解析 min/max-width 再返回 true，不要改成全局恒 true——那会让桌面/移动两套分支
 * 同时渲染，断言会以另一种方式失效。
 */

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  window.matchMedia = (query: string): MediaQueryList => {
    const mql = {
      matches: false,
      media: query,
      onchange: null,
      addListener: (cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
      removeListener: (cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) =>
        listeners.delete(cb),
      dispatchEvent: () => true,
    };
    return mql as unknown as MediaQueryList;
  };
}
