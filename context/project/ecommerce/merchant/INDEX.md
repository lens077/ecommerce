# merchant 前端知识

适用于 `frontend/apps/merchant/`。这里记录商家端特有的实现约束和已验证的故障模式。

## 经验

| 文件 | 内容 |
|---|---|
| [reports-chunk-over-500kb.md](experience/reports-chunk-over-500kb.md) | `Lazy` 命名不等于异步边界；ECharts 需要动态导入并按包边界拆分 |

