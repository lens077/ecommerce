/**
 * 应用入口。
 *
 * 这里只做一件事：在任何业务模块被 import 之前把传输层配置注入 `@ecommerce/api`。
 * `createConnectTransport` 在创建时就固化了 baseUrl 和 fetch，而桌面端的网关地址
 * 要等读完本地设置才知道 —— 所以真正的启动逻辑放在 bootstrap.tsx，用动态 import
 * 保证顺序确定，不依赖路由的 code splitting 恰好把 api 模块延后加载。
 */
// 「灯市」世界的自托管宋体(按 unicode-range 切片,浏览器只拉用到的字形片)
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/700.css";
import "@fontsource/noto-serif-sc/900.css";
import { setErrorMessageResolver } from "@ecommerce/api";
import { createErrorMessageResolver, initI18n } from "@ecommerce/i18n";
import { initLocaleStorage, initTransport } from "@ecommerce/tauri";
import { env } from "@/env";
import consumerEn from "./locales/en/consumer.json";
import consumerZh from "./locales/zh-CN/consumer.json";

await initTransport(env.VITE_GATEWAY_URL);

// 桌面端把语言偏好换到 settings.json；web 端是空操作。必须在 initI18n 之前
await initLocaleStorage();
// 同理，i18n 也要在 bootstrap 之前就绪：渲染时资源已经在内存里，组件侧不需要 Suspense
await initI18n({
  ns: "consumer",
  resources: { "zh-CN": consumerZh, en: consumerEn },
  titleKey: "meta.title",
});
// 让网关错误在英文界面下也是英文，而不是把中文 message 漏到界面上
setErrorMessageResolver(createErrorMessageResolver());

await import("./bootstrap");
