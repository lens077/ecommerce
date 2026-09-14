/**
 * 应用入口。
 *
 * 网关地址必须在 bootstrap 创建 transport 之前注入；Web 端默认使用同源 `/api`，
 * 由 Vite dev proxy 转发，生产环境可用 `VITE_GATEWAY_URL` 覆盖。
 */
import { setErrorMessageResolver, setGatewayBaseUrl } from "@ecommerce/api";
import { createErrorMessageResolver, initI18n } from "@ecommerce/i18n";
import adminEn from "./locales/en/admin.json";
import adminZh from "./locales/zh-CN/admin.json";

setGatewayBaseUrl(import.meta.env.VITE_GATEWAY_URL || "/api");

// i18n 要在 bootstrap 之前就绪：渲染时资源已经在内存里，组件侧不需要 Suspense，也不会闪文案
await initI18n({
  ns: "admin",
  resources: { "zh-CN": adminZh, en: adminEn },
  titleKey: "meta.title",
});

// 网关返回的错误不能把内部或未本地化的原文漏进管理界面。
setErrorMessageResolver(createErrorMessageResolver());

await import("./bootstrap");
