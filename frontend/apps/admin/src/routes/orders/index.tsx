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
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
});

function OrdersPage() {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");

  const orders = [
    { id: "ORD001", merchant: "优品数码", customer: "张先生", amount: 2999, status: "pending", createTime: "2024-06-12 10:30" },
    { id: "ORD002", merchant: "苹果旗舰店", customer: "李女士", amount: 9999, status: "paid", createTime: "2024-06-12 09:15" },
    { id: "ORD003", merchant: "小米专营店", customer: "王先生", amount: 599, status: "shipped", createTime: "2024-06-12 08:00" },
    { id: "ORD004", merchant: "华为官方", customer: "赵女士", amount: 1299, status: "completed", createTime: "2024-06-11 16:45" },
    { id: "ORD005", merchant: "优品数码", customer: "刘先生", amount: 3799, status: "refunding", createTime: "2024-06-11 14:20" },
  ];

  const tabs = [
    { label: "全部", value: "all" },
    { label: "待处理", value: "pending" },
    { label: "已支付", value: "paid" },
    { label: "已发货", value: "shipped" },
    { label: "已完成", value: "completed" },
    { label: "退款中", value: "refunding" },
  ];

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: "待处理", color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
      paid: { label: "已支付", color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
      shipped: { label: "已发货", color: tokens.colors.accent.blue, bg: "rgba(59, 130, 246, 0.1)" },
      completed: { label: "已完成", color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
      refunding: { label: "退款中", color: tokens.colors.accent.yellow, bg: "rgba(245, 158, 11, 0.1)" },
    };
    return configs[status] || configs.pending;
  };

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          订单管理
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
                {tabs.map((t) => (
                  <Tab
                    key={t.value}
                    label={t.label}
                    sx={{ minHeight: 36, textTransform: "none" }}
                  />
                ))}
              </Tabs>
              <Box sx={{ display: "flex", gap: 2 }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>时间范围</InputLabel>
                  <Select label="时间范围" defaultValue="7d">
                    <MenuItem value="today">今天</MenuItem>
                    <MenuItem value="7d">近7天</MenuItem>
                    <MenuItem value="30d">近30天</MenuItem>
                    <MenuItem value="all">全部</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  placeholder="搜索订单号/商家/客户..."
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
            </Box>
          </CardContent>
        </Card>

        {/* 订单列表 */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500 }}>订单信息</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>商家</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>客户</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>订单金额</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>状态</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>下单时间</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => {
                  const statusConfig = getStatusConfig(order.status);
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
                          ¥{order.amount.toLocaleString()}
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
                          {order.createTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <IconButton size="small" sx={{ color: "text.secondary" }}>
                            <Eye size={18} />
                          </IconButton>
                          <IconButton size="small" sx={{ color: "text.secondary" }}>
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
