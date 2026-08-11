/**
 * 首页 —「灯市」(纸灯工坊世界)
 *
 * THESIS: 综合商城的首页是一条夜里亮着的灯市长街——每件商品是一盏点亮的纸灯;
 *   它拒绝品类默认的「轮播 banner + 金刚区 + 瀑布流角标」排布。
 * OWN-WORLD: 和纸象牙场(#F6EFE1)+ 炭墨字(#2A2A28)+ 竹金结构线(#D8B48A),
 *   朱砂(#C2372B)只落在动作与价格;宋体 display,内容全部装在发光的纸面里。
 *   把所有文字拿掉,竹线横架与一片暖光纸卡仍能认出这是灯市。
 * STORY: 访客三秒内明白这是综合商城(墨字大标 + 类目竹架),被主灯与次第亮起的
 *   灯阵勾住往下逛,任意一盏灯(商品卡)一步进详情。
 * FIRST VIEWPORT: 左 55% 墨字大标「灯市开了。」+ 副句 + 朱砂「进灯市」;
 *   右 45% 主灯位(灯笼形纸框、呼吸光、本日主推商品与价格);移动端上下堆叠。
 * FORM: 纸灯工坊(Akari 语法),用户于三掷两 re-roll 后亲选的 challenger;
 *   seed key ee8c0618(source: paper-folds-pleats-deployable-akari-light-sculpture)。
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 *
 * 数据:ListProduct 尚未接通(后端 SQL/逻辑待落地)。当前渲染 authored 演示数据
 * (components/home/demoProducts.ts,界面已标注),接通后切 useQuery 分页拉取。
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Box, Container, Typography } from "@mui/material";
import { useTranslation } from "@ecommerce/i18n";
import { lantern, sp } from "@/styles/tokens";
import { CategoryIcon, ProductArt } from "@/components/home/DemoArt";
import {
  demoCategories,
  demoProducts,
  heroProduct,
  type DemoProduct,
} from "@/components/home/demoProducts";
import "./index.css";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  // TODO(ListProduct): 接通商品微服务后,这两行换成 useQuery 的 data/isLoading,
  // 空态与骨架沿用 LanternCard 的未点灯态。
  const products: DemoProduct[] = demoProducts;
  const isLoading = false;

  // 点灯时机:灯阵进入视口才次第亮起(否则动画在折叠线下无人看见时就放完了)。
  // 不支持 IntersectionObserver 时直接点亮,永不隐形。
  const gridRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setLit(true);
      return;
    }
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLit(true);
          ob.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  return (
    <Box className="lantern-page" sx={{ minHeight: "100vh", color: lantern.ink }}>
      <Container maxWidth="lg" sx={{ pt: { xs: sp[8], md: sp[12] }, pb: sp[12] }}>
        {/* ── 首屏:大标 + 主灯位 ─────────────────────────────── */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { xs: "stretch", md: "center" },
            gap: { xs: sp[8], md: sp[10] },
            mb: { xs: sp[10], md: sp[16] },
          }}
        >
          <Box sx={{ flex: { md: "1 1 55%" } }}>
            <Typography
              component="h1"
              sx={{
                fontFamily: lantern.serif,
                fontWeight: 900,
                fontSize: { xs: "2.9rem", sm: "3.8rem", md: "5.2rem" },
                lineHeight: 1.12,
                letterSpacing: "0.02em",
                mb: sp[4],
              }}
            >
              {t("home.slogan")}
            </Typography>
            <Typography
              sx={{
                color: lantern.inkSoft,
                fontSize: { xs: "0.95rem", md: "1.05rem" },
                lineHeight: 1.9,
                maxWidth: "34em",
                mb: sp[6],
              }}
            >
              {t("home.sloganSub")}
            </Typography>
            <button
              type="button"
              className="seal-btn"
              onClick={() =>
                document
                  .getElementById("lantern-grid")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              style={{
                fontFamily: lantern.serif,
                fontWeight: 700,
                fontSize: "1.05rem",
                letterSpacing: "0.12em",
                padding: "14px 30px",
              }}
            >
              {t("home.enterMarket")}
            </button>
          </Box>

          {/* 主灯位 */}
          <Box sx={{ flex: { md: "1 1 45%" }, minWidth: 0 }}>
            <Link
              to="/product/$spuCode"
              params={{ spuCode: heroProduct.spuCode }}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <Box
                className="lantern-hero-lamp"
                sx={{
                  position: "relative",
                  border: `1px solid ${lantern.bamboo}`,
                  borderRadius: { xs: "88px 88px 14px 14px", md: "120px 120px 16px 16px" },
                  px: { xs: sp[6], md: sp[8] },
                  pt: { xs: sp[8], md: sp[10] },
                  pb: { xs: sp[6], md: sp[8] },
                  textAlign: "center",
                  transition: "border-color 180ms ease-out",
                  "&:hover": { borderColor: lantern.bambooDeep },
                }}
              >
                {/* 竹肋:随灯形弯曲的横向骨架(Akari 的招牌几何) */}
                <Box
                  aria-hidden
                  sx={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    opacity: 0.55,
                    overflow: "hidden",
                    borderRadius: "inherit",
                  }}
                >
                  <svg viewBox="0 0 400 520" preserveAspectRatio="none" width="100%" height="100%">
                    <g fill="none" stroke={lantern.bamboo} strokeWidth="1.4">
                      <path d="M26 96 Q200 64 374 96" />
                      <path d="M10 186 Q200 156 390 186" />
                      <path d="M2 282 Q200 256 398 282" />
                      <path d="M6 378 Q200 356 394 378" />
                      <path d="M14 466 Q200 450 386 466" />
                    </g>
                  </svg>
                </Box>

                {/* 印章徽记:本日主灯 */}
                <Box
                  sx={{
                    position: "absolute",
                    top: { xs: 18, md: 26 },
                    right: { xs: 16, md: 22 },
                    bgcolor: lantern.vermilion,
                    color: "#FDF8EC",
                    fontFamily: lantern.serif,
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    letterSpacing: "0.18em",
                    writingMode: "vertical-rl",
                    px: "7px",
                    py: "10px",
                    borderRadius: "6px",
                    boxShadow: "inset 0 0 0 1px rgba(253,248,236,0.4)",
                  }}
                >
                  {t("home.heroToday")}
                </Box>

                <Box sx={{ width: { xs: 168, md: 216 }, mx: "auto", mb: sp[4] }}>
                  <ProductArt kind={heroProduct.art} title={heroProduct.name} />
                </Box>
                <Typography
                  component="h2"
                  sx={{
                    fontFamily: lantern.serif,
                    fontWeight: 700,
                    fontSize: { xs: "1.25rem", md: "1.45rem" },
                    mb: sp[1],
                  }}
                >
                  {heroProduct.name}
                </Typography>
                <Typography sx={{ color: lantern.inkSoft, fontSize: "0.85rem", mb: sp[3] }}>
                  {heroProduct.merchant}
                </Typography>
                <PriceInk price={heroProduct.minPrice} size="lg" />
                <Box
                  component="span"
                  className="seal-btn"
                  sx={{
                    display: "inline-block",
                    mt: sp[4],
                    fontFamily: lantern.serif,
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    letterSpacing: "0.14em",
                    px: "22px",
                    py: "10px",
                  }}
                >
                  {t("home.viewLamp")}
                </Box>
              </Box>
            </Link>
          </Box>
        </Box>

        {/* ── 类目竹架 ───────────────────────────────────────── */}
        <Box
          component="nav"
          aria-label={t("home.categoriesTitle")}
          sx={{
            borderTop: lantern.line,
            borderBottom: lantern.line,
            py: sp[4],
            mb: { xs: sp[10], md: sp[12] },
            display: "flex",
            gap: { xs: sp[5], md: 0 },
            justifyContent: { md: "space-between" },
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {demoCategories.map((c) => (
            <Link key={c.key} to="/categories" style={{ textDecoration: "none" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: sp[2],
                  minWidth: 56,
                  color: lantern.ink,
                  transition: "color 140ms ease-out",
                  "&:hover": { color: lantern.vermilion },
                }}
              >
                <CategoryIcon kind={c.icon} />
                <Typography
                  sx={{ fontFamily: lantern.serif, fontSize: "0.95rem", fontWeight: 600 }}
                >
                  {c.name}
                </Typography>
              </Box>
            </Link>
          ))}
        </Box>

        {/* ── 灯阵:今日亮灯 ─────────────────────────────────── */}
        <Box id="lantern-grid" sx={{ scrollMarginTop: "88px" }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: sp[3], mb: sp[6] }}>
            <Typography
              component="h2"
              sx={{
                fontFamily: lantern.serif,
                fontWeight: 900,
                fontSize: { xs: "1.7rem", md: "2.1rem" },
              }}
            >
              {t("home.gridTitle")}
            </Typography>
            <Typography sx={{ color: lantern.bambooDeep, fontSize: "0.85rem" }}>
              {t("home.demoBadge")}
            </Typography>
          </Box>

          {products.length === 0 ? (
            <Box sx={{ textAlign: "center", py: sp[16] }}>
              <Typography sx={{ color: lantern.inkSoft }}>
                {isLoading ? t("home.loading") : t("home.comingSoon")}
              </Typography>
            </Box>
          ) : (
            <Box
              ref={gridRef}
              className={lit ? "lantern-grid-lit" : undefined}
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, 1fr)",
                  sm: "repeat(3, 1fr)",
                  md: "repeat(4, 1fr)",
                },
                gap: { xs: sp[3], md: sp[4] },
              }}
            >
              {products.map((p, i) => (
                <LanternCard key={p.spuId} product={p} index={i} />
              ))}
            </Box>
          )}

          <Typography
            sx={{
              mt: sp[8],
              pt: sp[4],
              borderTop: lantern.lineSoft,
              color: lantern.inkSoft,
              fontSize: "0.85rem",
            }}
          >
            {t("home.demoNote")}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

