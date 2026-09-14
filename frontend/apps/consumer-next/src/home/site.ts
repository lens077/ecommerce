/**
 * 站点公网源(用于 canonical / hreflang 的绝对 URL)。
 *
 * 首页是构建期静态产物,只能在构建期定死域名;同一镜像部署到 dev(shop.dev.test)时
 * canonical 也指向线上——这正是想要的:dev 站不该被搜索引擎当成独立版本收录。
 * 显式覆盖用构建参数 NEXT_PUBLIC_SITE_URL(Dockerfile 的 ARG)。
 * 商品页(ISR)用的是运行时 CONSUMER_NEXT_PUBLIC_URL,两者不要混用。
 */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://shop.apikv.com").replace(
  /\/+$/,
  "",
);

/** 首页各语言版本的绝对 URL:zh 是根路径 `/`(next.config rewrite),en 是 `/en`。 */
export function homeUrl(lang: "zh" | "en"): string {
  return lang === "zh" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/en`;
}
