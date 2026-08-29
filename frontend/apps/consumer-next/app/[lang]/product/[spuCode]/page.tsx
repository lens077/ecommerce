import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { lang, spuCode } = await params;
  const publicOrigin = (process.env.CONSUMER_NEXT_PUBLIC_URL ?? "http://localhost:3004").replace(
    /\/$/,
    "",
  );

  return {
    title: `${spuCode} (${lang})`,
    alternates: {
      canonical: `${publicOrigin}/${lang}/product/${encodeURIComponent(spuCode)}`,
      languages: {
        zh: `${publicOrigin}/zh/product/${encodeURIComponent(spuCode)}`,
        en: `${publicOrigin}/en/product/${encodeURIComponent(spuCode)}`,
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

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductDetail lang={lang} spuCode={spuCode} />
      <PersonalizedPanel lang={lang} spuCode={spuCode} />
    </HydrationBoundary>
  );
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.some((lang) => lang === value);
}
