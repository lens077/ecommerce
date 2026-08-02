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
import { useFormat, useTranslation } from "@ecommerce/i18n";
import { LazyECharts } from "@/components/LazyECharts";
import { tokens } from "@/styles/tokens";

/** 星期文案 key。ECharts 的 option 在组件体内构造，切语言会跟着重建。 */
const WEEKDAY_KEYS = [
  "reports.weekday.mon",
  "reports.weekday.tue",
  "reports.weekday.wed",
  "reports.weekday.thu",
  "reports.weekday.fri",
  "reports.weekday.sat",
  "reports.weekday.sun",
] as const;

export const Route = createFileRoute("/reports" as any)({
  component: ReportsPage,
});

function ReportsPage() {
  const { t } = useTranslation();
  const { formatCurrency, formatNumber } = useFormat();

  const weekdays = WEEKDAY_KEYS.map((key) => t(key));
  const salesLabel = t("reports.chart.sales");
  const ordersLabel = t("reports.chart.orders");

  // 统计数据
  const stats = [
    {
      labelKey: "reports.stats.sales",
      value: formatCurrency(12580),
      change: "+8.3%",
      icon: DollarSign,
      color: tokens.colors.accent.green,
    },
    {
      labelKey: "reports.stats.orders",
      value: formatNumber(128),
      change: "+12.5%",
      icon: ShoppingBag,
      color: tokens.colors.accent.blue,
    },
    {
      labelKey: "reports.stats.visitors",
      value: formatNumber(1456),
      change: "+5.2%",
      icon: TrendingUp,
      color: tokens.colors.accent.yellow,
    },
    {
      labelKey: "reports.stats.products",
      value: formatNumber(256),
      change: "+3",
      icon: Package,
      color: tokens.colors.accent.red,
    },
  ] as const;

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
      data: [salesLabel, ordersLabel],
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
      data: weekdays,
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
        name: salesLabel,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: tokens.colors.text.secondary,
          formatter: (value: number) =>
            `¥${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`,
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
        name: ordersLabel,
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
        name: salesLabel,
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
        name: ordersLabel,
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
        name: salesLabel,
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
          {
            value: 4850,
            name: t("reports.category.phone"),
            itemStyle: { color: tokens.colors.accent.blue },
          },
          {
            value: 3200,
            name: t("reports.category.computer"),
            itemStyle: { color: tokens.colors.accent.green },
          },
          {
            value: 2340,
            name: t("reports.category.accessory"),
            itemStyle: { color: tokens.colors.accent.yellow },
          },
          {
            value: 1560,
            name: t("reports.category.wearable"),
            itemStyle: { color: tokens.colors.accent.red },
          },
          {
            value: 630,
            name: t("reports.category.other"),
            itemStyle: { color: tokens.colors.text.disabled },
          },
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
      data: weekdays,
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
        name: ordersLabel,
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
          {t("reports.title")}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{t("reports.range.label")}</InputLabel>
          <Select label={t("reports.range.label")} defaultValue="7d">
            <MenuItem value="today">{t("reports.range.today")}</MenuItem>
            <MenuItem value="7d">{t("reports.range.d7")}</MenuItem>
            <MenuItem value="30d">{t("reports.range.d30")}</MenuItem>
            <MenuItem value="90d">{t("reports.range.d90")}</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* 统计卡片 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 3,
          mb: 4,
        }}
      >
        {stats.map((stat) => (
          <Card key={stat.labelKey} sx={{ height: "100%" }}>
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
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    color: tokens.colors.accent.green,
                  }}
                >
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
                {t(stat.labelKey)}
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
                {t("reports.chart.salesTrend")}
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
                {t("reports.chart.categoryShare")}
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
              {t("reports.chart.weekOrders")}
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
