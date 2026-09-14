/**
 * 浏览器侧的 BFF(网关)公网地址。
 *
 * 首页是构建期静态产物,同一镜像同时部署到 dev(shop.dev.test)与 prod(shop.apikv.com),
 * 所以不能在构建期把网关地址烤进去。约定:网关与商城同父域、主机名把 `shop.` 换成
 * `gateway.`(两套环境都成立);`NEXT_PUBLIC_BFF_URL` 仅作显式覆盖。
 */
export function bffBaseUrl(): string {
  const override = process.env.NEXT_PUBLIC_BFF_URL;
  if (override) return override.replace(/\/+$/, "");
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (hostname.startsWith("shop.")) {
    return `${protocol}//gateway.${hostname.slice("shop.".length)}`;
  }
  // 本地 dev(localhost:3004):走 Next 的 /api 代理到网关
  return "/api";
}
