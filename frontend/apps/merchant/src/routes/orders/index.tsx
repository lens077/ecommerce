/**
 * 商家端订单管理页面
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
  Select,
  MenuItem,
  FormControl,
  TextField,
  InputAdornment,
} from "@mui/material";
import { Search, Eye, Truck, Download, Filter } from "lucide-react";
import { useState } from "react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { tokens } from "@/styles/theme";

/** 表头。key 显式列出，不用下标拼。 */
const COLUMNS = [
  "orders.table.orderNo",
  "orders.table.customer",
  "orders.table.items",
  "orders.table.amount",
  "orders.table.status",
  "orders.table.createTime",
  "orders.table.actions",
] as const;

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
});

function OrdersPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const [statusFilter, setStatusFilter] = useState("all");

  const orders = [
    {
      id: "ORD20240612001",
      customer: "张先生",
      phone: "138****1234",
      items: "iPhone 15 Pro Max",
      quantity: 1,
      amount: 9999,
      status: "pending",
      createTime: "2024-06-12 10:30",
    },
    {
      id: "ORD20240612002",
      customer: "李女士",
      phone: "139****5678",
      items: "AirPods Pro 2",
      quantity: 2,
      amount: 3798,
      status: "pending",
      createTime: "2024-06-12 09:15",
    },
    {
      id: "ORD20240611001",
      customer: "王先生",
      phone: "136****9012",
      items: "MacBook Air M2",
      quantity: 1,
      amount: 9999,
      status: "shipped",
      createTime: "2024-06-11 16:45",
    },
    {
      id: "ORD20240611002",
      customer: "赵女士",
      phone: "137****3456",
      items: "iPad Pro 12.9",
      quantity: 1,
      amount: 8499,
      status: "completed",
      createTime: "2024-06-11 14:20",
    },
  ];

  // 状态文案复用 common ns 的订单状态表；这里只留颜色和 key 的映射
  const getStatusConfig = (status: string) => {
    const configs: Record<string, { labelKey: string; color: string; bg: string }> = {
      pending: {
        labelKey: "common:orderStatus.pending_shipment",
        color: tokens.colors.accent.red,
        bg: "rgba(239, 68, 68, 0.1)",
      },
      shipped: {
        labelKey: "common:orderStatus.shipped",
        color: tokens.colors.accent.blue,
        bg: "rgba(59, 130, 246, 0.1)",
      },
      completed: {
        labelKey: "common:orderStatus.completed",
        color: tokens.colors.accent.green,
        bg: "rgba(16, 185, 129, 0.1)",
      },
    };
    return configs[status] || configs.pending;
  };

  const filteredOrders = orders.filter(
    (order) => statusFilter === "all" || order.status === statusFilter,
  );

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
      {/* 页面标题 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: "text.primary" }}>
          {t("orders.title")}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Download size={16} />}
          sx={{ borderColor: "divider", color: "text.secondary" }}
        >
          {t("orders.export")}
        </Button>
      </Box>

      {/* 筛选栏 */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <TextField
              size="small"
              placeholder={t("orders.searchPlaceholder")}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} color="#6b7280" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ width: 280 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                // 无可见 label 的 Select 要给可及名称，否则读屏只念「组合框」
                inputProps={{ "aria-label": t("a11y.statusFilter") }}
                sx={{ borderRadius: 5 }}
              >
                <MenuItem value="all">{t("orders.filterAll")}</MenuItem>
                <MenuItem value="pending">{t("common:orderStatus.pending_shipment")}</MenuItem>
                <MenuItem value="shipped">{t("common:orderStatus.shipped")}</MenuItem>
                <MenuItem value="completed">{t("common:orderStatus.completed")}</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="text"
              startIcon={<Filter size={16} />}
              sx={{ color: "text.secondary" }}
            >
              {t("orders.moreFilters")}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* 订单列表 */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {COLUMNS.map((key) => (
                  <TableCell key={key} sx={{ fontWeight: 500, color: "text.secondary" }}>
                    {t(key)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((order) => {
                const statusConfig = getStatusConfig(order.status);
                return (
                  <TableRow
                    key={order.id}
                    sx={{
                      "&:last-child td": { borderBottom: 0 },
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                        {order.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.primary" }}>
                        {order.customer}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {order.phone}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.primary" }}>
                        {order.items}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        x{order.quantity}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                      >
                        {formatCurrency(order.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t(statusConfig.labelKey)}
                        size="small"
                        sx={{
                          bgcolor: statusConfig.bg,
                          color: statusConfig.color,
                          fontWeight: 500,
                          borderRadius: 5,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {order.createTime}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small" aria-label={t("a11y.view")}>
                          <Eye size={16} />
                        </IconButton>
                        {order.status === "pending" && (
                          <IconButton size="small" color="primary" aria-label={t("a11y.ship")}>
                            <Truck size={16} />
                          </IconButton>
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
  );
}
