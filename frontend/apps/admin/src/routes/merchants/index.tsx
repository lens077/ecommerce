/**
 * 商家管理页面
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
} from "@mui/material";
import { useState } from "react";
import { Search, Eye, Check, X } from "lucide-react";
import { useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/merchants/")({
  component: MerchantsPage,
});

type MerchantStatus = "active" | "pending" | "suspended";

/** 只放配色。文案走 t(`merchants.status.${status}`)，免得配色表跟着语言复制一份 */
const STATUS_COLORS: Record<MerchantStatus, { color: string; bg: string }> = {
  active: { color: tokens.colors.accent.green, bg: "rgba(16, 185, 129, 0.1)" },
  pending: { color: tokens.colors.accent.yellow, bg: "rgba(245, 158, 11, 0.1)" },
  suspended: { color: tokens.colors.accent.red, bg: "rgba(239, 68, 68, 0.1)" },
};

const TABS = ["all", "active", "pending", "suspended"] as const;

const COLUMNS = [
  "merchants.table.info",
  "merchants.table.category",
  "merchants.table.owner",
  "merchants.table.contact",
  "merchants.table.status",
  "merchants.table.joinTime",
  "merchants.table.actions",
] as const;

function MerchantsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");

  const merchants = [
    {
      id: "m001",
      name: "优品数码旗舰店",
      category: "数码电子",
      owner: "张伟",
      phone: "138****1234",
      status: "active",
      joinTime: "2024-01-15",
    },
    {
      id: "m002",
      name: "苹果官方旗舰店",
      category: "数码电子",
      owner: "李娜",
      phone: "139****5678",
      status: "active",
      joinTime: "2024-02-20",
    },
    {
      id: "m003",
      name: "小米智能生活馆",
      category: "智能家居",
      owner: "王强",
      phone: "137****9012",
      status: "pending",
      joinTime: "2024-06-12",
    },
    {
      id: "m004",
      name: "联想官方商城",
      category: "电脑办公",
      owner: "赵敏",
      phone: "136****3456",
      status: "pending",
      joinTime: "2024-06-11",
    },
    {
      id: "m005",
      name: "华为官方旗舰店",
      category: "数码电子",
      owner: "刘洋",
      phone: "135****7890",
      status: "suspended",
      joinTime: "2024-03-10",
    },
  ];

  const filteredMerchants = merchants.filter((m) => {
    if (tab === 0) return true;
    return m.status === TABS[tab];
  });

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 4 }}>
          {t("merchants.title")}
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
                    label={t(`merchants.tabs.${value}`)}
                    sx={{ minHeight: 36, textTransform: "none" }}
                  />
                ))}
              </Tabs>
              <TextField
                size="small"
                placeholder={t("merchants.searchPlaceholder")}
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

        {/* 商家列表 */}
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
                {filteredMerchants.map((merchant) => {
                  const statusColor = STATUS_COLORS[merchant.status as MerchantStatus];
                  return (
                    <TableRow key={merchant.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                          {merchant.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          ID: {merchant.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {merchant.category}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {merchant.owner}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {merchant.phone}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={t(`merchants.status.${merchant.status as MerchantStatus}`)}
                          size="small"
                          sx={{ bgcolor: statusColor.bg, color: statusColor.color, fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {merchant.joinTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <IconButton
                            size="small"
                            aria-label={t("merchants.action.view")}
                            sx={{ color: "text.secondary" }}
                          >
                            <Eye size={18} />
                          </IconButton>
                          {merchant.status === "pending" && (
                            <>
                              <IconButton
                                size="small"
                                aria-label={t("merchants.action.approve")}
                                sx={{ color: tokens.colors.accent.green }}
                              >
                                <Check size={18} />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label={t("merchants.action.reject")}
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
