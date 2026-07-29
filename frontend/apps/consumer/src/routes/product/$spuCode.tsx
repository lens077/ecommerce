import { createFileRoute } from "@tanstack/react-router";

import {
    Box,
    Container,
    Typography,
    Card,
    CardMedia,
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
import { useState, useCallback, useMemo } from "react";
import { useAddToCart } from "@/hooks/useCart";
import { tokens } from "@/styles/tokens";
import type { Money } from "@/gen/third_party/google/type/money_pb.ts";

const formatMoney = (money?: Money): number => {
    if (!money) return 0;
    return Number(money.units) + money.nanos / 1_000_000_000;
};

// 样式组件定义在外面，避免每次渲染重新创建
const ImageCard = styled(Card)(() => ({
    borderRadius: "16px",
    overflow: "hidden",
    border: `1px solid ${tokens.colors.border.default}`,
}));

const ProductPage = () => {
    const {spuCode} = Route.useParams();

    console.log("spuCode", spuCode);
    const {data, isLoading, isError, error} = useProductDetail(spuCode);
    const product: ProductSpuDetail | undefined = data?.productDetail;

    const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
    const [showSuccess, setShowSuccess] = useState(false);

    const {
        quantity,
        isLoading: isAddingToCart,
        isSuccess,
        error: cartError,
        increment,
        decrement,
        addToCart,
        clearError,
    } = useAddToCart(1);

    const {attributes, availableValues, selectedSku, currentPrice, currentImage} = useMemo(() => {
        if (!product || !product.skus) {
            return {
                attributes: {} as Record<string, string[]>,
                availableValues: {} as Record<string, Set<string>>,
                selectedSku: undefined,
                currentPrice: 0,
                currentImage: "",
            };
        }

        // 提取所有唯一的属性键
        const attributeKeys = new Set<string>();
        product.skus.forEach((sku) => {
            if (sku.attributes) {
                Object.keys(sku.attributes).forEach((key) => attributeKeys.add(key));
            }
        });

        // 为每个属性键提取唯一的值
        const attrs = Array.from(attributeKeys).reduce(
            (acc, key) => {
                const values = new Set<string>();
                product.skus?.forEach((sku) => {
                    if (sku.attributes?.[key]) {
                        const value = String(sku.attributes[key]);
                        values.add(value);
                    }
                });
                acc[key] = Array.from(values);
                return acc;
            },
            {} as Record<string, string[]>,
        );

        // 计算每个属性值的可用性：基于已选的其他属性过滤SKU
        // 对于某个属性 key 的某个 value，检查是否存在一个 SKU 同时满足：
        // 1. 该 SKU 的 attributes[key] === value
        // 2. 该 SKU 匹配所有其他已选属性（排除当前 key）
        const availValues: Record<string, Set<string>> = {};
        Array.from(attributeKeys).forEach((key) => {
            const available = new Set<string>();
            product.skus.forEach((sku) => {
                if (!sku.attributes || sku.attributes[key] === undefined) return;
                const val = String(sku.attributes[key]);
                // 检查该 SKU 是否匹配所有其他已选属性
                const matchesOtherSelections = Object.entries(selectedAttrs).every(
                    ([otherKey, otherValue]) => {
                        if (otherKey === key) return true; // 排除当前 key
                        const skuValue = sku.attributes?.[otherKey];
                        return skuValue === undefined || String(skuValue) === otherValue;
                    },
                );
                if (matchesOtherSelections) {
                    available.add(val);
                }
            });
            availValues[key] = available;
        });

        // 根据选中的属性找到匹配的SKU（只有所有属性都已选才匹配）
        const allAttrsSelected =
            Object.keys(selectedAttrs).length > 0 &&
            Array.from(attributeKeys).every((k) => selectedAttrs[k] !== undefined);

        const foundSku = allAttrsSelected
            ? product.skus?.find((sku) => {
                if (!sku.attributes) return false;
                return Object.entries(selectedAttrs).every(([key, value]) => {
                    const skuValue = sku.attributes?.[key];
                    return skuValue !== undefined && String(skuValue) === value;
                });
            })
            : undefined;

        // 只有找到匹配的 SKU 时才显示价格，否则显示 0（避免回退到第一个 SKU 的价格）
        const price = foundSku ? formatMoney(foundSku.price) : 0;
        const image = foundSku?.thumbnailUrl || product.skus[0]?.thumbnailUrl || "";

        return {
            attributes: attrs,
            availableValues: availValues,
            selectedSku: foundSku,
            currentPrice: price,
            currentImage: image,
        };
    }, [product, selectedAttrs]);

    const handleAddToCart = useCallback(async () => {
        if (!product || !selectedSku) return;

        try {
            await addToCart({
                spuId: String(product.spuId),
                skuId: String(selectedSku.skuId),
                merchantId: selectedSku.merchantId,
                shopName: selectedSku.shopName,
                spuName: product.spuName,
                skuName: selectedSku.skuName || Object.values(selectedAttrs).join(" / "),
                price: formatMoney(selectedSku.price),
                costPrice: formatMoney(selectedSku.costPrice),
                skuThumbnailUrl: selectedSku.thumbnailUrl || product.skus?.[0]?.thumbnailUrl || "",
                selected: true,
            });
        } catch (err) {
            console.error("添加购物车失败:", err);
        }
    }, [product, selectedAttrs, addToCart, selectedSku]);

    if (isSuccess && !showSuccess) {
        setShowSuccess(true);
    }

    if (isLoading) return <ProductSkeleton/>;

    if (isError) return <Typography color="error">加载失败: {error.message}</Typography>;

    if (!product || !product.skus) return null;

    // 处理属性选择：再次选中时取消勾选
    const handleAttributeSelect = (key: string, value: string) => {
        setSelectedAttrs((prev) => {
            if (prev[key] === value) {
                const next = {...prev};
                delete next[key];
                return next;
            }
            return {...prev, [key]: value};
        });
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
                <Box sx={{mb: 3}}>
                    <Typography variant="body2" color="text.secondary">
                        首页 &gt; 商品详情
                    </Typography>
                </Box>

                <Typography variant="h4" component="h1" gutterBottom
                            sx={{fontWeight: 700, color: tokens.colors.text.primary}}>
                    {product.spuName}
                </Typography>

                <Box sx={{display: "flex", flexDirection: "column", gap: 5}}>
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: {xs: "column", md: "row"},
                            gap: 5,
                            alignItems: "flex-start",
                        }}
                    >
                        {/* 左侧：图片展示区 */}
                        <Box sx={{flex: "1 1 50%", minWidth: 0}}>
                            <ImageCard elevation={0}>
                                <CardMedia
                                    component="img"
                                    image={currentImage}
                                    alt={product.spuName}
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
                        <Box sx={{flex: "1 1 50%", minWidth: 0}}>
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 4,
                                    borderRadius: tokens.radius.xl,
                                    border: `1px solid ${tokens.colors.border.default}`,
                                }}
                            >
                                {/* 价格区域 */}
                                <Box sx={{mb: 3}}>
                                    {currentPrice > 0 ? (
                                        <Typography
                                            variant="h3"
                                            sx={{
                                                fontWeight: 700,
                                                color: tokens.colors.accent.red,
                                            }}
                                        >
                                            ¥{currentPrice.toLocaleString()}
                                        </Typography>
                                    ) : (
                                        <Typography
                                            variant="h5"
                                            sx={{
                                                fontWeight: 500,
                                                color: tokens.colors.text.secondary,
                                            }}
                                        >
                                            请选择规格
                                        </Typography>
                                    )}
                                </Box>

                                <Box sx={{display: "flex", gap: 1.5, mb: 3}}>
                                    <Chip
                                        size="small"
                                        label={`库存 ${Number(selectedSku?.stockLocked) || 0}`}
                                        sx={{
                                            bgcolor: selectedSku?.stockLocked ? tokens.colors.background.primary : "rgba(239, 68, 68, 0.1)",
                                            color: selectedSku?.stockLocked ? tokens.colors.text.secondary : tokens.colors.accent.red,
                                            fontWeight: 500,
                                            borderRadius: tokens.radius.md,
                                        }}
                                    />
                                </Box>

                                {/* 属性选择区 */}
                                <Divider sx={{mb: 3, borderColor: tokens.colors.border.default}}/>
                                <Typography variant="h6"
                                            sx={{mb: 2, fontWeight: 600, color: tokens.colors.text.primary}}>
                                    选择配置
                                </Typography>

                                {Object.entries(attributes).map(([key, values]) => (
                                    <Box key={key} sx={{mb: 3}}>
                                        <Typography variant="body2" color="text.secondary"
                                                    sx={{mb: 1.5, fontWeight: 500}}>
                                            {key}
                                        </Typography>
                                        <Box sx={{display: "flex", gap: 1.5, flexWrap: "wrap"}}>
                                            {values.map((value) => {
                                                const isAvailable = availableValues[key]?.has(value) ?? true;
                                                const isSelected = selectedAttrs[key] === value;
                                                return (
                                                    <Chip
                                                        key={value}
                                                        label={value}
                                                        disabled={!isAvailable}
                                                        onClick={() => isAvailable && handleAttributeSelect(key, value)}
                                                        sx={{
                                                            cursor: isAvailable ? "pointer" : "not-allowed",
                                                            border: `1px solid ${isSelected ? tokens.colors.accent.black : tokens.colors.border.default}`,
                                                            backgroundColor: isSelected ? tokens.colors.text.primary : tokens.colors.background.card,
                                                            color: isSelected ? tokens.colors.text.inverse : tokens.colors.text.primary,
                                                            borderRadius: tokens.radius.md,
                                                            py: 2,
                                                            fontWeight: 500,
                                                            transition: tokens.transitions.fast,
                                                            "&:hover": {
                                                                borderColor: isAvailable ? tokens.colors.accent.black : tokens.colors.border.default,
                                                            },
                                                            "&.Mui-disabled": {
                                                                opacity: 0.35,
                                                                backgroundColor: tokens.colors.background.card,
                                                                color: tokens.colors.text.secondary,
                                                                borderColor: tokens.colors.border.default,
                                                                cursor: "not-allowed",
                                                            },
                                                        }}
                                                    />
                                                );
                                            })}
                                        </Box>
                                    </Box>
                                ))}

                                <Divider sx={{my: 3, borderColor: tokens.colors.border.default}}/>

                                {/* 数量选择 */}
                                <Box sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: tokens.spacing[4],
                                    mb: tokens.spacing[4]
                                }}>
                                    <Typography variant="body2" color="text.secondary" sx={{fontWeight: 500}}>
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
                                <Box sx={{mt: 4, display: "flex", gap: 2}}>
                                    <Button
                                        variant="outlined"
                                        size="large"
                                        fullWidth
                                        startIcon={<ShoppingCartIcon/>}
                                        onClick={handleAddToCart}
                                        disabled={isAddingToCart || !selectedSku}
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
                                        {isAddingToCart ? "添加中..." : selectedSku ? "加入购物车" : "请选择规格"}
                                    </Button>
                                    <Button
                                        variant="contained"
                                        size="large"
                                        fullWidth
                                        startIcon={<FlashOnIcon/>}
                                        disabled={!selectedSku}
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
                                            "&:disabled": {
                                                bgcolor: tokens.colors.border.default,
                                                color: tokens.colors.text.disabled,
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
                anchorOrigin={{vertical: "bottom", horizontal: "center"}}
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

            {/* 错误提示 */}
            <Snackbar
                open={!!cartError}
                autoHideDuration={3000}
                onClose={clearError}
                anchorOrigin={{vertical: "bottom", horizontal: "center"}}
            >
                <Alert
                    severity="error"
                    onClose={clearError}
                    sx={{
                        bgcolor: tokens.colors.accent.red,
                        color: tokens.colors.text.inverse,
                        borderRadius: tokens.radius.lg,
                    }}
                >
                    {cartError}
                </Alert>
            </Snackbar>
        </Box>
    );
};

