-- 事务性发件箱（orders schema）。
--
-- 为什么存在：订单状态变更与「订单完成事件」必须**同生共死**。进程内总线时代，
-- SaveOrder 提交与事件发布是两个独立副作用（W1 缺口：提交后崩溃 = 订单在、事件永久丢）。
-- 这里把事件行放进同一事务：要么订单与事件一起提交，要么一起回滚，没有中间态。
--
-- 搬运：Debezium Outbox Event Router 从 WAL 读本表（TECH-RADAR §1.8），按提交序投 Kafka；
-- 没有 published_at/attempts/last_error 簿记列——游标就是 WAL 位点。
-- 信封：列按 CloudEvents 属性（TECH-RADAR §1.6），同时保留 EventRouter 的默认列名，
-- 这样 SMT 配置可以用默认 route.by.field=aggregatetype 而不必改列名。
--
-- 保留策略：connector 上线前这些行只进不出，必须配 purge（按 occurred_at 删除，见
-- services/order/outbox.md 的运维段）。
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS orders.outbox (
    id            UUID         PRIMARY KEY,                     -- CE id：UUIDv7，同时是幂等键的一半
    source        TEXT         NOT NULL,                        -- CE source：/services/order
    type          TEXT         NOT NULL,                        -- CE type：reverse-DNS 过去式
    subject       TEXT         NOT NULL,                        -- CE subject：聚合标识，如 order/<order_no>
    aggregatetype TEXT         NOT NULL,                        -- EventRouter 路由字段（界上下文）
    aggregateid   TEXT         NOT NULL,                        -- EventRouter 聚合标识（= subject 的值部分）
    partitionkey  TEXT         NOT NULL,                        -- Kafka partition key：同一聚合有序
    payload       JSONB        NOT NULL,                        -- CE data
    headers       JSONB        NOT NULL DEFAULT '{}'::jsonb,    -- CE 属性与 traceparent（binary mode）
    occurred_at   TIMESTAMPTZ  NOT NULL                         -- CE time，同时作为 purge 依据
);
COMMENT ON TABLE orders.outbox IS '订单领域事件的事务性发件箱：与业务写同事务；Debezium Outbox Event Router 搬到 Kafka 领域事件主干';
COMMENT ON COLUMN orders.outbox.headers IS 'CloudEvents 属性（content-type/specversion/traceparent 等），由具体 events 写入';
-- purge 按 occurred_at 扫，connector 用 WAL 位点，不需要 published 标记索引。
CREATE INDEX IF NOT EXISTS idx_orders_outbox_occurred_at ON orders.outbox (occurred_at);
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS orders.outbox;
