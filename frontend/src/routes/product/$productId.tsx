import { createFileRoute, useParams } from '@tanstack/react-router'
import * as React from 'react'
import {
    Box,
    Container,
    Typography,
    Grid,
    Card,
    CardContent,
    CardMedia,
    List,
    ListItem,
    ListItemText,
    Divider,
    Button,
    Paper,
    Chip
} from '@mui/material'
import { styled } from '@mui/material/styles'

const ProductPage = () => {
    const params = useParams()
    const _productId = params.productId // 使用下划线前缀表示未使用但保留的变量
    
    // 模拟商品数据，实际应该从API获取
    const product = {
        "id": "1",
        "name": "苹果 iPhone 15 Pro Max 256GB 原色钛金属",
        "nameSuggest": "name",
        "description": "苹果最新款旗舰手机，搭载A17 Pro芯片，钛金属机身，支持5G网络",
        "price": 8999,
        "status": "active",
        "merchantId": "550e8400-e29b-41d4-a716-446655440000",
        "categoryId": 1,
        "categoryName": "手机数码",
        "images": [
            {
                "url": "https://example.com/images/iphone15-cover.jpg",
                "type": "cover",
                "sortOrder": 1,
                "altText": "iPhone 15 Pro Max 正面图"
            },
            {
                "url": "https://example.com/images/iphone15-detail1.jpg",
                "type": "detail",
                "sortOrder": 2,
                "altText": "iPhone 15 Pro Max 背面图"
            },
            {
                "url": "https://example.com/images/iphone15-detail2.jpg",
                "type": "detail",
                "sortOrder": 3,
                "altText": "iPhone 15 Pro Max 侧面图"
            }
        ],
        "coverImage": "https://example.com/images/iphone15-cover.jpg",
        "attributes": {
            "存储容量": "256GB",
            "屏幕尺寸": "6.7英寸",
            "网络": "5G",
            "颜色": "原色钛金属"
        },
        "salesCount": 150,
        "ratingScore": 4.8,
        "createdAt": "2025-11-06T22:09:58.980134Z",
        "updatedAt": "2025-11-06T22:09:58.980134Z"
    }

    const ImageContainer = styled(Box)({
        position: 'relative',
        '& img': {
            width: '100%',
            height: 'auto',
            maxHeight: 500,
            objectFit: 'contain'
        }
    })

    const InfoCard = styled(Card)({
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
    })

    return (
        <Box sx={{ py: 6, backgroundColor: '#f5f5f5' }}>
            <Container maxWidth="lg">
                <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    {product.name}
                </Typography>
                
                <Grid container spacing={4}>
                    {/* 左侧图片区域 */}
                    <Grid item xs={12} md={6}>
                        <Card sx={{ borderRadius: '12px', overflow: 'hidden' }}>
                            <ImageContainer>
                                <CardMedia
                                    component="img"
                                    image={product.images[0].url}
                                    alt={product.images[0].altText}
                                    sx={{ height: 500, objectFit: 'contain' }}
                                />
                            </ImageContainer>
                            <Box sx={{ display: 'flex', gap: 1, p: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                                {product.images.map((image, _index) => (
                                    <Box
                                        key={image.url} // 使用图片URL作为key
                                        sx={{
                                            width: 80,
                                            height: 80,
                                            border: '2px solid transparent',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            '&:hover': {
                                                borderColor: 'primary.main'
                                            }
                                        }}
                                    >
                                        <img
                                            src={image.url}
                                            alt={image.altText}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    </Box>
                                ))}
                            </Box>
                        </Card>
                    </Grid>

                    {/* 右侧商品信息 */}
                    <Grid item xs={12} md={6}>
                        <InfoCard>
                            <CardContent sx={{ p: 4 }}>
                                <Box sx={{ mb: 3 }}>
                                    <Chip label={product.categoryName} color="primary" size="small" />
                                </Box>
                                
                                <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    ¥{product.price}
                                </Typography>
                                
                                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                                    <Chip 
                                        label={`评分: ${product.ratingScore}`} 
                                        sx={{ backgroundColor: '#4caf50', color: 'white' }}
                                    />
                                    <Chip 
                                        label={`销量: ${product.salesCount}`} 
                                        sx={{ backgroundColor: '#2196f3', color: 'white' }}
                                    />
                                </Box>
                                
                                <Divider sx={{ my: 3 }} />
                                
                                <Typography variant="h6" gutterBottom>
                                    商品属性
                                </Typography>
                                <List>
                                    {Object.entries(product.attributes).map(([key, value], index) => (
                                        <React.Fragment key={key}>
                                            <ListItem>
                                                <ListItemText primary={key} secondary={value} />
                                            </ListItem>
                                            {index < Object.entries(product.attributes).length - 1 && <Divider />}
                                        </React.Fragment>
                                    ))}
                                </List>
                                
                                <Divider sx={{ my: 3 }} />
                                
                                <Typography variant="h6" gutterBottom>
                                    商品描述
                                </Typography>
                                <Typography variant="body1" color="text.secondary">
                                    {product.description}
                                </Typography>
                                
                                <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
                                    <Button variant="contained" color="primary" size="large" fullWidth>
                                        加入购物车
                                    </Button>
                                    <Button variant="outlined" color="primary" size="large" fullWidth>
                                        立即购买
                                    </Button>
                                </Box>
                            </CardContent>
                        </InfoCard>
                    </Grid>
                </Grid>
                
                {/* 商品详情区域 */}
                <Box sx={{ mt: 6 }}>
                    <Paper elevation={0} sx={{ p: 4, borderRadius: '12px' }}>
                        <Typography variant="h5" component="h2" gutterBottom>
                            商品详情
                        </Typography>
                        <Divider sx={{ mb: 4 }} />
                        
                        <Typography variant="body1" paragraph>
                            {product.description}
                        </Typography>
                        
                        <Typography variant="body1" paragraph>
                            这款{product.name}是苹果公司最新推出的旗舰手机，采用钛金属机身设计，更加轻薄耐用。搭载A17 Pro芯片，性能强劲，支持AI功能。6.7英寸超视网膜XDR显示屏，色彩鲜艳，亮度高。
                        </Typography>
                        
                        <Typography variant="body1" paragraph>
                            相机系统升级为4800万像素主摄，支持4K 60fps视频录制，夜间模式效果出色。电池续航能力提升，支持快速充电和无线充电。
                        </Typography>
                    </Paper>
                </Box>
            </Container>
        </Box>
    )
}

export const Route = createFileRoute('/product/$productId')({
    component: ProductPage,
})
