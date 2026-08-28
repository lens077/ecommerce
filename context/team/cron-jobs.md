---
name: cron-jobs
layer: team
description: 定时/周期任务的执行边界——重叠、panic、超时、时区、优雅停止、多实例重复执行与「错过不补」；调度与执行分离（Postgres 任务表 / NATS JetStream）；robfig/cron 与 time.Ticker、K8s CronJob 的选型
---

# 定时任务约定

> 难的从来不是「按时调用一个函数」，而是**控制它的执行边界**。
> 下面每条对 `time.Ticker` 和 `robfig/cron` 同样成立——本仓现在全是前者。

## 一、现状：本仓没有 cron 库，周期任务都是 Ticker

`backend/go.mod` 里**没有 `robfig/cron`**。现有的周期性工作各自用 `time.NewTicker`：

| 位置 | 干什么 | 形状 |
|---|---|---|
| `*/internal/pkg/registry/consul.go` | Consul TTL 心跳（10 服务同构副本） | 固定周期，永不重叠 |
| `product/internal/biz/recommend.go:122` | 按 `updated_at` 游标增量同步 SPU 到 gorse | 串行循环，扫满一批立即续扫、不等下一个 tick |
| `behavior/internal/biz/usecase.go:268,312` | 事件批量 flush、失败重试 | 单 goroutine 消费队列 |
| 网关的主动健康检查、策略刷新（现由 sibling 仓 control-tower 承担） | 主动健康检查、策略刷新 | 固定周期 |

**判据**：单一固定周期、与组件生命周期绑定的 → 继续用 Ticker，不要为它引库。
出现**多条不同时间规则**（每天 2 点、每月 1 号、工作日）、需要动态增删任务、
需要统一的 panic/重叠/日志包装时，才值得引入 `robfig/cron`。

## 二、最大的坑：多实例重复执行——本仓当前是被**单副本掩盖**的

进程内调度器只认自己这个进程。三个副本就会在凌晨两点跑三次。

本仓现在集群里基本都是单副本，所以这个问题**还没暴露**。但 [`docs/DEVOPS.md`](../../docs/DEVOPS.md)
阶段 2 明确要求无状态服务扩到 ≥2 副本 + PDB——**扩副本那天，所有进程内定时任务会立刻变成重复执行**。
所以这是扩副本的前置条件，不是以后再说的事。

三种解法，按本仓成本排序：

1. **K8s CronJob**（推荐用于独立的、可单独启容器的任务：对账、清理、报表）。
   集群与 ArgoCD 都是现成的，调度与业务服务解耦，天然单实例；
2. **独立 worker 副本数固定为 1**（任务必须跑在业务进程里、依赖其内存状态时）。
   代价是它自己的可用性要单独考虑；
3. **分布式锁**（任务必须在每个业务实例里就地跑时的下策）。
   锁要带唯一 owner + TTL、Lua 校验 owner 解锁、考虑续期与租约过期——
   细则见 [`go-redis.md` 第五节](go-redis.md)。**单实例 Redis 锁不是共识算法**，
   它降低重复概率，不能替代任务本身的幂等。

无论选哪个，**任务本身必须幂等**。锁是优化，幂等是底线。

## 三、Ticker 的首次触发：本仓已经被咬过一次

`for { select { case <-ticker.C: ... } }` 的第一次执行发生在**一个完整周期之后**。
如果这个任务承担的是「让自己变得可见/可用」的职责，那段等待就是一个盲窗。

真实事故：Consul TTL check 注册后初始状态是 **critical**，而心跳 goroutine 进循环前
先等满一个 `ping_interval`(当时 25s) 才发第一次 `UpdateTTL(pass)`——于是每次后端启动都有
**25 秒「已注册但对外不可见」**，网关拿到空节点列表直接 503，表现为「刷几次才出数据」。
修法是**注册后立即补一次心跳**再进循环。详见
[`registry/experience/consul-ttl-first-ping-blind-window.md`](../project/ecommerce/registry/experience/consul-ttl-first-ping-blind-window.md)。

**约定**：写周期任务时显式决定「第一次要不要立刻执行」，并把决定写进注释。
`robfig/cron` 同理——`0 2 * * *` 注册完不会马上跑，需要冷启动数据的任务要自己补一次。

## 四、任务重叠

上一轮没跑完，下一轮又开始 → 重复写入、锁竞争、goroutine 持续增长。

`robfig/cron` 用 `JobWrapper` 处理（像 HTTP 中间件那样包装 Job）：

```go
c := cron.New(
    cron.WithLocation(loc),
    cron.WithChain(
        cron.Recover(cron.DefaultLogger),            // panic 恢复
        cron.SkipIfStillRunning(cron.DefaultLogger), // 上一轮没完就跳过这一轮
    ),
)
```

