import { setAppFetch, setGatewayBaseUrl } from "@ecommerce/api";
import { isTauri } from "./env";

/**
 * 在渲染任何组件之前把传输层配置注入 `@ecommerce/api`。
 *
 * 必须早于任何 api 模块被 import —— `createConnectTransport` 在创建时就固化了
 * baseUrl 和 fetch，晚了就来不及。各 app 的 `main.tsx` 用顶层 await 调用它，
 * 再动态 import 真正的应用入口。
 *
 * @param webGatewayUrl web 形态下的网关地址，通常是 `import.meta.env.VITE_GATEWAY_URL`
 */
export async function initTransport(webGatewayUrl?: string): Promise<void> {
  if (!isTauri()) {
    setGatewayBaseUrl(webGatewayUrl);
    return;
  }

  // 动态 import：web 构建里这些 chunk 永远不会被请求
  const [{ loadGatewayUrl }, { tauriFetch }] = await Promise.all([
    import("./settings"),
    import("./fetch"),
  ]);

  setGatewayBaseUrl(await loadGatewayUrl());
  setAppFetch(tauriFetch);
}

/**
 * 把 locale 的持久化后端换成桌面端的 settings.json。
 *
 * 必须早于 `initI18n` —— detectLocale 在 init 里就会读一次存储，换晚了这次启动
 * 读到的还是 localStorage。web 形态下是空操作，@ecommerce/i18n 自带的
 * localStorage 后端本来就是对的。
 */
export async function initLocaleStorage(): Promise<void> {
  if (!isTauri()) return;

  // 同样用动态 import 把 @tauri-apps/plugin-store 挡在 web bundle 外面
  const [{ setLocaleStorage }, { loadLocale, saveLocale }] = await Promise.all([
    import("@ecommerce/i18n"),
    import("./settings"),
  ]);

  setLocaleStorage({ read: loadLocale, write: saveLocale });
}
