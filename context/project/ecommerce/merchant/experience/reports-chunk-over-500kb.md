---
name: reports-chunk-over-500kb
module: merchant
description: reports 路由静态导入 ECharts 时会把图表引擎合入路由 chunk，组件名带 Lazy 也不会形成异步边界
---

# reports chunk 超过 500 kB

**症状**

merchant 生产构建提示 chunk 超过 `500 kB`。`reports` chunk 约为 `563 kB`，远大于其他业务路由。

**关键陷阱**

`LazyECharts` 的组件名和 `memo()` 都不会触发代码拆分。只要文件顶部仍是静态 `import`，
TanStack Router 的路由级自动拆包就会把 ECharts、图表类型和 ZRender 一起合入 `reports`。

按需注册 `LineChart`、`BarChart`、`PieChart` 已经启用了 ECharts 的 tree shaking；继续调整具名导入收益有限。
调高 `chunkSizeWarningLimit` 只会隐藏告警，不会减少路由加载和 JavaScript 解析成本。

**根因**

`frontend/apps/merchant/src/components/LazyECharts.tsx` 在模块顶层导入 `echarts/core`、
`echarts/charts`、`echarts/components` 和 Canvas renderer。该文件又被 `reports` 路由静态导入，
所以路由 chunk 包含完整的图表运行时。

ECharts 与 ZRender 合并后仍超过默认阈值。即使增加动态导入边界，构建器也会生成一个过大的异步 chunk。

**修复**

- `LazyECharts.tsx` 只保留类型导入，在组件挂载后通过 `import("./ECharts")` 加载图表运行时。
- 异步初始化保存最新 option，并在组件卸载时取消初始化、移除 resize listener、销毁实例。
- `ECharts.tsx` 只注册页面实际使用的图表和组件，不注册未使用的 `TitleComponent`。
- `vite.config.ts` 使用 Rolldown `output.codeSplitting.groups`，按 `echarts` 和 `zrender` 包边界拆分，
  不使用调高告警阈值的方式绕过检查。

遇到仅由单个路由使用的重型依赖时，必须确认存在动态 `import()` 边界。动态 chunk 仍过大时，
优先按稳定的包边界拆分，并用生产构建尺寸和真实浏览器运行结果验收。

