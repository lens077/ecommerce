# dbmigrate — 微服务数据库迁移与种子

goose v3 以**库形态**内嵌（`github.com/pressly/goose/v3`），不需要安装任何外部 CLI。
选型对抗与终裁记录见 `docs/技术栈选型对抗/对抗审阅表-第4轮-迁移库与CDC.md`。

## 布局与约定

```
services/<svc>/internal/data/
├── migrations/   # goose 注解 SQL（-- +goose Up / Down），同时是 sqlc 的 schema 输入
├── seeds/        # 示例/种子数据，goose no-versioning 模式，必须幂等（可重复执行）
├── queries/      # sqlc 查询（不变）
└── models/       # sqlc 生成物（不变；改了 migrations 必须同步重跑 sqlc generate 提交）
```

- 10 个服务共用 `ecommerce` 库、各占一个 PG schema；**版本表按服务隔离**在
  `public.goose_db_version_<svc>`，各服务独立演进互不阻塞。
- 版本号零填充顺序递增（`00001_...`），`make migrate-create` 自动取号。
- 每个服务的迁移用独立的 PG 咨询锁（FNV(服务名)），多副本并发迁移串行化，
  服务之间互不阻塞。
- **迁移文件里不要写 `SET search_path`**：goose 用非限定名读写版本表，
  search_path 被换掉后它会解析失败（已踩过）；所有对象显式带 schema 前缀。
- 种子文件必须写成幂等：`ON CONFLICT ... DO NOTHING/UPDATE` 或 `WHERE NOT EXISTS`，
  外键取值用业务键子查询（如 `(SELECT id FROM products.spus WHERE spu_code=...)`），
  不写死自增 ID。no-versioning 模式没有版本表兜底，不幂等=重复数据。
  **种子没有应用账本**（对抗第4轮 codex 攻击点），只对本地/演示环境执行；
  对集群库执行前必须确认环境与 DSN——工具不做环境探测（port-forward 会把远端伪装成
  localhost，探测只会给假安全感）。
- address 的行政区划字典（16k 行生成物）**不走** goose 种子，保持原路径：
  `psql "$DSN" -f services/address/internal/data/seed/seed_regions.sql`（见 cmd/regionseed）。

## 常用命令（在 backend/ 下）

```bash
make migrate-up                     # 全部服务迁到最新
make migrate-up MIGRATE_SVC=cart    # 单服务
make migrate-status                 # 状态
make migrate-down MIGRATE_SVC=cart  # 回滚最近一条
make seed                           # 灌示例数据（幂等，可重复跑）
make seed-down                      # 清示例数据
make migrate-create MIGRATE_SVC=cart NAME=add_coupon_column
```

DSN 优先级：`-dsn` 参数 > `DB_URI` > `DB_SOURCE` > 本地默认
`postgres://postgres:postgres@127.0.0.1:15432/ecommerce?sslmode=disable`。

本地起验证库：

```bash
docker run -d --name ecommerce-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ecommerce -p 15432:5432 postgres:18-alpine
```

## 首次接管存量库（集群 CNPG）

集群 `ecommerce` 库的表历史上是手工 psql 建的，**不能**直接 `up`（初始迁移会撞已存在
对象）。流程：

```bash
kubectl -n postgresql port-forward svc/pg-main-rw 15432:5432 &
export DB_URI='postgres://app:<密码>@127.0.0.1:15432/ecommerce'   # 密码在 Config Center，不入库
make migrate-baseline        # 把「现有结构=已应用到最新」记进版本表（只允许对空版本表执行）
make migrate-status          # 确认全部 applied
```

之后新的结构变更一律走 `migrate-create` 增量迁移 + `sqlc generate` 同 PR 提交；
滚更期新旧共存要求 expand→backfill→contract 节奏（见 `docs/DEVOPS.md` 阶段②）。

## 与 sqlc 的关系

`sqlc.yaml` 的 `schema:` 已指向 `internal/data/migrations`，sqlc 官方支持解析 goose
注解并忽略 Down 段（https://docs.sqlc.dev/en/latest/howto/ddl.html）。因此迁移文件是
**唯一**的表结构真相源：改结构 = 加迁移文件 = sqlc 输入同步变化，生成物与迁移同 PR 提交。

## 集群重建全量建表（2026-08-21 真库实测）

重建集群 → `pg-main` 就绪（部署仓 postgres 组件已全自动建实例+库）后，一条命令建全量表：

```bash
cd backend && make migrate-cnpg-up SEED=1     # 空库: 9 服务全量 up + 幂等种子
```

- 实测证据（migrate_smoke 一次性库）：12 个迁移全过（3–13ms/个）→ **19 张业务表**
  （18 张各服务 schema + `public.users` 历史债）+ **9 张 goose 版本表**；重跑 = 全 no-op。
- **接管手工建过表的存量库**（不是重建）：`make migrate-cnpg-up CMD=baseline`。
- 连接方式 = 临时 LoadBalancer 直连（用完即删）。两个实测坑，别绕回去：
  `kubectl port-forward` 在 PG 连续建连下**起来即死**；`pg-passthrough-gateway` 的 VIP 走
  **TLS-SNI 路由**，拿 IP 连会被拒（必须 `pg.dev.test` 域名解析）。
- 表名快查（核验 SQL 别拼错，本人踩过两次）：`products.sale_detail`、`cart.cart_item`
  均为**单数**（历史债，见各迁移文件头注释）。
