/**
 * 商家端运营报表页面
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import { TrendingUp, ShoppingBag, DollarSign, Package } from "lucide-react";
import { LazyECharts } from "@/components/LazyECharts";
import { tokens } from "@/styles/tokens";

export const Route = createFileRoute("/reports" as any)({
  component: ReportsPage,
});

function ReportsPage() {
  // 统计数据
  const stats = [
    {
      label: "今日销售额",
      value: "¥12,580",
      change: "+8.3%",
      icon: DollarSign,
      color: tokens.colors.accent.green,
    },
    {
      label: "今日订单",
      value: "128",
      change: "+12.5%",
      icon: ShoppingBag,
      color: tokens.colors.accent.blue,
    },
    {
      label: "今日访客",
      value: "1,456",
      change: "+5.2%",
      icon: TrendingUp,
      color: tokens.colors.accent.yellow,
    },
    {
      label: "商品总数",
      value: "256",
      change: "+3",
      icon: Package,
      color: tokens.colors.accent.red,
    },
  ];

  // 销售趋势图表配置
  const salesTrendOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#fff",
      borderColor: tokens.colors.border.default,
      textStyle: {
        color: tokens.colors.text.primary,
      },
    },
    legend: {
      data: ["销售额", "订单数"],
      bottom: 0,
      textStyle: {
        color: tokens.colors.text.secondary,
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      top: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
      axisLine: {
        lineStyle: {
          color: tokens.colors.border.default,
        },
      },
      axisLabel: {
        color: tokens.colors.text.secondary,
      },
    },
    yAxis: [
      {
        type: "value",
        name: "销售额",
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: tokens.colors.text.secondary,
          formatter: (value: number) => `¥${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`,
        },
        splitLine: {
          lineStyle: {
            color: tokens.colors.border.default,
            type: "dashed",
          },
        },
      },
      {
        type: "value",
        name: "订单数",
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: tokens.colors.text.secondary,
        },
        splitLine: {
          show: false,
        },
      },
    ],
    series: [
      {
        name: "销售额",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: {
          color: tokens.colors.accent.blue,
          width: 2,
        },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${tokens.colors.accent.blue}40` },
              { offset: 1, color: `${tokens.colors.accent.blue}05` },
            ],
          },
        },
        itemStyle: {
          color: tokens.colors.accent.blue,
          borderWidth: 2,
        },
        data: [8200, 9320, 9010, 12340, 12900, 13300, 12580],
      },
      {
        name: "订单数",
        type: "line",
        smooth: true,
        yAxisIndex: 1,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: {
          color: tokens.colors.accent.green,
          width: 2,
        },
        itemStyle: {
          color: tokens.colors.accent.green,
          borderWidth: 2,
        },
        data: [78, 92, 85, 118, 125, 132, 128],
      },
    ],
  };

  // 类目销售占比图表配置
  const categoryPieOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#fff",
      borderColor: tokens.colors.border.default,
      textStyle: {
        color: tokens.colors.text.primary,
      },
    },
    legend: {
      orient: "vertical",
      right: "5%",
      top: "center",
      textStyle: {
        color: tokens.colors.text.secondary,
      },
    },
    series: [
      {
        name: "销售额",
        type: "pie",
        radius: ["50%", "75%"],
        center: ["35%", "50%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: "#fff",
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        data: [
          { value: 4850, name: "手机通讯", itemStyle: { color: tokens.colors.accent.blue } },
          { value: 3200, name: "电脑办公", itemStyle: { color: tokens.colors.accent.green } },
          { value: 2340, name: "数码配件", itemStyle: { color: tokens.colors.accent.yellow } },
          { value: 1560, name: "智能穿戴", itemStyle: { color: tokens.colors.accent.red } },
          { value: 630, name: "其他", itemStyle: { color: tokens.colors.text.disabled } },
        ],
      },
    ],
  };

  // 近7天订单趋势（柱状图）
  const orderBarOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#fff",
      borderColor: tokens.colors.border.default,
      textStyle: {
        color: tokens.colors.text.primary,
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "10%",
      top: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
      axisLine: {
        lineStyle: {
          color: tokens.colors.border.default,
        },
      },
      axisLabel: {
        color: tokens.colors.text.secondary,
      },
    },
    yAxis: {
      type: "value",
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: tokens.colors.text.secondary,
      },
      splitLine: {
        lineStyle: {
          color: tokens.colors.border.default,
          type: "dashed",
        },
      },
    },
    series: [
      {
        name: "订单数",
        type: "bar",
        barWidth: "60%",
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: tokens.colors.accent.blue },
              { offset: 1, color: `${tokens.colors.accent.blue}80` },
            ],
          },
        },
        data: [78, 92, 85, 118, 125, 145, 128],
      },
    ],
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
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
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 3, mb: 4 }}>
        {stats.map((stat) => (
          <Card key={stat.label} sx={{ height: "100%" }}>
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
        ))}
      </Box>

      {/* 图表区域 */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {/* 第一行：销售趋势 + 类目占比 */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 3 }}>
          {/* 销售趋势 */}
          <Card sx={{ height: 400 }}>
            <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
                销售趋势
              </Typography>
              <Box sx={{ flex: 1 }}>
                <LazyECharts option={salesTrendOption} style={{ height: "100%", width: "100%" }} />
              </Box>
            </CardContent>
          </Card>

          {/* 类目占比 */}
          <Card sx={{ height: 400 }}>
            <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
                类目销售占比
              </Typography>
              <Box sx={{ flex: 1 }}>
                <LazyECharts option={categoryPieOption} style={{ height: "100%", width: "100%" }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* 近7天订单 */}
        <Card sx={{ height: 350 }}>
          <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
              近7天订单趋势
            </Typography>
            <Box sx={{ flex: 1 }}>
              <LazyECharts option={orderBarOption} style={{ height: "100%", width: "100%" }} />
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
