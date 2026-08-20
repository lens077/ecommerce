-- 商品服务：销量明细表 + 销量汇总视图。
-- 2026-08-21 由 schema/sales_detail.sql 原样转为 goose 版本化迁移（DDL 语义未动）。
-- 已知债（见 docs/design/product/sales.md）：表名单数 sale_detail、预聚合未落地，此处不趁机改。

-- +goose Up
CREATE SCHEMA IF NOT EXISTS products;
-- （SET search_path 已去掉，理由见 cart/00001；对象全部显式限定）

--  销量明细表
CREATE TABLE IF NOT EXISTS products.sale_detail
(
    id           BIGINT PRIMARY KEY,
    order_no     VARCHAR(64)    NOT NULL, -- 订单号
    merchant_id  UUID           NOT NULL, -- 商家ID
    spu_id       BIGINT         NOT NULL,
    sku_id       BIGINT         NOT NULL,
    category_id  BIGINT         NOT NULL,
    brand_id     BIGINT         NOT NULL,

    quantity     INTEGER        NOT NULL, -- 销量(退款为负数)
    price        DECIMAL(10, 2) NOT NULL, -- 单价
    total_amount DECIMAL(10, 2) NOT NULL, -- 总金额

    type         VARCHAR(32)    NOT NULL, -- 变更类型: paid/refund
    paid_at      timestamptz    NOT NULL, -- 支付/退款时间
    dt           DATE           NOT NULL, -- 日期(用于聚合)

    created_at   timestamptz    NOT NULL DEFAULT now()
);

-- 销量汇总视图
CREATE VIEW products.spu_total_sales AS
SELECT spu_id, COALESCE(SUM(quantity), 0) AS total_sales
FROM products.sale_detail
GROUP BY spu_id;

-- +goose Down
DROP VIEW IF EXISTS products.spu_total_sales;
DROP TABLE IF EXISTS products.sale_detail;
