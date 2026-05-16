-- CREATE DATABASE ecommerce;

-- DROP SCHEMA products;
CREATE SCHEMA IF NOT EXISTS products;
SET search_path TO products;

-- draft 草稿, online 上架, offline下架, deleted 逻辑删除
CREATE TYPE spus_status_enum AS ENUM ('draft','online','offline','deleted');

-- 商品核心信息
CREATE TABLE IF NOT EXISTS spus
(
    id             BIGSERIAL PRIMARY KEY,
    spu_code       VARCHAR(64)               NOT NULL UNIQUE, -- SPU编码，例iphone15-pro
    name           VARCHAR(255)              NOT NULL,        -- 商品名称
    description    TEXT                      NOT NULL,        -- 商品描述
    category_id    BIGINT                    NOT NULL,        -- 商品分类ID
    merchant_id    BIGINT                    NOT NULL,        -- 商家ID
    brand_id       BIGINT                    NOT NULL,        -- 品牌ID
    status         spus_status_enum          NOT NULL,        -- 状态
    main_media_url VARCHAR(500)              NOT NULL,        -- 主图/视频URL
    images_gallery JSONB       DEFAULT '[{}]',                -- 商品图集数组
    specs          JSONB       DEFAULT '{}',                  -- 商品通用规格
    created_at     timestamptz DEFAULT now() NOT NULL,        -- Unix时间戳，避免时区问题
    updated_at     timestamptz DEFAULT now() NOT NULL
);
COMMENT
    ON TABLE spus IS '商品概念表';
