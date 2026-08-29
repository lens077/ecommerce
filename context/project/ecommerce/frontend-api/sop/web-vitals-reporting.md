---
name: web-vitals-reporting
layer: project/ecommerce/frontend-api
description: 前端性能上报的链路、perf 与 tracker 的分工、自循环排除与基数纪律
---

# 前端性能上报 SOP

## 链路

```
@ecommerce/perf(采集) → 网关 /telemetry*(免 JWT) → behavior 进程的 telemetry.v1
  → OTel histogram → VictoriaMetrics(查:web_vitals_* / frontend_api_duration_*)
  → zap 结构化日志 → otelzap → VictoriaLogs(LogsQL 查:service_name:"behavior-service" AND "web_vital")
```

接入只需一行:`initPerf({ gatewayUrl, getRoute })`(见 consumer 的 `bootstrap.tsx`)。

## perf 与 tracker 的分工 —— 别混

| | `@ecommerce/tracker` | `@ecommerce/perf` |
|---|---|---|
| 采什么 | 用户对**内容**的行为(曝光/点击/加购) | **页面本身**的表现(LCP/卡顿/接口耗时) |
| 喂给谁 | gorse(推荐) | 可观测性栈(VictoriaMetrics / VictoriaLogs) |
| proto | behavior.v1(枚举封死,`item_id` 必填) | telemetry.v1 |

性能数据塞不进 behavior.v1 不是巧合:那个 proto 的每个约束都为推荐语义服务。
新的遥测类数据一律走 telemetry.v1,别去松 behavior 的约束。

## 三条纪律

**1. 自循环排除。** 采集 fetch/xhr 耗时的 observer 必须排除自身上报端点与 Track
埋点端点(`network.ts` 的 `excludePaths`)——否则每次上报都会催生下一次上报,
且两条旁路会污染业务接口的耗时分布。新增旁路上报端点时记得加进去。

**2. 基数纪律。** 会成为 metric label 的只有 `page` 与 `rating`。`page` 必须是
**路由模式**(`/product/$spuCode`),不是具体 URL —— 传 URL 会让 VM 的序列数跟着
商品数走。API 的 `path`、归因的 selector 都是高基数,只进日志不进 label。
服务端 `telemetry.go` 有同样的约束和注释,两边都别放松。

**3. 卸载上报用 sendBeacon,所以请求体必须自包含。** sendBeacon 带不了任何自定义
请求头(JWT/Connect-Protocol-Version 都不行),这决定了:网关必须给
`CollectWebVitals` 开免鉴权白名单;身份靠请求体里的 `anonId`(登录态由网关注入的
header 自动覆盖);不能用生成的 connect 客户端,`report.ts` 手写 JSON 线格式
(与 `tracker/transport.ts` 同一套理由,那边文件头注释写得更全)。

## 已知边界

- **五大指标用 web-vitals/attribution,不要手写**。LCP 定格时机、CLS Session
  Window、INP 高分位、bfcache 重置,手写版错了不报错只出错数。手写的只有
  web-vitals 不覆盖的:LongTask(`longtask.ts`)和 Resource Timing(`network.ts`)。
- SPA 软导航不分段(web-vitals v5 的 soft-navs 还是实验特性),一次真实导航的
  指标归属它发生时的路由。
- 跨域资源没有 `Timing-Allow-Origin` 时 dns/tcp/ttfb 全是 0,是浏览器隐私保护,
  不是采集坏了。
- 采样按**会话**定(sessionStorage 缓存决定),同一会话要么全采要么全不采 ——
  按事件采样会让同一页面的 LCP 和 INP 来自不同用户群,指标对不上。
