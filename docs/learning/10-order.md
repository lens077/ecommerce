# 10 订单：不是把购物车 JSON 存下来，而是作出交易承诺

[学习入口](README.md) · 前置：[购物车](02-cart.md)、[地址](04-address.md)、[商品](06-product.md)、[库存](09-inventory.md) · 下一课：[支付](11-payment.md)

## 0. Git 证据：订单从来不是「空响应就完成」

[f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md)（2026-02-25）已经要求订单生命周期、跨服务库存/支付协同和完整购物MVP。最早可读的 [87d88d00 application](https://github.com/lens077/ecommerce/blob/87d88d00/backend/services/order/internal/biz/application/order.go)（05-12）列出了身份、cart、商家拆单、核价库存、地址快照、金额编号、落库的步骤，但都是注释，返回nil；当时data创建还是panic。**有流程清单不是当时已做了简单建单。**

| 演进节点 | 当时实际实现/设计 | 当前限制或后续纠偏 |
|---|---|---|
| [3d079177 data](https://github.com/lens077/ecommerce/blob/3d079177/backend/services/order/internal/data/order.go)，05-15 | GetOrderByNo开始真实查询；SaveOrder/SaveOrderGroup只写日志 | 能读不代表能建，空保存持续至当前 |
| [6994d050 data](https://github.com/lens077/ecommerce/blob/6994d050/backend/services/order/internal/data/order.go)，07-26 | Data.DB(ctx)、命令/查询DTO与错误处理改造 | 结构改善，但保存实现没有随之落地 |
| [cdad0646 checkout v1](https://github.com/lens077/ecommerce/blob/cdad0646/docs/design/order/checkout.md)，08-08 | 独立settlement、短命Redis报价、逐商家预占、允许部分成单、成功拒绝重放等默认草案 | 它不是最初作者MVP；与后续全成全败和请求事实方案不同，不能继续照做 |
| [48bbd5d6 checkout v2](https://github.com/lens077/ecommerce/blob/48bbd5d6/docs/design/order/checkout.md)，08-28 | order内编排、PG请求事实/fence、整组原子、重放原结果、可靠补偿和履约门槛 | 解决缓存丢键/双提交/部分预占/双扣款事实等问题，但设计存在不代表现代码实现 |

当前checkout文首自署08-08不代表v2在08-08已存在；Git中该日blob还是v1。这也是历史还原必须读内容的原因。

**原始MVP判定：不满足。** 真正建单、库存预占、支付后状态同步与可查询结果都是首期要求，不是生产强化附加项。**生产判定：不满足**，O1/O2假成功就是阻断，不必先谈容量。未来按现行v2落实而非重新启用旧v1；先止假成功，再做一个可重读的真实订单事务。

## 1. 最小闭环与核心术语

用户确认一组商品、地址和价格，系统承诺为他创建可查询、可支付、可取消的订单。最小闭环也要核验购买主体、权威价格与库存，不能只返回一个空对象。

- **OrderGroup**：一次结账的整体，跨商家子单的展示与支付聚合。
- **MerchantOrder**：归属一个商家的子订单；拆单不等于把一次交易拆成互不相关的多次请求。
- **OrderLine / 快照**：固化商品、价格、收件信息，未来源数据变化不能篡改历史订单。
- **聚合（Aggregate）**：一组由统一入口维护不变量的领域对象；不是随便把几个struct放一起。
- **命令/查询分离**：改状态与读结果分清。代码有两个接口，不意味着已经完成全部 CQRS 架构。
- **Saga**：把多个本地事务组织成可恢复流程，失败有明确补偿；不是一个包住所有RPC的大数据库事务。
- **Fencing（围栏）**：新的执行代次获得新令牌，数据库拒绝失去租约的旧执行者继续提交。

类比：下单是一份合同，不是购物车截图；系统不能收到合同后只写一条日志就说「已签署」。

## 2. 现有代码已经长出哪些结构

[order.proto](../../backend/api/order/v1/order.proto) 只有 CreateOrder、CompleteOrder。CreateOrderResponse 和 Order 仍是空消息。

已有命令/查询接口、[领域实体](../../backend/services/order/internal/biz/domain/entity.go)、订单组/订单/明细/日志 [迁移](../../backend/services/order/internal/data/migrations/00001_order.sql)、状态守卫和集中 [错误映射](../../backend/services/order/internal/service/order.go)。

这些结构为后续实现留好了位置，但不能把类名 OrderCommandUseCase、事件总线、状态枚举当成流程已落地。

核查时 matrix 的 order `depends_on=[]`，inventory/product/address 只登记计划依赖；checkout 还要求 cart/merchant 的契约配套，尚不能声称已联网执行。

## 3. 当前断点：先看成功的含义

### O1 CreateOrder 没处理请求就成功

[service/order.go](../../backend/services/order/internal/service/order.go) 没读取请求主体，向 domain 传空商品、零地址和空备注；[application/order.go](../../backend/services/order/internal/biz/application/order.go) 的流程只有注释，返回空响应与 nil。

**错误返回 nil 意味着调用方可以继续后续动作。** 因此这比明确 Unimplemented 更危险：当前 [CheckoutPage](../../frontend/apps/consumer/src/components/checkout/CheckoutPage.tsx) 已从路由文件拆出，在RPC成功后仍跳固定支付结果页，缺少真实group_no/支付状态契约。

工作树已有新防护：核对全部选中条目与服务端快照的ID/数量/单价/SKU/SPU/商家一致，不再静默过滤本地条目，并用ref防本页双击。这些值得保留，但不能填补后端空成功、DB未写入和服务端幂等的缺口。

第一步不是堆功能，而是止住假成功：未实现路径明确失败，UI不进入成功状态。开发中的可用切片要有真实数据证据。

### O2 SaveOrder/SaveOrderGroup 只日志，不写库

[data/order.go](../../backend/services/order/internal/data/order.go) 的两个方法返回 nil，但未执行订单写入。CompleteOrder 修改内存聚合后调用 SaveOrder，再向事件总线发布。

[进程内 eventbus](../../backend/services/order/internal/eventbus/eventbus.go) 有缓冲和丢弃策略，不是事务 Outbox；当前事件 handler 主要记日志，不能把它写成「通知商家、积分、履约已实现」。

把进程内消息换成 Kafka 并不能单独修好：数据库事务回滚时，已经发送的事件无法自动撤销；数据库提交后进程崩溃，尚未发送的事件会丢。真正的边界是业务与 Outbox 记录同事务。

### O3 地址、商家与金额类型不一致

现 proto 地址ID是UUID字符串，domain请求仍有整数地址ID；merchant_id 在部分domain与SQL间混用整数/UUID。金额读取还经 NumericToFloat；邮编允许NULL，但映射直接解引用。

这些不是格式小问题：UUID不能通过强制转整数变成正确地址，NULL也不是空字符串的自动别名。必须按接口语义统一，然后重生成/回归。可空邮编映射要明确「没有邮编」的含义，不能 panic。

### O4 幂等、恢复与对象权限仍未形成闭环

前端禁按钮不能挡两标签页/重试。服务必须从可信主体认领请求、检查地址/购物车归属，并记录请求结果。CompleteOrder 也需核查主体、当前状态和履约前置条件，不因 orderNo合法就允许状态跳转。

## 4. 以既定 checkout v2 为路线，不恢复旧草稿

[checkout v2](../design/order/checkout.md) 已决定：

```text
CreateQuote → 权威商品/价格/归属核验 → 签发client_token
                    ↓
CreateOrder(token,addressId,remark)
  → 原子认领order_request
  → 复验报价
  → inventory组原子预占
  → 订单组/子单/明细/请求结果本地事务提交（带fence）
  → 返回group_no、金额、期限
                    ↓
收银台 → CreatePayment → 资金结果 → 订单接受 → 库存确认
```

**请求事实**与**业务订单**是两件事。业务失败可以没有订单，但应能解释这次 token 发生了什么。这样网络超时后查询/重试不会凭空产生第二份合同。

同 token 同请求重放原结果；同 token 换了地址/备注要核对 request_hash 并明确冲突。报价缓存可丢，但已经创建订单的幂等事实不能跟 Redis TTL一起消失。

## 5. 每条跨服务边界都要写完整

| 对接 | 需要的业务能力 | 失败时的责任 |
|---|---|---|
| cart | 当前主体的真实条目与快照数量 | 不存在/他人条目拒绝；完成后的数量核销幂等 |
| product | 批量可售状态与权威价格 | 商品下架/改价要求重新确认，不信客户端快照 |
| merchant | 商家资格与经营快照 | 不向不能接单的主体成交；历史快照不随改名变化 |
| address | 属于主体的地址内容 | 不仅取一个UUID；快照持久化后不反复回查 |
| inventory | Group预占、确认、释放与结果查询 | 超时结果未知；失败需要可持久恢复的补偿 |
| payment | 支付尝试与真实资金事实 | 订单只能接受一笔；晚到/多扣款走退款，不抹掉资金事实 |
| 前端 | group_no、子单、金额单位、支付期限、状态 | 下单成功跳收银台；支付结果从服务端查，不从URL推断 |

这是目标能力清单，不是要求先给每个依赖造一个万能客户端。按第一个真实用例建立小接口，再由 adapter 对接。跨服务不直接访问对方表，更不能靠复制表schema省去契约。

## 6. 高内聚、可靠性和性能的关系

order 的 application 层负责「顺序与恢复」，领域聚合负责「允许的状态与金额约束」，data负责「事务与持久化」。不要把所有规则堆在 service handler；也不要把状态机搬成只会转调的十层框架。

**Outbox**把业务变更和待发送事件写在同事务；**Inbox**把消费去重与本服务效果放在同事务；**补偿任务**保存尚未完成的逆向动作。仅 try/catch里调用释放，不足以覆盖崩溃。

性能从有界批量查询、稳定ID、短本地事务、明确deadline开始。不要在持有数据库锁的长事务里等待第三方支付网络请求。并发能减少延迟的前提是步骤真正独立，不能并发略过先后依赖。

可扩展首先是多worker处理同请求不会双提交：唯一键、状态CAS、租约与fence负责。不是先加分布式锁产品。

履约先按现行项目边界并入order；旧设计里独立Fulfillment字样不能成为新建微服务授权。保留 `OrderReadyForFulfillment` 这道业务门槛：支付完成与库存确认未齐，不得发货。

## 7. 分阶段练习

| 练习 | 最小交付 | 验收 |
|---|---|---|
| O-A 诚实的边界 | 停止假成功，统一主体/ID/金额/可空值 | 未实现明确失败；空邮编不panic；他人订单拒绝且事件数0；前端不跳假成功页 |
| O-B 最小真实下单 | 报价、请求事实、组预占、本地落库、查询响应 | 双请求同token只一组；同token异地址冲突；任一SKU失败不落业务订单；数据库重读可见 |
| O-C 可恢复交易 | Outbox/Inbox、补偿、超时、支付接受 | 回滚不发事件；旧执行者不能提交；重启恢复；取消后晚到支付不复活；重复事件无二次副作用 |

已有 [service/order_test.go](../../backend/services/order/internal/service/order_test.go) 主要证明错误映射，不是保存/事务/补偿验收。优先用能复现假成功的测试启动O-A，再推进下一层。所有远端/资金/破坏性测试先在隔离环境进行。
