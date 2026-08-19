---
name: go-redis
layer: team
description: go-redis v9 在本仓的用法约定——客户端热重建、cache-aside、TTL 与 Key、连接池与 context、redis.Nil、Pipeline、重试、锁、Pub/Sub 与 Cluster 边界
---

# go-redis 使用约定

依赖:`github.com/redis/go-redis/v9 v9.21.0`(`backend/go.mod:22`)。
各业务服务的客户端装配是同构副本(`internal/data/data.go` 的 `NewRedisClient` + `buildRedis`,
`internal/data/live.go` 的 `LiveRedis`),由 `backend/structcheck` 在 CI 强制,**改一个必须同步全部**。

> 本仓不同环境可能连接 Redis OSS 或 Dragonfly，地址、TLS 与当前可用性查
> [local-env.md](local-env.md) 和 [`.service-matrix.yaml`](../../.service-matrix.yaml)。两者都兼容常用
> RESP 命令，但不能假定高级能力完全相同。使用 Cluster 拓扑、Stream 消费组或模块类命令前，
> 必须在目标后端实测。

## 一、客户端生命周期:本仓比「启动时建一次」更严

通用建议是「不要每次请求 `redis.NewClient`,启动时建一次靠依赖注入传下去」。本仓做到了这一步
(fx 提供 `NewRedisClient`,注入进 `Data`),但**多了一条约束**:客户端支持配置热重建,
会被整体换掉。

```go
// ✅ 每次用的时候取,拿到的永远是当前那个
if err := d.rdb.Client().Ping(ctx).Err(); err != nil { ... }
pipe := r.data.rdb.Client().Pipeline()

// ❌ 把 Client() 的返回值存进结构体字段 / 包级变量
type repo struct{ rdb *redis.Client }   // 配置一变就抓着一个已被 Close 的旧客户端
```

`LiveRedis` 之所以不转发方法而只暴露 `Client()`,就是为了让「取一次」这个动作显式发生在调用点
(`internal/data/live.go` 的注释写了这条)。旧客户端在换池后有宽限期再 `Close`,
但**存下来的引用最终一定会失效**。

配置项由 `internal/conf/v1/conf.proto` 的 `Data.Cache.Redis` 定义（host/port/db、三个 timeout、
`pool_size`、`min_idle_conns`、`tls`）。实际值由 Config Center 下发；服务与配置键的映射查
[`.service-matrix.yaml`](../../.service-matrix.yaml)。Consul KV 已退役，见
[`consul-kv-retired.md`](../project/ecommerce/config/experience/consul-kv-retired.md)。
**凭据不进仓库**（硬规则 4）。

⚠️ `insecure_skip_verify` 等于只加密不校验身份。目标环境提供 CA 时，必须通过 `ca_pem` 校验证书。

## 二、`redis.Nil` 不是错误

键不存在时 `Result()` 返回的 `err == redis.Nil`,**这是正常结果,不是故障**。
把它和网络错误一起当失败处理,会让「缓存未命中」触发告警、熔断或 5xx。

```go
v, err := rdb.Get(ctx, key).Result()
switch {
case err == redis.Nil:
    // 未命中:回源查库,不是错误
case err != nil:
    // 真错误:超时/网络/命令错
default:
    // 命中
}
```

本仓已有的正确样例:`product/internal/data/recommend.go:178` 读同步游标时把 `redis.Nil`
当「还没有游标」处理。

缓存类的**写**失败(回填缓存)通常应该记 warn 后继续,而不是让请求失败——缓存是加速器不是真相源。

反序列化失败也不能静默伪装成普通未命中。它通常表示缓存格式已变或值已损坏：记录 Key 类型、
schema 版本和错误，删除损坏值后回源；日志与指标不得包含缓存正文或用户隐私。

## 三、缓存默认走 cache-aside

数据库是真相源时，默认使用 cache-aside：

1. 先读缓存。`redis.Nil` 表示未命中；其他错误需要记录并计入指标。
2. 未命中时读数据库，再用带 TTL 的 `Set` 回填。回填失败通常不改变本次读取结果。
3. 数据库写入成功后删除对应缓存。`Del` 失败必须可观测，不能像教程示例一样忽略返回值。

