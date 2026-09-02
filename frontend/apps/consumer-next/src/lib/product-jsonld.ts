/**
 * 商品详情页的 schema.org/Product JSON-LD。
 *
 * 只在 consumer-next（SSR/ISR）输出：它是富媒体搜索结果的前提，而 SPA 里输出
 * 收益极低（爬虫未必执行 JS），见 docs/frontend/semantic-html.md §二.6。
 *
 * 形态取舍：
 *  - 多 SKU 用 `AggregateOffer`（lowPrice/highPrice/offerCount），单 SKU 退化成 `Offer`。
 *    这是 Google Merchant listing 文档推荐的做法，比给每个 SKU 各出一个 Product 稳。
 *  - `price` 走 `moneyToDecimalString`，与页面展示同源（§四.3 的漂移防线）。
 *  - `availability` 只看 `stockLocked`：这是 proto 里唯一的库存字段。
 *    它语义是「锁定库存」而非「可售库存」，所以这里只敢区分「有/无」，不报数量。
 *  - 不写 `description`/`brand`：proto 没有这两个字段，宁缺毋滥——编造会被判误导。
 */
import type { ProductSpuDetail } from "@/gen/api/product/v1/product_pb";
import { moneyToDecimalString, type Money } from "./money";

const SCHEMA_IN_STOCK = "https://schema.org/InStock";
const SCHEMA_OUT_OF_STOCK = "https://schema.org/OutOfStock";

export interface ProductJsonLdInput {
  product: ProductSpuDetail;
  /** 页面 canonical URL，已含语言段。 */
  url: string;
}

type Offer = {
  "@type": "Offer";
  sku: string;
  name?: string;
  price: string;
  priceCurrency: string;
  availability: string;
  url: string;
};

export function buildProductJsonLd({ product, url }: ProductJsonLdInput) {
  const skus = product.skus.filter((sku): sku is typeof sku & { price: Money } => !!sku.price);

  const offers: Offer[] = skus.map((sku) => ({
    "@type": "Offer",
    sku: sku.skuCode,
    ...(sku.skuName ? { name: sku.skuName } : {}),
    price: moneyToDecimalString(sku.price),
    priceCurrency: sku.price.currencyCode,
    availability: sku.stockLocked > 0n ? SCHEMA_IN_STOCK : SCHEMA_OUT_OF_STOCK,
    url,
  }));

  const image = product.skus.map((sku) => sku.thumbnailUrl).filter((u) => u.length > 0);

  const base = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.spuName,
    sku: product.spuCode,
    url,
    ...(image.length > 0 ? { image } : {}),
  };

  if (offers.length === 0) {
    return base;
  }

  if (offers.length === 1) {
    return { ...base, offers: offers[0] };
  }

  // 多 SKU：价格区间 + 逐 SKU offer。lowPrice/highPrice 用数值比较，不能按字符串比。
  const numeric = offers.map((o) => Number(o.price));
  const currencies = new Set(offers.map((o) => o.priceCurrency));
  return {
    ...base,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: offers[numeric.indexOf(Math.min(...numeric))].price,
      highPrice: offers[numeric.indexOf(Math.max(...numeric))].price,
      // 混币种没有合法的 priceCurrency；实际业务单店单币种，真出现混币是数据问题
      ...(currencies.size === 1 ? { priceCurrency: offers[0].priceCurrency } : {}),
      offerCount: offers.length,
      offers,
    },
  };
}

/**
 * 序列化成可内联进 <script type="application/ld+json"> 的字符串。
 * `<` 转义成 \u003c：JSON-LD 内联在 HTML 里，一个 `</script>` 就能提前闭合标签。
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
