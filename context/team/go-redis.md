---
name: go-redis
layer: team
description: go-redis v9 在本仓的用法约定——客户端生命周期(热重建下必须每次取 Client())、redis.Nil 不是错误、Pipeline 的错误语义、自动重试对非幂等命令的含义、WATCH 乐观锁、Cluster 迁移
---

# go-redis 使用约定

依赖:`github.com/redis/go-redis/v9 v9.21.0`(`backend/go.mod:22`)。
11 个服务的客户端装配是同构副本(`internal/data/data.go` 的 `NewRedisClient` + `buildRedis`,
`internal/data/live.go` 的 `LiveRedis`),由 `backend/structcheck` 在 CI 强制,**改一个必须同步全部**。

> 连的**不是原生 Redis 而是 Dragonfly**(`dragonfly.app.com:443`,见 [local-env.md](local-env.md))。
> 它兼容 RESP 协议与常用命令,但不等于 Redis 的全部特性都在。用到下面标注「需先验证」的能力
> (Cluster 拓扑、Stream 消费组、模块类命令)之前,先在目标环境实测,不要照搬 Redis 文档的结论。

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

配置项由 `internal/conf/v1/conf.proto` 的 `Data.Cache.Redis` 定义(host/port/db、三个 timeout、
`pool_size`、`min_idle_conns`、`tls`),实际值在 Consul KV `ecommerce/<service>/dev.yml`。
**凭据不进仓库**(硬规则 4)。

⚠️ 当前 TLS 走 `insecure_skip_verify`,等于只加密不校验身份。生产化时应换成配 `ca_pem` 校验。

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

## 三、Pipeline:省的是网络往返,不是 Redis 的执行时间

批量读写时逐条发命令,每条都是一次 RTT。`Pipeline()` 把 N 条命令一次发出、一次收回。

三条语义必须记住:

1. **`Exec()` 之前拿不到结果**。命令返回的 `*Cmd` 要先存下来,`Exec()` 之后再读 `.Val()`/`.Result()`;
2. **错误从 `Exec()` 出来**,不是从单条命令出来;
3. **Pipeline 没有原子性**,其他客户端的命令可以穿插进来。要原子性用 `TxPipeline()`(MULTI/EXEC)。

本仓样例:`behavior/internal/data/event.go:150` 用 pipeline 批量 `SetNX` 做曝光去重——
先把每条命令的 `*redis.BoolCmd` 连同下标存进 candidates,`Exec` 之后再逐个读结果,
正是上面第 1 条的写法。

## 四、自动重试:非幂等命令可能执行不止一次

go-redis **默认 `MaxRetries: 3`**(退避 8ms→512ms),默认超时 dial 5s / read 3s / write 3s。
这意味着 `INCR`、`LPUSH`、`SetNX` 这类有副作用的命令在网络抖动时**可能被执行多次**。

本仓对这个坑有前科:网关的无条件重试与路由 `attempts` 相乘,让一个非幂等 POST 最多打上游 6 次
(见 [`gateway/experience/retry-amplification-and-phantom-health-check.md`](../project/ecommerce/gateway/experience/retry-amplification-and-phantom-health-check.md))。
Redis 侧同理:**要么让操作幂等(带唯一键的 SetNX、幂等的 Set),要么显式调小 `MaxRetries`**,
不要默认「客户端重试是安全的」。

超时值调得太短会把本可成功的命令变成重试,太长会让请求挂在那儿——两边都要看监控调,
指标口径见 [`observability/OBSERVABILITY.md`](../../observability/OBSERVABILITY.md)
(Redis 连接数/命中率/响应时间/错误数,以及命中率↓与 DB QPS↑ 的联动)。

## 五、读-改-写要用 WATCH,不要自己拼版本号

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

## 六、单机 → Cluster:业务代码基本不用改

```go
rdb := redis.NewClusterClient(&redis.ClusterOptions{
    Addrs: []string{"redis-1:6379", "redis-2:6379"}, // 种子节点即可,拓扑自动发现
})
```

业务层照旧调 `Get`/`Set`。但**不是零成本**,迁移前要检查两件事:

- **跨槽多键操作会失败**(`MGET`/多键 Lua/事务跨 slot)。需要同槽的键要用 hash tag(`{user:1}:cart`);
- **Cluster 下没有多 DB**(`db` 只能是 0),本仓配置里的 `db` 字段在迁移时要归零。

另外:Dragonfly 的 Cluster 支持**需先验证**,不要假定与 Redis 拓扑行为一致。
真要改,改的是同构的 `buildRedis`——11 份一起改,并让 `LiveRedis` 的持有类型跟着变。

## 七、Redis 不是消息队列的替代品

Stream / Pub-Sub 能做消息,但适用面是**轻量事件通知、实时推送、短生命周期任务**。
大吞吐、复杂路由、长期留存、消费者组治理与重放,仍应交给 Kafka。

本仓的现状是:订单的 EventBus 还是**进程内总线**、Kafka 依赖为 0(见 `TODO.md`),
所以「用 Redis 顶一下」看起来很诱人。**不要这么做**——事件是跨服务契约,
换掉传输层的代价远大于一次性接好 Kafka。真要临时过渡,必须在 TODO 写明是过渡态与退出条件。

## 八、健康检查

各服务的 `internal/server/health.go` 已把 `redis` 作为独立检查项(`CheckCache` → `Ping`),
与 `postgres` 分开报,不要合并成一个布尔值——合并后无法区分是哪一侧挂了。

## 相关

- 本地地址与基础设施主机:[local-env.md](local-env.md)
- 指标与告警口径:[`observability/OBSERVABILITY.md`](../../observability/OBSERVABILITY.md)
- 重试放大的前车之鉴:[`gateway/experience/retry-amplification-and-phantom-health-check.md`](../project/ecommerce/gateway/experience/retry-amplification-and-phantom-health-check.md)
- 官方文档:<https://redis.io/docs/latest/develop/clients/go/>
