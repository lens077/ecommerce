/**
 * 「回首页」的统一出口。
 *
 * 2026-09-14 起线上首页 `/` 由 consumer-next 服务端渲染(HTTPRoute 把 `/` Exact 指过去),
 * SPA 里的首页路由只在本地 dev(localhost:3000)与桌面端(Tauri 壳)还会被命中。
 * 所以生产 web 构建里必须整页跳转,客户端路由到 `/` 只会得到 SPA 自己那份旧首页。
 */
import { isTauri } from "@ecommerce/tauri";

/** 线上 web:首页在另一个应用里,只能整页跳。 */
export function homeIsExternal(): boolean {
  return import.meta.env.PROD && !isTauri();
}

/**
 * 回首页。`navigate` 传路由的 navigate(或 router.navigate),
 * 仅在首页仍由 SPA 承载的场景(dev / 桌面端)使用。
 */
export function goHome(navigate: (opts: { to: "/" }) => unknown): void {
  if (homeIsExternal()) {
    window.location.assign("/");
    return;
  }
  void navigate({ to: "/" });
}
