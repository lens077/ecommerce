import { env } from "./env";

/**
 * Umami 网站分析（自托管，无 cookie、不采 PII）。
 *
 * 与 `@ecommerce/tracker` 是两件事，别混：
 *   - `@ecommerce/tracker` 报的是商品浏览行为，喂给 behavior 服务与 gorse 推荐。
 *   - 这里报的是站点级访问指标（PV/UV/来源/停留），只给运营看。
 *
 * 注入而不是写死在 index.html：两个变量缺任一就完全不加载，
 * 于是本地开发和未配置的环境不会往面板里灌垃圾数据，也不必为此改 HTML。
 */
export function initAnalytics(): void {
  const scriptUrl = env.VITE_UMAMI_SCRIPT_URL;
  const websiteId = env.VITE_UMAMI_WEBSITE_ID;
  if (!scriptUrl || !websiteId) return;

  // 幂等：HMR 或重复调用不会插入第二份（umami 脚本自身不做去重，会重复计数）。
  if (document.querySelector<HTMLScriptElement>("script[data-website-id]")) return;

  const script = document.createElement("script");
  script.src = scriptUrl;
  script.defer = true;
  script.dataset.websiteId = websiteId;
  document.head.appendChild(script);
}
