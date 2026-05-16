-- CREATE DATABASE ecommerce;

-- DROP SCHEMA products;
CREATE SCHEMA IF NOT EXISTS products;
SET search_path TO products;

-- active 启用: 该规格正常可售,
-- inactive 停用: 该规格暂时不可售
-- deleted 逻辑删除: 运营删除不再销售的规格。前端不可见，数据库保留记录用于历史订单查询
CREATE TYPE skus_status_enum AS ENUM ('active','inactive','deleted');

-- 销售实物
CREATE TABLE IF NOT EXISTS skus
(
    id             BIGSERIAL PRIMARY KEY,
    sku_code       VARCHAR(64)      NOT NULL UNIQUE,                 -- SKU编码，如 iphone15-pro-black-256
    spu_id         BIGINT           NOT NULL,                        -- SPU的id,方便集合查询
    merchant_id    BIGINT           NOT NULL,                        -- 商家ID
    price          DECIMAL(10, 2)   NOT NULL,                        -- 销售价格
    cost_price     DECIMAL(10, 2)   NOT NULL,                        -- 成本价，由采购/商家填写，用于后续的分析
    stock_quantity INTEGER          NOT NULL DEFAULT 0,              -- 库存数量
    stock_locked   INTEGER          NOT NULL DEFAULT 0,              -- 已经锁定的库存
    attributes     JSONB            NOT NULL DEFAULT '{}',           -- 销售属性，（键值对），如 {"颜色": "深空黑", "存储": "256GB"}'
    bar_code       VARCHAR(128)     NOT NULL,                        -- 条形码
    thumbnail_url  VARCHAR(500)     NOT NULL,                        -- SKU缩略图
    status         skus_status_enum NOT NULL DEFAULT 'active',       -- 状态
    created_at     timestamptz               DEFAULT now() NOT NULL, -- Unix时间戳，避免时区问题
    updated_at     timestamptz               DEFAULT now() NOT NULL
);
COMMENT ON TABLE skus IS '销售实物表';
