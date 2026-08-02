/**
 * 类目管理页面
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
  IconButton,
} from "@mui/material";
import { Plus, Edit2, Trash2, ChevronRight } from "lucide-react";
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/categories/")({
  component: CategoriesPage,
});

const COLUMNS = [
  "categories.table.info",
  "categories.table.productCount",
  "categories.table.status",
  "categories.table.sort",
  "categories.table.actions",
] as const;

function CategoriesPage() {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  const categories = [
    { id: "c001", name: "手机通讯", icon: "📱", productCount: 1256, status: "enabled", sort: 1 },
    { id: "c002", name: "电脑办公", icon: "💻", productCount: 892, status: "enabled", sort: 2 },
    { id: "c003", name: "数码配件", icon: "🎧", productCount: 2341, status: "enabled", sort: 3 },
    { id: "c004", name: "智能穿戴", icon: "⌚", productCount: 567, status: "enabled", sort: 4 },
    { id: "c005", name: "智能家居", icon: "🏠", productCount: 423, status: "enabled", sort: 5 },
    { id: "c006", name: "游戏设备", icon: "🎮", productCount: 321, status: "disabled", sort: 6 },
    { id: "c007", name: "摄影摄像", icon: "📷", productCount: 198, status: "enabled", sort: 7 },
  ];

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary" }}>
            {t("categories.title")}
          </Typography>
          <Button variant="contained" startIcon={<Plus size={18} />}>
            {t("categories.add")}
          </Button>
        </Box>

        {/* 类目列表 */}
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
                {categories.map((category) => (
                  <TableRow key={category.id} hover>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Typography variant="h5">{category.icon}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                          {category.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {formatNumber(category.productCount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          bgcolor: category.status === "enabled" ? "rgba(16, 185, 129, 0.1)" : tokens.colors.background.primary,
                          color: category.status === "enabled" ? tokens.colors.accent.green : tokens.colors.text.disabled,
                        }}
                      >
                        {t(
                          category.status === "enabled"
                            ? "categories.status.enabled"
                            : "categories.status.disabled",
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {category.sort}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <IconButton
                          size="small"
                          aria-label={t("categories.action.edit")}
                          sx={{ color: "text.secondary" }}
                        >
                          <Edit2 size={18} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={t("categories.action.children")}
                          sx={{ color: "text.secondary" }}
                        >
                          <ChevronRight size={18} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={t("categories.action.delete")}
                          sx={{ color: tokens.colors.accent.red }}
                        >
                          <Trash2 size={18} />
                        </IconButton>
                      </Box>
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
