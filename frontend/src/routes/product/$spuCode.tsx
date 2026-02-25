import { createFileRoute } from '@tanstack/react-router'

import {
    Box, Container, Typography, Grid, Card, CardMedia,
    List, ListItem, ListItemText, Divider, Button, Paper, Chip, Skeleton
} from '@mui/material'
import { styled } from '@mui/material/styles'
import { useProductDetail } from '@/hooks/useProduct'
import type { ProductSpuDetail } from "@/gen/api/product/v1/product_pb.ts";
import { useState } from "react";

// 样式组件定义在外面，避免每次渲染重新创建
const ImageCard = styled(Card)(() => ({
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid #eee'
}))

const ProductPage = () => {
    const {spuCode} = Route.useParams()

    const {data, isLoading, isError, error} = useProductDetail(spuCode)
    const product: ProductSpuDetail | undefined = data?.productDetail

    const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({})

    // 3. 骨架屏占位图 (提升用户体验)
    if (isLoading) return <ProductSkeleton/>

    // 4. 错误处理
    if (isError) return <Typography color="error">加载失败: {error.message}</Typography>

    if (!product || !product.skus) return null

    // 提取所有唯一的属性键
    const attributeKeys = new Set<string>()
    product.skus.forEach(sku => {
        if (sku.attrs) {
            Object.keys(sku.attrs).forEach(key => attributeKeys.add(key))
        }
    })

    // 为每个属性键提取唯一的值
    const attributes = Array.from(attributeKeys).reduce((acc, key) => {
        const values = new Set<string>()
        product.skus?.forEach(sku => {
            if (sku.attrs?.[key]) {
                values.add(sku.attrs[key])
            }
        })
        acc[key] = Array.from(values)
        return acc
    }, {} as Record<string, string[]>)

    // 根据选中的属性找到匹配的SKU
    const findMatchingSku = () => {
        return product.skus?.find(sku => {
            if (!sku.attrs) return false
            return Object.entries(selectedAttrs).every(([key, value]) =>
                sku.attrs && sku.attrs[key] === value
            )
        })
    }

    // 获取当前选中的SKU
    const selectedSku = findMatchingSku()
    // 获取当前价格
    const currentPrice = selectedSku?.price || product.skus[0]?.price || 0
    // 获取当前图片
    const currentImage = selectedSku?.img || product.skus[0]?.img || ''

    // 处理属性选择
    const handleAttributeSelect = (key: string, value: string) => {
        setSelectedAttrs(prev => ({
            ...prev,
            [key]: value
        }))
    }

    return (
        <Box sx={{py: 6, backgroundColor: '#f9f9f9', minHeight: '100vh'}}>
            <Container maxWidth="lg">
                <Typography variant="h4" component="h1" gutterBottom sx={{fontWeight: 800}}>
                    {product.name}
                </Typography>

                <Grid container spacing={5}>
                    {/* 左侧：图片展示区 */}
                    <Grid item xs={12} md={6}>
                        <ImageCard elevation={0}>
                            <CardMedia
                                component="img"
                                image={currentImage}
                                alt={product.name}
                                sx={{height: 500, objectFit: 'contain', bgcolor: '#fff'}}
                            />
                        </ImageCard>
                    </Grid>

                    {/* 右侧：购买决策区 */}
                    <Grid item xs={12} md={6}>
                        <Paper elevation={0} sx={{p: 4, borderRadius: '16px'}}>
                            <Typography variant="h3" color="primary" sx={{fontWeight: 700, mb: 1}}>
                                ¥{currentPrice.toLocaleString()}
                            </Typography>

                            <Box sx={{display: 'flex', gap: 1, mb: 3}}>
                                <Chip size="small" label={`库存 ${selectedSku?.stock || 0}`}
                                      sx={{bgcolor: '#4caf50', color: '#fff'}}/>
                            </Box>

                            {/* 属性选择区 */}
                            <Divider sx={{mb: 3}}/>
                            <Typography variant="h6" sx={{mb: 2, fontWeight: 600}}>选择配置</Typography>

                            {Object.entries(attributes).map(([key, values]) => (
                                <Box key={key} sx={{mb: 3}}>
                                    <Typography variant="body2" color="text.secondary" sx={{mb: 1}}>
                                        {key}
                                    </Typography>
                                    <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                                        {values.map(value => (
                                            <Chip
                                                key={value}
                                                label={value}
                                                onClick={() => handleAttributeSelect(key, value)}
                                                sx={{
                                                    cursor: 'pointer',
                                                    border: `1px solid ${selectedAttrs[key] === value ? '#1976d2' : '#ddd'}`,
                                                    backgroundColor: selectedAttrs[key] === value ? '#e3f2fd' : 'white',
                                                    '&:hover': {
                                                        borderColor: '#1976d2',
                                                        backgroundColor: '#f1f8fe'
                                                    }
                                                }}
                                            />
                                        ))}
                                    </Box>
                                </Box>
                            ))}

                            <Divider sx={{my: 3}}/>

                            <Typography variant="h6" sx={{mb: 1, fontWeight: 600}}>核心配置</Typography>
                            <List disablePadding>
                                {product.commonSpecs && Object.entries(product.commonSpecs).map(([key, val]) => (
                                    <ListItem key={key} sx={{px: 0, py: 0.5}}>
                                        <ListItemText
                                            primary={<Typography variant="body2"
                                                                 color="text.secondary">{key}</Typography>}
                                            secondary={<Typography variant="body1" fontWeight={500}>{val}</Typography>}
                                        />
                                    </ListItem>
                                ))}
                            </List>

                            <Box sx={{mt: 4, display: 'flex', gap: 2}}>
                                <Button variant="contained" size="large" fullWidth
                                        sx={{borderRadius: '8px', py: 1.5, fontWeight: 'bold'}}>
                                    加入购物车
                                </Button>
                                <Button variant="outlined" size="large" fullWidth
                                        sx={{borderRadius: '8px', fontWeight: 'bold'}}>
                                    立即购买
                                </Button>
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    )
}

// 骨架屏组件：让等待不再焦虑
const ProductSkeleton = () => (
    <Container maxWidth="lg" sx={{py: 6}}>
        <Skeleton variant="text" width="40%" height={60} sx={{mb: 2}}/>
        <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
                <Skeleton variant="rectangular" height={500} sx={{borderRadius: '12px'}}/>
            </Grid>
            <Grid item xs={12} md={6}>
                <Skeleton variant="rectangular" height={400} sx={{borderRadius: '12px'}}/>
            </Grid>
        </Grid>
    </Container>
)

export const Route = createFileRoute('/product/$spuCode')({
    component: ProductPage,
})
