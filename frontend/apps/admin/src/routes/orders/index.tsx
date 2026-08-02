/**
 * 订单管理页面
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { useState } from "react";
import { Search, Eye, MessageSquare } from "lucide-react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
});

type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "refunding";

const STATUS_COLORS: Record<OrderStatus, { color: string; bg: string }> = {
  pending: { color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
  paid: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
  shipped: { color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
  completed: { color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
  refunding: { color: tokens.colors.accent.yellow, bg: "rgba(245, 158, 11, 0.1)" },
};

const TABS = ["all", "pending", "paid", "shipped", "completed", "refunding"] as const;

const TIME_RANGES = ["today", "last7d", "last30d", "all"] as const;

const COLUMNS = [
  "orders.table.info",
  "orders.table.merchant",
  "orders.table.customer",
  "orders.table.amount",
  "orders.table.status",
  "orders.table.createTime",
  "orders.table.actions",
] as const;

function OrdersPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");

  const orders = [
    { id: "ORD001", merchant: "优品数码", customer: "张先生", amount: 2999, status: "pending", createTime: "2024-06-12 10:30" },
    { id: "ORD002", merchant: "苹果旗舰店", customer: "李女士", amount: 9999, status: "paid", createTime: "2024-06-12 09:15" },
    { id: "ORD003", merchant: "小米专营店", customer: "王先生", amount: 599, status: "shipped", createTime: "2024-06-12 08:00" },
    { id: "ORD004", merchant: "华为官方", customer: "赵女士", amount: 1299, status: "completed", createTime: "2024-06-11 16:45" },
    { id: "ORD005", merchant: "优品数码", customer: "刘先生", amount: 3799, status: "refunding", createTime: "2024-06-11 14:20" },
  ];

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          {t("orders.title")}
        </Typography>

        {/* 操作栏 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 36 }}
              >
                {TABS.map((value) => (
                  <Tab
                    key={value}
                    label={t(`orders.tabs.${value}`)}
                    sx={{ minHeight: 36, textTransform: "none" }}
                  />
                ))}
              </Tabs>
              <Box sx={{ display: "flex", gap: 2 }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>{t("timeRange.label")}</InputLabel>
                  <Select label={t("timeRange.label")} defaultValue="last7d">
                    {TIME_RANGES.map((value) => (
                      <MenuItem key={value} value={value}>
                        {t(`timeRange.${value}`)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder={t("orders.searchPlaceholder")}
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
                    <TableCell key={key} sx={{ fontWeight: 500 }}>
                      {t(key)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => {
                  const statusColor = STATUS_COLORS[order.status as OrderStatus];
                  return (
                    <TableRow key={order.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                          {order.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {order.merchant}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {order.customer}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.colors.accent.red }}>
                          {formatCurrency(order.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={t(`orders.status.${order.status as OrderStatus}`)}
                          size="small"
                          sx={{ bgcolor: statusColor.bg, color: statusColor.color, fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {order.createTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <IconButton
                            size="small"
                            aria-label={t("orders.action.view")}
                            sx={{ color: "text.secondary" }}
                          >
                            <Eye size={18} />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label={t("orders.action.remark")}
                            sx={{ color: "text.secondary" }}
                          >
                            <MessageSquare size={18} />
                          </IconButton>
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
