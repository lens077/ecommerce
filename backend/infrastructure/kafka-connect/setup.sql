-- Debezium CDC 的数据库侧准备。
--
-- 手工执行（仓库没有 migration 工具，和各服务的 schema.sql 一样的做法）：
--   kubectl exec -i -n postgres postgres-postgresql-0 -- \
--     psql -U postgres -d ecommerce < backend/infrastructure/kafka-connect/setup.sql
--
-- 必须在 apply kafkaconnector.yaml **之前**跑完，否则 connector 会因为
-- 找不到 publication 而反复失败。

-- 1. 清掉孤儿复制槽。
--
-- debezium_slot 是上一套完全不同的配置留下的残骸：它的输出插件是 wal2json、
-- 挂在 postgres 库上，而现在的 connector 用的是 pgoutput + ecommerce 库。
-- 更要命的是 wal2json 的 .so 在 bitnami postgres:18 镜像里根本不存在，
-- 谁也读不了它 —— 它只会永远钉住 WAL 不让回收。
-- 新 connector 用 dbz_ecommerce 这个槽，不会复用它，所以必须手动删。
SELECT pg_drop_replication_slot('debezium_slot')
WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'debezium_slot');

-- 2. 预建 publication。
--
-- debezium_user 有 REPLICATION 属性但**不是超级用户**，执行不了
-- CREATE PUBLICATION ... FOR ALL TABLES（该语句要求 superuser）。
-- 所以由 postgres 建好，connector 侧配 publication.autocreate.mode=disabled 直接用，
-- 既能跑通又不用给 CDC 账号提权。
--
-- 表清单必须和 kafkaconnector.yaml 的 table.include.list 保持一致 ——
-- publication 里没有的表，Debezium 收不到它的变更；
-- table.include.list 里没有的表，白白多占 WAL 解码开销。
DROP PUBLICATION IF EXISTS dbz_ecommerce_pub;
CREATE PUBLICATION dbz_ecommerce_pub FOR TABLE
    orders.order_main,
    orders.order_item,
    orders.order_log,
    products.skus,
    products.spus,
    products.sale_detail;

-- 3. 快照阶段 Debezium 要 SELECT 这几张表；PG 15 起 pgoutput 也会校验
--    复制账号对已发布表的 SELECT 权限。
GRANT USAGE ON SCHEMA orders, products TO debezium_user;
GRANT SELECT ON ALL TABLES IN SCHEMA orders, products TO debezium_user;

-- 注：还需要给复制槽的 WAL 保留量封顶（max_slot_wal_keep_size = 2GB），
-- 否则任何一个停止消费的槽都会无上限地攒 WAL，而 PG 的 PVC 只有 8Gi，
-- 撑满之后主库会因为写不下 WAL 直接拒绝写入。
-- 但这条不在这里用 ALTER SYSTEM 下 —— 本实例的 postgresql.conf 来自
-- ConfigMap my-postgres-all-in-one-config，改在这里会写进 postgresql.auto.conf，
-- 而 auto.conf 优先级更高，等于把同一个参数分裂成两个来源。
-- 正确的落点见 node1:/home/kubernetes/postgres/postgresql.conf。

-- 验证：
--   SELECT pubname, puballtables FROM pg_publication;
--   SELECT * FROM pg_publication_tables WHERE pubname = 'dbz_ecommerce_pub';  -- 应为 6 行
--   SELECT slot_name, plugin, database, active FROM pg_replication_slots;     -- 应为空
