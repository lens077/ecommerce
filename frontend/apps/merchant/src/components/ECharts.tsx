/**
 * 按需加载 ECharts 组件
 * 只注册需要的组件，减小 Bundle 大小
 */

import * as echarts from "echarts/core";

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

export default echarts;

// 重新导出类型
export type { EChartsOption } from "echarts";
