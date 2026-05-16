CREATE SCHEMA IF NOT EXISTS inventory;

-- 库存余额表 (SKU + 仓库维度)
CREATE TABLE inventory.stock
(
    id           BIGSERIAL PRIMARY KEY,
    sku_id       BIGINT     NOT NULL,
    warehouse_id VARCHAR(6) NOT NULL DEFAULT 'df0001', -- 仓库ID
    merchant_id  UUID       NOT NULL,                  -- 商家id, 用于数据隔离

    on_hand      INT        NOT NULL DEFAULT 0,        -- 在手库存: 仓库货架上实际存在的商品数量。只有商品真正离开仓库（发货），这个数字才会减少。
    locked       INT        NOT NULL DEFAULT 0,        -- 已锁定库存: 用户已支付，等待发货的商品数量。商品还在仓库里，但已经被“预定”给具体订单，不能再卖给其他人。
    available    INT        NOT NULL DEFAULT 0,        -- 可用库存: 继续销售的库存数量。计算公式：available = on_hand - locked。用户每次下单预占，扣减的是 available，不影响 on_hand 和 locked。

    version      INT        NOT NULL DEFAULT 0,        -- 乐观锁版本号

    created_at   TIMESTAMPTZ         DEFAULT now(),
    updated_at   TIMESTAMPTZ         DEFAULT now(),

    UNIQUE (sku_id, warehouse_id)                      -- 一个 SKU 在一个仓库只有一条记录
);

-- 库存操作日志表(流水表)
-- 每一次库存状态变更都要留下记录，用于审计和对账
CREATE TYPE StockStatus AS ENUM (
    'available',
    'reserved',
    'locked',
    'deducted',
    'released'
    );
-- DROP TABLE inventory.change_log;
CREATE TABLE inventory.change_log
(
    id               BIGSERIAL PRIMARY KEY,
    order_no         VARCHAR(64) NOT NULL, -- 幂等键（同一订单同一操作唯一）
    sku_id           BIGINT      NOT NULL,
    warehouse_id     VARCHAR(6)  NOT NULL DEFAULT 1,
    merchant_id      UUID        NOT NULL,

    change_type      VARCHAR(32) NOT NULL, -- RESERVE, CONFIRM, RELEASE, DEDUCT, ADJUST
    from_status      StockStatus,          -- 变更前状态
    to_status        StockStatus NOT NULL, -- 变更后状态

    quantity         INT         NOT NULL, -- 变更数量（正数增加，负数减少）
    before_on_hand   INT         NOT NULL,
    after_on_hand    INT         NOT NULL,
    before_locked    INT         NOT NULL,
    after_locked     INT         NOT NULL,
    before_available INT         NOT NULL,
    after_available  INT         NOT NULL,

    operator         VARCHAR(64),          -- 操作者（system/用户ID/商家ID）
    remark           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (order_no, change_type)         -- 幂等：同一订单同一操作只执行一次
);
