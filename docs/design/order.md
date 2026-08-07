# 下单（CreateOrder）设计基线 v2

> 状态：设计基线（经 6 轮对抗评审收敛，9 个 P0 全部关闭；实现依赖 §14 前置改造）
> 日期：2026-08-08
> 范围：消费者下单主链（报价 → 提交 → 支付 → 库存确认 → 超时/退款自愈）；不含售后与履约实现
> 关联：`/DESIGN.md`（微服务总纲、库存状态机 :255、订单一致性决议）、`/TODO.md`（Outbox 决议 :167、cart RPC 缺口 :222、CreateOrder 假成功桩 :41）

## 0. 结论速览

- **checkout 并入 order 服务** application 层，不新建服务；`settlement` 名称保留给 DESIGN.md:121 既有的佣金/商家结算/对账服务。
- **正确性锚点是 Postgres，不是 Redis**：`order_request` 请求事实表（client_token 唯一约束 + fence_token 条件更新）承担幂等与 fencing；Redis 只存报价，允许丢失（退化为重新报价）。
- **v1 全成全败**：任一商家/SKU 不满足 → 整单失败，不落任何业务订单；部分成交是 v2 产品需求（需结算页显式勾选授权）。
- 库存交互**全组原子**：`ReserveGroup` / `ConfirmReservationGroup` / `ReleaseGroup`，一次请求一个库存事务，消灭跨商家补偿窗口与混合库存态。
- 支付把**资金事实**（payment_attempt，只增不改）与**订单接受**（order_group.accepted_pay_no，CAS 唯一）分开；订单取消后到达的成功支付一律自动退款，不复活订单。
- 跨服务副作用两条腿：同步链 = RPC + 持久化补偿任务；异步链 = **Outbox + Kafka + Inbox 幂等消费**（对齐 TODO.md:167 决议）。
- 履约门禁：只有 **OrderReadyForFulfillment**（库存确认成功后发出）可触发履约；OrderPaid 不再直接触发履约（**需修订 DESIGN.md:149 的事件订阅拓扑**）。
- 库存状态机对齐 DESIGN.md:255：支付确认 = 预占 → **locked**；发货完成才 locked → deducted。

## 1. 术语

| 术语 | 含义 |
|---|---|
| quote / 报价 | 结算页由服务端实时计价生成的商品明细 + 单价 + 总价快照，TTL 15 分钟，存 Redis |
| token（client_token） | 报价凭证兼幂等键，服务端签发的 uuid-v4，一个 token 背后是两条生命周期不同的记录：报价（Redis，短命）与请求事实（DB，永久） |
| order_request | 下单请求事实表。**失败可以没有业务订单，但不能没有请求事实** |
| attempt | 一次下单执行代次。同一 token 因崩溃/失约被接管时 attempt_no 递增，派生新 reservation_id |
| fence_token | 围栏令牌。每次认领/接管 order_request 时更新，最终落库事务以它做条件更新，失去租约的旧执行者无法提交 |
| reservation | 库存预占记录（头表 + 明细表），reservation_id = derive(client_token, attempt_no) |
| 墓碑 | ReleaseGroup 对不存在的 reservation 写入的 aborted 终态头记录，用于拒绝晚到的 ReserveGroup 复活 |

## 2. 流程总览

```text
[商品页] ──直接购买(sku+qty)──┐
[购物车] ──去结算(cartItemIds)─┴→ [结算页]
    CreateQuote：反查 cart / 批量取商品 / 库存展示 / 签发 token
    （地址列表由前端并行调 address 服务获取）
        │ 用户确认商品、价格、地址，点击「去支付」
        ▼
    CreateOrder(token, addressId, remark)
        认领 order_request → 复验报价 → ReserveGroup → 本地事务落库(带 fence) → 响应
        │ 成功：group_no + 子单列表 + pay_amount + pay_deadline
        ▼
    [收银台页]（凭 group_no 跳转，此时支付单不存在）
        │ 用户选渠道，点击「支付」
        ▼
    CreatePayment(group_no, channel, payment_request_id) → 渠道 pay_url
        │ 渠道回调
        ▼
    PaymentCaptured → order: paid → InventoryConfirmRequested
        → inventory: ConfirmReservationGroup（预占→locked）
        → InventoryConfirmed → OrderReadyForFulfillment
超时：cron 扫 pay_deadline → cancelled + OrderCancelled outbox → 消费者 ReleaseGroup
```