/** 墨字价格:「¥ 199 起」,数字宋体大字 + tabular */
function PriceInk({ price, size = "md" }: { price: number; size?: "md" | "lg" }) {
  const { t } = useTranslation();
  const num = size === "lg" ? "1.9rem" : "1.3rem";
  return (
    <Typography component="p" sx={{ lineHeight: 1, whiteSpace: "nowrap" }}>
      <Box component="span" sx={{ color: lantern.vermilion, fontSize: "0.85em", mr: "2px" }}>
        ¥
      </Box>
      <Box
        component="span"
        sx={{
          fontFamily: lantern.serif,
          fontWeight: 700,
          fontSize: num,
          color: lantern.vermilion,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {price}
      </Box>
      <Box component="span" sx={{ color: lantern.inkSoft, fontSize: "0.85rem", ml: "4px" }}>
        {t("home.priceFrom")}
      </Box>
    </Typography>
  );
}

/** 纸灯商品卡:入场次第点亮(--i),hover 透光 */
function LanternCard({ product, index }: { product: DemoProduct; index: number }) {
  return (
    <Link
      to="/product/$spuCode"
      params={{ spuCode: product.spuCode }}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Box
        className="lantern-card"
        style={{ "--i": index } as React.CSSProperties}
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          border: `1px solid ${lantern.bamboo}`,
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: sp[3], pb: 0 }}>
          <Box
            sx={{
              aspectRatio: "1 / 1",
              // 灯心暖光从商品后面发出,竹肋横过灯面,拱顶收出灯笼形
              background: `repeating-linear-gradient(180deg, transparent 0 34px, rgba(181, 138, 84, 0.16) 34px 35px), radial-gradient(ellipse 72% 60% at 50% 42%, #FFF6DC 0%, #F5EBD2 62%, #EDE3CA 100%)`,
              borderRadius: "56px 56px 8px 8px",
              border: "1px solid rgba(216, 180, 138, 0.55)",
              p: sp[2],
            }}
          >
            <ProductArt kind={product.art} title={product.name} />
          </Box>
        </Box>
        <Box sx={{ p: sp[3], display: "flex", flexDirection: "column", gap: sp[1], flex: 1 }}>
          <Typography
            sx={{
              fontSize: "0.95rem",
              fontWeight: 600,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.85em",
            }}
          >
            {product.name}
          </Typography>
          <Typography sx={{ color: lantern.inkSoft, fontSize: "0.85rem" }}>
            {product.merchant}
          </Typography>
          <Box sx={{ mt: "auto", pt: sp[1] }}>
            <PriceInk price={product.minPrice} />
          </Box>
        </Box>
      </Box>
    </Link>
  );
}
