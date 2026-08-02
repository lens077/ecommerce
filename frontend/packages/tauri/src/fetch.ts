import { fetch as pluginFetch } from "@tauri-apps/plugin-http";

/**
 * 走 Rust 侧发出的 fetch。
 *
 * 桌面端 webview 的源是 `tauri://localhost`，而网关的 CORS 是显式白名单
 * （见 gateway/middleware/cors）。plugin-http 在 Rust 进程里发请求，
 * 压根不经过 webview 的同源策略，所以不需要为桌面端去改网关白名单。
 *
 * 可发往的地址受 `apps/desktop/src-tauri/capabilities/default.json` 里
 * `http:default` 的 scope 限制。
 */
export const tauriFetch: typeof globalThis.fetch = async (input, init) => {
    const outerSignal = init?.signal;
    if (!outerSignal) {
        return pluginFetch(input, init);
    }

    // plugin-http 会给传进去的 signal 挂一个永不解绑的 abort 监听器，里面直接
    // `void invoke("plugin:http|fetch_cancel", { rid })`（见 dist-js/index.js:113）。
    // connect-web 在 unary 调用结束后会 abort 自己的 controller，此时 rid 已经释放，
    // 那次 cancel 就会以 "The resource id N is invalid" 变成 unhandled rejection——
    // 每个成功的请求都会刷一条。这里用一个内层 controller 转发 abort，响应回来后
    // 就解绑，让完成之后的 abort 不再传下去。
    //
    // 流式响应仍然可以取消：读到一半 cancel reader 时，plugin-http 自己会调
    // `fetch_cancel_body` 释放 Rust 侧资源，不依赖这个 signal。
    const inner = new AbortController();
    const forward = () => inner.abort(outerSignal.reason);

    if (outerSignal.aborted) {
        forward();
    } else {
        outerSignal.addEventListener("abort", forward, { once: true });
    }

    try {
        return await pluginFetch(input, { ...init, signal: inner.signal });
    } finally {
        outerSignal.removeEventListener("abort", forward);
    }
};