## 3. 数据模型变更

### 3.1 orders 库

**新表 `order_request`（请求事实，本设计的幂等与 fencing 锚点）**

| 列 | 说明 |
|---|---|
| client_token | UNIQUE。报价 token |
| user_id | 认领时的认证身份 |
| request_hash | hash(token, user_id, addressId, remark)。同 token 不同 hash → 明确 CONFLICT，防同 token 双地址并发时输家静默拿到别人地址的订单 |
| quote_hash | 报价内容摘要，审计用 |
| state | processing / succeeded / failed（failed 为终态业务失败，重放返回原错误） |
| business_error | 终态失败原因（错误码 + 明细），供幂等重放 |
| group_no / order_nos | **认领时生成并持久化**的全部业务编号（order_nos 为 merchant_id→order_no 映射）。重试复用，杜绝编号漂移 |
| attempt_no | 执行代次，fenced 接管时 +1 |
| fence_token / lease_until | 围栏令牌 + 租约（30s）。终态落库事务条件更新，零行即整笔回滚 |

**`order_group` 加列**：`status`（pending_payment/paid/cancelled，预留 partial_cancelled 不启用）、`pay_deadline`、`currency`、`client_token UNIQUE`（第二道防线）、`accepted_pay_no`、`inventory_status`（pending/confirmed/failed）。

**新表**：`outbox`（event_id、event_type、partition_key=group_no、payload、published_at）、`processed_event`（inbox，UNIQUE(consumer, event_id)）、`compensation_task`（挂 order_request 的 release_required 任务：reservation_id、状态、重试计数）、`job_run`（定时任务执行历史）。

### 3.2 inventory 库（breaking migration）

**`stock` 加 `reserved` 列**，不变量与操作矩阵修正为：

```text
不变量：available = on_hand - reserved - locked
Reserve:  available -= q, reserved += q
Confirm:  reserved  -= q, locked   += q      （支付确认，对齐 DESIGN.md:255 的「已锁定」）
Release:  reserved  -= q, available += q
Deduct:   locked    -= q, on_hand  -= q      （发货完成）
```

现有注释「available = on_hand - locked」（schema.sql:11）随迁移一并修正。

**新表 `reservation`（头）**：reservation_id UNIQUE、client_token、attempt_no、payload_hash、state（reserved/confirmed/released/**aborted**）、expire_at。
**新表 `reservation_item`（明细）**：UNIQUE(reservation_id, sku_id, warehouse_id)，行携带 merchant_id、order_no（审计关联，不做幂等键）、quantity。

**`change_log`**：撤销 `UNIQUE(order_no, change_type)`（多 SKU 多条 RESERVE 流水写不进去，现存 schema bug）；幂等职责上移 reservation 头表；改普通索引 (order_no, sku_id, change_type)；**只在状态真实迁移时写入**，幂等重放不产生流水。

### 3.3 payment 库（整体重建，现有单订单模型作废）

**新表 `payment_attempt`**：pay_no、group_no、`payment_request_id UNIQUE`（客户端生成：同一次点击的超时重试复用，用户主动重新发起用新 id）、channel、amount、currency、`capture_status`（created/pending/**captured**/failed/closed，captured 后不可逆——资金事实只增不改）、`refund_status`（none/pending/refunded/failed，独立轴）、channel_trade_no、回调审计字段。

**新表**：`refund_task`（UNIQUE(pay_no)，渠道退款 worker 的持久任务，指数退避）、payment 侧 outbox / processed_event。

**不设**「同 group 至多一条 succeeded」的部分唯一索引——两个渠道都真实扣款时，两行 captured 必须如实入库；唯一性在 `order_group.accepted_pay_no` 的 CAS 上。

## 4. 报价阶段 CreateQuote

- 入参两种形态（oneof）：`cart_item_ids`（购物车入口）| `sku_id + quantity`（直接购买入口）。
- 服务端动作（四路并行，总预算 2s）：
  1. cart 反查：`BatchGetCartItems(ids)` 强制附加 `user_id = 认证身份`，条数不符整单拒绝（防越权）；
  2. product：`BatchGetSkuForTrade`（批量返回单价/在售状态/归属 merchant_id）；
  3. merchant：批量可交易状态；
  4. inventory：`BatchGetStock` 仅供「仅剩 N 件」展示，**不做准入判断**（准入以 ReserveGroup 为准，查询结果在返回瞬间即过期）。
