-- 商品服务：搜索策展投影表 products.search_catalog。
-- 2026-09-03 起，搜索投影由本表定义，一行 = 一个 Elasticsearch 文档（alias ecommerce_catalog_products）。
-- 搬运层是 Debezium CDC → Kafka → Elasticsearch Sink（同级仓 postgres-kafka-es-streaming-pipeline），
-- 本仓不再有自写 indexer；tools/search-indexer 与 outbox→NATS 链随之退役。
--
-- 为什么用 trigger 而不是应用层同事务 upsert：投影是 spus/skus/sale_detail 三表的纯函数，
-- 不含业务判断；当前写这三张表的路径全是绕过 Go 服务的 SQL（seed / 修数），
-- 应用层 upsert 覆盖不到它们。判据与讨论见 docs/design/search/search.md。
--
-- 列与 Elasticsearch mapping 一一对应（mapping 真相源：pipeline 仓 deploy/docker-node3/index-mappings.json）：
--   price      最低 active SKU 价，无 active SKU 时为 0；仅供展示/排序，不得用于交易计算
--   sale_count products.sale_detail 按 spu 求和（与 spu_total_sales 视图同义；视图本身进不了逻辑复制）
--   updated_at 投影刷新时刻，表示索引新鲜度，不是商品业务时间
-- status = 'deleted' 或 SPU 行被删时，删除投影行 → Debezium tombstone → ES 删除文档。

-- +goose Up
CREATE TABLE products.search_catalog
(
    id             BIGINT         PRIMARY KEY,          -- = products.spus.id，也是 ES 文档 _id
    spu_code       VARCHAR(64)    NOT NULL,
    name           VARCHAR(255)   NOT NULL,
    description    TEXT           NOT NULL,
    status         VARCHAR(16)    NOT NULL,              -- spus.status::text；查询端固定过滤 online
    main_media_url VARCHAR(500)   NOT NULL,
    merchant_id    UUID           NOT NULL,
    price          DECIMAL(10, 2) NOT NULL,
    sale_count     BIGINT         NOT NULL,
    updated_at     TIMESTAMPTZ    NOT NULL
);
COMMENT ON TABLE products.search_catalog IS '搜索策展投影：spus/skus/sale_detail 的派生行，由 trigger 维护，经 CDC 同步到 Elasticsearch alias ecommerce_catalog_products';

-- +goose StatementBegin
CREATE FUNCTION products.search_catalog_refresh(p_spu_id BIGINT) RETURNS VOID
    LANGUAGE plpgsql AS
$$
BEGIN
    -- 单条 SPU 重算：与全量回填走同一条 SQL，投影定义只有一份。
    INSERT INTO products.search_catalog (id, spu_code, name, description, status, main_media_url, merchant_id,
                                         price, sale_count, updated_at)
    SELECT s.id,
           s.spu_code,
           s.name,
           s.description,
           s.status::text,
           s.main_media_url,
           s.merchant_id,
           COALESCE((SELECT MIN(k.price) FROM products.skus k WHERE k.spu_id = s.id AND k.status = 'active'), 0),
           COALESCE((SELECT SUM(d.quantity) FROM products.sale_detail d WHERE d.spu_id = s.id), 0),
           now()
    FROM products.spus s
    WHERE s.id = p_spu_id
      AND s.status <> 'deleted'
    ON CONFLICT (id) DO UPDATE
        SET spu_code       = EXCLUDED.spu_code,
            name           = EXCLUDED.name,
            description    = EXCLUDED.description,
            status         = EXCLUDED.status,
            main_media_url = EXCLUDED.main_media_url,
            merchant_id    = EXCLUDED.merchant_id,
            price          = EXCLUDED.price,
            sale_count     = EXCLUDED.sale_count,
            updated_at     = EXCLUDED.updated_at;

    -- SPU 不存在或已 deleted：删除投影行（不存在则无操作，幂等）。
    IF NOT FOUND THEN
        DELETE FROM products.search_catalog WHERE id = p_spu_id;
    END IF;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION products.search_catalog_on_spus() RETURNS TRIGGER
    LANGUAGE plpgsql AS
$$
BEGIN
    PERFORM products.search_catalog_refresh(COALESCE(NEW.id, OLD.id));
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION products.search_catalog_on_child() RETURNS TRIGGER
    LANGUAGE plpgsql AS
$$
BEGIN
    -- skus / sale_detail 都以 spu_id 归属 SPU；spu_id 被改时新旧两侧都要重算。
    IF NEW.spu_id IS NOT NULL THEN
        PERFORM products.search_catalog_refresh(NEW.spu_id);
    END IF;
    IF OLD.spu_id IS NOT NULL AND OLD.spu_id IS DISTINCT FROM NEW.spu_id THEN
        PERFORM products.search_catalog_refresh(OLD.spu_id);
    END IF;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER trg_search_catalog_spus
    AFTER INSERT OR UPDATE OR DELETE ON products.spus
    FOR EACH ROW EXECUTE FUNCTION products.search_catalog_on_spus();

CREATE TRIGGER trg_search_catalog_skus
    AFTER INSERT OR UPDATE OF price, status, spu_id OR DELETE ON products.skus
    FOR EACH ROW EXECUTE FUNCTION products.search_catalog_on_child();

CREATE TRIGGER trg_search_catalog_sale_detail
    AFTER INSERT OR UPDATE OF quantity, spu_id OR DELETE ON products.sale_detail
    FOR EACH ROW EXECUTE FUNCTION products.search_catalog_on_child();

-- 回填存量 SPU
SELECT products.search_catalog_refresh(id) FROM products.spus;

-- +goose Down
DROP TRIGGER IF EXISTS trg_search_catalog_sale_detail ON products.sale_detail;
DROP TRIGGER IF EXISTS trg_search_catalog_skus ON products.skus;
DROP TRIGGER IF EXISTS trg_search_catalog_spus ON products.spus;
DROP FUNCTION IF EXISTS products.search_catalog_on_child();
DROP FUNCTION IF EXISTS products.search_catalog_on_spus();
DROP FUNCTION IF EXISTS products.search_catalog_refresh(BIGINT);
DROP TABLE IF EXISTS products.search_catalog;