「先写数据库、再删缓存」仍有竞态：并发读可能在事务提交前读到旧值，并在 `Del` 之后把旧值回填。
强新鲜度数据需要带版本的值/Key、数据库条件写，或事务提交后由可靠事件再次失效；短 TTL 只能限制
旧值存活时间，不能消除竞态。

缓存是否允许 fail-open 取决于数据语义。商品详情等派生缓存可以回源；Session、限流计数和锁不是
普通缓存，Redis 故障时不能假装未命中后绕过安全或一致性约束。

同一个热点 Key 并发未命中会同时回源。使用进程内 `singleflight` 或带 owner/TTL 的 Redis 重建锁
合并回源，并给 TTL 加有界随机抖动，避免大量 Key 同时过期。重建锁只保护缓存填充，不能替代
数据库事务。

写穿（write-through）会把「数据库已提交、缓存写失败」变成跨系统部分成功。除非契约明确规定
重试与补偿方式，否则不要把它作为默认模式，也不要在数据库已成功后返回可诱发重复写的模糊错误。

刷新提前（refresh-ahead）只能用于允许短暂旧值的派生数据。后台刷新必须使用服务生命周期
`context`、单次超时和去重；不要像通用教程那样从请求里启动无界的 `context.Background()` goroutine。

## 四、Pipeline:省的是网络往返,不是 Redis 的执行时间

批量读写时逐条发命令,每条都是一次 RTT。`Pipeline()` 把 N 条命令一次发出、一次收回。

四条语义必须记住:

1. **`Exec()` 之前拿不到结果**。命令返回的 `*Cmd` 要先存下来,`Exec()` 之后再读 `.Val()`/`.Result()`;
2. `Exec()` 返回 Pipeline 中的第一个错误，各 `*Cmd` 仍保留自己的结果与错误。某个 `GET` 的
   `redis.Nil` 不代表整批命令都失败；
3. **Pipeline 没有原子性**,其他客户端的命令可以穿插进来。要原子性用 `TxPipeline()`(MULTI/EXEC)，
   但 Redis 事务在 `EXEC` 后遇到命令错误不会回滚已执行命令；
4. 大批量操作必须按有上限的 chunk 分批。无界 Pipeline 会同时放大客户端内存、网络缓冲、
   单次延迟和失败重试成本。

本仓样例:`behavior/internal/data/event.go:150` 用 pipeline 批量 `SetNX` 做曝光去重——
先把每条命令的 `*redis.BoolCmd` 连同下标存进 candidates,`Exec` 之后再逐个读结果,
正是上面第 1 条的写法。

## 五、自动重试:非幂等命令可能执行不止一次

go-redis **默认 `MaxRetries: 3`**(退避 8ms→512ms),默认超时 dial 5s / read 3s / write 3s。
这意味着 `INCR`、`LPUSH` 等命令在网络抖动时**可能被执行多次**。`SetNX` 的状态变更只会成功一次，
但如果首次响应丢失，重试会返回 false，调用方无法仅凭返回值判断首次是否成功。

本仓对这个坑有前科:网关的无条件重试与路由 `attempts` 相乘,让一个非幂等 POST 最多打上游 6 次
(见 [`gateway/experience/retry-amplification-and-phantom-health-check.md`](../project/ecommerce/gateway/experience/retry-amplification-and-phantom-health-check.md))。
Redis 侧同理:**要么让操作幂等且结果可判定（唯一操作 ID、超时后读回确认），要么为有歧义的命令
显式限制重试**。go-redis v9 用 `MaxRetries: -1` 禁用命令重试；不要误以为 0 表示禁用，也不要默认
「客户端重试是安全的」。

超时值调得太短会把本可成功的命令变成重试,太长会让请求挂在那儿——两边都要看监控调,
指标口径见 [`observability/OBSERVABILITY.md`](../../docs/observability/OBSERVABILITY.md)
(Redis 连接数/命中率/响应时间/错误数,以及命中率↓与 DB QPS↑ 的联动)。

## 六、连接池要按总连接预算和等待数据调

`redis.Client` 并发安全且自带连接池。不要按请求创建 Client；本仓仍须遵守第一节的热重建边界。

