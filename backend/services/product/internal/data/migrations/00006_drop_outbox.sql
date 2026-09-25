-- 移除没有当前仓库生产者的 products.outbox。
-- 迁移判定规则见 context/team/db-migrations.md。
--
-- pkg/outbox.Insert 已随 90000abe 删除；当前仓库没有本表的业务读写。
-- 这不能证明目标环境没有存量数据、旧版本或外部消费者。
-- 本迁移是 contract 步骤，不因操作是删表而豁免兼容性核查。
-- 执行前必须确认目标环境、迁移版本、表内数据、仍运行的旧版本、外部脚本、
-- live publication、Connector 白名单及对象依赖，并准备备份/恢复路径和锁等待超时。
-- 发现数据或消费者时先停止并重新评估；仓库配置或历史 GRANT 不能替代运行态核查。
-- 不使用 CASCADE：未知依赖必须阻止删表，不能随迁移自动删除。
-- 线 B（领域事件）开工时按首个真实事件契约新建 outbox，不照搬旧 relay 簿记列。

-- +goose Up
DROP TABLE IF EXISTS products.outbox;

-- +goose Down
-- 仅恢复 00004 的空表结构、约束、索引与表注释，不恢复数据或原有序列进度。
-- owner、GRANT 与 default privileges 由执行环境决定，原有权限须独立核对/恢复。
CREATE TABLE products.outbox
(
    id            BIGSERIAL PRIMARY KEY,
    event_id      UUID         NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    source        VARCHAR(128) NOT NULL,
    type          VARCHAR(128) NOT NULL,
    subject       VARCHAR(128) NOT NULL,
    partition_key VARCHAR(128) NOT NULL,
    payload       JSONB        NOT NULL,
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ,
    attempts      INT          NOT NULL DEFAULT 0,
    last_error    TEXT
);
COMMENT ON TABLE products.outbox IS '事务性发件箱：与业务写同事务落库；目标搬运层为 Debezium Outbox Event Router 到 Kafka；发布进度由 WAL 与 Connect offset 表示';
CREATE INDEX idx_products_outbox_unpublished ON products.outbox (id) WHERE published_at IS NULL;
CREATE INDEX idx_products_outbox_published_at ON products.outbox (published_at) WHERE published_at IS NOT NULL;
