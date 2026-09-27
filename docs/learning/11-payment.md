# 11 支付：成功、失败之外，还有「不知道是否已扣款」

[学习入口](README.md) · 前置：[订单](10-order.md) · 综合：[契约实验室](12-contracts.md)

本章只教设计、源码阅读与验收，**payment 的实际实现由你亲自完成**。这里不运行支付请求，不恢复旧注释代码，不对真实资金进行故障注入。

## 0. Git 证据：旧大文件是注释，不能当作曾经完成支付

[f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L146-L181)（2026-02-25）已经设计Payer创建/查询/退款/查退款、支付宝/微信、验签后更新、按支付单号幂等、对账；首期明确要求实际支付和订单同步。因此「只支持一个渠道」可以作为当前重新裁剪的交付切片，却不能谎称原文只要求一个支付按钮。

最早公开 [1e09a8d1 payment.proto](https://github.com/lens077/ecommerce/blob/1e09a8d1/backend/api/payment/v1/payment.proto)（06-11）有四RPC，输入是单order_id/consumer_id/amount/currency等；同期schema是单轴状态，没有完整的请求幂等模型。

关键实现证据：

- [d258a70f data/payment.go](https://github.com/lens077/ecommerce/blob/d258a70f/backend/services/payment/internal/data/payment.go)（06-11）有数百行余额转账/支付宝/通知/回跳素材，但仓储方法和构造函数均被注释。不能写「旧版已经能付，只是后来退化」。仓外前身是否曾运行不在本仓证据范围。
- [520f0ecd data](https://github.com/lens077/ecommerce/blob/520f0ecd/backend/services/payment/internal/data/payment.go)（08-01）明确为可编译、启动和注册补五个Unimplemented桩，区分服务不可达与功能没做；不是交付资金闭环。
- [48bbd5d6 checkout v2](https://github.com/lens077/ecommerce/blob/48bbd5d6/docs/design/order/checkout.md)（08-28）纠正为按组attempt、capture/refund分轴、order只接受一笔、晚到/多余付款退款；不能把这套更完整语义倒写成06月已实现。
- [6efb317a data](https://github.com/lens077/ecommerce/blob/6efb317a/backend/services/payment/internal/data/payment.go)（09-23）删除旧注释，只剩诚实桩；是消除误导而非删掉活支付链。

**原始MVP判定：不满足；生产判定：不满足。** 当前真实创建、渠道扣款、验签入账、状态同步、重放和对账都不能靠仓储桩完成。旧注释里即使有弱验签等危险素材，也不是当前正在执行的漏洞；当前应修的是启用前契约和假成功展示，不恢复那些素材。

## 1. 支付 MVP 也不能省略的底线

最小业务：对一个属于当前用户、仍可付款的订单，创建一次支付尝试；渠道确认后持久记录结果，再让订单决定是否接受。

MVP 可以只支持一种支付渠道、没有复杂分账，但仍必须具备身份核验、服务端金额、回调验签、重复处理和结果可查询。真实扣款不能用「先跑通，安全以后补」交付。

| 术语 | 教学解释 |
|---|---|
| payment_attempt | 一次具体渠道尝试；用户换渠道可能是另一尝试，网络重试仍应属于同一次 |
| payment_request_id | 对一次支付意图的稳定幂等标识；每次重试重新随机生成就失去作用 |
| captured | 渠道确认真实扣款，属于资金事实 |
| accepted_pay_no | order接受哪笔付款；与渠道扣款事实不同 |
| refund | 退款，独立于是否captured；扣过再退也不能抹掉扣款历史 |
| webhook / notify | 渠道发给服务端的通知；不是浏览器回跳页面 |
| 对账 | 将本地事实与渠道账单/查询对比，找出漏通知、状态不明与金额差异 |
| ACK | 对通知的成功确认；过早确认可能让渠道停止重发而本地还没保存 |

## 2. 当前实现，不夸大桩代码

[现行 proto](../../backend/api/payment/v1/payment.proto) 提供创建、查询状态、通知、回跳四个RPC；[data/payment.go](../../backend/services/payment/internal/data/payment.go) 的五个仓储方法统一返回 Unimplemented。

已经完成的内容包括参数约束、客户术语迁移、Connect错误透传、构造与启动装配。它能诚实拒绝未实现功能，比空响应成功更安全；但**尚不能支付、不能宣称已验签或已退款**。

已有 [service测试](../../backend/services/payment/internal/service/payment_test.go) 验证部分参数与未实现错误透传；并非对账或资金一致性测试。

早期支付单设计稿已删除，不再作为独立契约。路线以 [checkout v2](../design/order/checkout.md) 的按组支付与 capture/refund 分轴为准，不能直接复活旧单订单实现。

## 3. 启用前必须先修的契约缺口

### PAY1 当前创建参数来自不可信请求体

[service/payment.go](../../backend/services/payment/internal/service/payment.go) 接收 customer_id、amount、currency，尚未从可信会话和order核验。

目前 repo 桩阻止真实扣款，所以准确结论是「启用前安全阻断」，不是已经实测能冒用付款。

未来应由服务端读取可信主体，向order获取属于该主体、可付款的group与权威金额/币种。客户端可以表达「我想付这组订单、选这个渠道」，不能表达「这组订单现在只值一分钱」。

不应让payment自己重新从商品价格计算订单总额：报价/订单快照由order拥有，payment只核实并执行对应支付事实。

### PAY2 数据模型不足以表达重试与退款

[旧迁移](../../backend/services/payment/internal/data/migrations/00001_payments.sql) 是单order_id、单status，没有支付请求唯一键和两个独立状态轴。

一个status=refunded会遮盖问题：「之前是否真的扣款？退了多少？哪次尝试？」设计应保留capture事实，另跟踪refund，保存渠道交易标识与请求关联。

[旧SQL](../../backend/services/payment/internal/data/queries/query.sql) 中有修改主键的UpdateStatusQuery，另一个状态更新没有旧状态条件。它们是待替换资产，不是可以重新接通就复用的正确实现。

### PAY3 回调日志缺少数据最小化

当前handler会记录通知/表单内容。付款通知可能含敏感或可关联数据；普通Info日志不应当成为不受限的支付审计仓库。

需要白名单日志字段、trace/payment标识、校验结果；完整审计材料按必要性、权限、脱敏和保留期存储。测试使用合成数据，不将真实签名、token或付款人资料写进教材。

### PAY4 结果页仍是演示成功，必须与真实支付分开

当前 [payment/result](../../frontend/apps/consumer/src/routes/payment/result.tsx) 使用success!==false，缺参数默认成功；金额为固定展示值，订单链接也是固定编号，没有调用支付状态查询。新checkout的服务端快照保护不能阻止它把空建单响应后的跳转渲染为已支付。

最小止损是无真实凭证/状态时显示「无法确认/处理中/功能未开放」，不能默认成功；正式实现后只显示服务端查得的订单和资金状态。修的是用户可观察的事实，不是换一段漂亮提示语。

## 4. 超时不等于失败：用一个场景理解幂等

```text
payment → 渠道：扣100元
渠道已扣款 → 响应在网络中丢失
payment：超时
```

如果这时重新生成request_id再扣一次，就可能扣两次。正确做法是先持久记录同一尝试，再用同一幂等标识查询或恢复结果；渠道支持什么幂等能力也必须按它的真实协议验证。

本地唯一约束只能防本地重复认领，不自动保证远端副作用只一次。必须贯通本地意图、渠道请求标识、查询与对账。状态至少能表达「处理中/结果未知」，而不是异常都改成失败。

同key不同订单/金额必须拒绝；同key同内容重复可以返回已有结果或明确pending。等待要有时间预算，不能两个请求都因为「另一个似乎卡住」而继续扣款。

## 5. 资金事实与订单接受必须分离

checkout v2 的重点是：同一组订单可能因为并行渠道/竞态实际扣了两笔。现实不能被数据库一个唯一成功约束抹掉。

- payment保存两笔真实captured，不伪装第二笔没发生。
- order用CAS只接受其中一笔。
- 其他扣款建立持久退款任务，失败后可继续重试与对账。
- 订单取消后才到达的成功付款同理：承认钱到了，再退；不复活已经取消的订单。

这是高内聚：payment拥有钱的事实，order拥有订单接受和履约规则。两者通过明确契约协作，而不是互改对方表。

## 6. 回调入口怎样和网关对接

支付通知在路由清单中可匿名，是因为渠道没有用户session；**匿名不等于无需认证通知来源**。验签发生在payment的渠道adapter，并同时校验商户/app标识、交易映射、金额、币种和状态。

要验证渠道真正使用的HTTP形态与Connect handler是否一致：form、JSON、GET回跳、返回体/ACK要求，不因proto已有Notify方法就假设渠道能直接调用。

浏览器回跳只负责引导用户查询结果，不能当扣款凭证。支付结果页应展示服务端查得的状态，对pending提供刷新/等待，而不是根据URL参数渲染成功。

## 7. 错误、安全、性能、扩展的顺序

1. **正确性**：本地事实、状态条件、幂等、验签核额优先。
2. **安全**：可信主体、订单归属、凭据隔离、日志裁剪和渠道回调校验。
3. **可靠性**：持久任务、状态查询、通知重放、退款恢复、对账。
4. **性能**：复用HTTP连接、有界并发、总deadline、队列积压可观测。不要在持锁事务中等渠道慢请求。
5. **扩展**：多worker基于数据库领取/CAS协作。第二个真实渠道出现时再验证可替换接口，不先造万能支付框架。

一个小的PaymentChannel接口可以隐藏vendor请求/签名/响应，调用方只看项目拥有的金额、交易标识和结果。只有一个生产渠道时如实称单实现边界，不夸称已支持多渠道能力接缝。

## 8. 由你完成的三组实验

| 练习 | 学习目标 | 通过条件 |
|---|---|---|
| PAY-A 可信创建 | 主体、group_no、权威金额、request_id | 他人订单/过期订单/伪造金额拒绝，渠道调用0；同请求重试同一次尝试 |
| PAY-B 可靠确认 | 验签核额、CAS、审计与Outbox同事务 | 任一校验不符不能成功ACK；重复通知只一次状态迁移/事件；captured后close不能回退 |
| PAY-C 资金恢复 | 查询、订单接受、退款、对账 | 双扣款真实记录两笔，只接受一笔并退另一笔；取消后晚到成功可恢复退款；进程重启不丢责任 |

本课的最重要结论：**钱是否到账、订单是否接受、用户看见什么页面，是三个需要对齐但不能混为一谈的事实。**
