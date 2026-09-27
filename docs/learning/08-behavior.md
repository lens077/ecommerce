# 08 行为与推荐：允许丢什么，不允许重复算什么

[学习入口](README.md) · 前置：[商品](06-product.md)、[平台](01-platform.md) · 关联：[搜索](07-search.md)

## 0. Git 证据：队列和补投第一版就有

原始 [f3fe86d3路线图](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L890-L898) 将个性化推荐放在第四阶段，behavior不在首期六服务中。它缺少某项高级推荐能力，不是最初交易MVP失败的首要原因。

本仓最早新增behavior的提交是 **`15994efb`（2026-08-02）**。已读取 [proto](https://github.com/lens077/ecommerce/blob/15994efb/backend/api/behavior/v1/behavior.proto)、[usecase](https://github.com/lens077/ecommerce/blob/15994efb/backend/services/behavior/internal/biz/usecase.go)、[recommend repo](https://github.com/lens077/ecommerce/blob/15994efb/backend/services/behavior/internal/data/recommend.go)：

- 当时就有Track/Recommend/SimilarItems，不是后来才追加三种职责。
- usecase原文：「Track只把事件塞进内存队列就返回」「队列写满时直接丢事件并计数」。这是明确的尽力而为设计，不是事后为丢失找借口。
- 同版已有Fx排空、PG落库、PendingSync补投、个性化/会话/最新降级，以及POST累加、PUT覆盖两种反馈。

因此应修正上一版的演进叙述：**不是先做纯CRUD，再逐步加队列和补投；第一版就组合了这些机制，而其重放假设从一开始就不完整。** 当前配置共享、动态client与optional_auth进一步改善运行接线，但没自动修复重复累加。

**扩展MVP判定：采集与召回的单服务切片已具备；浏览器→归因→目录补全→推荐效果和失败重放不能仅凭RPC存在算完整。生产判定：不满足可靠画像/多副本投递要求；可以在明确允许损失的受控实验中验证，不能作为支付/销量事实来源。** 最小后续优化优先为B2/B3的幂等和领取，不是先训练更复杂模型。

## 1. 最小业务范围：收行为、取推荐，不负责订单事实

最小模型是「用户看了商品 → 记录一次 read → 推荐返回一组商品标识」。它是浏览体验的旁路，不能因为推荐系统慢而阻止加购或下单。

- **埋点**：记录曝光、点击、停留等行为。
- **召回**：从大量商品里取出可能相关的候选，再展示或排序。
- **冷启动**：没有历史画像时仍需给出合理内容，例如本次会话或最新商品。
- **背压（Backpressure）**：下游处理不及时，让上游减速或明确拒绝，不能无限堆内存。
- **尽力而为（Best-effort）**：允许受控丢失、但要声明和度量；不能把它用于付款记账。
- **至少一次投递**：失败后重试，可能重复；接收方必须说明怎样去重或覆盖。

## 2. 当前实现的真实路径

[proto](../../backend/api/behavior/v1/behavior.proto) 提供 Track、Recommend、SimilarItems。ItemId 统一为 product 的 `spu_code`，不是 SKU ID；dwell 的 value 是秒，事件时间是毫秒。

```text
前端 tracker → Track → 有界内存队列 → 批量 flush
                                      ↓
                  Redis 曝光去重 → PostgreSQL events
                                      ↓
                       gorse feedback → 标 synced_at
                                      ↓ 失败
                        PendingSync → 再次投递
```

Recommend 根据登录/匿名身份选择 personalized/session，失败或无结果降级到 latest，再过滤 dislike。telemetry 在同一进程注册，但处理 Web Vitals，不属于购买事实。

源码入口：[service](../../backend/services/behavior/internal/service/behavior.go)、[usecase](../../backend/services/behavior/internal/biz/usecase.go)、[event repo](../../backend/services/behavior/internal/data/event.go)、[recommend repo](../../backend/services/behavior/internal/data/recommend.go)。

## 3. 第一版已有的工程化与后续加固

- 请求限制事件批次和 value 范围，纠正客户端时钟偏差。
- 有界队列满时返回 dropped，避免埋点拖死页面；进程记录累计丢弃量。
- Fx 停机 hook 尝试排空队列，时间受 shutdown deadline 约束。
- 曝光 Redis 去重只是优化，Redis 故障时保留事件继续写库。
- 先写 PostgreSQL，再推 gorse；不能让 gorse 成为唯一事实来源。
- 待同步事件用数据库记录补投，而不是只靠进程内重试。
- 推荐有多个降级策略，dislike 在本服务过滤。
- 共享 gorse client 区分累加 POST 和覆盖 PUT；工作树还有 LiveClient 热重建改造，尚未提交/发布的部分不能写成线上完成。

这恰恰适合学习：第一版已经用了队列和重试，仍不能自动证明可靠；要核对的是它们组合后的丢失、重复与并发语义。

## 4. 当前缺陷、已接受取舍和待验风险

### B1 accepted 不等于已落库

`Track` 成功只表示入内存队列。进程突然终止会丢未 flush 的事件；`flush` 保存失败也丢整批，不能从 DB 补投它们。

这对普通曝光可能是合理取舍，但必须在接口说明、观测和产品预期里一致。**purchase 埋点绝不能替代 payment 的已支付事件**，客户端可以伪造行为，也可以丢行为。

演进应先量队列丢弃、数据库保存失败、同步延迟；只有可验证业务需求要求可靠接收时，才把 accepted 的边界改为持久化成功。不能仅把通道改大就宣称可靠。

### B2 现有重试可能重复累计反馈

[PushFeedback](../../backend/services/behavior/internal/data/recommend.go) 将 read/impression 分到 InsertFeedback（POST 累加），其他分到 PutFeedback（PUT 覆盖）。但 usecase 的 `push` 注释声称三元组重复投递只覆盖。

这是可以从当前代码证明的语义冲突：

1. POST 在 gorse 成功。
2. 响应丢失，或随后 PUT/MarkSynced 失败。
3. DB 仍显示未同步。
4. retry 再 POST，同一事件再次累加。

**幂等不是「主键没重复」，而是业务效果没重复。** 同一行 value 从 1 变 2 仍然是重复副作用。

建议沿用 DB 作为事实源：为事件建立可去重身份，在 PG 汇总每个反馈三元组的绝对值，再同步 PUT。还要防旧快照晚到覆盖新快照，可用稳定分区/序列化同步与版本核对；不能只把 POST 全改 PUT 而仍逐条传 value=1，否则又把计次功能丢了。该方案需先验证当前 gorse 版本的接口语义。

### B3 多副本补投没有领取协议

`PendingSync` 是简单 SELECT 未同步记录，没有领取、租约或分区；两个副本可能同时取到同批事件，当前进程的 flush 与 retry 也可能重叠。

**可扩展**不等于把 replicas 从 1 改到 3。先把远端副作用变成幂等，再设计每个同步任务的领取与恢复；数据库行锁、租约或按 key 分区各有成本，应围绕吞吐与失败恢复验证选一条，不引入 Redis 作为永久事实锁。

### B4 匿名到登录画像还没闭环

`identity()` 优先取网关头，否则使用 `anon:` 前缀。matrix 已有 optional_auth 类别，因此不能继续说「源码仍放在 anonymous」；但上线、跨设备归因、匿名事件合并需独立验收。

同一请求可能同时含登录主体与 anonId。要明确谁可把匿名历史关联到用户、共享设备登出后如何隔离。不得单凭用户随便填写的 anonId 把他人的画像合并过来；持久关联与回填策略仍待实现。

## 5. 与其他模块的契约

| 对接方 | 关键约定 | 错配后果 |
|---|---|---|
| product → gorse | ItemId=spu_code；分类、上线状态与商品目录一致 | 推荐出无法展示/已下架商品，或把 SKU ID 当 SPU code |
| 前端 tracker → Track | 批次≤200、事件时刻毫秒、dwell 秒、身份由网关裁定 | value 量纲错、匿名身份串用户、超量 beacon 被拒 |
| 网关 → behavior | optional_auth：识别成功才注入；不能据此授权敏感动作 | 登录行为全落匿名，或将推荐接口变成越权入口 |
| payment/order → 推荐 | 真实 purchase 若需可靠性，来自可信业务事实 | 浏览器伪造支付污染训练，也不能据此发货 |
| PostgreSQL → gorse | 可重放投影；累加/覆盖/去重语义与版本一致 | 恢复时重复加分、多个 worker 相互覆盖 |

推荐 RPC 只返回 ItemId/Score，前端还需要商品展示数据。不要让推荐服务成为第二个商品目录；应定义批量取卡片的契约或复用经核实的读模型，并在商品下架后过滤。

## 6. 高内聚、低耦合的演进

把「采集」「持久化和投影同步」「推荐读取」分成清晰的内部模块，不必立刻拆成三个微服务。共享的是事实语义，不是为了少写几行把所有 SDK 混进一个公共 client。

高频 ingestion 的批量化、有界队列和 TTL 已有基础。性能优化应同时观察队列延迟、DB batch 延迟、pending 年龄、gorse 错误率；日志条数不能代替可聚合指标。消费者增长之前先验证多副本重复路径。

隐私上只收必要事件，区分匿名标识与登录身份，设计保留/删除路径；不把用户 token、手机号、地址放进 source 字段。

## 7. 三个动手实验

| 练习 | 具体故障 | 通过条件 |
|---|---|---|
| B-A 重放正确性 | gorse 已接收 POST，但客户端收到超时；再次补投 | 同一批业务反馈的最终计数不增加两次；覆盖类值和累加类值分别断言 |
| B-B 多副本恢复 | 两个 worker 同时处理同一批 pending，一方中途退出 | 不丢待同步记录、不重复业务效果；过期领取能恢复 |
| B-C 归因与丢弃 | 匿名/登录/登出切换、队列满、DB 故障、无效时间戳 | 返回 accepted/dropped 含义准确，身份不串，损失有指标而不是假装成功 |

当前行为 usecase 的这些专项回归覆盖不能从 telemetry 测试推导出来。已有 [telemetry_test](../../backend/services/behavior/internal/service/telemetry_test.go) 只证明同进程中的另一组行为；不要用「behavior 有测试文件」替代具体断言。
