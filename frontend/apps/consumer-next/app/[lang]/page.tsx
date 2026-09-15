/**
 * 首页 —「灯市」(纸灯工坊世界),服务端渲染版。
 *
 * 2026-09-14 从 consumer SPA 的 routes/index.tsx 迁来:首页首屏不再等 JS。
 * 设计契约(THESIS / OWN-WORLD / STORY / FIRST VIEWPORT)原样保留在 SPA 文件头,
 * 视觉 token 与演示数据共用 @ecommerce/lantern;样式在 src/home/home.css。
 *
 * 渲染策略:demo 数据是构建期常量,页面整页静态(构建时预渲染 /zh 与 /en,
 * 根路径 / 由 next.config 的 rewrite 落到 /zh)。ListProduct 接通后可直接加 `revalidate`:
 * 自 2026-09-15 起线上 `.next/server/app` 整目录是 init 容器拷贝后的可写卷(此前只挂
 * app/zh、app/en 两个子目录,首页产物 app/zh.html 写不进去)。
 *
 * 客户端 JS 只有三个岛:灯阵入视点亮、顶栏搜索(RPC 客户端按需加载)、登录态。
 */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import {
  CategoryIcon,
  demoCategories,
  demoProducts,
  heroProduct,
  ProductArt,
  type DemoProduct,
} from "@ecommerce/lantern";
import { homeCopy, isLanguage, LANGUAGES, type HomeCopy, type Language } from "@/home/copy";
import { LitGrid } from "@/home/LitGrid";
import { lanternSerif } from "@/home/fonts";
import { SiteFooter } from "@/home/SiteFooter";
import { SiteHeader } from "@/home/SiteHeader";
import { homeUrl } from "@/home/site";
import "@/home/home.css";

export const dynamic = "force-static";

type PageParams = { lang: string };

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { lang } = await params;
  const copy = homeCopy[isLanguage(lang) ? lang : "zh"];
  const current = isLanguage(lang) ? lang : "zh";
  return {
    title: { absolute: copy.title },
    description: copy.description,
    applicationName: copy.title,
    // Lighthouse SEO 要求 canonical / hreflang 是绝对 URL;域名来源见 src/home/site.ts
    alternates: {
      canonical: homeUrl(current),
      languages: {
        "zh-CN": homeUrl("zh"),
        en: homeUrl("en"),
        "x-default": homeUrl("zh"),
      },
    },
  };
}

export default async function HomePage({ params }: { params: Promise<PageParams> }) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  const copy = homeCopy[lang];
  return (
    <>
      <div className={`lantern-page ${lanternSerif.variable}`}>
        <SiteHeader lang={lang} copy={copy} />
        <main className="container lantern-main">
          {/* ── 首屏:大标 + 主灯位 ───────────────────────────── */}
          <section className="hero">
            <div className="hero-copy">
              <h1 className="hero-title">{copy.home.slogan}</h1>
              <p className="hero-sub">{copy.home.sloganSub}</p>
              <a className="seal-btn seal-btn--lg" href="#lantern-grid">
                {copy.home.enterMarket}
              </a>
            </div>
            <div className="hero-lamp-slot">
              <a className="hero-lamp-link" href={productHref(lang, heroProduct)}>
                <div className="lantern-hero-lamp">
                  <div className="lamp-ribs" aria-hidden="true">
                    <svg viewBox="0 0 400 520" preserveAspectRatio="none">
                      <g fill="none" stroke="#D8B48A" strokeWidth="1.4">
                        <path d="M26 96 Q200 64 374 96" />
                        <path d="M10 186 Q200 156 390 186" />
                        <path d="M2 282 Q200 256 398 282" />
                        <path d="M6 378 Q200 356 394 378" />
                        <path d="M14 466 Q200 450 386 466" />
                      </g>
                    </svg>
                  </div>
                  <span className="lamp-seal">{copy.home.heroToday}</span>
                  <div className="lamp-art">
                    <ProductArt kind={heroProduct.art} title={heroProduct.name} />
                  </div>
                  <h2 className="lamp-name">{heroProduct.name}</h2>
                  <p className="lamp-merchant">{heroProduct.merchant}</p>
                  <PriceInk price={heroProduct.minPrice} size="lg" copy={copy} />
                  <span className="seal-btn seal-btn--md">{copy.home.viewLamp}</span>
                </div>
              </a>
            </div>
          </section>

          {/* ── 类目竹架 ─────────────────────────────────────── */}
          <nav className="lanes" aria-label={copy.home.categoriesTitle}>
            {demoCategories.map((c) => (
              <a className="lane" key={c.key} href="/categories">
                <CategoryIcon kind={c.icon} />
                <span>{c.name}</span>
              </a>
            ))}
          </nav>

          {/* ── 灯阵:今日亮灯 ───────────────────────────────── */}
          <section id="lantern-grid" className="grid-section">
            <div className="grid-head">
              <h2 className="grid-title">{copy.home.gridTitle}</h2>
              <span className="grid-badge">{copy.home.demoBadge}</span>
            </div>
            <LitGrid>
              {demoProducts.map((p, i) => (
                <LanternCard key={p.spuId} lang={lang} product={p} index={i} copy={copy} />
              ))}
            </LitGrid>
            <p className="demo-note">{copy.home.demoNote}</p>
          </section>
        </main>
        <SiteFooter copy={copy} />
      </div>
    </>
  );
}

function productHref(lang: Language, product: DemoProduct): string {
  return `/${lang}/product/${encodeURIComponent(product.spuCode)}`;
}

/** 墨字价格:「¥ 199 起」,数字宋体大字 + tabular */
function PriceInk({
  price,
  size = "md",
  copy,
}: {
  price: number;
  size?: "md" | "lg";
  copy: HomeCopy;
}) {
  return (
    <p className={size === "lg" ? "price-ink price-ink--lg" : "price-ink"}>
      <span className="yen">¥</span>
      <span className="num">{price}</span>
      <span className="from">{copy.home.priceFrom}</span>
    </p>
  );
}

/** 纸灯商品卡:入场次第点亮(--i),hover 透光 */
function LanternCard({
  lang,
  product,
  index,
  copy,
}: {
  lang: Language;
  product: DemoProduct;
  index: number;
  copy: HomeCopy;
}) {
  return (
    <a className="lantern-card-link" href={productHref(lang, product)}>
      <div className="lantern-card" style={{ "--i": index } as CSSProperties}>
        <div className="card-art-frame">
          <div className="card-art">
            <ProductArt kind={product.art} title={product.name} />
          </div>
        </div>
        <div className="card-body">
          <p className="card-name">{product.name}</p>
          <p className="card-merchant">{product.merchant}</p>
          <div className="card-price">
            <PriceInk price={product.minPrice} copy={copy} />
          </div>
        </div>
      </div>
    </a>
  );
}
