"use client";

import { useQuery } from "@connectrpc/connect-query";
import { ProductService } from "@/gen/api/product/v1/product_pb";
import { personalizedBrowserTransport } from "@/lib/personalized-browser-transport";

type Language = "zh" | "en";

export function PersonalizedPanel({ lang, spuCode }: { lang: Language; spuCode: string }) {
  const query = useQuery(
    ProductService.method.getProductDetail,
    { spuCode },
    {
      transport: personalizedBrowserTransport,
      staleTime: 60_000,
      retry: false,
    },
  );

  return (
    <aside className="personalized" data-personalized-state={query.status}>
      <p className="skuLabel">{lang === "zh" ? "客户端个性化层" : "Client personalization"}</p>
      <p>
        {query.isPending
          ? lang === "zh"
            ? "等待浏览器携带会话 Cookie 拉取…"
            : "Waiting for the browser session query…"
          : query.error
            ? lang === "zh"
              ? "个性化数据暂不可用。"
              : "Personalized data is unavailable."
            : query.data.productDetail?.spuName}
      </p>
    </aside>
  );
}
