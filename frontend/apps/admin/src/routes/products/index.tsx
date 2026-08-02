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
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/products/")({
  component: ProductsPage,
});

type ReviewStatus = "pending" | "approved" | "rejected";

const STATUS_COLORS: Record<ReviewStatus, { color: string; bg: string }> = {
  pending: { color: tokens.colors.accent.yellow, bg: "rgba(245, 158, 11, 0.1)" },
  approved: { color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
  rejected: { color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
};

/** tab 顺序即 status 顺序，筛选直接按下标取，不用再写一串 if */
const TABS: readonly ReviewStatus[] = ["pending", "approved", "rejected"];

const COLUMNS = [
  "products.table.info",
  "products.table.merchant",
  "products.table.category",
  "products.table.price",
  "products.table.stock",
  "products.table.status",
  "products.table.submitTime",
  "products.table.actions",
] as const;

function ProductsPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();
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

  const filteredProducts = products.filter((p) => p.status === TABS[tab]);

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          {t("products.title")}
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
                {TABS.map((value) => (
                  <Tab
                    key={value}
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {t(`products.tabs.${value}`)}
                        {value === "pending" && (
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
                placeholder={t("products.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ width: 240 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={18} color={tokens.colors.text.secondary} />
                      </InputAdornment>
                    ),
                  },
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
                  {COLUMNS.map((key) => (
                    <TableCell key={key} sx={{ fontWeight: 500 }}>
                      {t(key)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProducts.map((product) => {
                  const statusColor = STATUS_COLORS[product.status as ReviewStatus];
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
                          {formatCurrency(product.price)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {formatNumber(product.stock)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={t(`products.status.${product.status as ReviewStatus}`)}
                          size="small"
                          sx={{ bgcolor: statusColor.bg, color: statusColor.color, fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {product.createTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <IconButton
                            size="small"
                            aria-label={t("products.action.view")}
                            sx={{ color: "text.secondary" }}
                          >
                            <Eye size={18} />
                          </IconButton>
                          {product.status === "pending" && (
                            <>
                              <IconButton
                                size="small"
                                aria-label={t("products.action.approve")}
                                sx={{ color: tokens.colors.accent.green }}
                              >
                                <Check size={18} />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label={t("products.action.reject")}
                                sx={{ color: tokens.colors.accent.red }}
                              >
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
