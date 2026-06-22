/**
 * 运营报表页面
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { TrendingUp, TrendingDown, ShoppingBag, Users, DollarSign, Store } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/reports/")({
  component: ReportsPage,
});

function ReportsPage() {
  const stats = [
    {
      label: "销售额",
      value: "¥1,285,600",
      change: "+12.5%",
      icon: DollarSign,
      color: tokens.colors.accent.green,
    },
    {
      label: "订单数",
      value: "12,340",
      change: "+8.3%",
      icon: ShoppingBag,
      color: tokens.colors.accent.blue,
    },
    {
      label: "访客数",
      value: "84,560",
      change: "+15.2%",
      icon: Users,
      color: tokens.colors.accent.yellow,
    },
    {
      label: "商家数",
      value: "256",
      change: "+3",
      icon: Store,
      color: tokens.colors.accent.red,
    },
  ];

  return (
    <AdminLayout>
      <Box sx={{ maxWidth: 1400 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary" }}>
            运营报表
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>时间范围</InputLabel>
            <Select label="时间范围" defaultValue="7d">
              <MenuItem value="today">今天</MenuItem>
              <MenuItem value="7d">近7天</MenuItem>
              <MenuItem value="30d">近30天</MenuItem>
              <MenuItem value="90d">近90天</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* 统计卡片 */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat) => (
            <Grid item xs={12} sm={6} lg={3} key={stat.label}>
              <Card sx={{ height: "100%" }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: `${stat.color}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <stat.icon size={24} color={stat.color} />
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: tokens.colors.accent.green }}>
                      <TrendingUp size={14} />
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {stat.change}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {stat.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* 图表区域 */}
        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Card sx={{ height: 400 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
                  销售趋势
                </Typography>
                <Box
                  sx={{
                    height: 300,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: tokens.colors.background.primary,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    图表区域 (ECharts / Recharts)
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={4}>
            <Card sx={{ height: 400 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
                  类目占比
                </Typography>
                <Box
                  sx={{
                    height: 300,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: tokens.colors.background.primary,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    饼图区域
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </AdminLayout>
  );
}
