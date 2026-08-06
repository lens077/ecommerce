---
name: config-hot-reload-boundaries
layer: project/ecommerce/config
description: 配置热更新到底哪些段会立刻生效、哪些只打 WARN、失败时保留旧资源为什么反而更危险
---

# 配置改了到底生效没有

## 前提：只有配置中心这条路有热更新

`CONFIG_SOURCE=consul` 时**没有热更新**，配置只在启动时读一次。这不是 bug 而是设计：
`consulSource` 刻意不实现 `Watcher` 接口，`startWatch` 用类型断言发现不支持就打一行

```
当前配置数据源不支持变更推送,配置仅在启动时加载一次  source=consul
```

有这行日志，就别再指望改 KV 会生效了。

## 三层结构

```
配置中心 PutKey
  → pg_notify(事务内)  → config-service 的 LISTEN → WatchKeys 流
  → 服务侧 source_configcenter.Watch 收到 SNAPSHOT/PUT
  → decodeConfig → live.Set(新的 *Bootstrap)
  → 各订阅者的回调(串行、同步)
```

`live.Set` 是**整体原子替换**，不是逐字段改——配置是一个整体，半新半旧的中间态没有调用方能正确处理。
回调串行执行，保证「上一次重建做完才开始下一次」。

## 哪些段会真的生效

| 段 | 行为 |
|---|---|
| `log.application.level` | **立即生效**，日志出 `log level changed` |
| `data.database` | **重建连接池**，出 `database config changed, rebuilding pool` → `database pool rebuilt` |
| `data.cache` | **重建 redis 客户端**，语义同上 |
| `server` | 只打 WARN，不重新绑端口 |
| `discovery` | 只打 WARN，不重新注册 |
| `observability` | 只打 WARN，不重建 tracer |

后三段不热生效是权衡后的取舍（重新绑端口会切断 in-flight 连接、重注册要先摘节点、
重建 tracer 会丢未导出的 span），滚动重启更可控。但**沉默是不可接受的**——
改完没反应又没人说一声，只会让人以为热更新坏了，所以一律打

```
WARN  该配置段已变更,但需要重启服务才会生效  section=server
```

## 为什么消费侧必须改造

只推不改等于没改。原先所有消费者都在 fx 构造期拿走 `*Bootstrap` 快照，
推送多少次都跟它们无关。所以：

- `config.Live`：`atomic.Pointer` + 订阅，Get 在热路径上所以不用 RWMutex
- `data.PgPool`：**实现 `models.DBTX`**，于是 `models.New(pool)` 之后底层池被换掉
  `*Queries` 依然有效，data 层所有 `queries.*` 调用点一行都不用改；同时实现
  `otelpgx.PoolStats`，指标注册在壳上，换池后一直有效（otelpgx 没有反注册接口，
  每次换池都注册会重复上报）
- `data.LiveRedis`：**不要把 `Client()` 的返回值存进结构体字段**，那样又变回「启动时抓一次」
- `pkg/log`：必须是 `zap.AtomicLevel`。core 一旦建好就无法替换级别，
  只有把这个开关留在外面后续才改得动

真正需要改的调用点只有「要拿池本身」的那几处：`BeginTx` 和 `Ping` 走 `.Pool()`，
redis 一律 `.Client()`。9 个服务里每个只有 1~7 处，编译器会全部指出来。

## 最危险的一条：失败时保留旧资源

新配置连不上时**保留旧池并只记 ERROR**：

```
ERROR  rebuild database pool failed, keeping the current one  error=...no such host
```

这是有意的——一次配置手滑不该让在跑的流量全挂。但它的含义是**改错了不会有任何外部表现**：
服务照常 healthy、请求照常成功，只有那一行 ERROR 说明新配置没被采纳。

所以：**改完配置要去看日志确认那三行之一出现了**，别看 `/healthz`。
`healthy` 恰恰是配置没生效时的表现。

同理，换池是 **Ping 通过之后才 Swap**，旧池延迟 30s 才 Close（立刻 Close 会掐断
还在执行的查询）。任何时刻对外可见的都是一个能用的池。

## 实测方式

这一层每一条都是「不生效也不报错」的，所以必须实跑，不能只看代码：

```bash
cd ../config-center && make dev                  # 配置中心得先起来
cd backend/services/user   && make dev-cc       # 目标服务走配置中心
# 然后 PutKey 改一个值,盯日志
```

四个必测场景：改 `log.application.level` 要看到级别真的变；改 `data.database.pool.max_conns`
要看到池重建；改 `server.addr` 要看到 WARN **且端口没变**（`lsof` 验）；把 DB host 改成
不可达的要看到 ERROR + 保留旧池 + 服务仍 healthy，改回去要看到重建成功。

单测层面对应 `pkg/log` 的 `TestModule_LogLevelHotReload`（先对「不订阅」的写法跑红过）
与 `internal/data/live_test.go` 的 `TestPgPool_SwapRedirectsQueries`。

## 陷阱

- **`http.Server.WriteTimeout` 会掐断 WatchKeys 长流**。config-service 侧配了 5s，
  流在第一个心跳上就断，客户端每 30s 重连重取快照，看着一切正常实则一直在抖。
  已由 `withoutWriteTimeout` 只对流式路由清写截止时间。
- 配置中心不可达时服务**直接启动失败**，不会偷偷回落到 Consul。错误信息里带着
  namespace/env/key 和地址，照着看就行。

## 相关

- 三处副本谁是源：[`three-copies-of-one-config.md`](three-copies-of-one-config.md)
- 模块总览与约定：[`../INDEX.md`](../INDEX.md)
