import Script from "next/script";

/**
 * Umami 网站分析（自托管，无 cookie、不采 PII）。
 *
 * 与 `@ecommerce/tracker` 是两件事：那个报商品浏览行为喂 gorse 推荐，这个只报
 * 站点级访问指标（PV/UV/来源）给运营看。
 *
 * 两个环境变量缺任一就返回 null，完全不加载——本地开发和未配置的环境不会往面板
 * 灌垃圾数据。NEXT_PUBLIC_* 在构建期内联，改值要重新构建镜像。
 *
 * strategy="afterInteractive"：analytics 不该和首屏抢主线程，但要早于用户开始点击，
 * 这是 Next 为这类脚本给的档位（lazyOnload 会漏掉停留极短的访问）。
 */
export function UmamiAnalytics() {
  const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!scriptUrl || !websiteId) return null;

  return (
    <Script
      id="umami-analytics"
      src={scriptUrl}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