- 签发 token：uuid-v4（128 位随机不可枚举），Redis key `order:quote:{token}`，TTL 15 分钟，绑定内容：user_id、入口类型、完整 (sku, merchant, quantity, 单价分) 集合、总价、币种。
- Redis 定位与驱逐立场：**报价是唯一允许真丢的数据**（丢失退化为重新报价，无资损）。v1 沿用共享 Dragonfly（各服务连 DB 0，实例策略 allkeys-lru，maxmemory-policy 无法按 logical DB 配置），报价 miss 率进监控；miss 率影响转化时再上独立实例。**Redis 中不存在任何请求状态**（processing 等一律不进 Redis，见 §5）。
- 价格语义：购物车价仅展示；结算页价 = 用户确认价；提交时服务端复验，任何不符 → 拒单重报价。降价同样拒单重确认（规则统一，用户只会更高兴）。本凭证的准确名称是**报价版本校验**（quote validation），不是"价格确认"。

## 5. 提交阶段 CreateOrder

入参：`token + address_id + remark`，**不携带任何商品数据**——商品事实的唯一来源是 token 绑定的报价快照。报价后的购物车改动不影响本单（用户确认的是报价），作用于下一次报价。

### 5.1 认领算法（order_request）

```text
1. INSERT order_request ON CONFLICT(client_token) DO NOTHING
   成功 → attempt=1, fence=F1, lease=now+30s，group_no/order_nos 此刻生成并持久化 → 进主链
2. 冲突 → 读现状：
   succeeded → 校验 user_id + request_hash：
               通过 → 按 group_no 重建原响应返回（幂等重放 = 返回首次结果，不是拒绝）
               hash 不符 → CONFLICT（明确报错，不静默）
   failed    → 同上校验后返回原 business_error（失败也是幂等重放；想再买 = 新报价新 token）
   processing 且 lease 未过 → ALREADY_IN_PROGRESS，客户端退避
   processing 且 lease 已过 → fenced 接管：
       UPDATE ... SET fence=新值, attempt_no+1, lease=now+30s
        WHERE client_token=? AND state='processing' AND lease_until<now()
       零行 → 别人抢先 → ALREADY_IN_PROGRESS
       成功 → 同一事务写 compensation_task(release_required, 旧 reservation_id)
            → 以新 attempt 派生新 reservation_id 进主链
```

重放顺序强制为**先查 DB、后碰报价**：order_request 已终态则报价过期/Redis 丢失都不影响返回原结果（永久幂等）；未终态才加载并校验报价。属主校验在 DB 级（order_request.user_id / group.user_id 对认证身份），不符 → PERMISSION_DENIED，不回显订单内容。

### 5.2 主链

```text
认领 → 报价复验（product BatchGetSkuForTrade + merchant 状态；在售/归属/单价/数量逐项比对）
    失败 → 本地事务 order_request→failed(原因) → 返回业务错误（终态，可重放）
 → ReserveGroup(reservation_id, payload_hash, items[])      （全组原子，见 §6）
    缺货 → order_request→failed(缺货明细) → 返回
 → 本地事务 [ order_group + order_main + order_item + order_log(初始 pending_payment)
            + OrderCreated outbox（含 (cart_item_id, quoted_quantity) 列表）
            + order_request→succeeded
              WHERE client_token=? AND fence_token=? AND lease_until>now() ]
    条件更新零行 → 整笔回滚（失去租约的旧执行者被挡死）
    事务失败 → 写 compensation_task(release_required) → 系统错误返回（token 不消费，可重试）
 → 返回响应（§13）
```

拆单：按 merchant_id 分组生成子单；地址快照由 order 在本事务内拿 address_id 调 address 服务换取完整内容写入 8 个 `address_*` 字段（address 服务必须校验属主）。

### 5.3 错误分类

- **业务失败**（终态，消费报价）：OUT_OF_STOCK / OFF_SHELF / PRICE_CHANGED / MERCHANT_DISABLED / QUOTE_EXPIRED——只有下游返回**类型化业务错误码**才进此路径。
- **系统失败**（不终态，不动 token）：下游超时、UNAVAILABLE、DB 异常 → 返回 UNAVAILABLE；processing 租约到期后同 token 重试，撞唯一约束自然幂等。**绝不把系统错误混进缺货列表**。

### 5.4 上限与预算