- `SkipIfStillRunning` —— 缓存刷新、状态同步、数据扫描这类**允许偶尔少跑一次**的任务；
- `DelayIfStillRunning` —— 每一轮都不能丢的任务。但**耗时长期大于间隔时延迟会无限累积**，
  那说明该改的是频率或任务本身，不是继续等。

Ticker 侧没有现成 wrapper，形状要自己保证。本仓 `product` 的同步循环是**正确示范**：
单 goroutine 串行执行，`syncOnce` 返回「是否追平」，没追平就立即续扫而不是等下一个 tick——
它天然不可能重叠，也不会因为积压 N 批就拖 N 个周期。

## 五、panic 与超时

**panic**：`robfig/cron` v3 **默认不 recover**；Ticker 起的后台 goroutine 更是一 panic 带走整个进程。
任何后台 goroutine 都要有 recover + 记完整堆栈 + 接告警。
但 recover 是最后一道保险，**不是错误处理**——业务错误照旧用 `error` 返回。

**超时**：调度器只负责触发，不会终止跑太久的函数。Job 内部必须自己建带超时的 context，
并**一路传到 pgx / redis / connect 调用**：

```go
func (j *ReconcileJob) Run() {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
    defer cancel()
    if err := j.svc.Reconcile(ctx); err != nil {
        j.log.Error("reconcile failed", zap.Error(err))
    }
}
```

只建 context 而不往下传，等于只创建了一个超时对象，任务本身仍然停不下来。

## 六、时区：必须显式设置

生产容器默认 UTC，开发机是 CST——同一份 `0 2 * * *` 在两处差 8 小时。

```go
loc, err := time.LoadLocation("Asia/Shanghai")   // 或按表达式：CRON_TZ=Asia/Shanghai 0 2 * * *
c := cron.New(cron.WithLocation(loc))
```

**不要依赖服务器默认时区**，并在启动日志里打印**当前时区 + 每个任务的下次执行时间**——
这是唯一能在上线时一眼看出配错的方法（对照本仓「配置在骗人」的两次前科）。

## 七、优雅停止：别把心跳挂在启动 context 上

`c.Stop()` 返回一个 context，停止新调度并等待在跑的任务结束：

```go
stopCtx := c.Stop()
select {
case <-stopCtx.Done():
case <-time.After(30 * time.Second): // Job 不支持取消时的兜底
}
```

接 fx 时挂 `OnStop`。⚠️ **反面教材（本仓真实 bug）**：inventory 的 Consul 心跳挂在
`OnStart` 的 ctx 上，而那个 ctx 只管启动超时、`OnStart` 一返回就被取消——心跳立刻退出，
服务 30s 后被 Consul 判死摘除。**长生命周期的后台任务用 `context.Background()` 派生，
用 `OnStop` 关，不要用 `OnStart` 的 ctx**（见 `TODO.md` 的 inventory 注册链路对齐）。

## 八、Cron 不保证任务一定执行

进程内调度器**不持久化、不补偿、不重试、无执行历史**。凌晨 2 点服务没跑，这次就是错过了，
3 点重启不会补。

因此**重要任务不能只依赖一次回调**。本仓已规划的这几个都属于这一类：

- 订单**超时兜底 job**（扫 `pay_deadline` / 卡在中间态的订单）—— 编舞式 Saga 无中心，
  这是必须存在的 backstop（`TODO.md` §二）；
- 支付**每日对账**与支付状态主动轮询（回调的兜底）；
- **库存定期对账**与流水修复；
- 将来的结算/佣金计算。

正确形状是把「调度」和「执行」拆开：

```
Cron/CronJob 只发「该执行了」的信号
      ↓
写任务表（与 Outbox 同源）或发消息
      ↓
Worker 幂等执行 + 失败重试 + 记录状态
      ↓
支持人工重跑与补偿
```

**这条链的两段现在都有现成载体**：**NATS JetStream 已在集群里跑**（`nats` ns，nats-0/1/2），
outbox relay 也已上线（`ecommerce-outbox-relay`）。所以「发消息」这一段不再是待建选项。

选哪个看**可靠性要求**，不看有没有 MQ：绝不能丢的任务（订单超时兜底、对账、结算）
仍走 **Postgres 任务表**——它能和 Outbox 同事务写入，这是 JetStream 给不了的；
其余可重发的走 JetStream。不要因为「觉得没有 MQ」就退回「一次 cron 回调直接干完」——
那正是对账类任务最容易悄悄漏掉一天的方式。

**越界信号**：当 cron 回调里开始堆 retry、recover、超时控制、状态记录、goroutine 池，
真正的业务代码反而越来越少时，说明调度器已经在承担 Worker 的职责。
这时候该拆的是架构（按上面的链路把执行挪出去），不是继续给回调打补丁。

