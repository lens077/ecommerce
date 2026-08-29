# 2026-08-28 DuckDB 引入评估：可替代场景与新增能力

> 用户决策语境：「需要添加 DuckDB」。本文回答两个问题：**它能替代现有架构里的什么**、**加进来之后能做什么新的事**。
> 名词澄清：评估对象为 DuckDB（嵌入式 OLAP 分析引擎，MIT）。
> 结论先行：DuckDB 定位为**零常驻的批分析/报表/对账引擎**，直接承接 TECH-RADAR §3.2 ClickHouse 触发条款的前两个触发条件（第一个真实分析需求、`behaviors.events` 规模化后卸载 OLTP），把「常驻 ClickHouse」的触发线再推后一级；它**不替代** PostgreSQL（OLTP 真相源红线）、Elasticsearch（全文检索投影）、Kafka（事件主干）、VictoriaMetrics（指标时序）与流处理触发项（新鲜度 <30s 归 RisingWave 条款）。

## 一、仓内现状对账（评估的锚点）

| 现状 | 事实 | 对 DuckDB 的意义 |
|---|---|---|
| 行为埋点 | `behaviors.events`（PG，append-only 流水：user_id/event_type/item_id/value/source/occurred_at；是 gorse 反馈的事实来源，可完整重放） | 千万行级后的分析查询是 CH 触发条件②——DuckDB 经 Parquet 归档或 postgres 直读可先行卸载 |
| 销量统计 | 设计为「PG 明细事实 + `sales_daily_agg` 每日预聚合 + Dragonfly 可丢缓存」（`docs/design/product/sales.md`） | 预聚合之上的 ad-hoc 维度分析（跨月/跨类目/跨商家切片）正是 DuckDB 甜点区 |
| 分析服务 | analytics 独立服务排第四阶段（指标计算/行为分析/经营报表）；分析消费者当前为 0 | DuckDB 可作为该服务的引擎候选，避免先建 OLAP 集群 |
| ClickHouse | 触发式缓上（2026-08-20 拍板）：触发条件①真实分析需求②events 千万行级/影响交易库③gorse 特征流式清洗；常驻成本 1–2Gi 是当时唯一零消费者大户 | DuckDB 承接①②的第一响应，CH 触发条件需升级（见 §五） |
| 分析 CDC | Debezium/Kafka Connect PoC 排在「真实 CH/报表需求出现后」；Kafka K5 分析链未动 | 若 DuckDB+Parquet 归档成立，CDC 的必要性进一步推后 |
| 对象存储 | Silo（基于 MinIO，S3 兼容）定稿 | DuckDB httpfs 可直读写 S3 兼容端点——Parquet 归档的落点现成 |
| 事件主干 | Kafka（外部集群）目标态；事件 envelope 含 occurred_at/aggregate_id | 「Kafka → Parquet 落 Silo → DuckDB 查询」构成零常驻冷分析链 |
| 对账 | 支付对账（渠道账单 vs 平台订单）在 P0/P1 清单反复出现，尚无工具形态 | 渠道 CSV/账单 join 平台导出，是 DuckDB 教科书场景 |
| 构建约束 | **Go 服务 CGO_ENABLED=0 静态构建**（STACK §2.6 硬事实） | go-duckdb 需 CGO——集成形态必须绕开或例外声明（见 §四） |
| 资源约束 | 3 节点 arm64 各 4c/6.5G，内存紧张 | DuckDB 零常驻（进程内/跑批），不占集群常驻预算；重查询可在 Mac/CI/低峰节点执行 |

## 二、可替代的场景

| # | 被替代者 | 替代方式 | 收益 |
|---|---|---|---|
| 1 | **ClickHouse 常驻单节点**（TECH-RADAR §3.2 触发条件①②的既定响应） | 真实分析需求出现时，先用零常驻 DuckDB 跑批承接（PG 增量导出 → Parquet 落 Silo → DuckDB 扫描/聚合） | 免去 1–2Gi 常驻内存税（当时预算表唯一零消费者大户）；空闲占用为零，任务结束进程即消失 |
| 2 | **支付对账的一次性 Go parser / 人工 Excel** | 渠道账单 CSV/XLSX（sniffer 自动识别 dialect + excel 扩展）→ staging 表 → SQL join PG 订单/支付快照 → matched/missing/mismatch 三表输出 | 教科书场景：不写解析代码、不建库；金额显式 DECIMAL、单号显式字符串、留原始行号追溯 |
| 3 | **直接打 PG 的分析 SQL**（`behaviors.events` 千万行级后的漏斗/归因查询会伤 OLTP） | 按水位增量导出 `event_date` 分区 Parquet；分析只扫 Silo，不碰生产库 | OLTP 卸载——这正是 CH 触发条件②的本体；PG 侧只承担低峰增量导出 |
| 4 | **`sales_daily_agg` 之外的 ad-hoc 维度报表**（原本要么手写 SQL 打 PG、要么等第四阶段 analytics 服务） | DuckDB 跨月/类目/商家切片，结果写回 PG 报表表或 Parquet | 报表需求即到即答，不用为一张报表立项一个服务 |
| 5 | **Debezium/Kafka Connect 分析 CDC PoC 的前置必要性**（PRIORITY 挂账「等真实 CH/报表需求」） | Parquet 归档链已覆盖冷分析场景 | CDC 进一步推后，组件面不扩大 |
| 6 | **analytics 服务（第四阶段）的引擎预选** | CLI 跑批 → 复杂化后升级独立 analytics-runner（允许 CGO 的例外镜像，duckdb-go v2.10505.0） | 服务未建先有能力；建服务时引擎已经过真实任务验证 |

