CREATE SCHEMA IF NOT EXISTS cart;
SET search_path TO cart;

CREATE TYPE cart.cart_type AS ENUM (
    'active',
    'expired',
    'deleted'
    );

-- 购物车主表
CREATE TABLE IF NOT EXISTS cart.cart_item
(
    id                BIGSERIAL PRIMARY KEY,                    -- 自增主键
    user_id           UUID           NOT NULL, -- 用户ID
    merchant_id UUID NOT NULL, -- 商家ID（数据隔离）
    spu_id BIGINT NOT NULL,                                     -- SPU ID
    sku_id            BIGINT         NOT NULL,                  -- SKU ID
    quantity          INT            NOT NULL DEFAULT 1,        -- 数量
    selected          BOOLEAN        NOT NULL DEFAULT TRUE,     -- 是否选中（下单时勾选）

    -- 商品快照（加入购物车时的信息）
    spu_name          VARCHAR(255)   NOT NULL,                  -- SPU名称快照
    sku_name          VARCHAR(255)   NOT NULL,                  -- SKU名称快照
    price             DECIMAL(10, 2) NOT NULL,                  -- 加入时单价
    sku_attributes    JSONB          NOT NULL DEFAULT '{}',     -- SKU销售属性快照
    sku_thumbnail_url VARCHAR(500)   NOT NULL,                  -- SKU缩略图快照

    status            cart_type      NOT NULL DEFAULT 'active', -- active, expired, deleted
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- 唯一约束：一个用户对同一个SKU在同一商家下只能有一条记录（数量累加）
    UNIQUE (user_id, merchant_id, sku_id)
);
COMMENT ON TABLE cart.cart_item IS '购物车明细表';

-- 索引
CREATE INDEX idx_cart_user_id ON cart.cart_item (user_id);
CREATE INDEX idx_cart_merchant_id ON cart.cart_item (merchant_id);
CREATE INDEX idx_cart_user_selected ON cart.cart_item (user_id, selected);
CREATE INDEX idx_cart_user_merchant ON cart.cart_item (user_id, merchant_id);