import { createFileRoute } from "@tanstack/react-router";

import {
  Box,
  Container,
  Typography,
  Card,
  CardMedia,
  List,
  ListItem,
  ListItemText,
  Divider,
  Button,
  Paper,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
} from "@mui/material";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import { styled } from "@mui/material/styles";
import { useProductDetail } from "@/hooks/useProduct";
import type { ProductSpuDetail } from "@/gen/api/product/v1/product_pb.ts";
import { useState, useCallback } from "react";
import { useAddToCart } from "@/hooks/useCart";
import { tokens } from "@/styles/tokens";

// 样式组件定义在外面，避免每次渲染重新创建
const ImageCard = styled(Card)(() => ({
  borderRadius: "16px",
  overflow: "hidden",
  border: `1px solid ${tokens.colors.border.default}`,
}));

const ProductPage = () => {
  const { spuCode } = Route.useParams();

  const { data, isLoading, isError, error } = useProductDetail(spuCode);
  const product: ProductSpuDetail | undefined = data?.productDetail;

  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  // 使用加入购物车 Hook
  const {
    quantity,
    isLoading: isAddingToCart,
    isSuccess,
    increment,
    decrement,
    setQuantity,
    addToCart,
  } = useAddToCart(1);

  // 监听添加成功
  if (isSuccess && !showSuccess) {
    setShowSuccess(true);
  }

  // 处理加入购物车
  const handleAddToCart = useCallback(async () => {
    if (!product || !selectedSku) return;

    try {
      await addToCart({
        spuId: product.id,
        skuId: selectedSku.id,
        merchantId: product.merchantId || "default",
        merchantName: product.merchantName || "官方自营",
        spuName: product.name,
        skuName: Object.values(selectedAttrs).join(" / "),
        price: selectedSku.price,
        skuThumbnailUrl: selectedSku.img || product.skus[0]?.img || "",
      });
    } catch (err) {
      console.error("添加购物车失败:", err);
    }
  }, [product, selectedSku, selectedAttrs, addToCart]);

  // 3. 骨架屏占位图 (提升用户体验)
  if (isLoading) return <ProductSkeleton />;

  // 4. 错误处理
  if (isError) return <Typography color="error">加载失败: {error.message}</Typography>;

  if (!product || !product.skus) return null;

  // 提取所有唯一的属性键
  const attributeKeys = new Set<string>();
  product.skus.forEach((sku) => {
    if (sku.attrs) {
      Object.keys(sku.attrs).forEach((key) => attributeKeys.add(key));
    }
  });

  // 为每个属性键提取唯一的值
  const attributes = Array.from(attributeKeys).reduce(
    (acc, key) => {
      const values = new Set<string>();
      product.skus?.forEach((sku) => {
        if (sku.attrs?.[key]) {
          // 确保值是字符串类型
          const value = String(sku.attrs[key]);
          values.add(value);
        }
      });
      acc[key] = Array.from(values);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  // 根据选中的属性找到匹配的SKU
  const findMatchingSku = () => {
    return product.skus?.find((sku) => {
      if (!sku.attrs) return false;
      return Object.entries(selectedAttrs).every(([key, value]) => {
        const skuValue = sku.attrs?.[key];
        return skuValue !== undefined && String(skuValue) === value;
      });
    });
  };

  // 获取当前选中的SKU
  const selectedSku = findMatchingSku();
  // 获取当前价格
  const currentPrice = selectedSku?.price || product.skus[0]?.price || 0;
  // 获取当前图片
  const currentImage = selectedSku?.img || product.skus[0]?.img || "";

  // 处理属性选择
  const handleAttributeSelect = (key: string, value: string) => {
    setSelectedAttrs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <Box
      sx={{
        py: 6,
        minHeight: "100vh",
        bgcolor: tokens.colors.background.primary,
      }}
    >
      <Container maxWidth="lg">
        {/* 面包屑导航 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            首页 &gt; 商品详情
          </Typography>
        </Box>

        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, color: tokens.colors.text.primary }}>
          {product.name}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 5,
              alignItems: "flex-start",
            }}
          >
            {/* 左侧：图片展示区 */}
            <Box sx={{ flex: "1 1 50%", minWidth: 0 }}>
              <ImageCard elevation={0}>
                <CardMedia
                  component="img"
                  image={currentImage}
                  alt={product.name}
                  sx={{
                    height: 500,
                    objectFit: "contain",
                    bgcolor: tokens.colors.background.card,
                    transition: tokens.transitions.normal,
                    "&:hover": {
                      transform: "scale(1.02)",
                    },
                  }}
                />
              </ImageCard>
            </Box>

            {/* 右侧：购买决策区 */}
            <Box sx={{ flex: "1 1 50%", minWidth: 0 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  borderRadius: tokens.radius.xl,
                  border: `1px solid ${tokens.colors.border.default}`,
                }}
              >
                {/* 价格区域 */}
                <Box sx={{ mb: 3 }}>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 700,
                      color: tokens.colors.accent.red,
                    }}
                  >
                    ¥{currentPrice.toLocaleString()}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 1.5, mb: 3 }}>
                  <Chip
                    size="small"
                    label={`库存 ${selectedSku?.stock || 0}`}
                    sx={{
                      bgcolor: selectedSku?.stock ? tokens.colors.background.primary : "rgba(239, 68, 68, 0.1)",
                      color: selectedSku?.stock ? tokens.colors.text.secondary : tokens.colors.accent.red,
                      fontWeight: 500,
                      borderRadius: tokens.radius.md,
                    }}
                  />
                </Box>

                {/* 属性选择区 */}
                <Divider sx={{ mb: 3, borderColor: tokens.colors.border.default }} />
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: tokens.colors.text.primary }}>
                  选择配置
                </Typography>

                {Object.entries(attributes).map(([key, values]) => (
                  <Box key={key} sx={{ mb: 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>
                      {key}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                      {values.map((value) => (
                        <Chip
                          key={value}
                          label={value}
                          onClick={() => handleAttributeSelect(key, value)}
                          sx={{
                            cursor: "pointer",
                            border: `1px solid ${selectedAttrs[key] === value ? tokens.colors.accent.black : tokens.colors.border.default}`,
                            backgroundColor: selectedAttrs[key] === value ? tokens.colors.text.primary : tokens.colors.background.card,
                            color: selectedAttrs[key] === value ? tokens.colors.text.inverse : tokens.colors.text.primary,
                            borderRadius: tokens.radius.md,
                            py: 2,
                            fontWeight: 500,
                            transition: tokens.transitions.fast,
                            "&:hover": {
                              borderColor: tokens.colors.accent.black,
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}

                <Divider sx={{ my: 3, borderColor: tokens.colors.border.default }} />

                {/* 数量选择 */}
                <Box sx={{ display: "flex", alignItems: "center", gap: tokens.spacing[4], mb: tokens.spacing[4] }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    数量
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      border: `1px solid ${tokens.colors.border.default}`,
                      borderRadius: tokens.radius.md,
                    }}
                  >
                    <Box
                      component="button"
                      onClick={decrement}
                      disabled={quantity <= 1}
                      sx={{
                        width: 36,
                        height: 36,
                        border: "none",
                        bgcolor: "transparent",
                        cursor: quantity <= 1 ? "not-allowed" : "pointer",
                        color: tokens.colors.text.secondary,
                        "&:hover:not(:disabled)": {
                          bgcolor: tokens.colors.background.primary,
                        },
                        "&:disabled": {
                          opacity: 0.4,
                        },
                      }}
                    >
                      -
                    </Box>
                    <Typography
                      sx={{
                        minWidth: 48,
                        textAlign: "center",
                        fontWeight: 500,
                        color: tokens.colors.text.primary,
                      }}
                    >
                      {quantity}
                    </Typography>
                    <Box
                      component="button"
                      onClick={increment}
                      sx={{
                        width: 36,
                        height: 36,
                        border: "none",
                        bgcolor: "transparent",
                        cursor: "pointer",
                        color: tokens.colors.text.secondary,
                        "&:hover": {
                          bgcolor: tokens.colors.background.primary,
                        },
                      }}
                    >
                      +
                    </Box>
                  </Box>
                </Box>

                {/* 操作按钮 */}
                <Box sx={{ mt: 4, display: "flex", gap: 2 }}>
                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<ShoppingCartIcon />}
                    onClick={handleAddToCart}
                    disabled={isAddingToCart}
                    sx={{
                      borderRadius: tokens.radius.lg,
                      py: 1.5,
                      fontWeight: 600,
                      borderWidth: 1,
                      borderColor: tokens.colors.accent.black,
                      color: tokens.colors.accent.black,
                      "&:hover": {
                        borderWidth: 1,
                        borderColor: tokens.colors.accent.black,
                        bgcolor: tokens.colors.background.primary,
                      },
                      "&:disabled": {
                        borderColor: tokens.colors.border.default,
                        color: tokens.colors.text.disabled,
                      },
                    }}
                  >
                    {isAddingToCart ? "添加中..." : "加入购物车"}
                  </Button>
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={<FlashOnIcon />}
                    sx={{
                      borderRadius: tokens.radius.lg,
                      py: 1.5,
                      fontWeight: 600,
                      bgcolor: tokens.colors.accent.black,
                      color: tokens.colors.text.inverse,
                      boxShadow: "none",
                      "&:hover": {
                        bgcolor: tokens.colors.accent.darkGray,
                        boxShadow: "none",
                      },
                    }}
                  >
                    立即购买
                  </Button>
                </Box>
              </Paper>
            </Box>
          </Box>
        </Box>
      </Container>

      {/* 成功提示 */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={2000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          onClose={() => setShowSuccess(false)}
          sx={{
            bgcolor: tokens.colors.accent.green,
            color: tokens.colors.text.inverse,
            borderRadius: tokens.radius.lg,
          }}
        >
          已成功加入购物车
        </Alert>
      </Snackbar>
    </Box>
  );
};

// 骨架屏组件：让等待不再焦虑
const ProductSkeleton = () => (
  <Box sx={{ py: 6, minHeight: "100vh", bgcolor: tokens.colors.background.primary }}>
    <Container maxWidth="lg">
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="text" width="20%" />
      </Box>
      <Skeleton variant="text" width="60%" height={50} sx={{ mb: 4 }} />
      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 5 }}>
        <Box sx={{ flex: "1 1 50%", minWidth: 0 }}>
          <Skeleton variant="rectangular" height={500} sx={{ borderRadius: "16px" }} />
        </Box>
        <Box sx={{ flex: "1 1 50%", minWidth: 0 }}>
          <Paper elevation={0} sx={{ p: 4, borderRadius: "20px", border: `1px solid ${tokens.colors.border.default}` }}>
            <Skeleton variant="text" width="40%" height={60} />
            <Skeleton variant="rectangular" height={32} width={100} sx={{ borderRadius: "8px", my: 2 }} />
            <Skeleton variant="rectangular" height={200} sx={{ borderRadius: "12px", my: 3 }} />
            <Box sx={{ display: "flex", gap: 2 }}>
              <Skeleton variant="rectangular" height={48} sx={{ borderRadius: "12px", flex: 1 }} />
              <Skeleton variant="rectangular" height={48} sx={{ borderRadius: "12px", flex: 1 }} />
            </Box>
          </Paper>
        </Box>
      </Box>
    </Container>
  </Box>
);

export const Route = createFileRoute("/product/$spuCode")({
  component: ProductPage,
});