// 骨架屏组件：让等待不再焦虑
const ProductSkeleton = () => (
    <Box sx={{py: 6, minHeight: "100vh", bgcolor: tokens.colors.background.primary}}>
        <Container maxWidth="lg">
            <Box sx={{mb: 3}}>
                <Skeleton variant="text" width="20%"/>
            </Box>
            <Skeleton variant="text" width="60%" height={50} sx={{mb: 4}}/>
            <Box sx={{display: "flex", flexDirection: {xs: "column", md: "row"}, gap: 5}}>
                <Box sx={{flex: "1 1 50%", minWidth: 0}}>
                    <Skeleton variant="rectangular" height={500} sx={{borderRadius: "16px"}}/>
                </Box>
                <Box sx={{flex: "1 1 50%", minWidth: 0}}>
                    <Paper elevation={0}
                           sx={{p: 4, borderRadius: "20px", border: `1px solid ${tokens.colors.border.default}`}}>
                        <Skeleton variant="text" width="40%" height={60}/>
                        <Skeleton variant="rectangular" height={32} width={100} sx={{borderRadius: "8px", my: 2}}/>
                        <Skeleton variant="rectangular" height={200} sx={{borderRadius: "12px", my: 3}}/>
                        <Box sx={{display: "flex", gap: 2}}>
                            <Skeleton variant="rectangular" height={48} sx={{borderRadius: "12px", flex: 1}}/>
                            <Skeleton variant="rectangular" height={48} sx={{borderRadius: "12px", flex: 1}}/>
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
