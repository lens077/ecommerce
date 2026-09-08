-- 商品服务：事务性 outbox 表的 2026-08-21 初始结构。
-- 迁移判定规则见 context/team/db-migrations.md。
--
-- 当前语义：业务写与 outbox 写在同一事务提交；目标搬运层是 Debezium Outbox
-- Event Router → Kafka。自写 relay 与 NATS JetStream 已退役，不得再使用 PubAck、
-- destination ACK 或应用层发布游标解释本表。
--
-- published_at、attempts、last_error 及两个发布簿记索引是初始结构遗留，等待后续
-- goose 迁移删除。它们不表示当前发布进度；当前进度由 replication slot 与 Connect
-- offset 表示。列按 CloudEvents 1.0 属性对齐：event_id=id, source, type, subject,
-- occurred_at=time。消费者仍必须按 event_id 幂等。

-- +goose Up
CREATE TABLE products.outbox
(
    id            BIGSERIAL PRIMARY KEY,                          -- 初始结构的单调行 ID；不是当前发布游标
    event_id      UUID         NOT NULL DEFAULT gen_random_uuid() UNIQUE, -- CloudEvents id 与消费幂等键
    source        VARCHAR(128) NOT NULL,                          -- CloudEvents source，如 /service/product
    type          VARCHAR(128) NOT NULL,                          -- CloudEvents type，如 ecommerce.product.spu.upserted
    subject       VARCHAR(128) NOT NULL,                          -- CloudEvents subject：聚合标识，如 spu:42
    partition_key VARCHAR(128) NOT NULL,                          -- Kafka partition key，保证同聚合根有序
    payload       JSONB        NOT NULL,                          -- CloudEvents data
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),            -- CloudEvents time
    published_at  TIMESTAMPTZ,                                    -- 遗留簿记列，待后续迁移删除
    attempts      INT          NOT NULL DEFAULT 0,                -- 遗留簿记列，待后续迁移删除
    last_error    TEXT                                            -- 遗留簿记列，待后续迁移删除
);
COMMENT ON TABLE products.outbox IS '事务性发件箱：与业务写同事务落库；目标搬运层为 Debezium Outbox Event Router 到 Kafka；发布进度由 WAL 与 Connect offset 表示';

-- 以下两个索引服务于初始 relay 簿记结构；后续迁移与遗留列一并删除。
CREATE INDEX idx_products_outbox_unpublished ON products.outbox (id) WHERE published_at IS NULL;
CREATE INDEX idx_products_outbox_published_at ON products.outbox (published_at) WHERE published_at IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS products.outbox;
