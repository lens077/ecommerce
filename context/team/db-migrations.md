---
name: db-migrations
layer: team
description: 数据库结构变更与种子数据的唯一路径——goose 版本化迁移（tools/dbmigrate）、baseline 接管存量库、幂等种子、与 sqlc 的单一真相源关系，以及三处实测踩过的坑
affects:
  - backend/tools/dbmigrate
  - backend/sqlc.yaml
---

# 数据库迁移与种子数据

> 2026-08-21 终裁采用 goose v3；过程稿已删除。操作手册见
> `backend/tools/dbmigrate/README.md`。本文只写**判定规则**与换个服务仍成立的坑。

## 规则

1. **结构变更只有一条路**：`make migrate-create MIGRATE_SVC=<svc> NAME=<what>` 生成
   `internal/data/migrations/<n>_<what>.sql`，写 `-- +goose Up` / `-- +goose Down`，
   **同一 PR 里重跑 `sqlc generate` 提交生成物**。不再存在独立的 schema/ 目录——
   迁移目录就是 sqlc 的 schema 输入（sqlc 官方解析 goose 注解并忽略 Down 段），
   改了其中一个没改另一个 = 生成物漂移（merchant 曾积欠 agreement 表整整一张，
   order 的 merchant_id 类型欠账 int64→UUID，都是 2026-08-21 接管时才补上的）。
2. **滚更兼容**：迁移必须按 expand→backfill→contract 拆（`docs/DEVOPS.md` 阶段②）——
   滚动更新期间新旧版本共存，一步到位的改列会打死旧副本。
   **唯一例外——纯桩服务可一步改列**，四个条件**全部**成立才适用：①目标服务单副本；
   ②data 层对该表零真实 SQL 读写（相关方法全是显式 `Unimplemented` 桩）；③无仓库外
   SQL 消费者（CDC connector、报表、人工脚本）读写该表；④迁移文件头注明依据本条例外，
   并写清前三点各自的核实位置。任一条件失效（桩恢复真实现、扩了副本、接了 CDC）后，
   同表列变更必须回到三段式。先例：payment `00002_rename_consumer_to_customer.sql`
   （2026-08-30 买家实体统一 Customer；2026-08-31 复审指出「豁免只在迁移文件里自证」
   不合规，遂把例外条件正式化于此，而非默许各迁移自行授予豁免）。
3. **种子数据必须幂等**：`internal/data/seeds/` 走 goose no-versioning 模式
   （`make seed` / `seed-down`），没有版本表兜底，重跑就是重放——
   `ON CONFLICT DO NOTHING/UPDATE` 或 `WHERE NOT EXISTS` 是硬要求；
   外键一律用业务键子查询（`(SELECT id FROM products.spus WHERE spu_code=...)`），
   写死自增 ID 的种子在非空库上必错位。
4. **存量环境接管用 baseline，不改 DDL 语义**：已手工建过表的库（当前外部 Pigsty；CNPG 仅为存量休眠环境）跑
   `make migrate-baseline` 把「现状=已应用」记进版本表；**不要**为了可重放把
   `CREATE TYPE` 包进 `DO $$ ... EXCEPTION` ——sqlc 的解析器没有 DO 块分支，
   包进去的类型会从 catalog 里消失，枚举模型直接退化（对抗第4轮 codex 实证）。

## 关键陷阱

- **迁移文件里禁写 `SET search_path`**。goose 用非限定名读写版本表，`SET search_path
  TO cart` 是会话级的，执行完这条后 goose 在同一连接上 `INSERT INTO goose_db_version_*`
  会解析到 cart schema 里去 → `relation does not exist`，整条迁移回滚。症状：五个带
  search_path 的服务全部报 `failed to insert version`，三个不带的全部成功（2026-08-21
  实测）。对策（已双保险）：迁移对象全部显式限定 schema；dbmigrate 的版本表名带
  `public.` 前缀。
- **版本表不能放进业务 schema**：goose 在跑 00001 之前就要先建版本表，而 00001 才
  `CREATE SCHEMA` ——`cart.goose_db_version` 是鸡生蛋，必失败。版本表统一
  `public.goose_db_version_<svc>`，按服务隔离、互不阻塞。
- **`Provider.Close()` 会连带关掉传入的 `*sql.DB`**：想复用同一个句柄做后续操作
  （baseline 记账）就不能提前 Close，否则 `sql: database is closed`。
- **`-- +goose NO TRANSACTION` 的迁移没有失败保护**（对抗第4轮 codex 实证：非事务
  迁移半途失败不会回滚也无 dirty 标记）——只在 `CREATE INDEX CONCURRENTLY` 这类
  必须出事务的语句上使用，且语句必须自带幂等（IF NOT EXISTS）。
- 每服务迁移用独立咨询锁（FNV(服务名)）：同服务多副本并发迁移串行化，服务间并行。

## 与 CDC/outbox 的关系

事件生产者的 outbox 表也是普通迁移，事件行必须与业务写在同一事务插入。product 的 `00006_drop_outbox.sql` 移除 `00004_outbox.sql` 定义的旧表，应用到最新版本后的 schema 不再包含 `products.outbox`。**仓库迁移不代表目标环境已经执行**；当前仓库没有生产者，也不能据此推断存量表为空。首个领域事件生产者落地时随契约新建。当前目标搬运层是 Debezium Outbox Event Router，不再维护自写 relay、destination ACK、`published_at`、attempt、delivery 表或 cursor 语义。

- `00006` 是 contract 步骤：执行前明确环境与 DSN、核对迁移版本、存量数据、旧版本、外部消费者、live publication、Connector 白名单与对象依赖，准备备份/恢复路径和锁等待超时。发现数据或消费者时停止并重新评估；不加 `CASCADE` 绕过依赖失败。
- `00006` 的 Up 使用事务局部 `lock_timeout = '3s'`，长读事务占锁时以 `55P03` 失败并回滚，不无限排队。`TestProductOutboxMigration` 是显式执行的隔离测试，`-short` 门禁不运行它；改该迁移或执行目标环境前，在 `backend/` 运行 `env -u DB_URI -u DB_SOURCE -u TEST_DB_URI go test -count=1 -timeout 5m ./tools/dbmigrate -run '^TestProductOutboxMigration$'`，需要本机 Docker。
- `00006` 的 Down 只重建 `00004` 的空表结构、约束、索引和表注释；不会恢复数据、序列进度或原有权限。owner、GRANT 和 default privileges 必须独立核对。

- outbox 采用 append-only 事件行；`event_id` 唯一，`aggregate_type` 决定 topic，`partition_key` 保证同一聚合分区有序，`payload` 与 `occurred_at` 保存事实内容和发生时间。
- 新建 outbox 表时直接按 Router 需要的列建，不要照抄 `00004_outbox.sql`：它带的 `published_at`/`attempts`/`last_error` 是自写 relay 的簿记列，正是删表的原因之一。表一旦有了生产者，后续改列回到 expand→contract：先加列、改生产者和 Connector，再删无人读取的旧列。
- 发布进度由 Debezium replication slot 与 Connect offset 表示。迁移不得重新引入 JetStream ACK/NACK、双 destination 完成态或应用层发布游标。
- `products.search_catalog` 不是 outbox。它是 trigger 维护的可重建行投影；表、trigger、publication、Connector 和 Elasticsearch mapping 必须按搜索 CDC 手顺一起验收。
