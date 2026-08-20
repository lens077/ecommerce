---
name: db-migrations
layer: team
description: 数据库结构变更与种子数据的唯一路径——goose 版本化迁移（tools/dbmigrate）、baseline 接管存量库、幂等种子、与 sqlc 的单一真相源关系，以及三处实测踩过的坑
---

# 数据库迁移与种子数据

> 选型对抗与终裁：`docs/技术栈选型对抗/对抗审阅表-第4轮-迁移库与CDC.md`（2026-08-21，
> goose v3 胜出）。操作手册：`backend/tools/dbmigrate/README.md`。本文只写**判定规则**与
> 换个服务仍成立的坑。

## 规则

1. **结构变更只有一条路**：`make migrate-create MIGRATE_SVC=<svc> NAME=<what>` 生成
   `internal/data/migrations/<n>_<what>.sql`，写 `-- +goose Up` / `-- +goose Down`，
   **同一 PR 里重跑 `sqlc generate` 提交生成物**。不再存在独立的 schema/ 目录——
   迁移目录就是 sqlc 的 schema 输入（sqlc 官方解析 goose 注解并忽略 Down 段），
   改了其中一个没改另一个 = 生成物漂移（merchant 曾积欠 agreement 表整整一张，
   order 的 merchant_id 类型欠账 int64→UUID，都是 2026-08-21 接管时才补上的）。
2. **滚更兼容**：迁移必须按 expand→backfill→contract 拆（`docs/DEVOPS.md` 阶段②）——
   滚动更新期间新旧版本共存，一步到位的改列会打死旧副本。
3. **种子数据必须幂等**：`internal/data/seeds/` 走 goose no-versioning 模式
   （`make seed` / `seed-down`），没有版本表兜底，重跑就是重放——
   `ON CONFLICT DO NOTHING/UPDATE` 或 `WHERE NOT EXISTS` 是硬要求；
   外键一律用业务键子查询（`(SELECT id FROM products.spus WHERE spu_code=...)`），
   写死自增 ID 的种子在非空库上必错位。
4. **存量环境接管用 baseline，不改 DDL 语义**：已手工建过表的库（集群 CNPG）跑
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

事件生产者的 outbox 表也是普通迁移（如 product 的 `00004_outbox.sql`），
CloudEvents 属性列 + `published_at IS NULL` 部分索引；写入必须与业务写同事务
（`backend/pkg/outbox`）。链路契约见对抗审阅表第4轮与 `backend/tools/cdc-demo/`。
