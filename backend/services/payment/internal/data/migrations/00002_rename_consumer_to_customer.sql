-- 术语统一：买家实体一律 Customer。consumer 让位给 Kafka/NATS 的消息消费者
-- （同一个 backend 里 consumer_id 与 consumer_group 并存，grep 分不开）。
--
-- 一步 RENAME 的依据：context/team/db-migrations.md 规则 2 的「纯桩服务」例外，四条件逐一核实：
-- ①payment 单副本（backend/services/payment/deploy/{dev,prod} 均 replicas:1）；②data 层
-- 5 个方法当前全部返回 Unimplemented（internal/data/payment.go:49-67，真实现是注释块），
-- 运行时没有任何 SQL 读写这两列；③无已知仓库外 SQL 消费者读写 payments 表（node3 的
-- Debezium CDC 链是独立演示链、非业务链路，见 docs/todo/数据一致性与事件驱动.md；
-- 业务库日后接入 CDC 则此豁免失效）；
-- ④即本注释。滚动更新期间不存在新旧副本读不同列名的窗口。**豁免的前提就是「桩」**——
-- 等 data 层恢复成真实现之后，再改这张表的列名必须老老实实拆三步。

-- +goose Up
ALTER TABLE payments.payments RENAME COLUMN consumer_id TO customer_id;
ALTER TABLE payments.payments RENAME COLUMN consumer_version TO customer_version;

COMMENT ON COLUMN payments.payments.customer_id IS '买家 ID';
COMMENT ON COLUMN payments.payments.customer_version IS '买家乐观锁版本';

-- +goose Down
ALTER TABLE payments.payments RENAME COLUMN customer_id TO consumer_id;
ALTER TABLE payments.payments RENAME COLUMN customer_version TO consumer_version;
