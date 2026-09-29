import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Code, ConnectError } from "@connectrpc/connect";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { GetProductDetailResponse } from "@/gen/api/product/v1/product_pb";
import { isGatewayError } from "@/lib/gateway-error";
import { loadProductDetail } from "@/lib/product-detail-loader";
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-jsonld";
import { buildProductMetadata, type ProductMetadataInput } from "@/lib/product-metadata";
import { PersonalizedPanel } from "./personalized-panel";
import { Providers } from "../../../providers";
import { ProductDetail } from "./product-detail";
// POC 样式只服务商品页;首页有自己的 home.css,两者不共用 body/h1 规则
import "../../../styles.css";

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
  // 非法语言段由页面组件 notFound()，这里不必为它发 RPC
  if (!isLanguage(lang)) {
    return {};
  }

  // 与页面组件同一次渲染内共用这次 RPC（React cache 去重），见 lib/product-detail-loader.ts
  const { queryClient, queryOptions } = await loadProductDetail(spuCode);
  const input = productMetadataInput(lang, queryClient, queryOptions.queryKey);

  return {
    ...buildProductMetadata(input),
    // 商品不存在时不声明 canonical/hreflang：noindex 的页面再指认规范地址、拉进语言簇是自相矛盾的信号。
    // 服务故障时保留，那可能只是正常商品暂时取不到。
    ...(input.status === "not-found"
      ? {}
      : {
          alternates: {
            canonical: productUrl(lang, spuCode),
            languages: {
              zh: productUrl("zh", spuCode),
              en: productUrl("en", spuCode),
            },
          },
        }),
  };
}

export default async function ProductPage({ params }: { params: Promise<PageParams> }) {
  const { lang, spuCode } = await params;
  if (!isLanguage(lang)) {
    notFound();
  }

  const { queryClient, queryOptions } = await loadProductDetail(spuCode);
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
    // Providers(transport + react-query)只包商品页:首页是静态 HTML + 三个小岛,
    // 放在 layout 里会把 connect/react-query 运行时塞进首页首屏 JS。
    <Providers>
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
    </Providers>
  );
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.some((lang) => lang === value);
}

type ProductQuery = Awaited<ReturnType<typeof loadProductDetail>>;

/**
 * 查询结果 → TDK 的三种状态。「这个 URL 没有商品」只认 product 服务自己返回的两种码：
 * not_found（该服务约定商品缺失必须是它）和 invalid_argument（spuCode 不合法，例如超过
 * proto 的 max_len，同一个 URL 永远取不到）。网关自己返回的同名错误码（例如路由缺失时的
 * not_found）是故障，见 lib/gateway-error.ts；其余错误码一律按故障处理。
 */
function productMetadataInput(
  lang: Language,
  queryClient: ProductQuery["queryClient"],
  queryKey: ProductQuery["queryOptions"]["queryKey"],
): ProductMetadataInput {
  const state = queryClient.getQueryState(queryKey);
  const product = queryClient.getQueryData<GetProductDetailResponse>(queryKey)?.productDetail;
  if (state?.status === "success" && product) {
    return { lang, status: "success", product };
  }
  if (state?.status === "error") {
    const error = ConnectError.from(state.error);
    const noSuchProduct = error.code === Code.NotFound || error.code === Code.InvalidArgument;
    if (noSuchProduct && !isGatewayError(error)) {
      return { lang, status: "not-found" };
    }
  }
  return { lang, status: "unavailable" };
}