go-redis v9.21.0 的 `PoolSize` 是基础连接数，**不是硬上限**。连接不足时，客户端可以继续分配连接；
真正的上限由 `MaxActiveConns` 控制。当前同构装配只传入 `PoolSize` 和 `MinIdleConns`，因此估算容量时
必须按「每个 Pod × 每个 Client × 每个 Redis/Cluster 节点」计算总连接数，不能把 `PoolSize` 当成
整个部署的最大连接数。Cluster 的连接池按节点分别建立；目标后端是 Dragonfly 时，Cluster 行为仍需
先验证。

不要只按 CPU 套固定公式扩池。先观察 `PoolStats()`：

- `Timeouts`、`WaitCount`、`WaitDurationNs` 和 `PendingRequests` 反映取连接的等待与超时；
- `TotalConns`、`IdleConns`、`StaleConns` 反映连接规模和回收；
- `Hits`、`Misses` 等计数器是累计值，监控应看增量或速率。

`MinIdleConns` 会乘上副本数并长期占用服务端连接。只有建连延迟和突发流量数据证明需要时才提高。
`PoolTimeout`、`ReadTimeout`、`WriteTimeout` 与上游请求 deadline 要一起设计，不能用增大连接池掩盖
慢命令、下游过载或不受控并发。

## 七、所有操作都要继承可取消的 context

请求路径把传入的 `ctx` 一路传给 Redis；定时任务和 Worker 使用服务生命周期 `ctx`，再为单次操作
派生 timeout。不要在 repository 或刷新 goroutine 中换成 `context.Background()`，否则请求取消和服务
停止都无法终止工作。

go-redis v9.21.0 只有在 `ContextTimeoutEnabled` 开启时，才把 context 的 timeout/deadline 用于连接 I/O。
当前同构装配没有开启该选项，因此仍要正确配置 socket 的 `DialTimeout`、`ReadTimeout` 和
`WriteTimeout`；不能只包一层 `context.WithTimeout` 就假定阻塞 I/O 一定按该 deadline 返回。

`BLPop`、Pub/Sub 等长阻塞操作使用独立的服务生命周期，不要挂在一次 HTTP/gRPC 请求或无主 goroutine
上。退出时取消 `ctx` 并关闭对应对象。

## 八、读-改-写要用 WATCH,不要自己拼版本号

Redis 没有针对任意值的读-改-写原语。正确做法是 `Watch()` + `TxPipelined()`:
监视的键在期间被别人改过,`Exec` 返回 `redis.TxFailedErr`,**从读开始重试**(必须放在重试循环里)。

```go
for i := 0; i < maxRetries; i++ {
    err := rdb.Watch(ctx, func(tx *redis.Tx) error {
        cur, err := tx.Get(ctx, key).Result()
        if err != nil && err != redis.Nil { return err }
        _, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
            pipe.Set(ctx, key, next(cur), 0)
            return nil
        })
        return err
    }, key)
    if err == nil { break }
    if err == redis.TxFailedErr { continue } // 乐观锁失败,重来
    return err
}
```

⚠️ 这条对**库存**尤其重要。`inventory` 目前的乐观锁写在 SQL 里且是坏的
(WHERE 比对未来版本号、丢弃 execrows,见 `TODO.md` P0),而 TODO 里还计划引入
「Redis 分布式锁」。落地时注意:**锁必须带唯一 owner 与 TTL,解锁要用 Lua 校验 owner**
(否则会解掉别人的锁),并且**单实例 Redis 锁不是共识算法**——它降低冲突概率,
不能替代数据库层的最终一致性校验(库存扣减的 SQL 条件必须自带 `available >= @quantity`)。

续租也必须用 Lua 同时校验 owner 并更新 TTL。即使续租和解锁都正确，持有者仍可能在租约过期后继续
执行；会写入关键状态的流程还需要 fencing token 或数据库条件写，不能把 Redlock 的多数派成功直接
等同于业务正确性。抢锁重试必须受 `ctx`、次数和带抖动的退避约束。

## 九、单机 → Cluster:业务代码基本不用改