## 三、加入后能做的新事情

1. **零常驻「分析层」**：`PG →（低峰增量导出）→ Parquet on Silo → DuckDB` ——与 CH 裁决时的「断代可重放」原则同构：分析数据永远可从 PG 事实重建，丢了不心疼。目录按 `event_date=`/`sale_date=` Hive 分区，单文件目标 ≥100MB，新批次先写临时 prefix、校验后原子发布 manifest。
2. **对账工具化**（首批 PoC #1）：支付宝等渠道账单 vs 平台订单的日对账，产出可入库的差异报告——P0/P1 清单里反复出现的「支付对账」第一次有了工具形态。
3. **经营报表预计算**：商家日报/平台周报由 CronJob 低峰跑 DuckDB 生成，写回 PG mart 或 Parquet；BI 侧 Evidence（静态报表站）/Metabase 读快照或 PG mart——**不让 BI 直连跑批中的 `.duckdb` 文件**（多 worker 锁问题）。
4. **Kafka 事件冷归档分析链**：franz-go 消费者按时间/大小滚动写 Parquet 落 Silo（checkpoint/幂等归消费者，DuckDB 只查已提交对象）——兼作事件重放审计的查询端。
5. **DuckLake 1.0 升级路径**（组件恰好都在）：catalog 存 Pigsty PG（独立 database/schema/账号）+ 数据 Parquet 落 Silo，得到 ACID/快照/时间旅行/模式演进。**不是第一步**——普通分区 Parquet 先行，出现多写者/共享数据集/小文件治理需求再启用。
6. **dbt-duckdb 数据集市**：SQL 模型超过约十个、依赖与增量逻辑复杂化后引入（官方 adapter，独立于 Go 构建链）。
7. **Mac 本机探索分析**：CLI 直查导出数据（arm64 一级支持），运营问题不用等报表排期。

## 四、集成形态（正面解决 CGO_ENABLED=0）

**结论：业务服务的 `CGO_ENABLED=0` 一字不改；DuckDB 永不进 10 个微服务的进程内。**

