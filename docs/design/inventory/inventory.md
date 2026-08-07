# 分布式库存状态机设计

> 从根 `DESIGN.md` 拆出（2026-08-08）。⚠️ 现状与设计差距极大：`Reserve` 静默无操作、
> `ReleaseReserve` 是 panic 桩（2026-08-06 对抗评审，修复项见 `TODO.md` P0）。
> 实际表结构以 [`backend/services/inventory/internal/data/schema/`](../../../backend/services/inventory/internal/data/schema/) 为准。
> 与订单的协作契约（Reserve=TCC Try、ConfirmReserve、reqid 关联键、预占 TTL 兜底）
> 见 [order/checkout.md](../order/checkout.md) 与 [order/consistency.md](../order/consistency.md)。


库存是电商核心高风险模块，这里设计使用分布式库存状态机，解决超卖、库存不一致、并发冲突等核心问题。

### 库存分层模型

采用「实物库存 + 逻辑库存」双层模型，兼顾数据准确性与业务灵活性：

1. 实物库存（Physical Stock）
    - 核心维度：SKU_ID + 仓库 ID 唯一标识，记录仓库内实物库存的真实数据
    - 核心字段：在手库存（On-hand）、已锁定库存（Locked）、可用库存（Available）
    - 计算公式：可用库存 = 在手库存 - 已锁定库存
    - 用途：仓储实际库存管理，所有库存扣减、调整的最终依据，保证账实一致
2. 逻辑库存（Logic Stock）
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

1. 分布式锁机制
    - 基于 Redis 实现可重入分布式锁，以SKU_ID + 仓库ID作为锁粒度，保证单 SKU 库存操作的原子性，避免并发扣减导致的超卖。
    - 锁设计：设置合理的超时时间，支持锁自动续期，避免死锁；通过 Lua 脚本实现锁的加锁、解锁、续期的原子操作。
2. 库存操作原子化
    - 所有库存扣减、预占、释放操作，均通过 PostgreSQL 的事务 + 行锁实现数据库层面的原子性，避免并发更新导致的数据不一致。
    - 核心扣减 SQL 强制添加库存校验条件，例：UPDATE inventory SET locked = locked + ? WHERE sku_id = ? AND
      warehouse_id = ? AND
      available >= ?，从数据库层面杜绝超卖。
3. 库存流水与可追溯
    - 每一次库存变动都生成唯一的库存流水记录，关联订单号、操作类型、变动前后库存、操作人、操作时间，支持全链路库存追溯，方便问题排查与对账。
4. 库存预警机制
    - 通过 Kafka 监听库存变更事件，当 SKU 可用库存低于预设阈值时，触发stock.low_warning事件，通过通知服务推送至商家钉钉 /
      企业微信 / 邮件，提醒商家补货。

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
