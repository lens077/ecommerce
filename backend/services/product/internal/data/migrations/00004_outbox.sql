-- 商品服务：事务性 outbox 表（TODO ③「NATS JetStream 落地」的第一个生产者）。
-- 2026-08-21 新增。设计对抗与终裁见 docs/技术栈选型对抗/对抗审阅表-第4轮-迁移库与CDC.md。
--
-- 语义：业务写与 outbox 写在同一事务提交（杜绝双写丢事件）；独立 relay
-- （backend/pkg/outbox + tools/outbox-relay）按 id 批扫未发布行，发到 NATS JetStream
-- （Nats-Msg-Id = event_id 做窗口去重），PubAck 后标记 published_at。
-- 列按 CloudEvents 1.0 属性对齐：event_id=id, source, type, subject, occurred_at=time。
-- 消费者必须幂等：JetStream 去重窗口默认 2 分钟，relay 停摆超窗后重投是设计内行为。

-- +goose Up
CREATE TABLE products.outbox
(
    id            BIGSERIAL PRIMARY KEY,                          -- relay 扫描游标（近似提交序）
    event_id      UUID         NOT NULL DEFAULT gen_random_uuid() UNIQUE, -- CloudEvents id；发布时作 Nats-Msg-Id
    source        VARCHAR(128) NOT NULL,                          -- CloudEvents source，如 /service/product
    type          VARCHAR(128) NOT NULL,                          -- CloudEvents type，如 ecommerce.product.spu.upserted
    subject       VARCHAR(128) NOT NULL,                          -- CloudEvents subject：聚合标识，如 spu:42
    partition_key VARCHAR(128) NOT NULL,                          -- 保序键；relay 对同键按 id 串行发布
    payload       JSONB        NOT NULL,                          -- CloudEvents data（事件携带完整投影，消费者不回查库）
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),            -- CloudEvents time
    published_at  TIMESTAMPTZ,                                    -- NULL = 待发布
    attempts      INT          NOT NULL DEFAULT 0,                -- 发布尝试次数
    last_error    TEXT                                            -- 最近一次发布失败原因
);
COMMENT ON TABLE products.outbox IS '事务性发件箱：与业务写同事务落库，由 relay 异步发布到 NATS JetStream';

-- relay 唯一扫描路径；部分索引不随已发布历史膨胀
CREATE INDEX idx_products_outbox_unpublished ON products.outbox (id) WHERE published_at IS NULL;
-- 清理路径（按发布时间保留窗口删除）
CREATE INDEX idx_products_outbox_published_at ON products.outbox (published_at) WHERE published_at IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS products.outbox;