单次下单 ≤ 10 个商家、≤ 50 个明细行、单行数量 ≤ 999（沿用 proto 校验）。CreateOrder 总预算 3s = 复验 500ms + ReserveGroup 1s + 本地事务 500ms + 裕量 1s。重试规则：只读 RPC 允许基础设施自动重试 1 次；**ReserveGroup 禁止任何基础设施层自动重试**，只允许应用层带同 reservation_id 的显式重试。熔断按下游服务粒度。

## 6. 库存契约

### 6.1 三个 RPC（替代现有逐商家 Reserve/ReleaseReserve）

- `ReserveGroup(reservation_id, payload_hash, items[]{merchant_id, order_no, sku_id, warehouse_id, quantity})`
  单个数据库事务内完成整组预占：行锁按 **sku_id 升序**（跨订单锁序一致防死锁），`UPDATE ... WHERE available >= ?` 影响行数不足即整组回滚。`order_no` 仅审计关联，幂等键是 reservation_id。
- `ConfirmReservationGroup(reservation_id)`：全组 reserved → locked，一次事务，杜绝"前三个 locked 第四个失败"的混合态。
- `ReleaseGroup(reservation_id)`：全组 reserved → available。**对不存在的 reservation 写 state=aborted 墓碑头记录**。

### 6.2 幂等规则（状态机吸收一切重放）

```text
reservation 状态机：(absent) → reserved → confirmed / released / aborted（三终态）
同 reservation_id 同 payload_hash 重试 → 返回首次结果
同 reservation_id 不同 payload_hash   → INVALID_ARGUMENT（暴露调用方 bug，不掩盖不重扣）
ReserveGroup 撞 released/aborted      → RESERVATION_ABORTED 终态错误，绝不复活
```

墓碑堵住的时序洞：fenced 接管者已 Release 旧 reservation_id，失去租约的旧执行者此刻才把 ReserveGroup 发到 inventory——无墓碑则凭空创建无人认领的预占；有墓碑则该请求失败，其落库又被 fence 挡住，两条路全死。

### 6.3 过期与对账

- `expire_at = pay_deadline + 30 分钟`；`pay_deadline = 创建 + 30 分钟`。裕量构成：取消扫描周期 1min + 渠道异步通知密集重试期 ~15min + 消息重投窗口 10min + 时钟偏差 2min，取整 30。超出裕量的极端迟到回调（支付宝全重试窗口 24h）不靠裕量兜，走退款路径（§7.4）。
- 预占泄漏三层防线：① order 侧 compensation_task 持久重试 ReleaseGroup；② inventory 对账任务（每分钟）——扫「reserved 且创建超 2 分钟」的 reservation，调 order 内部 RPC `GetOrderRequestState(client_token, attempt_no)`，**仅当 order 侧返回明确终态（failed，或该 attempt 已被更高代次接管）才释放；order 服务不可达（UNAVAILABLE）≠ NOT_FOUND，跳过本轮**——"当前查不到订单"不能证明"稍后不会提交"；③ expire_at 到期自动回收（最后防线）。
- 订单 paid 但 reservation 仍 reserved 超 10 分钟 → 对账补发 Confirm + 告警。

## 7. 支付

### 7.1 收银台与创建支付单

- 前端凭 group_no 跳收银台页（此时支付单不存在，收银台是页面不是渠道 url）。
- `CreatePayment(group_no, channel, payment_request_id, return_url)`：**金额、主体、币种全部服务端权威获取**——payment 调 order 核验 group 属于当前认证用户、status=pending_payment、未过 pay_deadline，再取 pay_amount。现有 payment.proto:27 客户端传 amount 的契约作废重定义。
- 多渠道 attempt 并存合法（用户换渠道是常态）；接受第一笔 captured 为 accepted_pay_no，其余 captured 一律进退款。

### 7.2 回调处理（payment 本地事务，完成后才 ack 渠道）

核验清单：验签、app_id、seller_id、out_trade_no 对应 attempt 存在且属本系统、total_amount 与支付单**逐分相等**、currency、trade_status 到本地状态机的合法迁移。金额不符 = 资损级告警 + 不 ack。同一事务内：持久化回调原文 + attempt 状态 CAS 迁移 + 写 `PaymentCaptured` outbox。重复回调 → CAS 零行 → 直接 ack（幂等）；captured 后到达的关闭通知 → 忽略 + 审计。

### 7.3 支付后事件链（履约门禁）

