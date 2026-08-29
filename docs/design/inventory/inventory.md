# 分布式库存状态机设计

> 从根 `DESIGN.md` 拆出（2026-08-08）。⚠️ 现状与设计差距极大：`Reserve` 静默无操作、
> `ReleaseReserve` 是 panic 桩（2026-08-06 对抗评审，修复项见 `TODO.md` P0）。
> 实际表结构以 [`backend/services/inventory/internal/data/migrations/`](../../../backend/services/inventory/internal/data/migrations/) 为准。
> 与订单的协作契约（Order Saga 同步调用 Reserve、ConfirmReserve、reqid 关联键、预占 TTL 兜底）
> 见 [order/checkout.md](../order/checkout.md) 与 [order/consistency.md](../order/consistency.md)。


库存是电商核心高风险模块，这里设计使用分布式库存状态机，解决超卖、库存不一致、并发冲突等核心问题。

### 库存分层模型

采用「库存流水真相 + 余额投影」模型，并保留实物库存与逻辑库存的业务视图，兼顾数据准确性与业务灵活性：

1. 实物库存（Physical Stock）
    - 核心维度：SKU_ID + 仓库 ID 唯一标识，记录仓库内实物库存的真实数据
    - 核心字段：在手库存（On-hand）、预占库存（Reserved）、已锁定库存（Locked）、可用库存（Available）
    - 计算公式：**`available = on_hand − reserved − locked`**（2026-08-26 修正：旧公式漏掉了本文自己定义的「预占」态，[order/checkout.md](../order/checkout.md) 已点名该注释是 bug；此公式为唯一成文版本，须由属性测试守护——任意操作序列后不变量恒成立）
    - 用途：仓储实际库存管理；余额是 `StockLedger` 流水的投影，不是最终真相
2. 逻辑库存（Logic Stock，只读投影）
    - 核心维度：SKU_ID 维度汇总全渠道可用库存，面向前端展示与下单校验
    - 用途：商品详情页库存展示、下单前置校验，支持预售等特殊业务场景的库存配置，与实物库存实时同步。

### 3.2 库存状态机与流转规则

核心库存状态定义

- 可用：可正常下单销售的库存，对应可用库存字段
- 预占：用户下单未支付，临时锁定的库存，避免超卖
- 已锁定：用户支付成功，等待发货扣减的库存
- 已扣减：订单发货完成，正式从在手库存中扣除的库存
- 已释放：订单取消 / 超时，从预占 / 锁定状态回滚至可用的库存

状态流转核心规则

- 可用 → 预占：用户下单创建订单，触发库存预占
- 预占 → 已锁定：订单支付成功，预占库存转为锁定库存
- 预占 → 可用：订单取消/支付超时，预占库存释放回可用
- 已锁定 → 已扣减：订单发货完成，锁定库存正式扣减，在手库存同步减少
- 已锁定 → 可用：订单全额退款，锁定库存释放回可用

### 高并发库存操作保障

1. ~~分布式锁机制（Redis 可重入锁）~~ —— **已废止（2026-08-26）**：正确性一律锚定
   PostgreSQL（下条的事务 + 行锁 + 条件更新），Redis 协议缓存（实际为 Dragonfly，
   `allkeys-lru` 驱逐）**不得承载锁/幂等等「丢失即出错」的数据**——锁键可被驱逐即超卖。
   此为 [order/checkout.md](../order/checkout.md) 六轮对抗评审定稿结论，本节旧文与其相悖故废止。
2. 库存操作原子化（**唯一正确性锚点**）
    - 所有库存扣减、预占、释放操作均落 PostgreSQL，并以单条条件更新把「校验 `available >= quantity`」与变更合为一个原子动作；事务与固定锁序负责跨行整组操作，严禁把正确性放入 Dragonfly/Redis。
    - 核心扣减 SQL 强制添加库存校验条件，例：UPDATE inventory SET locked = locked + ? WHERE sku_id = ? AND
      warehouse_id = ? AND
      available >= ?，从数据库层面杜绝超卖。
3. 库存流水与可追溯（`StockLedger` 是库存绝对真相源）
    - 每一次库存变动都生成唯一的库存流水记录，关联订单号、操作类型、变动前后库存、操作人、操作时间，支持全链路库存追溯，方便问题排查与对账。
4. 预占生命周期与库存预警（目标态）
    - 预占与释放必须成对且总量平衡；预占到期由后台任务或延迟事件自动释放。
    - 库存预警机制
    - 库存事务写 broker-neutral outbox，目标经 relay 发布到 Kafka；消费者通过 Inbox 幂等处理低库存事件，再调用通知适配器。当前生产者、Kafka consumer、通知服务与商家渠道均未接线。

## 库存表（早期设计稿）

    ```sql
       CREATE TABLE IF NOT EXISTS products.inventory
       (
           id         BIGSERIAL PRIMARY KEY,
           sku_id     BIGINT      NOT NULL REFERENCES products.skus (id) UNIQUE,
           on_hand    INTEGER     NOT NULL DEFAULT 0,
           locked     INTEGER     NOT NULL DEFAULT 0,
           created_at timestamptz NOT NULL DEFAULT now(),
           updated_at timestamptz NOT NULL DEFAULT now(),
           CONSTRAINT inventory_sku_unique UNIQUE (sku_id)
       );
    COMMENT ON TABLE products.inventory IS '库存表';
    ```
