/**
 * ECharts React 封装组件
 * 使用按需加载的 echarts 实例
 */

import { useEffect, useRef, memo } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts";

// 导入需要的图表类型
import { LineChart, BarChart, PieChart } from "echarts/charts";

// 导入需要的组件
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from "echarts/components";

// 导入渲染器
import { CanvasRenderer } from "echarts/renderers";

// 注册必须的组件
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

interface LazyEChartsProps {
  option: Record<string, any>;
  style?: React.CSSProperties;
  className?: string;
}

export const LazyECharts = memo(function LazyECharts({
  option,
  style,
  className,
}: LazyEChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化图表
    chartRef.current = echarts.init(containerRef.current);

    // 设置配置
    chartRef.current.setOption(option);

    // 响应式 resize
    const handleResize = () => {
      chartRef.current?.resize();
    };

    window.addEventListener("resize", handleResize);

    // 清理
    return () => {
      window.removeEventListener("resize", handleResize);
      chartRef.current?.dispose();
    };
  }, []);

  // 更新配置
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option);
    }
  }, [option]);

  return <div ref={containerRef} style={style} className={className} />;
});
