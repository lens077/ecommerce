# dbmigrate — 微服务数据库迁移与种子

goose v3 以**库形态**内嵌（`github.com/pressly/goose/v3`），不需要安装任何外部 CLI。
迁移判定规则与实测陷阱见 `context/team/db-migrations.md`。

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
- **不要用 `psql -f` 直接执行 `seeds/*.sql`**。`-- +goose Up/Down` 对 `psql` 只是注释，
  `psql` 会先执行 Up 段，再执行 Down 段；多文件种子还可能在后续文件报外键错误。必须通过
  `dbmigrate ... seed` 或本目录的 dev Seed Job 执行，让 goose 只选择 Up 段。
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

## 集群发布门禁

`dbmigrate` 随同一发布 tag 构建 amd64/arm64 镜像，复用后端 Trivy、Cosign 和 SBOM 流程。
最终镜像只含二进制、CA 根证书与版本化 migration SQL，不含服务配置或示例种子。
`promote-release.py` 核验并固定迁移 index digest，与应用清单一起晋级。

- `make deploy` / `make k8s-pre-all` / `make k8s-prod-all` 在工作负载 apply 前运行
  `scripts/deploy-db-migrations.sh`；仅 Job `Complete=True` 放行。
- 原生 Helm install/upgrade 与 ArgoCD 完整同步使用同一份 PreSync/pre-upgrade hook。
  **不要选择性同步工作负载**：selective sync 会跳过 hook。
- `DRY_RUN=1` 只校验资源，不执行 SQL，不证明迁移成功。
- CLI 每次创建独立 Job，保留状态、digest 和日志 7 天；原生 Helm/Argo hook 保留到
  下次运行或 TTL 到期。长期审计需由集群日志归档承担。

目标命名空间须事先提供 `tcr-pull-secret`，以及 pre 的 `ecommerce-db-migrate` / prod 的
`ecommerce-db-migrate-prod` Secret。迁移 Secret 必须包含 `DB_URI` 和 `ca.crt`；
DSN 指向已核对的环境数据库，设置 `sslmode=verify-full`、
`sslrootcert=/etc/postgresql/ca/ca.crt` 和连接超时。凭据通过受控渠道注入，不打印、不入 Git。
仅凭 Secret 名或 namespace 不能证明数据隔离，prod 首次运行前必须核对 DSN 与授权。

发布只运行 goose `up`：失败停止发布，不自动 `baseline`、`down` 或灌种子。
各服务迁移不构成跨服务事务，失败时可能已有部分服务迁移成功；修复后重跑，应用回滚仍须
兼容已扩展的 schema。破坏性 contract 变更单独评审。

行政区划静态字典在空库初始化时单独导入并校验；`seeds/` 仍只面向本地/演示。
两者均不随每次部署执行，不把「schema 就绪」当作「业务基础数据就绪」。

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
