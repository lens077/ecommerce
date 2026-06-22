/**
 * 商家端商品管理页面
 * 
 * 修复样式问题
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import { Search, Plus, Edit, Trash2, Eye, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { tokens } from "@/styles/theme";

export const Route = createFileRoute("/products/")({
  component: ProductsPage,
});

function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const products = [
    { id: "SKU001", name: "iPhone 15 Pro Max 256GB", category: "手机", price: 9999, stock: 50, sales: 128, status: "online" },
    { id: "SKU002", name: "AirPods Pro 2 无线耳机", category: "配件", price: 1899, stock: 200, sales: 456, status: "online" },
    { id: "SKU003", name: "MacBook Air M2 13寸", category: "电脑", price: 7999, stock: 30, sales: 89, status: "online" },
    { id: "SKU004", name: "iPad Pro 12.9寸", category: "平板", price: 8499, stock: 0, sales: 67, status: "offline" },
  ];

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; color: string; bg: string }> = {
      online: { label: "已上架", color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
      offline: { label: "已下架", color: tokens.colors.text.secondary, bg: tokens.colors.background.primary },
    };
    return configs[status] || configs.online;
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
      {/* 页面标题 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary" }}>
          商品管理
        </Typography>
        <Button variant="contained" startIcon={<Plus size={16} />} sx={{ bgcolor: "primary.main" }}>
          添加商品
        </Button>
      </Box>

      {/* 统计卡片 */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
        {[
          { label: "全部商品", value: products.length },
          { label: "上架中", value: products.filter((p) => p.status === "online").length },
          { label: "已下架", value: products.filter((p) => p.status === "offline").length },
          { label: "库存不足", value: products.filter((p) => p.stock > 0 && p.stock < 10).length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>{stat.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary" }}>{stat.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* 筛选栏 */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <TextField
            size="small"
            placeholder="搜索商品名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><Search size={16} color="#6b7280" /></InputAdornment>,
              },
            }}
            sx={{ width: 280 }}
          />
        </CardContent>
      </Card>

      {/* 商品列表 */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>商品信息</TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>分类</TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>价格</TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>库存</TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>销量</TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>状态</TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProducts.map((product) => {
                const statusConfig = getStatusConfig(product.status);
                return (
                  <TableRow key={product.id} sx={{ "&:last-child td": { borderBottom: 0 }, "&:hover": { bgcolor: "action.hover" } }}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Box sx={{ width: 56, height: 56, borderRadius: 1, bgcolor: "background.default", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ImageIcon size={24} color="#d1d5db" />
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>{product.name}</Typography>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>SKU: {product.id}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>{product.category}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.colors.accent.red }}>
                        ¥{product.price.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: product.stock === 0 ? tokens.colors.accent.red : "text.primary" }}>
                        {product.stock === 0 ? "缺货" : product.stock}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>{product.sales}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={statusConfig.label} size="small" sx={{ bgcolor: statusConfig.bg, color: statusConfig.color, fontWeight: 500, borderRadius: 5 }} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small"><Eye size={16} /></IconButton>
                        <IconButton size="small"><Edit size={16} /></IconButton>
                        <IconButton size="small" sx={{ "&:hover": { color: tokens.colors.accent.red } }}><Trash2 size={16} /></IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