```text
PaymentCaptured
 → order 消费（inbox 去重，单本地事务）：
     CAS pending_payment→paid 成功 → 置 accepted_pay_no + 写 order_log
                                   + InventoryConfirmRequested outbox
     发现 group 已 cancelled       → 同事务写 PaymentRefundRequested outbox   ← 晚到支付的可靠触发点
 → inventory 消费：ConfirmReservationGroup
     成功 → InventoryConfirmed → order 置 inventory_status=confirmed
                               → OrderReadyForFulfillment outbox（履约唯一入口）
     失败(RESERVATION_EXPIRED 等) → InventoryConfirmationFailed 显式事件
         （consumer 返回错误只会重投自己，业务失败必须用事件说出来）
 → order 消费 InventoryConfirmationFailed：
     自动补占一次（新 attempt 派生新 reservation_id → 重发 ConfirmRequested）
     仍失败 → inventory_status=failed → PaymentRefundRequested + 告警
     （补占限一次：无限补占在缺货热点上是重试风暴，退款是确定性出口）
```

OrderPaid 不再被履约订阅（DESIGN.md:149 需随本设计修订）；`ReleaseLocked/Unlock`（已确认后的售后退款）本期只定义契约不实现。

### 7.4 退款

规则唯一：**订单取消后到达的成功支付一律退款，不复活订单**（复活需重新抢库存、可能失败、语义分叉；退款是确定性的）。refund_task 以 pay_no 唯一，worker 指数退避调渠道退款；对账任务比对「已取消订单 × captured 支付流水」发现漏建任务并告警。

## 8. 超时取消

- cron（每分钟）扫 `status=pending_payment AND pay_deadline<now()`，**只做本地事务**：CAS 置 cancelled + order_log + `OrderCancelled` outbox，三者同库同事务；**ReleaseGroup 由消费者驱动**，失败重投直至成功。"先提交后补偿"因补偿持久化在 outbox 而安全——不依赖再扫 pending_payment，不需要 cancelling 中间态。
- 与支付回调的竞态：双方都是条件更新（WHERE status='pending_payment'），先到先赢，零行即认输退出；输掉的回调走 §7.3 的 cancelled 分支退款。
- 多副本：K8s CronJob `concurrencyPolicy: Forbid` + 应用内 `FOR UPDATE SKIP LOCKED` 批量领取 + CAS 幂等，三层防重。
- 运维参数：批 100 行、循环至空批或单轮 30s 预算、索引 `(order_status, pay_deadline)`、失败行下轮重扫、执行历史落 job_run、指标含处理量与**滞留订单最老年龄**（告警项）。

## 9. Outbox / Inbox 硬性契约

- 事件带全局 event_id；partition key = group_no（同组保序）；relay 收到 Kafka ack 才标 published，标记前崩溃允许重复投递。
- 每个消费者：`processed_event` 唯一约束（consumer, event_id）+ 业务更新 + 下游 outbox **三者同一本地事务**——幂等消费是表结构不是口号。
- 语义边界：**允许重复，不允许已确认事件不可追踪地丢失**。报价（Redis）是全系统唯一允许真丢的数据。
- 监控：outbox 未发布滞留年龄、消费 lag、死信告警。

## 10. 正确性论证

不变量：**链路上每一个改状态的 RPC 都有调用方生成的稳定幂等键，效果侧有唯一约束或吸收态状态机；每一个跨服务副作用，要么是同步调用 + 持久化补偿任务，要么是 outbox 至少一次投递 + inbox 幂等消费。**

「服务端实际成功、调用方只收到超时」逐环验证：

| 环节 | 重试语义 | 防线 |
|---|---|---|
| CreateOrder | 同 token 重试 | order_request client_token 唯一 → 返回首单；fence 挡旧执行者 |
| ReserveGroup | 同 reservation_id 重试 | reservation 唯一键 → 返回首次结果；不同 hash → 报错；墓碑拒复活 |
| 建单失败但已预占 | — | compensation_task / 对账 / expire_at 三层释放，泄漏有上限且自愈 |
| CreatePayment | 同 payment_request_id 重试 | attempt 唯一键 |
| 回调重复/乱序 | — | attempt 与 group 条件更新，终态吸收 |
| 双渠道双扣款 | — | 两行 captured 如实入库；accepted_pay_no CAS 取一；其余退款 |
| 「已付款无订单」 | — | 不可能：CreatePayment 前置校验订单存在且可支付，因果序保证 |
| 「已付款无库存」 | — | 有界：expire_at 裕量覆盖正常迟到；超界走补占一次或退款，钱货两清必居其一 |

