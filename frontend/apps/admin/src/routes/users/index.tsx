/**
 * 用户管理页面
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
  TextField,
  InputAdornment,
  Avatar,
} from "@mui/material";
import { useState } from "react";
import { Search } from "lucide-react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/users/")({
  component: UsersPage,
});

const COLUMNS = [
  "users.table.info",
  "users.table.phone",
  "users.table.orders",
  "users.table.amount",
  "users.table.level",
  "users.table.joinTime",
] as const;

function UsersPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useFormat();
  const [search, setSearch] = useState("");

  const users = [
    {
      id: "u001",
      nickname: "张三",
      phone: "138****1234",
      orders: 12,
      amount: 15800,
      status: "normal",
      joinTime: "2024-01-15",
    },
    {
      id: "u002",
      nickname: "李四",
      phone: "139****5678",
      orders: 8,
      amount: 8999,
      status: "normal",
      joinTime: "2024-02-20",
    },
    {
      id: "u003",
      nickname: "王五",
      phone: "137****9012",
      orders: 25,
      amount: 45600,
      status: "vip",
      joinTime: "2024-03-10",
    },
    {
      id: "u004",
      nickname: "赵六",
      phone: "136****3456",
      orders: 3,
      amount: 1200,
      status: "normal",
      joinTime: "2024-05-01",
    },
    {
      id: "u005",
      nickname: "钱七",
      phone: "135****7890",
      orders: 18,
      amount: 28900,
      status: "vip",
      joinTime: "2024-04-15",
    },
  ];

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          {t("users.title")}
        </Typography>

        {/* 操作栏 */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: 2 }}>
            <TextField
              size="small"
              placeholder={t("users.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 300 }}
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
          </CardContent>
        </Card>

        {/* 用户列表 */}
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
                {users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Avatar sx={{ bgcolor: tokens.colors.text.primary }}>
                          {user.nickname[0]}
                        </Avatar>
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 500, color: "text.primary" }}
                          >
                            {user.nickname}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            ID: {user.id}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {user.phone}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.primary" }}>
                        {t("users.orderCount", { count: user.orders })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: tokens.colors.accent.red }}
                      >
                        {formatCurrency(user.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t(user.status === "vip" ? "users.level.vip" : "users.level.normal")}
                        size="small"
                        sx={{
                          bgcolor:
                            user.status === "vip"
                              ? "rgba(245, 158, 11, 0.1)"
                              : tokens.colors.background.primary,
                          color:
                            user.status === "vip"
                              ? tokens.colors.accent.yellow
                              : tokens.colors.text.secondary,
                          fontWeight: 500,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {user.joinTime}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>
    </AdminLayout>
  );
}
