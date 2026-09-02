import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { GetProductDetailResponse } from "@/gen/api/product/v1/product_pb";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-jsonld";
import { productDetailQueryOptions } from "@/lib/product-query";
import { createAnonymousServerTransport } from "@/lib/server-transport";
import { PersonalizedPanel } from "./personalized-panel";
import { ProductDetail } from "./product-detail";

const LANGUAGES = ["zh", "en"] as const;
type Language = (typeof LANGUAGES)[number];
type PageParams = { lang: string; spuCode: string };

// 多 Pod 缓存一致性缓解拍板（2026-08-28）：短 TTL——各 Pod 独立 ISR 缓存的最大不一致窗口压到 60s。
// 升级路径：需要严格一致时改共享 cacheHandler（next.config cacheHandler 指向共享存储）。
export const revalidate = 60;
export const runtime = "nodejs";

export function generateStaticParams() {
  return [];
}

/** canonical 与 JSON-LD 的 url 必须同源同算——搜索引擎会拿两者互相校验。 */
function productUrl(lang: string, spuCode: string): string {
  const publicOrigin = (process.env.CONSUMER_NEXT_PUBLIC_URL ?? "http://localhost:3004").replace(
    /\/$/,
    "",
  );
  return `${publicOrigin}/${lang}/product/${encodeURIComponent(spuCode)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { lang, spuCode } = await params;

  return {
    title: `${spuCode} (${lang})`,
    alternates: {
      canonical: productUrl(lang, spuCode),
      languages: {
        zh: productUrl("zh", spuCode),
        en: productUrl("en", spuCode),
      },
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<PageParams> }) {
  const { lang, spuCode } = await params;
  if (!isLanguage(lang)) {
    notFound();
  }

  const transport = createAnonymousServerTransport();
  const queryClient = new QueryClient();
  const queryOptions = productDetailQueryOptions(transport, spuCode);

  await queryClient.prefetchQuery(queryOptions);
  const queryState = queryClient.getQueryState(queryOptions.queryKey);

  if (queryState?.status !== "success") {
    return (
      <main className="status" data-rpc-state="error">
        <h1>{lang === "zh" ? "商品暂不可用" : "Product unavailable"}</h1>
        <p role="alert">
          {lang === "zh"
            ? "匿名服务端 Connect RPC 请求失败；请检查网关地址和商品编码。"
            : "The anonymous server-side Connect RPC failed; check the gateway URL and product code."}
        </p>
      </main>
    );
  }

  // JSON-LD 在服务端从同一份查询数据生成：爬虫拿到的首屏 HTML 里就有，不依赖水合。
  // 数据源与 ProductDetail 展示的完全同一份（dehydrate 的就是它），价格同源见 lib/money.ts。
  const product = queryClient.getQueryData<GetProductDetailResponse>(
    queryOptions.queryKey,
  )?.productDetail;
  const jsonLd = product ? buildProductJsonLd({ product, url: productUrl(lang, spuCode) }) : null;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {jsonLd && (
        <script
          type="application/ld+json"
          // 已由 serializeJsonLd 转义 `<`，不会提前闭合 script
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <ProductDetail lang={lang} spuCode={spuCode} />
      <PersonalizedPanel lang={lang} spuCode={spuCode} />
    </HydrationBoundary>
  );
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.some((lang) => lang === value);
}
