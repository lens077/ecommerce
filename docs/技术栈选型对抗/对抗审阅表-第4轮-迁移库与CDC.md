# 对抗审阅表 · 第 4 轮：Go 迁移库选型 × CDC 链路（2026-08-21）

> 团队 `db-cdc-adversarial`（AgentTeams）：codex = openai/gpt-5.6-terra、claude =
> anthropic/claude-fable-5（均 max effort），captain 终裁并落地。流程：R1 两份独立
> 立场稿（互不可见）→ R2 交叉攻击 + 自我复核 → captain 逐条核实、终裁、写代码、实测。
> 与前三轮不同：**本轮终裁直接落到可运行代码**，代码即裁决的验收物。
> 原始过程稿在团队存档（t1–t4 任务 output）；本表只记结论、证据与被推翻的主张。

---

## §A 共同事实（两员独立得出、captain 复核无争议）

| # | 事实 | 出处 |
|---|---|---|
| A1 | CDC 主链**双方一致维持** outbox → 自写 relay → NATS JetStream → search 消费者 → Meilisearch，0:2 无人主张换件 | t1/t2 |
| A2 | `Nats-Msg-Id` 只在流的去重窗口内有效（默认 2 分钟、内存字典），**不是 exactly-once**；消费者幂等是硬前提 | [NATS docs](https://docs.nats.io/learn/jetstream/your-first-stream)、[Synadia](https://www.synadia.com/insights/checks/nats-large-deduplication-window) |
| A3 | Meilisearch 写入是异步任务：HTTP 202 仅入队，**task `succeeded` 才能 ACK 消息** | [Meili async docs](https://www.meilisearch.com/docs/capabilities/indexing/tasks_and_batches/async_operations) |
| A4 | `pg_notify` 只当唤醒信号；投递保证=轮询批扫（LISTEN 扇出会丢） | t1/t2 一致 |
| A5 | PG17+ 有 failover slots、CNPG 1.27+ 有 `replicationSlots.highAvailability.synchronizeLogicalDecoding`——「逻辑槽 failover 必丢」是**过时论断**；但 pg-main 实测 `instances=1`（CNPG operator 1.30.0 / PG 18.4）且未启用该配置，**今天逻辑复制不可用，不构成换件理由** | [PG17](https://www.postgresql.org/docs/17/logical-replication-failover.html)、[CNPG replication](https://cloudnative-pg.io/docs/current/replication)、kubectl 实查 |
| A6 | sqlc 官方解析 atlas/dbmate/golang-migrate/goose/sql-migrate/tern 六家迁移格式并忽略 down 段 → 迁移目录可以直接当 sqlc 的 schema 输入 | [sqlc ddl.html](https://docs.sqlc.dev/en/latest/howto/ddl.html) |

## §B 裁决一：迁移库 —— **goose v3 胜出**（codex 主张 golang-migrate 被驳回）

分歧：codex（t1）唯一推荐 `golang-migrate/v4`；claude（t2）唯一推荐 `pressly/goose v3`。

**终裁 goose v3（v3.27.3, MIT），按证据强度排序的理由：**

1. **dirty/force 语义与无人链路正面冲突（决定性）**。golang-migrate 失败后置持久
   dirty 标志，必须人工 `migrate force` 才能继续（其 FAQ 原文）；本仓是 tag 触发
   CI + ArgoCD selfHeal 的无人链路，每次迁移失败都升级成「人工带凭据修版本表」。
   goose 的 SQL 迁移与版本记录同事务，失败即回滚、重跑即重试。（claude t4-M1；
   codex t3 亦确认 dirty 是「安全栅栏」但代价在本仓形态下不成立）
2. **种子数据有官方路径**。本轮用户需求点名 examples 要能当种子灌——goose
   `-no-versioning`/`WithDisableVersioning` 正是官方设计给 seed 的
   （[goose blog](https://pressly.github.io/goose/blog/2021/no-version-migrations)）；
   golang-migrate 无对应机制（claude t4-M4）。
3. **库形态是一等公民**。goose v3 Provider API（`NewProvider`+`WithTableName`+
   `WithSessionLocker`+`database.Store`）让 dbmigrate 以纯库内嵌实现 per-service
   版本表、per-service 咨询锁与 baseline 记账，零外部 CLI。
4. 单文件 `-- +goose Up/Down` 注解比 up/down 双文件评审友好；sqlc 兼容两家皆可（A6），非差异点。

**同时被驳回/修正的 claude 方案细节**（对抗价值的实证——胜方方案也带伤）：

| 主张（t2） | 驳回证据 | 落地修正 |
|---|---|---|
| 基线迁移用 `DO $$ CREATE TYPE ... EXCEPTION` 包裹以便存量库重放 | codex t3 实证：sqlc 的 `schema.Apply` 没有 DoStmt 分支，DO 块内 CREATE TYPE 不进 catalog → 枚举模型直接退化 | DDL 保持裸语句（sqlc 可见），存量库改走 `dbmigrate baseline` 记账 |
| 版本表放各服务 schema（`cart.goose_db_version`） | codex t3 实证：goose 在跑 00001 之前先建版本表，而 00001 才 `CREATE SCHEMA` ——鸡生蛋必失败 | 版本表统一 `public.goose_db_version_<svc>` |
| （双方都没预见） | captain 落地实测：迁移文件里的 `SET search_path` 是会话级的，goose 用非限定名读写版本表被带偏 → `relation does not exist`（5 个带 search_path 的服务全炸，3 个不带的全过） | 迁移禁写 `SET search_path`，对象显式限定；版本表名带 `public.` 双保险 |

其余候选一句话出局：**Atlas**——versioned 工作流的关键特性（triggers/RLS 等）在需登录的
Pro 层，供应商锁定；**tern**——生态小、无内建会话锁与种子路径；**dbmate**——纯 CLI 无 Go
库形态。（t1/t2 一致，未被攻击）

**codex t3 终稿对 goose 判决的攻击与 captain 裁定**（t3 结论「暂维持 golang-migrate +
单一 PreSync Job」，**不改判**，理由逐条）：

| t3 攻击 | 裁定 |
|---|---|
| dirty 是防「半应用后自愈重跑」的安全栅栏，被倒置成缺点；goose 的 `NO TRANSACTION` 半失败同样无 dirty 证据 | **部分采信、不改判**。本仓迁移语料 100% 事务型：goose 失败=整体回滚+版本未记，重试天然安全，无需人工；GM 即使在 PG 已干净回滚时也置 dirty、每次失败都要人工 force——在 tag-CI+selfHeal 无人链路里这是常态成本而非罕见保险。NO TRANSACTION 的例外已立为使用纪律（context/team/db-migrations.md：仅限 CONCURRENTLY 类语句且自带幂等） |
| GM 双文件可单独存在、维护未停（2026-07 有推送），claude 的「v4.19.1 停 2025-11」不实 | **采信订正**：维护状态两家平手，剔除出判决依据（本表 §B 四条理由本就未引用维护论据）；双文件确属风格成本非运行限制，降权为第 4 条的次要项 |
| no-versioning 种子无应用账本，须环境硬闸+幂等协议 | **采信为纪律**：种子幂等已是硬要求（实现+文档）；「只对本地/演示环境执行、对集群执行前须确认环境」写入 tools/dbmigrate/README.md。账本缺失是 no-versioning 的定义性代价，用幂等+可重放（seed-down/seed）对冲 |
| 中心包 `go:embed` 各服务目录不可实现（embed 禁 `..`） | **采信**：攻击对象是 claude t2 的 backend/pkg/migrate+embed.FS 提案；已落地实现本就用 `os.DirFS`（t3 亦引用现实现印证），无需变更 |
| 执行器不能双轨（fx OnStart 与 Job 二选一），应只留 PreSync Job | **采信**：驳回 claude t2 的 OnStart 方案；集群执行形态定为**单一 ArgoCD PreSync hook Job 跑 `dbmigrate up`**（带锁、可观察、失败阻断 sync），与 claude t4-M5 对 wave -1 裸 Job 的批评合流。见 §E |

## §C 裁决二：CDC 链路 —— **维持 outbox → 自写 relay → JetStream → Meili，更优 = 补缺口而非换件**

替代方案逐项否决（两员独立同判，captain 核实）：

| 候选 | 否决理由 |
|---|---|
| a. Debezium Server（PG→JetStream sink） | sink 存在且成熟（2.7+ 支持认证/TLS，3.3 支持异步发布），但引入 JVM 常驻组件与快照/槽管理复杂度；上游要的是**领域事件**不是行变更（订单一致性设计已定 outbox，docs/design/order/consistency.md）；Kafka/Debezium 刚整体退役，资源预算紧（第 2 轮 T2） |
| b. pglogrepl 自写逻辑解码 relay（无 outbox 表） | 行级变更反推业务意图是反模式；搜索文档是 spus/skus/sale_detail 三表聚合，行级照样要 join；且承接 A5——本集群逻辑复制今天不可用；WAL 被槽钉住的教训本仓付过学费（backend/infrastructure/kafka-connect/setup.sql 头注） |
| c. Sequin | 同 b 的逻辑复制前提；再引一个常驻 Elixir 控制面，单人运维负担；成熟度与社区延续性存疑 |
| d. Watermill forwarder | 多一层框架抽象换不来新保证（仍是 outbox 轮询），自写 relay 不到 300 行且契约完全可控 |
| e. Benthos/Redpanda Connect | 通用流处理器做这条窄链路是牛刀，且 pg CDC 输入同样踩 b 的前提 |
| f. 直写双写 + 重试表 | 双写窗口丢事件正是 outbox 要杜绝的问题本身，倒退 |
| g. PeerDB | 面向仓库/分析同步（本仓规划里它的位置是将来 PG→ClickHouse，TODO ⑫），不是领域事件总线 |

**四个必补缺口 → 实现落防映射**（两员的缺口清单合并去重后共识）：

| 缺口 | 落防位置 |
|---|---|
| NOTIFY 只当唤醒，轮询兜底是投递保证 | `pkg/outbox/relay.go` Run：`WaitForNotification` 带 PollInterval 超时，超时照扫 |
| 2min 去重窗口 → 消费端幂等硬前提 | 事件=完整文档投影，Meili AddDocuments 整文档替换天然幂等；流去重窗口配 10m 只作近因兜底 |
| relay 防双跑 + 保序 | PG 咨询锁单活（备实例阻塞待命）+ 批内按 id 升序 + 首错即停；`FOR UPDATE SKIP LOCKED` 只防误配双跑不承担保序 |
| outbox 清理 + 滞留告警 | relay 每小时按 `Retention` 清已发布行；最老未发布 > `StaleWarn` 记 WARN（告警接线锚点）；未发布行走部分索引 |
| tombstone（claude t4-C4 攻击成立） | `spu.deleted` 事件 → Meili DeleteDocument；毒消息 MaxDeliver 后 TERM 留痕 |
| 全量重建 | 临时索引 `products_rebuild` 灌满 → `SwapIndexes` 原子切换 → 删临时；线上索引全程可查 |
| 重投乱序覆盖新投影（codex t3-C4 攻击成立） | 消费者默认 `MaxAckPending=1` 串行保序（搜索喂养吞吐远低于串行上限，可调大自担乱序）+ 处理前 `InProgress()` 续租防 AckWait 超时空转 |
| reindex 水位竞态（codex t3-C5 攻击成立） | Reindex 记录扫描前水位；swap 后按 `updated_at >= 水位` 做 delta 补偿（含转 deleted 的删除侧）重放到新索引——文档投影完全派生自 PG，重放即闭环，不回拨流游标 |

**附带判决**：①金额口径=索引/事件用**数值投影**（真相仍是 PG DECIMAL；索引值只做展示
与排序。备选 int64 分被记录：若将来事件要参与金额运算再切）；②「逻辑复制升级触发条件」
采 claude 修正——PG 只要求一台物理 standby，`instances=2` + CNPG `synchronizeLogicalDecoding`
实测通过即可重评（codex 的 instances≥3 门槛系发明）；③relay 部署形态=独立进程（可单独
扩缩/重启/观测；product 服务当前无写路径，内嵌无宿主）。

## §D 落地与实测（本轮验收物）

**迁移**：9 服务 `internal/data/migrations/`（goose 注解，DDL 语义原样；仅 2 处真实修复：
user 删 `CREATE DATABASE connect_example` 残留、inventory 修非法 `DEFAULT 1`）+ 4 服务
`seeds/`（examples 改写为幂等种子）；工具 `backend/tools/dbmigrate` + Make 目标。
postgres:18-alpine 实测：up 全绿 → 重跑 no-op → seed×2 计数不变（spus 7/skus 13/sale 21/
cart 4/addr 2/order 2+3+3+2）→ `down-to 0` 回滚+重放 → baseline 接管「手工建过表」库后
up=no-op、二次 baseline 被拒。sqlc `schema:` 改指 migrations，连真库重生成**零漂移**，
并暴露补齐三笔存量生成物欠账（merchant 整张 agreement 表、order `merchant_id`
int64→UUID、product SKU 枚举名 `SkusStatusEnum`→`ProductsSkusStatusEnum`）。

**CDC**：`products.outbox` 迁移（CloudEvents 属性列）+ `pkg/outbox`（同事务 Insert；
relay 单活批扫）+ `pkg/searchindex`（durable pull 消费者 + reindex/swap）+ 三个二进制
（`tools/outbox-relay`、`tools/search-indexer`、`tools/cdc-demo`）。
`tools/cdc-demo/run.sh` 端到端实测（compose：PG18/NATS 2.12/Meili v1.53）：
同事务提交 → **0.3s** 可搜、tombstone **0.3s** 删除、outbox 全部 published、
种子商品经 index-swap 重建可搜（price=8999 数值、sale_count=9 与视图口径吻合），
全程 10.4s，退出码 0。

**验收锚点**：`go build ./...`、`go vet ./...`、`go test -count=1 ./structcheck/...`、
`go test -short ./...`、`scripts/verify-context.sh`、`scripts/verify-freeze.sh --all` 全绿。

## §E 遗留与触发条件

- 集群 CNPG 首次接管：发布窗口跑 `make migrate-baseline`（手顺见 tools/dbmigrate/README.md）。
- 集群迁移执行形态（codex t3 采纳项）：**单一 ArgoCD PreSync hook Job** 跑 `dbmigrate up`
  （失败阻断 sync、可复跑），不用 wave -1 裸 Job（claude t4-M5），不在服务 OnStart 里迁移。
- relay/indexer 出 Deployment + NACK CRD 进 ArgoCD；R1 故障→积压重放演练（TODO ③ 剩余项）。
- search 服务本体 ES→Meili 迁移（复用 `pkg/searchindex`，TODO 搜索小节）。
- 逻辑复制类方案重评触发条件（codex t3 收紧）：CNPG `instances>=2` **且**
  `synchronizeLogicalDecoding`/`sync_replication_slots`/`hot_standby_feedback` 配齐 **且**
  switchover 演练验证 slot `synced=true`，配套 `wal_status`/`safe_wal_size` 告警与
  re-snapshot runbook（`max_slot_wal_keep_size` 设上限会令 slot `lost`）；pgstream 亦非
  直连件（init 建 slot/schema/trigger，官方 target 无 JetStream/Meili），引入仍需投影层。

## §F 过程备注

- codex 在 R2 期间发现工作区并发变化（captain 正在实施转换）主动暂停待确认——对抗与
  落地并行时，评审基准应锚定「转发文本 + 不可变参照」，已写进任务描述惯例。
- codex t3 终稿在 captain 终裁初版之后送达（满档推理 + 网络核验约 50 分钟）：其六条
  T-mig / 六条 T-cdc 攻击已逐条裁定并回写本表（§B 裁定表、§C 缺口表新增两行、§E 收紧），
  其中两条促成实现变更（`MaxAckPending=1` 串行保序 + reindex 水位补偿），变更后端到端
  demo 复跑 PASS。t3 维持己方 GM 推荐但自认「修正后 goose 可为可接受备选」；captain
  维持 goose 终裁，分歧点与理由见 §B 裁定表首行。
- 本轮存档：`团队存档-第4轮/`（team.json 终态 + captain/claude/codex 对话 jsonl）。
