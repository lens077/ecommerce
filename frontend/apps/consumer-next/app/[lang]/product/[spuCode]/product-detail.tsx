"use client";

import { useQuery } from "@connectrpc/connect-query";
import { useEffect } from "react";
import { ProductService } from "@/gen/api/product/v1/product_pb";
import { formatMoney } from "@/lib/money";
import { PRODUCT_QUERY_STALE_TIME_MS } from "@/lib/product-query";

type Language = "zh" | "en";

const COPY = {
  zh: {
    eyebrow: "Next.js 垂直切片",
    price: "价格",
    stock: "锁定库存",
    sku: "SKU",
    loading: "正在加载商品…",
    missing: "商品响应缺少详情。",
    error: "浏览器查询失败",
  },
  en: {
    eyebrow: "Next.js vertical slice",
    price: "Price",
    stock: "Locked stock",
    sku: "SKU",
    loading: "Loading product…",
    missing: "The product response has no detail.",
    error: "Browser query failed",
  },
} satisfies Record<Language, Record<string, string>>;

export function ProductDetail({ lang, spuCode }: { lang: Language; spuCode: string }) {
  const query = useQuery(
    ProductService.method.getProductDetail,
    { spuCode },
    {
      staleTime: PRODUCT_QUERY_STALE_TIME_MS,
    },
  );
  const copy = COPY[lang];

  useEffect(() => {
    document.documentElement.dataset.consumerNextHydrated = "true";
    return () => {
      delete document.documentElement.dataset.consumerNextHydrated;
    };
  }, []);

  if (query.isPending) {
    return <p className="status">{copy.loading}</p>;
  }

  if (query.error) {
    return (
      <p className="status statusError" role="alert">
        {copy.error}: {query.error.message}
      </p>
    );
  }

  const product = query.data.productDetail;
  if (!product) {
    return (
      <p className="status statusError" role="alert">
        {copy.missing}
      </p>
    );
  }

  return (
    <main className="shell" data-rpc-state="success" data-spu-code={product.spuCode}>
      <header className="hero">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{product.spuName}</h1>
        <p className="code">{product.spuCode}</p>
      </header>

      <section className="skuGrid" aria-label={copy.sku}>
        {product.skus.map((sku) => (
          <article className="skuCard" key={sku.skuCode}>
            <p className="skuLabel">{copy.sku}</p>
            <h2>{sku.skuName}</h2>
            <dl>
              <div>
                <dt>{copy.price}</dt>
                <dd>{formatMoney(sku.price)}</dd>
              </div>
              <div>
                <dt>{copy.stock}</dt>
                <dd>{sku.stockLocked.toString()}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
