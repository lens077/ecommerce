/**
 * 应用入口。
 *
 * 和其他三个 app 同一个套路：入口只负责把「渲染之前必须就绪」的东西准备好，
 * 真正的启动逻辑在 bootstrap.tsx，用动态 import 保证顺序确定。
 *
 * admin 目前还没接 `@ecommerce/api`，所以这里不需要 initTransport /
 * setErrorMessageResolver —— 等接了网关再补，位置就在 initI18n 后面。
 */
import { initI18n } from "@ecommerce/i18n";
import adminEn from "./locales/en/admin.json";
import adminZh from "./locales/zh-CN/admin.json";

// i18n 要在 bootstrap 之前就绪：渲染时资源已经在内存里，组件侧不需要 Suspense，也不会闪文案
await initI18n({
  ns: "admin",
  resources: { "zh-CN": adminZh, en: adminEn },
  titleKey: "meta.title",
});

await import("./bootstrap");
