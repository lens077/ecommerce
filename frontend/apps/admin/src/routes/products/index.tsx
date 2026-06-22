/**
 * 商品审核页面
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
  Tabs,
  Tab,
  Avatar,
} from "@mui/material";
import { useState } from "react";
import { Search, Eye, Check, X, Image as ImageIcon } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/products/")({
  component: ProductsPage,
});

function ProductsPage() {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");

  const products = [
    {
      id: "p001",
      name: "iPhone 15 Pro Max 256GB",
      merchant: "苹果官方旗舰店",
      category: "手机通讯",
      price: 9999,
      stock: 100,
      status: "pending",
      createTime: "2024-06-12 10:30",
    },
    {
      id: "p002",
      name: "MacBook Air M3 13英寸",
      merchant: "优品数码旗舰店",
      category: "电脑办公",
      price: 8999,
      stock: 50,
      status: "pending",
      createTime: "2024-06-12 09:15",
    },
    {
      id: "p003",
      name: "小米手环 8 Pro",
      merchant: "小米智能生活馆",
      category: "智能穿戴",
      price: 399,
      stock: 200,
      status: "approved",
      createTime: "2024-06-11 16:45",
    },
    {
      id: "p004",
      name: "华为 Mate 60 Pro",
      merchant: "华为官方旗舰店",
      category: "手机通讯",
      price: 6999,
      stock: 80,
      status: "rejected",
      createTime: "2024-06-11 14:20",
    },
    {
      id: "p005",
      name: "AirPods Pro 2",
      merchant: "苹果官方旗舰店",
      category: "数码配件",
      price: 1899,
      stock: 150,
      status: "approved",
      createTime: "2024-06-10 11:00",
    },
  ];

  const tabs = [
    { label: "待审核", value: "pending" },
    { label: "已通过", value: "approved" },
    { label: "已驳回", value: "rejected" },
  ];

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: "待审核", color: tokens.colors.accent.yellow, bg: "rgba(245, 158, 11, 0.1)" },
      approved: { label: "已通过", color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
      rejected: { label: "已驳回", color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
    };
    return configs[status] || configs.pending;
  };

  const filteredProducts = products.filter((p) => {
    if (tab === 0) return p.status === "pending";
    if (tab === 1) return p.status === "approved";
    if (tab === 2) return p.status === "rejected";
    return true;
  });

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          商品审核
        </Typography>

        {/* 操作栏 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{ minHeight: 36 }}
              >
                {tabs.map((t) => (
                  <Tab
                    key={t.value}
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {t.label}
                        {t.value === "pending" && (
                          <Chip
                            label={products.filter((p) => p.status === "pending").length}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.75rem",
                              bgcolor: tokens.colors.accent.yellow,
                              color: "#fff",
                            }}
                          />
                        )}
                      </Box>
                    }
                    sx={{ minHeight: 36, textTransform: "none" }}
                  />
                ))}
              </Tabs>
              <TextField
                size="small"
                placeholder="搜索商品名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ width: 240 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={18} color={tokens.colors.text.secondary} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* 商品列表 */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500 }}>商品信息</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>商家</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>类目</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>价格</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>库存</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>状态</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>提交时间</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProducts.map((product) => {
                  const statusConfig = getStatusConfig(product.status);
                  return (
                    <TableRow key={product.id} hover>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <Avatar
                            variant="rounded"
                            sx={{
                              width: 48,
                              height: 48,
                              bgcolor: tokens.colors.background.primary,
                            }}
                          >
                            <ImageIcon size={20} color={tokens.colors.text.secondary} />
                          </Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                              {product.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              ID: {product.id}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {product.merchant}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {product.category}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.colors.accent.red }}>
                          ¥{product.price.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {product.stock}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={statusConfig.label}
                          size="small"
                          sx={{ bgcolor: statusConfig.bg, color: statusConfig.color, fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {product.createTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <IconButton size="small" sx={{ color: "text.secondary" }}>
                            <Eye size={18} />
                          </IconButton>
                          {product.status === "pending" && (
                            <>
                              <IconButton size="small" sx={{ color: tokens.colors.accent.green }}>
                                <Check size={18} />
                              </IconButton>
                              <IconButton size="small" sx={{ color: tokens.colors.accent.red }}>
                                <X size={18} />
                              </IconButton>
                            </>
                          )}
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
    </AdminLayout>
  );
}
