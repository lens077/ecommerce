/**
 * 应用入口。
 *
 * 这里只做一件事：在任何业务模块被 import 之前把传输层配置注入 `@ecommerce/api`。
 * 桌面端的网关地址要等读完本地设置才知道，所以真正的启动逻辑放在 bootstrap.tsx。
 */
import { setErrorMessageResolver } from "@ecommerce/api";
import { createErrorMessageResolver, initI18n } from "@ecommerce/i18n";
import { initLocaleStorage, initTransport } from "@ecommerce/tauri";
import merchantEn from "./locales/en/merchant.json";
import merchantZh from "./locales/zh-CN/merchant.json";

await initTransport(import.meta.env.VITE_API_URL);

// 桌面端把语言偏好换到 settings.json；web 端是空操作。必须在 initI18n 之前
await initLocaleStorage();
// 同理，i18n 也要在 bootstrap 之前就绪：渲染时资源已经在内存里，组件侧不需要 Suspense
await initI18n({
  ns: "merchant",
  resources: { "zh-CN": merchantZh, en: merchantEn },
  titleKey: "meta.title",
});
// 让网关错误在英文界面下也是英文，而不是把中文 message 漏到界面上
setErrorMessageResolver(createErrorMessageResolver());

await import("./bootstrap");