```go
rdb := redis.NewClusterClient(&redis.ClusterOptions{
    Addrs: []string{"redis-1:6379", "redis-2:6379"}, // 种子节点即可,拓扑自动发现
})
```

业务层照旧调 `Get`/`Set`。但**不是零成本**,迁移前要检查两件事:

- **跨槽多键操作会失败**(`MGET`/多键 Lua/事务跨 slot)。需要同槽的键要用 hash tag(`{user:1}:cart`);
- **Cluster 下没有多 DB**(`db` 只能是 0),本仓配置里的 `db` 字段在迁移时要归零。

另外:Dragonfly 的 Cluster 支持**需先验证**,不要假定与 Redis OSS 的拓扑行为一致。
真要改,改的是同构的 `buildRedis`——11 份一起改,并让 `LiveRedis` 的持有类型跟着变。

## 十、Redis 不是消息队列的替代品

Stream / Pub-Sub 能做消息,但适用面是**轻量事件通知、实时推送、短生命周期任务**。
大吞吐、复杂路由、长期留存、消费者组治理与重放,仍应交给 Kafka。

Pub/Sub 是 at-most-once 的即时投递：订阅者离线、断线或处理失败时，消息不会补发。`Publish()` 返回的
订阅者数量只表示当时匹配的订阅者，不是业务处理 ACK。长驻订阅还会持有专用连接；订阅循环必须在
连接关闭后从 `LiveRedis.Client()` 重新取得当前 Client、重建订阅并确认成功，不能永久抓住旧
`*redis.Client`。

本仓的现状是:订单的 EventBus 还是**进程内总线**、Kafka 依赖为 0(见 `TODO.md`),
所以「用 Redis 顶一下」看起来很诱人。**不要这么做**——事件是跨服务契约,
换掉传输层的代价远大于一次性接好 Kafka。真要临时过渡,必须在 TODO 写明是过渡态与退出条件。

## 十一、Key、TTL 与批量维护

共享 Redis/Dragonfly 时，Key 至少包含系统、服务、用途、schema 版本和业务标识，例如
`ecommerce:product:detail:v2:12345`。schema 版本允许新旧格式并行发布和按前缀退场，也能避免不同服务
碰撞。不要把密码、Token、邮箱或手机号等敏感明文放进 Key。

缓存、Session、临时状态和锁必须有 TTL。确需永久保留的 Key 要明确 owner、容量上限和清理方式。
需要 Cluster 多 Key 同槽时才使用 hash tag，例如 `ecommerce:cart:{user:42}:items`；花括号会改变 slot，
不要只为排版随意添加。

线上批量遍历使用 `SCAN`，不要使用会阻塞实例的 `KEYS`。`SCAN` 可能返回重复项，遍历期间的数据也会
变化，因此处理必须幂等；写入或删除继续按有上限的 Pipeline chunk 执行。删除大 Key 前先在目标
Redis OSS/Dragonfly 环境验证命令兼容性和延迟。

## 十二、健康检查

各服务的 `internal/server/health.go` 已把 `redis` 作为独立检查项(`CheckCache` → `Ping`),
与 `postgres` 分开报,不要合并成一个布尔值——合并后无法区分是哪一侧挂了。

`Ping` 只证明当次可以建立/借到连接并完成一个命令，不能证明连接池没有饱和。容量告警还要结合第六节
的等待、超时、连接数和命令延迟指标。

## 相关

- 本地地址与基础设施主机:[local-env.md](local-env.md)
- 指标与告警口径:[`observability/OBSERVABILITY.md`](../../docs/observability/OBSERVABILITY.md)
- 重试放大的前车之鉴:[`gateway/experience/retry-amplification-and-phantom-health-check.md`](../project/ecommerce/gateway/experience/retry-amplification-and-phantom-health-check.md)
- 官方文档:<https://redis.io/docs/latest/develop/clients/go/>
- go-redis v9 `Options`：<https://pkg.go.dev/github.com/redis/go-redis/v9#Options>
- OneUptime 教程（2026-01-07；缓存模式、连接池、Pipeline、Pub/Sub 与锁的示例来源；本页已按本仓约束修正）：
  <https://oneuptime.com/blog/post/2026-01-07-go-redis/view>
