# 商品表设计（早期设计稿）

> 从根 `DESIGN.md` 拆出（2026-08-08）。⚠️ 本文是**设计期草稿**，与实际建表已有出入
> （如 ListProducts 的 SQL 用的是 `products.spus`，本文写的是 `products.spu`）。
> 真相以 [`backend/services/product/internal/data/migrations/`](../../../backend/services/product/internal/data/migrations/) 为准，
> 本文仅保留字段取舍的设计意图。列表查询设计见 [listing.md](listing.md)。
> ⚠️ 2026-08-26 标注两处与定稿冲突项（新表禁止效仿，存量迁移属代码债，看板 P2）：
> ① `price DECIMAL(10,2)` 违反「金额 int64 最小单位（分）/ PG 用 NUMERIC 无损」铁律；
> ② `merchant_id BIGINT` 与「跨服务标识一律 UUID 字符串」漂移（proto 与搜索投影里它是 string）。

1. 商品 SPU 表

    ```sql
    CREATE TABLE IF NOT EXISTS products.spu
    (
        id             BIGSERIAL PRIMARY KEY,
        spu_code       VARCHAR(64)  NOT NULL UNIQUE,
        name           VARCHAR(255) NOT NULL,
        description    TEXT         NOT NULL DEFAULT '',
        category_id    BIGINT       NOT NULL,
        brand_id       BIGINT       NOT NULL,
        merchant_id    BIGINT       NOT NULL,
        main_image_url VARCHAR(500) NOT NULL,
        banner_urls    JSONB        NOT NULL DEFAULT '[]',
        status         VARCHAR(32)  NOT NULL DEFAULT 'draft', -- draft/on_sale/off_sale/deleted
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE products.spu IS '商品SPU表';
    ```

商品 SKU 表

    ```sql
    CREATE TYPE products.skus_status_enum AS ENUM ('active','inactive','deleted');
    
    CREATE TABLE IF NOT EXISTS products.skus
    (
        id            BIGSERIAL PRIMARY KEY,
        sku_code      VARCHAR(64)               NOT NULL UNIQUE,
        spu_id        BIGINT                    NOT NULL REFERENCES products.spu (id),
        merchant_id   BIGINT                    NOT NULL,
        price         DECIMAL(10, 2)            NOT NULL,
        cost_price    DECIMAL(10, 2)            NOT NULL,
        bar_code      VARCHAR(128)              NOT NULL,
        thumbnail_url VARCHAR(500)              NOT NULL,
        attributes    JSONB                     NOT NULL DEFAULT '{}',
        status        products.skus_status_enum NOT NULL DEFAULT 'active',
        created_at    timestamptz               NOT NULL DEFAULT now(),
        updated_at    timestamptz               NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE products.skus IS '商品SKU表';
    ```
