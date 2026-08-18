/**
 * ECharts React 封装组件
 * 使用按需加载的 echarts 实例
 */

import { useEffect, useRef, memo } from "react";
import type { ECharts } from "echarts/core";

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
  const chartRef = useRef<ECharts | null>(null);
  const latestOptionRef = useRef(option);

  useEffect(() => {
    let disposed = false;
    let removeResizeListener: (() => void) | undefined;

    void import("./ECharts").then(({ default: echarts }) => {
      if (disposed || !containerRef.current) return;

      const chart = echarts.init(containerRef.current);
      chartRef.current = chart;
      chart.setOption(latestOptionRef.current);

      const handleResize = () => chart.resize();
      window.addEventListener("resize", handleResize);
      removeResizeListener = () => window.removeEventListener("resize", handleResize);
    });

    // 清理
    return () => {
      disposed = true;
      removeResizeListener?.();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // 更新配置
  useEffect(() => {
    latestOptionRef.current = option;
    if (chartRef.current) {
      chartRef.current.setOption(option);
    }
  }, [option]);

  return <div ref={containerRef} style={style} className={className} />;
});
