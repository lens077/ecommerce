-- 库存服务初始结构。
-- 2026-08-21 由 schema/schema.sql 转为 goose 版本化迁移。
-- 语义修复（唯一一处改动）：change_log.warehouse_id 原写 `VARCHAR(6) DEFAULT 1`，
-- 整型默认值灌给 varchar 列在 PG 上是 42804 datatype mismatch，建表必失败——
-- 说明该文件从未在干净库上原样执行过；对齐 stock 表改为 DEFAULT 'df0001'。
-- 注意：StockStatus 枚举原文件未加 schema 限定且无 search_path，落在 public，保持不变
-- （sqlc 生成的模型名依赖这一点）。

-- +goose Up
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

CREATE TABLE inventory.change_log
(
    id               BIGSERIAL PRIMARY KEY,
    order_no         VARCHAR(64) NOT NULL, -- 幂等键（同一订单同一操作唯一）
    sku_id           BIGINT      NOT NULL,
    warehouse_id     VARCHAR(6)  NOT NULL DEFAULT 'df0001',
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

-- +goose Down
DROP TABLE IF EXISTS inventory.change_log;
DROP TABLE IF EXISTS inventory.stock;
DROP TYPE IF EXISTS StockStatus;
DROP SCHEMA IF EXISTS inventory;
