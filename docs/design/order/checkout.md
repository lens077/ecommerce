# 下单功能设计终稿

> 原 `docs/design/order.md`（2026-08-08 移入本目录）。跨服务一致性底座见
> [consistency.md](consistency.md)，订单表早期稿见 [schema.md](schema.md)。

阶段一：结算页（settlement 服务，新建）
两个入口：购物车勾选 → 去结算（携带 cartItemIds）；商品页直接购买 → 去结算（携带 skuId + 数量）。
结算服务计价：反查 cart 服务（或直接用 sku）→ 批量调商品服务取实时价格与商品信息 → 调库存查询接口（新增，仅展示"仅剩 N 件"提示，不做准入判断）→ 拉取用户地址列表供选择。
服务端签发 token（即 reqid），与本次报价（商品明细 + 确认价）绑定写入 Redis，TTL 5 分钟，返回前端。token 同时承担幂等键与价格确认凭证两个职责。
阶段二：提交订单
用户点"去支付"，前端提交 token + addressId + remark。
结算服务原子校验 token，调 order.CreateOrder。编排到此为止——预占、落库、补偿全部内聚在订单服务内。
订单服务内部：
拿 cartItemIds 反查 cart 服务（或 sku 形态直接取），不信任前端内容；
取实时价与 token 绑定的确认价比对，不一致拒单"价格已变动"，前端刷新结算页重新确认；
按 merchant_id 拆单，内存中生成 group_no 和各商家 order_no；
逐商家调 Reserve（关联键 = reqid + 商家维度）；商家内任一 sku 不足 → 该商家整单失败，进缺库存列表；
至少一个商家成功 → 一个本地事务写入 order_group + order_main + order_item + order_log（pending_payment，写入 pay_deadline、地址 8 字段快照、价格/商品快照）；
落库失败 → 补偿调 ReleaseReserve；补偿也失败 → 靠库存侧预占 TTL 兜底（见阶段四）；
按结果处置 token：全部失败 → 服务端删 key，允许用户修正后重试；成功 → key 保留至 TTL，拒绝重放。
响应（CreateOrderResponse 需填充）：group_no、各商家单的 order_no 与状态、缺库存商品列表（前端放回购物车）、应付总额。
成单条目从购物车移除——这个我们没讨论过，我直接给默认方案：由结算服务在收到成功响应后调已有的 cart.RemoveCartItem，失败不阻塞主流程。不同意你改。
阶段三：收银台与支付
前端拿 group_no 跳收银台页——此时支付单尚不存在，跳的是页面不是渠道 url。
用户选渠道点支付 → payment 服务才创建支付单，按 order_group 合并支付（金额 = order_group.pay_amount）。
支付成功回调 → 订单置 paid、写 order_log、调 ConfirmReserve 把预占转实扣（新增接口，否则预占过期回收会吞掉已付款订单的库存）。
阶段四：超时与自愈
定时扫表（每分钟）：pending_payment AND pay_deadline < now() → 置 cancelled + ReleaseReserve + order_log。不用 Kafka 延迟队列（无原生支持）、不用 Redis 过期通知（不保证送达）。
库存侧预占落记录（reqid、sku、数量、状态、expire_at），后台任务回收过期未确认的预占；expire_at 略大于 pay_deadline。
由此产生的改动清单
inventory：新增库存查询接口（结算页用）、新增 ConfirmReserve；ReserveRequest.order_no 改为 reqid 关联键语义。
order proto：CreateOrderRequest 加 token、支持 cartItemIds / sku+数量 两种入参形态；CreateOrderResponse 从空 message 补全为第 7 步的结构。
新建 settlement 服务 + 两个后台定时任务（订单超时取消、预占过期回收）。
第一版明确不做
运费、优惠（字段保留恒为 0）、凑单包邮、超卖（商家自行虚报库存）、延迟消息优化。

对照你最初的版本，四个关键翻转：先校验后落库（原来是先写 order_group）、预占替代检查（原来只查不占）、服务端签发 token（原来前端随机 reqid）、下单与支付断开（原来下单成功直接调支付）。另外补齐了原方案完全缺失的三块：失败补偿、超时取消、预占转实扣。
