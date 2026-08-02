---
name: retry-amplification-and-phantom-health-check
module: gateway
description: 两层重试相乘让一个 POST 最多打上游 6 次；15s 兜底轮询顺带把健康检查的失败计数清零，让 HealthyNodeFilter 从未生效过
---

# 一次 503 变成一串重复请求，而健康检查一个坏节点都没标出来

**症状**

上游短暂不可用时，浏览器发一个请求，网关 accesslog 里出现好几条打向上游的记录。
同时：无论怎么造故障，健康检查器**从来不把任何节点标成不健康**，
`HealthyNodeFilter` 看起来接了但没有任何效果。

**关键陷阱**

这两件事看起来无关，实际上第二件的凶手是一段「兜底」代码，而它写下来的初衷是好的。

## 一、重试相乘

网关有**两层**重试，而它们是**相乘**关系：

| 层 | 位置 | 语义 | 能力 |
|---|---|---|---|
| 路由层 | `configs/config.yaml` 的 `retry.attempts` | **总尝试次数**（不是重试次数） | 有 `per_try_timeout`、有 `conditions` |
| 客户端层 | `client/client.go` 的 `defaultMaxRetries` | 一次 RoundTrip 最多选几个节点 | 无延迟、无退避、无条件判断 |

原来 `defaultMaxRetries = 3`，配上路由的 `attempts: 2`，
一个浏览器 POST 最多打上游 **6 次**。

**ConnectRPC 全是 POST，没有幂等性保证。** 盲目重放会造成重复写入
（加购、下单这类会真的重复发生）。

改成 `defaultMaxRetries = 1`：重试语义**只由路由层负责**，因为只有那一层知道
什么错误值得重试、每次试多久。客户端层不该再乘一遍。

## 二、兜底轮询把健康检查废掉了

`nodeApplier` 里曾有一个 15s 的 `startRefreshLoop`：定期主动查一次注册中心，
把服务列表刷回来。它是**watcher 生命周期 bug 时代的产物**——watcher 断了不会重建，
所以要靠轮询兜底。watcher 修好之后，它只剩三条害处：

1. 未启动的服务每 15s 刷一条 `service xxx not found in registry` WARN，淹没真日志
   （config.yaml 声明了 10 条路由，本地通常只起一两个服务，日志基本被这个刷满）；
2. 它的 `Callback` 会调 `healthChecker.updateNodes`——见下；
3. 与 watcher 推送的节点列表**并发写 picker**，互相覆盖。

`healthChecker.updateNodes` 原来是**全删再全加**：清空 `nodes` / `healthyNodes` /
`failureCount` 三张表，再按新列表全部重建为「健康、0 次失败」。

于是**服务发现每推送一次，就等于给所有节点做一次赦免**。
配上 15s 轮询和 10s 的检查间隔，`failureCount` 永远攒不到 `maxFailures`（默认 3），
健康检查器实际上**标不出任何不健康节点**。这个功能从写下那天起就没生效过。

改为 **diff 语义**：只有新出现的地址才初始化为健康，只有消失的地址才被删除，
已存在的地址保留当前健康状态和失败计数，只刷新 node 实例本身（权重、元数据可能变了）。
消失的地址要连同它的健康状态一起清掉，否则地址复用时会继承旧计数。

**验证**

`gateway/client/health_checker_test.go` 三个用例，其中两个**对旧代码跑会红**：
"一次服务发现推送就把不健康节点赦免回健康了" / "失败计数被重置成 0"。
这是它们有效的证据，不是摆设。

**排查捷径**

- 「某个防护性功能好像没生效」时，先找**谁在重置它的状态**，而不是先怀疑阈值配错了。
  兜底/刷新/同步这类周期性代码是重灾区。
- 判断重试是不是被放大：数 accesslog 里同一个 `trace_id` 打向上游的条数，
  和路由配置的 `attempts` 对不上就是有第二层在乘。
- 删「兜底」代码前先确认它兜的那个底还在不在。它往往比它要兜的 bug 活得更久。

**相关**

- 本轮真凶其实在服务注册侧：[`registry/experience/consul-ttl-first-ping-blind-window.md`](../../registry/experience/consul-ttl-first-ping-blind-window.md)
- 前端侧的重复请求：[`consumer/experience/duplicate-cart-queries.md`](../../consumer/experience/duplicate-cart-queries.md)
