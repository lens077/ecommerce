# 09 库存：代码写了「事务」，不等于真的有事务

[学习入口](README.md) · 前置：[商品](06-product.md)、[购物车](02-cart.md) · 关联：[订单](10-order.md)、[支付](11-payment.md)

## 0. Git 证据：原子性不是后加要求，错参也不是最近才出现

[f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L93-L142)（2026-02-25）明确写：SKU+仓库、预占→支付锁定→发货扣减，所有预占/扣减/释放走「PostgreSQL事务+行锁」，每次变化有流水。首期MVP包含inventory，因此这些不是可以推迟到高并发阶段才修的底线。

但原设计本身也不完备：有reserved状态，等式却只写available=on_hand-locked；另推荐Redis锁。现在的完整守恒式与PG唯一事实来自后续设计纠偏，不能倒写为原文已正确。

- `3d079177`（2026-05-15）加入[Reserve/Release契约](https://github.com/lens077/ecommerce/blob/3d079177/backend/api/inventory/v1/inventory.proto)，注释要求order_no幂等与商家隔离；服务目录是gitlink，不是本仓可读实现。
- [7660f1ae data](https://github.com/lens077/ecommerce/blob/7660f1ae/backend/services/inventory/internal/data/inventory.go)（05-16）首次展开真实查/改/流水，但已经有Quantity=available-requested、Version=current+1、忽略行数、无实际事务；Release是panic。
- `9dde3e51`（08-20）迁移到goose并修仓库默认字面量，只能证明schema工程化，不能证明预占逻辑修好。
- [48bbd5d6 checkout v2](https://github.com/lens077/ecommerce/blob/48bbd5d6/docs/design/order/checkout.md)（08-28）要求reserved列、reservation头/明细、整组原子、payload_hash、释放墓碑；补上多SKU和迟到消息语义。
- [98befc16 data](https://github.com/lens077/ecommerce/blob/98befc16/backend/services/inventory/internal/data/inventory.go)（09-23）修错误变量和未找到SKU，数量/版本/事务/行数缺口仍在当前实现。

**原始MVP判定：不满足，连最窄的正确预占+释放也不足。生产判定：不满足。** 当前限制不是吞吐不够，而是成功响应和真实库存效果对不上。未来先按I-A修正确性，再落实reservation生命周期；不以引入Redis锁或扩Pod替代事务。

## 1. MVP 从守恒开始，不从锁开始

库存服务的最小责任是：有限商品不能卖出超过可用数量，并能解释每一次变化。它不是完整 WMS（仓库管理系统），不必一开始做拣货、库位、批次和盘点平台。

术语：

| 术语 | 含义 |
|---|---|
| on_hand | 实物账面库存 |
| available | 当前可卖数量 |
| reserved | 未支付订单占住的数量，目标设计要单独保存 |
| locked | 已确认支付、待履约的锁定量；不是已经出库 |
| reservation | 一次可重复查询、确认或释放的预占事实 |
| ledger / change_log | 每次库存变动的持久流水 |
| 乐观锁 | 用旧版本条件更新；成功必须检查影响行数 |
| 悲观锁 | 事务内先锁住行，如 SELECT FOR UPDATE，再做修改 |

目标不变量是 `available + reserved + locked = on_hand`。确认支付把 reserved 转 locked；实际发货才减少 on_hand。不能为了省一列，把未支付预占与已支付锁定混成一类。

[库存设计](../design/inventory/inventory.md) 与 [checkout v2](../design/order/checkout.md) 是演进依据；旧文首「Reserve 静默无操作」不能当当前实现——现在有尝试读写，但参数、事务和流水语义仍有错。

## 2. 当前实现和已做的工程化

现行 [inventory.proto](../../backend/api/inventory/v1/inventory.proto) 只有 Reserve、ReleaseReserve，没有正式 Group/Confirm/BatchGetStock 契约。

阅读：[service](../../backend/services/inventory/internal/service/inventory.go) → [data](../../backend/services/inventory/internal/data/inventory.go) → [SQL](../../backend/services/inventory/internal/data/queries/query.sql) → [迁移](../../backend/services/inventory/internal/data/migrations/00001_inventory.sql)。

已有余额表、change_log、version、SQL 条件更新、错误 reason/Connect 映射、共享连接和事务 helper。日志在库存不足时带 SKU 而不回显真实余量；错误变量和非法 UUID 的处理已改进。

这些都是保护材料，下一步是把它们正确组合成一个原子业务操作，而不是继续增加工具。

## 3. 缺陷一：扣减量和匹配版本都传错

当前 Reserve 把 `stock.Available - item.Quantity` 传给 SQL 的 Quantity，把 `stock.Version + 1` 传给 WHERE version。

但 SQL 的意义是：

```text
只有 version = 调用方读到的旧版本 且 available >= 请求数量时，
执行 available -= 请求数量，version += 1。
```

用数字理解：现有10件，版本5，想预占2件。正确输入是数量2、旧版本5；当前却是数量8、版本6。

通常没有竞争时 WHERE 匹配不到，UPDATE 影响0行；当前代码又忽略 `:execrows` 返回的行数，接着写「已经扣了2件」的流水。若竞争恰好使版本到了6，还可能实际扣8件。

**改成正确参数只是第一步**，必须把0行区分为冲突/库存不足等结果，不能返回成功。并发重试要有预算，并基于新的可信状态，不能无限循环。

## 4. 缺陷二：注释写开事务，实际没有覆盖主链

data.Reserve 注释写「开启事务」「提交事务」，但方法没有通过 ExecTx 包住所有操作。读取使用 `DB(ctx)`，写入却直接使用 `u.data.db`。

即使调用方将来开了事务，后面的写入绕过事务查询器，也不一定处于同一个事务中。SELECT FOR UPDATE 在独立语句结束后不能替后面另一个连接上的 UPDATE 持续保护。

**原子性（Atomicity）**：预占一组SKU，要么全部完成并记完整流水，要么全部回滚。当前循环中第二项失败，不能保证第一项已做的动作全部撤销。

修复应让读、条件更新、预占记录和流水都使用同一事务句柄。锁顺序按稳定键排序可减少死锁，但它不替代事务和幂等。

## 5. 缺陷三：仓库维度和流水主键不完整

读取库存按 merchant+SKU，缺 warehouse 条件；service 丢弃逐项 warehouse_id，固定仓库值。多个仓库有同一SKU时，读取的余额与更新的目标可能不是同一条记录。

change_log 的唯一约束是 `(order_no, change_type)`，而一次订单可能含多SKU；INSERT 冲突忽略会把后面的流水吞掉。**流水不重复，不等于扣库存幂等**：扣减动作已经发生时，最后一条日志 DO NOTHING 不能撤销它。

目标把幂等放在 reservation 头记录：稳定ID、payload_hash、状态；明细按SKU/仓库记录。重复同意图返回原结果，不同内容重用同ID报冲突。

## 6. 缺陷四：释放还没有真实路径

ReleaseReserve handler 直接返回 status=false、nil，没有调用 usecase；data 中的 panic 桩当前并未到达。

这不是「释放成功返回false」的可依赖协议。未实现应显式 Unimplemented，前端/调用方才能停止伪成功路径。

目标释放应幂等：释放两次不能把 available 加两次。还要处理乱序：先收到 Release、后收到晚到 Reserve，必须通过 aborted 墓碑等设计阻止被取消的预占复活。

## 7. 与 order/payment 的完整契约

| 项目 | 必须约定 |
|---|---|
| 输入身份 | 调用方有权为对应商家/SKU预占；内部RPC不是只因在内网就可信 |
| 预占范围 | 一次请求是整个订单组，还是单商家；checkout v2 要求全组原子 |
| 幂等 | reservation_id、payload_hash、重复处理和冲突错误 |
| 数值 | SKU/商家/仓库的类型一致；请求的是本次数量，不是剩余量 |
| 状态 | Reserve → Confirm（reserved转locked）或Release；扣实物与确认支付不同 |
| 超时 | RPC超时是结果未知，能按reservation查询；不能盲目新建ID重扣 |
| 到期 | order暂不可达不等于订单不存在；释放要基于权威状态与保守恢复 |
| 事件 | 业务变更与事件事实同事务，重复消费与释放都可重放 |

matrix 的 order→inventory 当前只在 planned。只有两边真实 proto、client装配、deadline、错误和测试都落地，才从计划箭头升级为接线事实。

## 8. 安全、性能、扩展怎样取舍

- 先确保「最后一件只一人成功」，再测热点SKU吞吐；没有正确性的高QPS没有价值。
- 原子条件更新能缩短锁时间；必须测真实 SQL 的索引与争用。不要先把库存搬进 Redis 后异步回写数据库。
- 多SKU事务锁顺序稳定，限定批次大小，超时/冲突有界处理。
- 无状态副本增加后，库存约束仍靠数据库与稳定 reservation，不靠进程内 mutex。
- 观测成功预占、业务拒绝、冲突、释放失败和补偿积压，不只看 HTTP 500。

## 9. 三个练习

| 练习 | 动手范围 | 断言 |
|---|---|---|
| I-A 真实预占 | 正确q/旧version/仓库、同事务、影响行数 | 10预占2变8；失败不记成功流水；第二SKU失败第一SKU回滚；并发最后一件仅一成功 |
| I-B 预占生命周期 | reservation头+明细、Group三接口 | 同ID同内容不重扣；异内容冲突；重复释放不超增；先释放后晚到预占不复活 |
| I-C 恢复与对账 | 到期处理、持久事件、余额/流水核对 | 进程重启可恢复；消息重放不改变已完成效果；守恒等式始终成立 |

现有 [service 测试](../../backend/services/inventory/internal/service/inventory_test.go) 主要验证错误和非法输入，stub 无法发现 SQL 参数和跨事务问题。上述练习要使用隔离真实数据库，而不是线上库存；本轮未执行。