| 事实核查 | 结论 |
|---|---|
| 官方 Go 驱动 [`duckdb/duckdb-go`](https://github.com/duckdb/duckdb-go) v2.10505.0（2026-07-22，对应 DuckDB 1.5.5） | 依赖 `duckdb-go-bindings` 预编译静态库，**但 Go↔C 桥接仍是 cgo**——「预编译」省的是编译 C++ 源码，不是去掉 cgo |
| 纯 Go 的 DuckDB 实现 | 不存在成熟对等物，不应作为计划 |
| Quack 远程协议（2026-05-12 官方发布，DuckDB 首个官方 server 形态） | **Beta**——不为绕 cgo 引入生产 |

**形态排序**：

1. **首选：DuckDB CLI 子进程跑批**（v1.5.5，独立二进制，arm64 一级支持）。Go 调度器 `exec.Command` 拉起，SQL 走**固定模板文件**（绝不接受用户任意 SQL——CLI 的 `.sh` 等元命令扩大攻击面，官方安全文档明确 CLI 面向交互使用）；大结果 `COPY ... TO ... (FORMAT PARQUET)`，Go 只读状态与 manifest。
2. **次选（复杂化后）：独立 `analytics-runner` 镜像**，显式声明 CGO 例外（`现有业务服务 CGO_ENABLED=0 规则不变；analytics-runner 独立构建、允许 CGO`），K8s Job/CronJob 隔离、跑完退出不常驻。
3. **不采用**：业务服务内嵌 duckdb-go；常驻任意 SQL 查询服务；Quack Beta 服务化。

**资源与安全基线**（6.5G 节点上跑 Job 时）：

```sql
SET memory_limit = '3GB'; SET threads = 2;
SET temp_directory = '/fast-local-disk/duckdb-tmp';
SET preserve_insertion_order = false;
```

- PG 侧：**只读账号** + `pg_connection_limit` 限 2–4（postgres 扩展默认 64 连接且会 CTID 并行全扫——对 Pigsty 生产库是真实风险）+ PG 侧 `statement_timeout` + 只在低峰跑；长期方案是增量导出 Parquet、报表不直扫 PG。
- Silo 侧：httpfs 官方测试过 MinIO（`ENDPOINT`/`URL_STYLE=path`/`USE_SSL`），但 **Silo 的 Range GET/multipart/List 兼容性与 Pangolin 隧道带宽须实测**（PoC 验收项）；凭据走 Secret/环境，不入仓。
- 内存模型：spill-to-disk 可用但非万能（`list()`/`string_agg()` 等不能完整 spill；多 blocking operator 叠加仍可 OOM）；官方经验值聚合型 1–2GB/线程、join 型 3–4GB/线程。

## 五、与 ClickHouse 触发条款的关系（修订建议，已同步 TECH-RADAR §3.2）

DuckDB **不推翻** CH 的「触发式缓上」，而是在它前面加一层零成本验证：

- 原触发条件①（第一个真实分析需求）②（events 千万行级/影响交易库）→ **改由 DuckDB 承接第一响应**；
- **CH 触发条件升级为服务化信号**（任一）：持续摄取、秒级新鲜度、多用户并发在线切片、DuckDB 批处理窗口/预计算已不能满足 SLA；
- 原条件③（gorse 特征流式清洗）归流处理触发项（RisingWave 条款）；
- `clickhouse-local`/chdb 保留为未来 CH 迁移的验证工具，不作当前默认。

成本对照：CH 单节点 2G 顶格=3×6.5G 集群的长期资源税（换来的是在线服务能力）；DuckDB 空闲占用为零（换走的是低延迟在线并发）。当前分析消费者为 0，低占空比批处理的账毫无悬念。

## 六、边界红线（不替代什么）

1. **不替代 PostgreSQL**——OLTP 唯一真相源红线不动；`.duckdb` 文件是单进程写模型（多进程只能全只读），不承载任何交易状态。
2. **不替代 Elasticsearch 搜索投影**（目标态，存量 Meilisearch 迁移中）——DuckDB 的 FTS 扩展只适合局部分析，不做面向用户的搜索。
3. **不替代 Kafka/流处理**——新鲜度 <30s 的需求仍归流处理触发项；DuckDB 无 consumer checkpoint/watermark/exactly-once sink。
4. **不替代 VictoriaMetrics**——指标时序、告警链不动；DuckDB 只分析导出的历史文件。
5. **不做常驻高并发在线查询服务**——单查询可占满内存/CPU/临时盘，任意 SQL 无法做资源预估与行级授权；可接受的常驻形态仅限「内部少量用户 + 固定报表接口 + 预审 SQL + 并发上限 + 只读数据」。

## 七、落地路线（阶段化）

- **阶段 A（可立即 PoC，不进服务代码）**：①支付渠道 CSV 对账；②`behaviors.events` 时间范围导出 Parquet + 按日/事件类型聚合。验收：PG 连接数与 I/O、Silo Range GET 兼容性、峰值 RSS、spill 空间、幂等重跑、文件大小分布。
- **阶段 B**：普通分区 Parquet 分析层成形（manifest 原子发布纪律）。
- **阶段 C**：CLI 编排复杂化后建独立 analytics-runner（CGO 例外镜像）。
- **阶段 D**：按信号选 DuckLake（多写者/快照/模式演进）或 ClickHouse（服务化信号）。

## 来源（精选）

- [DuckDB v1.5.5](https://github.com/duckdb/duckdb/releases/tag/v1.5.5)（2026-07-22，MIT；DuckDB Labs + Foundation 治理）
- [duckdb-go v2.10505.0](https://github.com/duckdb/duckdb-go/releases/tag/v2.10505.0) / [duckdb-go-bindings v0.10505.0](https://github.com/duckdb/duckdb-go-bindings)（预编译静态库仍需 cgo）
- [Quack 远程协议（Beta）](https://duckdb.org/2026/05/12/quack-remote-protocol.html)
- [DuckLake 1.0（2026-04-13，production-ready；catalog 可存 PostgreSQL）](https://ducklake.select/2026/04/13/ducklake-10/)
- [httpfs S3 API（官方测试含 MinIO）](https://duckdb.org/docs/current/core_extensions/httpfs/s3api.html) · [PostgreSQL 扩展](https://duckdb.org/docs/current/core_extensions/postgres/overview.html) · [并发模型](https://duckdb.org/docs/current/connect/concurrency.html) · [larger-than-memory](https://duckdb.org/docs/lts/guides/performance/how_to_tune_workloads.html) · [CLI 安全边界](https://duckdb.org/docs/current/operations_manual/securing_duckdb/embedding_duckdb.html)
- 竞品：[chdb v4.3.0](https://github.com/chdb-io/chdb/releases/tag/v4.3.0)（嵌入式 CH，同样原生绑定）· [clickhouse-local](https://clickhouse.com/docs/en/operations/utilities/clickhouse-local)（保留为 CH 迁移验证）· DataFusion（引擎工具箱非开箱数据库）· Polars（DataFrame 非 SQL 库）
- 完整论证与风险登记表见调研代理全文（本文为决策浓缩版）。
