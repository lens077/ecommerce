---
name: consul-ttl-first-ping-blind-window
module: registry
description: TTL check 注册后初始为 critical，pinger 却先等一个完整 ping_interval 才发首次心跳，服务在这段时间内「已注册但对外不可见」
---

# 后端服务启动后，前端要刷好几次才出数据

**症状**

后端服务启动完全正常：fx 生命周期无报错、`starting server`、`starting ttl pinger` 都打了，
Consul UI 里也能看到这个实例。但前端首屏拿到的是 503，要手动刷新好几次才出数据。
过一会儿（半分钟内）自己就好了，重启后又复现。

**关键陷阱**

服务端日志**干净得没有任何线索**——因为请求根本没打到服务端，它在网关那一层就被挡回去了。
于是排查方向很自然地跑去网关、去前端重试逻辑、去 Consul 集群本身。

这个坑还有第二层伪装：网关侧确实**同时**存在真实的 watcher 生命周期 bug。
修掉 watcher 之后症状**减轻但没消失**，很容易被判定为「已修复，剩下的是网络抖动」。

**根因**

三件事叠在一起：

1. Consul 的 TTL check 在 `Register` 之后**初始状态是 `critical`**，不是 passing。
   必须等第一次 `UpdateTTL(..., api.HealthPassing)` 才转 passing。
2. `TtlCheckPinger` 原来的写法是 `NewTicker` 之后直接进 `for { select { case <-ticker.C: ... } }`
   ——**第一次心跳要等一个完整的 `ping_interval`**。KV 里配的是 25s。
3. 服务发现方（网关用的 kratos `contrib/registry/consul/v2`）是用 **`passingOnly=true`** 查询的。

于是每次后端启动都存在一段 **25 秒的「已注册但对外不可见」盲窗**：
Consul 里有这个实例，但它是 critical，`passingOnly` 把它过滤掉，网关拿到空节点列表，
p2c selector 返回 `ErrNoAvailable`，前端收到 503。

用户日志正好把这个数字坐实了：

```
00:50:37.264  INFO  registry/consul.go:228  starting ttl pinger  {"interval": "25s", ...}
00:51:02.526  INFO  LoggingInterceptor      rpc completed        {"rpc.procedure": ".../UserProfile", ...}
```

25.262 秒。

**修复**

`TtlCheckPinger` 在进 ticker 循环**之前**先 `ping()` 一次，把盲窗压到零。
调用点保证 `Register` 已同步返回，`checkID` 一定存在。
11 个服务的这段代码此前字节完全相同（`internal/pkg/registry/consul.go`），统一修改。

配套调了两个 KV 参数（11 份 `ecommerce/<svc>/dev.yml` + 8 份 `ecommerce/<svc>/pre.yml`，
两个环境逐字一致）：

| 字段 | 旧值 | 新值 | 理由 |
|---|---|---|---|
| `check.ttl.ping_interval` | `25s` | `10s` | 只比 `duration` 少 5s，网络抖一下就掉出 passing 被摘流量 |
| `check.deregister_critical_service_after` | `6s` | `1m` | ⚠️ 见下 |
| `check.ttl.duration` | `30s` | 不变 | |

⚠️ **`deregister_critical_service_after` 在 Consul 里有 1 分钟硬下限**，写小于 1m 的值会被
**静默钳制**到 1m，既不报错也不警告。原来写的 `6s` 从来没有生效过——配置在骗人，
读代码的人会以为服务掉线 6 秒就被摘掉，实际是 60 秒。要么写 `1m`，要么接受它其实是 `1m`。

**验证**

`backend/services/user/internal/pkg/registry/pinger_test.go` 三个用例：
首次心跳必须立即发出、ticker 持续心跳、context 取消后停止。
第一个用例把 `ping_interval` 设成 30s 但只等 3s——**对旧代码跑会红**
（"3s 内没有收到首次心跳，首次 ping 仍在等 ticker"），这是它有效的证据。

**遗留（已知，未改）**

- `consul.go` 里 pinger 用的是 `context.Background()`，应用退出时不会取消；
  紧邻的注释写「当应用退出时，TtlCheckPinger 的 context 也会关闭」是**错的**。
  影响仅为退出时多一条 `UpdateTTL` 错误日志。
- fx hook 块在 11 个服务里已漂移出 5 个变体，本轮没有统一。
- **仓库里的 `backend/services/*/configs/{dev,pre}.yml` 仍是旧值**（`6s`/`25s`）。
  它们不是运行时配置——服务只从 Consul KV 读（`CONFIG_SOURCE`，见
  `backend/services/cart/internal/pkg/config/source.go`），这些文件是种子/参考副本。
  其中 `merchant`/`payment`/`product` 的 `dev.yml` 还停在更老的 schema
  （`ping_interval_seconds: 1`，没有 `check` 段），是独立的漂移问题。

**排查捷径**

- 「服务日志干净但前端拿不到数据」时，先问**请求有没有到服务端**。
  服务端没有对应的 `rpc completed`，就说明问题在它前面，别在服务内部找。
- 直接查 Consul 看健康状态，不要只看服务是否注册：
  `curl -s http://192.168.3.112:8500/v1/health/service/<name> | jq '.[].Checks[].Status'`
- 一个已宣告修好的 bug 仍然复现时，先确认修的是不是**同一层**。
  本例中网关 watcher 的修复是真的、也有效，但它和真凶是两个独立故障。

**相关**

- 网关侧的重试放大与健康检查失效：[`gateway/experience/retry-amplification-and-phantom-health-check.md`](../../gateway/experience/retry-amplification-and-phantom-health-check.md)
- 前端侧的重复请求：[`consumer/experience/duplicate-cart-queries.md`](../../consumer/experience/duplicate-cart-queries.md)
- Consul 地址与 KV 路径见 [`context/team/local-env.md`](../../../../team/local-env.md)