事实源表述：正确性不是某一个 Postgres 单独保证的。**order、payment、inventory 三个数据库加支付渠道共四个权威事实源，各自靠唯一约束和条件状态迁移守住本域，域间靠可靠事件传播、靠对账收敛。**单一真相源在本系统不存在，存在的是收敛机制。

## 11. 身份与授权

- user_id **只**取网关 JWT 过滤器验证后注入的 `UserIdMetadataKey`（x-md-global-user-id，jwt.go:294），永不从请求体或 token 内容取。order 现有桩读 UserNameMetadataKey（order.go:33）是要修的错。
- 网关硬规则：转发前**剥离入站请求携带的全部 x-md-global-\* 头**再注入，防伪造。
- cart 反查恒带 user_id；address 服务校验 addressId 属主；token 校验 quote.user_id == 认证身份；重放校验 DB 级属主（§5.1）。
- 网关路由与 RBAC：CreateQuote/CreateOrder/CreatePayment → consumer；渠道回调匿名放行、可信性靠验签；GetOrderRequestState 为服务间内部 RPC 不过网关。

## 12. 金额规范

全链路整数分（int64）：新建共享 money 类型——checked add/mul（溢出即错）、与 pgtype.Numeric 无损互转、上限对齐 DECIMAL(10,2)。现有 `NumericToFloat`（numeric.go:9，float64 路径）在订单链路**禁用并逐步消灭**。小计 = 单价分 × 数量，总价 = 求和，纯乘加无舍入；未来分摊类除法用银行家舍入。币种 v1 固定 CNY，响应显式携带。

## 13. 响应契约（CreateOrderResponse）

- 成功：`group_no`、`orders[]{order_no, merchant_id, merchant_name, pay_amount}`、总 `pay_amount`、`currency`、`pay_deadline`。全成全败下不存在 per-order 混合状态字段。
- 业务失败：**无 group_no、无 order_no**（什么都没落库，返回了就是撒谎）；错误码 + 明细 `[]{cart_item_id?(直接购买为空), sku_id, sku_name, requested_quantity, available_quantity, reason}`，reason ∈ OUT_OF_STOCK/OFF_SHELF/PRICE_CHANGED/MERCHANT_DISABLED；QUOTE_EXPIRED 用独立错误码。
- 前端处置：购物车入口 → 回购物车页标记缺货项（条目本来就没被移除，不存在"放回"）；直接购买 → 停留结算页提示，**不**自动加入购物车。

## 14. 前置改造与完整改动清单

### 前置（动 order 主体之前，按序）

0. **止血**：CreateOrder 假成功桩（TODO.md:41）先改显式 Unimplemented。
1. **inventory breaking migration**：stock.reserved 列 + 不变量修正、reservation 头/明细表、change_log 约束迁移、墓碑语义；ReserveGroup/ConfirmReservationGroup/ReleaseGroup、BatchGetStock 查询接口。
2. **cart**：`BatchGetCartItems`（ids + user_id）、`BatchConsumeCartItems`（**按数量核销**：现数量 ≤ 报价数量则删行，否则减报价数量——报价 1 件、用户已改 3 件时不误删整行；TODO.md:222 的批量查询即此项）。
3. **product**：`BatchGetSkuForTrade`（现仅有按 spu_code 的单查，product.proto:11）。
4. **merchant**：批量可交易状态查询（现无任何状态 RPC，merchant.proto:10）。
5. **pkg/money 整数分类型**（§12）。
6. **payment schema 重建**（§3.3）。

### 改动清单

- proto：order（CreateQuote 新增、CreateOrderRequest/Response 重定义、GetOrderRequestState 内部 RPC）、inventory（三个 Group RPC + 查询）、payment（CreatePayment 契约重做）、cart/product/merchant（前置项）。
- DB migration：orders（order_request、group 加列、outbox、processed_event、compensation_task、job_run）、inventory（§3.2）、payment（§3.3 + refund_task）。
- 基础设施：Kafka relay、消费者（order/inventory/payment 各自的 inbox 消费）、两个 cron（超时取消、库存对账）、退款 worker。
- 网关：三条消费者路由 + RBAC、回调放行、x-md-global-* 剥离。
- 文档修订：DESIGN.md:149 事件订阅拓扑（履约改挂 OrderReadyForFulfillment）、DESIGN.md 库存公式注释。
- 配置 seed、deploy 清单、`.service-matrix.yaml`、监控指标与告警（§6.3/§8/§9 所列）。

