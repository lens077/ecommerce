---
name: retry-amplification-and-phantom-health-check
module: gateway
description: 服务发现每推送一次就把 failureCount 清零，让健康过滤从写下那天起就没生效过；「兜底」代码是防护性功能失效的常见凶手
---

# 健康检查一个坏节点都没标出来

> 原文还有前半段「两层重试相乘让一个 POST 打上游 6 次」。那半段已**架构性消亡**：
> 新网关（`control-tower/services/gateway`）转发默认无重试，RouteConfig 里也没有
> `retry.attempts` 字段，客户端层的 `defaultMaxRetries` 随旧网关一起删除。
> 本文只保留仍然成立的后半段。

**症状**

无论怎么造故障，健康检查器**从来不把任何节点标成不健康**，
过滤器看起来接了但没有任何效果。

**关键陷阱**

凶手是一段「兜底」代码，而它写下来的初衷是好的。

## 兜底轮询把健康检查废掉了

旧网关 `nodeApplier` 里有一个 15s 的 `startRefreshLoop`：定期主动查一次注册中心，
把服务列表刷回来。它是 **watcher 生命周期 bug 时代的产物**——watcher 断了不会重建，
所以要靠轮询兜底。watcher 修好之后，它只剩害处，其中最致命的一条：
它的 `Callback` 会调 `healthChecker.updateNodes`。

而 `healthChecker.updateNodes` 是**全删再全加**：清空 `nodes` / `healthyNodes` /
`failureCount` 三张表，再按新列表全部重建为「健康、0 次失败」。

于是**服务发现每推送一次，就等于给所有节点做一次赦免**。
配上 15s 轮询和 10s 的检查间隔，`failureCount` 永远攒不到 `maxFailures`（默认 3），
健康检查器实际上**标不出任何不健康节点**。这个功能从写下那天起就没生效过。

正确写法是 **diff 语义**：只有新出现的地址才初始化为健康，只有消失的地址才被删除，
已存在的地址保留当前健康状态和失败计数，只刷新 node 实例本身（权重、元数据可能变了）。
消失的地址要连同它的健康状态一起清掉，否则地址复用时会继承旧计数。

## 这条教训写进了新网关的设计契约

重写网关时它被提升成 `resolver` 包的显式不变式，
`control-tower/services/gateway/internal/resolver/resolver.go` 的包注释逐字写着：

> 快照替换是增量语义：仍存在的实例保留其健康/在途状态，不会被刷新清零（历史坑：
> 旧网关全删全加把 failureCount 清零，健康过滤长期形同虚设）

实现是 `serviceState.snapshotSwap`：仍在列表里的 `Addr` 直接复用旧 `*node`
（连同 `inflight` / `fails` / `downTill`），只有新地址才建零值，缺失的才剔除。
被动健康由 `feedback` 累计，连续 3 次失败进 5s 冷却。

**排查捷径**

- 「某个防护性功能好像没生效」时，先找**谁在重置它的状态**，而不是先怀疑阈值配错了。
  兜底/刷新/同步这类周期性代码是重灾区。
- **删「兜底」代码前先确认它兜的那个底还在不在。** 它往往比它要兜的 bug 活得更久。

**相关**

- 本轮真凶其实在服务注册侧：[`registry/experience/consul-ttl-first-ping-blind-window.md`](../../registry/experience/consul-ttl-first-ping-blind-window.md)
- 前端侧的重复请求：[`consumer/experience/duplicate-cart-queries.md`](../../consumer/experience/duplicate-cart-queries.md)
