/**
 * 启动前置:在任何业务模块被 import 之前把传输层配置注入 `@ecommerce/api`。
 *
 * `createConnectTransport` 在创建时就固化了 baseUrl 和 fetch,而桌面端的网关地址
 * 要等读完本地设置才知道,所以这里的初始化必须先于 bootstrap 里的一切。
 *
 * 顺序由 ES 模块求值规则保证:bootstrap.tsx 的**第一个** import 是本文件,
 * 模块按 import 顺序求值、顶层 await 会被等待,于是下面四个 await 跑完之前
 * bootstrap 的其余 import(MUI、路由、AuthProvider…)不会开始求值。
 * 2026-09-15 之前这里是 main.tsx + `await import("./bootstrap")`:动态 import 让 Vite
 * 无法把第二波 45 个 chunk 写进 HTML 的 modulepreload,移动端白白多一个 RTT 波次。
 *
 * ⚠️ 不要把 `import "./init"` 从 bootstrap.tsx 的第一行挪走。
 */
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
