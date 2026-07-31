/**
 * 首页 — 商品列表
 *
 * 之前首页只是 `redirect({ to: "/categories" })`（且 /categories 是占位桩），
 * 现改为直接展示商品。数据来自商品微服务的 ListProduct（待后端落地核心 SQL/逻辑后接通）。
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Box, Container, Typography } from "@mui/material";
import { sp, tokens } from "@/styles/tokens";
import "./index.css";

export const Route = createFileRoute("/")({
  component: HomePage,
});

// 商品卡片视图模型（对应后端 ListProduct 的 ProductCard，字段以最终 proto 契约为准）
interface ProductCardVM {
  spuId: string;
  spuCode: string;
  name: string;
  mainMediaUrl: string;
  minPrice: number; // 该 SPU 最低 SKU 售价，展示“¥xx 起”
}

function HomePage() {
  // TODO(ListProduct): 接通商品微服务 ListProduct 后，用 useQuery 拉取分页商品列表。
  // 目前后端核心 SQL/逻辑待定（设计待确认），先渲染空态骨架。
  const products: ProductCardVM[] = [];
  const isLoading = false;

  return (
    <Box sx={{ bgcolor: tokens.colors.background.primary, minHeight: "100vh" }}>
      <Container maxWidth="lg" sx={{ py: sp[5] }}>
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, color: tokens.colors.text.primary, mb: sp[4] }}
        >
          精选商品
        </Typography>

        {products.length === 0 ? (
          <Box sx={{ textAlign: "center", py: sp[16] }}>
            <Typography variant="body1" sx={{ color: tokens.colors.text.secondary }}>
              {isLoading ? "商品加载中…" : "商品即将上架，敬请期待"}
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                sm: "repeat(3, 1fr)",
                md: "repeat(4, 1fr)",
              },
              gap: sp[4],
            }}
          >
            {products.map((p) => (
              <ProductCard key={p.spuId} product={p} />
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}

function ProductCard({ product }: { product: ProductCardVM }) {
  return (
    <Link
      to="/product/$spuCode"
      params={{ spuCode: product.spuCode }}
      style={{ textDecoration: "none" }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          borderRadius: tokens.radius.lg,
          border: `1px solid ${tokens.colors.border.default}`,
          bgcolor: tokens.colors.background.card,
          overflow: "hidden",
          transition: tokens.transitions.fast,
          "&:hover": { boxShadow: tokens.shadows.md },
        }}
      >
        <Box
          component="img"
          src={product.mainMediaUrl}
          alt={product.name}
          sx={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", bgcolor: tokens.colors.background.primary }}
        />
        <Box sx={{ p: sp[3], display: "flex", flexDirection: "column", gap: sp[1] }}>
          <Typography
            variant="body2"
            sx={{
              color: tokens.colors.text.primary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {product.name}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 700, color: tokens.colors.accent.red }}>
            ¥{product.minPrice.toLocaleString()}
            <Typography component="span" variant="caption" sx={{ color: tokens.colors.text.secondary, ml: sp[1] }}>
              起
            </Typography>
          </Typography>
        </Box>
      </Box>
    </Link>
  );
}
