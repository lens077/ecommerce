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
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/categories/")({
  component: CategoriesPage,
});

function CategoriesPage() {
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
            类目管理
          </Typography>
          <Button variant="contained" startIcon={<Plus size={18} />}>
            添加类目
          </Button>
        </Box>

        {/* 类目列表 */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500 }}>类目信息</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>商品数</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>状态</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>排序</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>操作</TableCell>
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
                        {category.productCount.toLocaleString()}
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
                        {category.status === "enabled" ? "启用" : "禁用"}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {category.sort}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <IconButton size="small" sx={{ color: "text.secondary" }}>
                          <Edit2 size={18} />
                        </IconButton>
                        <IconButton size="small" sx={{ color: "text.secondary" }}>
                          <ChevronRight size={18} />
                        </IconButton>
                        <IconButton size="small" sx={{ color: tokens.colors.accent.red }}>
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