## 八·五、Asynq：评估过，暂不采用

[Asynq](https://github.com/hibiken/asynq) 是 Go 生态基于 Redis 的分布式后台任务框架，
正好是上面那条链的现成实现（Enqueue → Redis 持久化 → 多 Worker 消费，
Retry/Timeout/Priority/Unique 都是框架属性）。**它不替代 Cron**——Cron 决定什么时候开始，
Asynq 决定能不能可靠地结束。

**结论：现阶段不引入。** 理由：可靠性上限 = Dragonfly 的持久化配置，
而绝不能丢的任务已由 Postgres 任务表覆盖（同事务写 Outbox）；它擅长的「量大、可重发」
负载（邮件、报表导出、图片处理）本仓暂时没有。第一个此类需求出现时**直接上 Asynq，
不要用 goroutine + channel 手搓半个任务系统**。

刷缓存、更新统计、清理临时文件这类轻任务，Ticker / cron 本身就够，不必为它入队。

## 八·六、Healthchecks：任务观察面，不是调度器

Healthchecks 只做 dead-man switch：任务按预期时间发送 `/start`、成功或 `/fail` 心跳；
信号缺失或任务主动报错时，它把检查标为异常。它不触发任务，也不拥有重试、锁、并发、
幂等、补偿和业务状态，因此以后引入 K8s CronJob、应用调度器或任务表时不构成重复调度。

接入约束：

- 调度和执行仍以 cron、systemd timer、K8s CronJob 或任务表为真相源；不要把同一份 schedule
  再配置成 Healthchecks 的执行规则。
- 心跳失败不能阻止或回滚原任务。请求必须设置短连接/总超时和有限重试，并用 best-effort 发送。
- 一个端到端任务对应一个 check；不要给内部每一步建一串检查，也不要为尚不存在的未来任务建占位检查。
- Ping UUID 和 project key 按凭据处理，只放本地 secret 或 K8s Secret，禁止进 Git。
- Healthchecks 与任务同机时只能发现任务失败、未执行和超时，无法在整机失联期间自行告警；
  要覆盖主机故障，观察端必须放到独立故障域。

2026-08-27 实况：node3 运行 Healthchecks v4.3，只监听 `127.0.0.1:8000`。当前唯一 check 是 `pgBackRest full backup`（24 小时周期 + 2 小时 grace），wrapper 为 `/etc/healthchecks/pg-backup-heartbeat.sh`，ping URL 位于 `/etc/healthchecks/pgbackrest.url`。通知使用 v4.3 原生 `ntfy` Channel 和 bearer token，不使用 generic webhook。start/success/fail 与 ntfy 都已实测；Healthchecks、任务和 ntfy bridge 仍同在 node3，整机失联风险未消除。

ZeroSSL 续期在 node1 `apikv-cert-renew.timer`，失败/成功直接发 ntfy，过期兜底由 Gatus 检查。Healthchecks 只监听 node3 loopback，因此不要为 node1 timer 创建一个无法发送的占位 check。

## 九、选型

| 用 | 适合 |
|---|---|
| `time.Ticker` | 单一固定周期、与组件生命周期绑定（心跳、flush、健康检查）——**本仓现状** |
| `robfig/cron` | 多条不同时间规则、需要动态增删、需要统一的重叠/panic/日志包装；单进程或单调度实例 |
| K8s CronJob | 任务可独立起容器、希望调度与业务解耦、天然单实例（对账、清理、报表）——**本仓首选** |
| NATS JetStream | 跨服务事件、可重发的异步链路——**集群已在跑**，配合 `ecommerce-outbox-relay`（§八） |
| Postgres 任务表 | 绝不能丢、要与业务数据同事务（Outbox 同源）、要人工补偿的任务（§八） |
| Redis 任务队列（Asynq） | 量大、可重发的后台工作（邮件、导出、推理触发）——**评估过，暂不引入**（§八·五） |

一句话：**Cron 只决定任务什么时候开始，能不能可靠地结束是另一套工程**——
是否幂等、会不会重叠、失败怎么办、重启会不会漏、多实例会不会重复。
后者靠队列 + Worker 的架构解决，不靠往 cron 回调里打补丁。

## 相关

- 分布式锁的落地要求：[go-redis.md](go-redis.md)
- 副本数与部署策略：[`docs/DEVOPS.md`](../../docs/DEVOPS.md)（阶段 2）
- 任务的指标与告警口径：[`observability/OBSERVABILITY.md`](../../docs/observability/OBSERVABILITY.md)
- 首次触发盲窗的完整复盘：[`registry/experience/consul-ttl-first-ping-blind-window.md`](../project/ecommerce/registry/experience/consul-ttl-first-ping-blind-window.md)