## 15. 验收测试矩阵（定稿门槛，全绿前不称定稿）

1. 并发重复提交（同 token 双请求）→ 恰好一单，输家拿到相同响应
2. 同 token 不同 request_hash（双地址并发）→ 一单成功 + 一个明确 CONFLICT
3. ReserveGroup 成功但 RPC 超时 → 重试返回首次结果，库存只扣一份
4. 订单事务失败 → 补偿释放 → 同 token 重试新 attempt 成功；旧 reservation 不可复用
5. fenced 接管：租约过期后旧执行者复活 → 其落库被 fence 拒绝、其晚到 Reserve 被墓碑拒绝
6. 重复支付回调 / 乱序（captured 后收 close）→ 状态不变，正常 ack
7. 双渠道双扣款 → 两行 captured、一个 accepted、另一笔自动退款
8. 取消后晚到成功回调 → 不复活订单，PaymentRefundRequested 可靠产生
9. Confirm 遇 RESERVATION_EXPIRED → 补占一次成功续链；再失败 → 退款 + 告警
10. 多实例定时任务并跑 → 无重复取消、无重复释放
11. outbox relay 在 Kafka ack 后、标记前崩溃 → 事件重复投递，消费者 inbox 去重
12. Redis 报价全丢 → 已成单 token 重放仍返回原结果；未成单强制重新报价；无重复下单
13. 越权：他人 token / 他人 cartItemId / 他人 addressId → 全部 PERMISSION_DENIED 且不泄露内容
14. 库存不变量：任意操作序列后 available + reserved + locked == on_hand 恒成立（属性测试）

## 16. v1 明确不做 / v2 展望

**不做**：运费、优惠（字段保留恒 0）、凑单包邮、部分成交（v2 需结算页显式授权勾选）、超卖（商家自行虚报库存）、延迟消息优化（先用扫表）、ReleaseLocked 售后释放（契约已定义）、独立报价 Redis 实例（miss 率驱动）。

## 17. 决策演进记录（对抗评审 6 轮）

| # | 初始主张 | 被击穿点 | 终决策 |
|---|---|---|---|
| 1 | 先写 order_group 再查库存 | 半成品落库、幽灵订单 | 先校验预占后落库，失败无业务订单 |
| 2 | 只"检查"库存 | 检查通过≠拿到货，TOCTOU 超卖 | ReserveGroup 预占为准，查询仅展示 |
| 3 | 前端随机 reqid 防重 | 刷新/重试即新 id，防不住 | 服务端签发 token |
| 4 | Redis SETNX 当幂等 | 原子性撑不住 RPC 边界、租约无法 fencing | order_request + client_token 唯一 + fence_token，Redis 只存报价 |
| 5 | 重放拒绝 | 响应丢失后客户端无法恢复 | 幂等重放返回首次结果（含原业务错误） |
| 6 | settlement 独立微服务 | 与 DESIGN.md 结算服务撞名；只有临时数据+编排 | checkout 并入 order application 层 |
| 7 | 部分商家成交 | 产品决策被技术默认；重试/响应语义全烂 | v1 全成全败 |
| 8 | 逐商家 Reserve | 同库何必拆调用；补偿窗口+预算矛盾 | ReserveGroup 全组原子 |
| 9 | 限制商家改价频率解决价格竞态 | 窗口变窄洞还在 | 提交时报价版本校验，不符拒单 |
| 10 | 同步调 RemoveCartItem 清购物车 | 失败即永久残留；整行删误伤后改数量 | OrderCreated 消费者按数量核销 |
| 11 | 「至多一条 succeeded」唯一索引 | 篡改资金事实 | payment_attempt 如实记录 + accepted_pay_no CAS |
| 12 | Confirm=「转实扣」 | 与 DESIGN.md:255 冲突 | Confirm=locked，发货才 deducted |
| 13 | cron 内直接远程 Release | DB 提交与 RPC 不可能原子 | 本地事务 CAS+outbox，消费者释放 |
| 14 | OrderPaid 触发履约 | 补占失败退款时货可能已发 | OrderReadyForFulfillment 门禁 |
| 15 | 「唯一不撒谎的是 Postgres」 | 系统有四个权威事实源 | 各域唯一约束+条件迁移，域间事件+对账收敛 |
