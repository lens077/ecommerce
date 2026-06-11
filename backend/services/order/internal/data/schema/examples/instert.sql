-- ==========================================
-- 1. 结构初始化与 Schema 声明
-- ==========================================
CREATE SCHEMA IF NOT EXISTS orders;
SET search_path TO orders;

-- 订单状态枚举
DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_enum') THEN
            CREATE TYPE orders.order_status_enum AS ENUM (
                'pending_payment', 'paid', 'pending_shipment', 'shipped', 'completed', 'cancelled', 'refunding', 'refunded'
                );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipping_status_enum') THEN
            CREATE TYPE orders.shipping_status_enum AS ENUM (
                'unshipped', 'shipped', 'in_transit', 'delivered', 'returning', 'returned'
                );
        END IF;
    END $$;

-- ==========================================
-- 2. 完美的建表结构设计（统一类型）
-- ==========================================

-- 订单组表
CREATE TABLE IF NOT EXISTS orders.order_group
(
    id              BIGSERIAL PRIMARY KEY,
    group_no        VARCHAR(64)    NOT NULL UNIQUE,
    user_id         VARCHAR(64)    NOT NULL, -- 统一调整为 VARCHAR(64) 以兼容 Casdoor
    total_amount    DECIMAL(10, 2) NOT NULL DEFAULT 0,
    freight_amount  DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    pay_amount      DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at      timestamptz    NOT NULL DEFAULT now(),
    updated_at      timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_group_user_id ON orders.order_group (user_id);

-- 订单主表
CREATE TABLE IF NOT EXISTS orders.order_main
(
    id                  BIGSERIAL PRIMARY KEY,
    order_no            VARCHAR(64)                 NOT NULL UNIQUE,
    group_no            VARCHAR(64)                 NOT NULL,
    merchant_id         UUID                        NOT NULL, -- 统一调整为 UUID
    merchant_name       VARCHAR(255)                NOT NULL,
    user_id             VARCHAR(64)                 NOT NULL, -- 统一调整为 VARCHAR(64)
    order_status        orders.order_status_enum    NOT NULL DEFAULT 'pending_payment',
    shipping_status     orders.shipping_status_enum NOT NULL DEFAULT 'unshipped',

    address_name        VARCHAR(64)                 NOT NULL,
    address_phone       VARCHAR(32)                 NOT NULL,
    address_province    VARCHAR(64)                 NOT NULL,
    address_city        VARCHAR(64)                 NOT NULL,
    address_district    VARCHAR(64)                 NOT NULL,
    address_detail      VARCHAR(500)                NOT NULL,
    address_postal_code VARCHAR(16),
    address_full_text   TEXT                        NOT NULL,

    total_amount        DECIMAL(10, 2)              NOT NULL,
    freight_amount      DECIMAL(10, 2)              NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(10, 2)              NOT NULL DEFAULT 0,
    pay_amount          DECIMAL(10, 2)              NOT NULL,

    courier_code        VARCHAR(64),
    courier_name        VARCHAR(64),
    tracking_no         VARCHAR(64),
    shipped_at          timestamptz,
    delivered_at        timestamptz,

    pay_channel         VARCHAR(32),
    pay_no              VARCHAR(64),
    paid_at             timestamptz,
    pay_deadline        timestamptz                 NOT NULL,
    remark              TEXT,
    merchant_remark     TEXT,
    created_at          timestamptz                 NOT NULL DEFAULT now(),
    updated_at          timestamptz                 NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_main_merchant_id ON orders.order_main (merchant_id);
CREATE INDEX IF NOT EXISTS idx_order_main_order_no ON orders.order_main (order_no);

-- 订单明细表
CREATE TABLE IF NOT EXISTS orders.order_item
(
    id                BIGSERIAL PRIMARY KEY,
    order_id          BIGINT         NOT NULL,
    order_no          VARCHAR(64)    NOT NULL,
    merchant_id       UUID           NOT NULL, -- 统一调整为 UUID
    spu_id            BIGINT         NOT NULL,
    sku_id            BIGINT         NOT NULL,
    spu_name          VARCHAR(255)   NOT NULL,
    sku_name          VARCHAR(255)   NOT NULL,
    sku_attributes    JSONB          NOT NULL DEFAULT '{}',
    sku_thumbnail_url VARCHAR(500)   NOT NULL,
    price             DECIMAL(10, 2) NOT NULL,
    cost_price        DECIMAL(10, 2) NOT NULL,
    quantity          INTEGER        NOT NULL,
    total_amount      DECIMAL(10, 2) NOT NULL,
    created_at        timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_item_order_id ON orders.order_item (order_id);

-- 订单状态变更日志表
CREATE TABLE IF NOT EXISTS orders.order_log
(
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT                   NOT NULL,
    order_no      VARCHAR(64)              NOT NULL,
    merchant_id   UUID                     NOT NULL, -- 统一调整为 UUID
    old_status    orders.order_status_enum,
    new_status    orders.order_status_enum NOT NULL,
    operator_type VARCHAR(32)              NOT NULL,
    operator_id   VARCHAR(64),
    remark        TEXT,
    created_at    timestamptz              NOT NULL DEFAULT now()
);

-- ==========================================
-- 3. 数据清空与精准插入测试数据
-- ==========================================
TRUNCATE orders.order_item, orders.order_log, orders.order_main, orders.order_group RESTART IDENTITY;

-- 1. 插入订单组
INSERT INTO orders.order_group (group_no, user_id, total_amount, freight_amount, discount_amount, pay_amount)
VALUES
    ('OG202602240001', '88735c43-9899-44b6-9aec-74f37a8996b4', 26997.00, 0.00, 0.00, 26997.00),
    ('OG202602240002', '88735c43-9899-44b6-9aec-74f37a8996b4', 3250.00,  0.00, 0.00, 3250.00);

-- 2. 插入订单主表（使用固定的标准 UUID 作为 Merchant_id）
INSERT INTO orders.order_main (
    order_no, group_no, merchant_id, merchant_name, user_id,
    order_status, shipping_status,
    address_name, address_phone, address_province, address_city, address_district, address_detail, address_postal_code, address_full_text,
    total_amount, freight_amount, discount_amount, pay_amount,
    pay_channel, pay_no, paid_at, pay_deadline
)
VALUES
    ('ORDER202602240001', 'OG202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', '苹果官方旗舰店', '88735c43-9899-44b6-9aec-74f37a8996b4',
     'paid', 'shipped',
     '张三', '13800138000', '广东省', '深圳市', '南山区', '科技园1号', '518000', '广东省深圳市南山区科技园1号 张三 13800138000',
     17998.00, 0, 0, 17998.00,
     'alipay', 'PAY202602240001', '2026-02-24 10:30:00+08', '2026-02-24 11:00:00+08'),

    ('ORDER202602240058', 'OG202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', '苹果官方旗舰店', '88735c43-9899-44b6-9aec-74f37a8996b4',
     'completed', 'delivered',
     '张三', '13800138000', '广东省', '深圳市', '南山区', '科技园1号', '518000', '广东省深圳市南山区科技园1号 张三 13800138000',
     8999.00, 0, 0, 8999.00,
     'wechat', 'PAY202602240058', '2026-02-24 15:20:00+08', '2026-02-24 16:00:00+08'),

    ('ORDER202602240035', 'OG202602240002', '00000000-0000-0000-0000-000000002002', '雅诗兰黛旗舰店', '88735c43-9899-44b6-9aec-74f37a8996b4',
     'completed', 'delivered',
     '李四', '13900139000', '上海市', '浦东新区', '陆家嘴', '金融中心2号', '200120', '上海市浦东新区陆家嘴金融中心2号 李四 13900139000',
     3250.00, 0, 0, 3250.00,
     'alipay', 'PAY202602240035', '2026-02-24 09:20:00+08', '2026-02-24 10:00:00+08');

-- 3. 动态检索主表自增 ID 插入详情明细（防止 ID 写死冲突）
INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
SELECT
    id, 'ORDER202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 1, 1,
    'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB', '{"颜色": "原色钛金属", "版本": "256GB"}', 'https://cdn.example.com/iphone15pro/black_thumb.jpg',
    8999.00, 7500.00, 2, 17998.00
FROM orders.order_main WHERE order_no = 'ORDER202602240001';

INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
SELECT
    id, 'ORDER202602240058', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 1, 1,
    'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB', '{"颜色": "原色钛金属", "版本": "256GB"}', 'https://cdn.example.com/iphone15pro/black_thumb.jpg',
    8999.00, 7500.00, 1, 8999.00
FROM orders.order_main WHERE order_no = 'ORDER202602240058';

-- 验证小金额高精度的化妆品场景
INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
SELECT
    id, 'ORDER202602240035', '00000000-0000-0000-0000-000000002002', 2, 3,
    '雅诗兰黛小棕瓶精华', '小棕瓶精华 50ml', '{"容量": "50ml"}', 'https://cdn.example.com/anr/50ml_thumb.jpg',
    650.50, 300.00, 5, 3252.50 -- 修正数量乘积关系以确保逻辑完美
FROM orders.order_main WHERE order_no = 'ORDER202602240035';

-- 4. 插入状态日志
INSERT INTO orders.order_log (order_id, order_no, merchant_id, old_status, new_status, operator_type, operator_id, remark)
SELECT id, 'ORDER202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 'pending_payment', 'paid', 'user', '88735c43-9899-44b6-9aec-74f37a8996b4', '用户支付成功'
FROM orders.order_main WHERE order_no = 'ORDER202602240001';

INSERT INTO orders.order_log (order_id, order_no, merchant_id, old_status, new_status, operator_type, operator_id, remark)
SELECT id, 'ORDER202602240058', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 'paid', 'completed', 'system', 'system', '订单已签收完成'
FROM orders.order_main WHERE order_no = 'ORDER202602240058';