# 交接文档 — 技术雷达审问会话（2026-08-20）

> 会话形态：用户对 `docs/TECH-RADAR.md` 定稿进行逐题「审问」，中途升级为两次正式复审与一次生产变更。
> 本文只做指针与状态，不复制真相源内容；结论以 `docs/TECH-RADAR.md`、进度以 `TODO.md` 为准。

## 1. 持续约定（接手者必读）

- **审问答题模板**：逐问回答，覆盖「是什么 / 为什么是这个组合 / 解决了什么 / 没有它之前如何运作 / 单个组件行不行」。
- **术语表自动维护**：用户每问到一个专业术语，追加进 `docs/GLOSSARY.md`；已收录术语被再次问到时就地补充。该文件已被并发会话重构为全项目术语表（12 节），遵守其头部自己的维护规则。
- **复审模式**：用户可对任何既有定稿发起重审（含用户本人拍板项）。流程 = 实测取证（GitHub API / 代码 grep / 服务器探测）→ 算账 → `AskUserQuestion` 拍板 → 落笔全部真相源 → 跑适用门禁。
- **并发现实**：至少一个其他会话在高频改仓（后端 db-migrations 重构、NATS ③ 落地、备份三件套暂缓均非本会话所为）。**任何 edit 前先重读文件**，「file changed since read」在本会话出现 6 次。

## 2. 本会话完成的事项（按序）

1. **§2 搜索讲解**（Meilisearch+pgvector、typo/facet/sortable、数据流向、倒排 vs 向量索引）——纯讲解，无文件变更。
2. **术语表**：初版由本会话建立，后被并发会话重构吸收；重构后按约定累计**新增 18 条**（存储与备份 5、Silo/社区分叉 2、OLTP/列存/ClickHouse 3、身份与凭据 7、密封与解封 1）、**就地补充 3 处**（Silo 状态、ClickHouse 裁决、密封态 API 全拒细节）。
3. **§10.6 Silo 复审**（用户情报触发）：`pgsty/silo` = MinIO 社区延续分叉实锤（AGPL、2.45k⭐、领先上游 108 commits、回补 AIStor-only CVE）。裁决 = **SeaweedFS 主结论维持**、silo 🟡 收编备选、「上游无人修 CVE」论据降级。落笔：`docs/TECH-RADAR.md` §10 复审附记。
4. **node2 存量 MinIO → silo 切换（本会话唯一动生产的操作，已执行并验收）**：
   - 镜像：`pgsty/minio`（无 tag + pull always）→ `pgsty/silo:RELEASE.2026-08-06T00-00-00Z@sha256:29a498b2…`（pin digest）。
   - 事故与修复：silo 镜像 `HOME=/tmp` → 挂在 `/root/.minio/certs` 的证书静默不加载 → TLS 降级 HTTP → 公网 500 约 3 分钟；修复 = command 显式 `--certs-dir /root/.minio/certs`。
   - 验收全绿：容器 healthy、横幅 `API: https://`、bucket `ecommerce` 完好、mcli 通、公网严格校验 root=403/health=200 与基线一致、缩略图匿名 GET 200。
   - 回退：`/home/docker/minio/compose.yml.bak-20260820`；旧 digest `b6bfe72…`（恰为 silo 官方升级测试的对照组镜像）。
   - 记录：`TODO.md` ⓪d。
5. **教训沉淀 ×2**（verify-context 绿）：`context/team/tech-selection.md` 新建（「上游已死」类结论必查三件套：镜像谱系 / namespace 现状 / 社区分叉）；`context/team/tls-enablement.md` 追加「第三个变量是 HOME」。
6. **§3.2 ClickHouse 复审**（用户重审自己的拍板项）：改 **🟡 触发式缓上**。复审账 = 分析消费者 0（埋点落 PG `behaviors.events`、CH 全仓零接线）+ 1–2Gi 是预算表唯一零消费者常驻大户 + 「断代可重放」反转「先装」论据。三条触发线（真实分析需求 / `behaviors.events` 千万行级或影响交易库 p95 / gorse 特征加工）。落笔：radar 总览+3.2+T2 附、`TODO.md` ⑫⑬、`STACK.md`、术语表。
7. **§4 身份/授权/凭据讲解** + OpenBao seal/unseal 两轮深入（Vault 同源设计、失效面清单、「密封冻结的是变化不是运行」）——讲解无决策变更。**口头建议未登记 TODO**：sealed 状态进监控、恢复演练把解封写进依赖顺序（宜随 TODO ② 落地时一并）。

## 3. 当前事实快照（截至会话末）

- node2 silo 运行中（实测 healthy）；cart 缩略图路径正常。
- ClickHouse 不部署，触发条件见 `TODO.md` ⑫。
- 并发会话动态（非本会话所为，勿归因）：§10 备份三件套被用户拍板 ⏸ 暂缓（测试期数据不重要）；TODO ③ NATS 应用侧底座标注 2026-08-21 落地；`db-migrations.md` 入库且 `backend/**` schema 大改在工作区。
- **全部改动未提交**：本会话文件与并发会话改动混在同一工作区。提交属不可逆动作，需用户授权，且建议按归属拆分提交。

## 4. 待续事项（指针）

| 事项 | 指针 |
|---|---|
| silo 长期观察：CVE 响应时效（加速触发已改盯 silo）；翻盘条件=稳定维护 ≥12 个月 + CVE ≤30 天 + SeaweedFS PoC 受阻 | radar §10 复审附记 |
| 商品图迁 SeaweedFS（注意备份三件套已 ⏸，节奏以 TODO 现行文本为准） | TODO ① |
| 凭据链 / casdoor 收编 / OpenFGA | TODO ② ⑧ ⑪ |
| OpenBao sealed 监控 + 恢复演练依赖顺序（建议，未登记） | 随 ② 落地 |

## 5. 本会话触碰的文件（归属清单）

- **新建**：`context/team/tech-selection.md`、`.scratch/radar-interrogation/HANDOVER.md`（本文）、`docs/GLOSSARY.md`（初版，后被并发重构吸收）
- **修改**：`docs/TECH-RADAR.md`（§10 复审附记两轮、总览 §3、3.2、T2 附砍序）、`TODO.md`（⓪d 新增、⑫ 重写、⑬ 砍序）、`.service-matrix.yaml`（minio 条目 note）、`STACK.md`（CH 注记）、`docs/GLOSSARY.md`（18 新增+3 补充）、`context/team/tls-enablement.md`、`context/team/INDEX.md`、`context/INDEX.md`
- **服务器侧（不入库）**：node2 `/home/docker/minio/compose.yml`（已切 silo；备份 `compose.yml.bak-20260820`）
- **非本会话改动（工作区可见，勿归因）**：`backend/**` 迁移重构、`context/team/db-migrations.md`、TODO ③ 进展、radar §10 总览 ⏸ 行等

## 6. 门禁状态

- `scripts/verify-context.sh`：**绿**（context/ 改动后已跑）
- `backend/structcheck`：**绿**（matrix note 改动后已跑）
- 其余锚点未跑——本会话未动 Go/前端代码；提交前按 AGENTS.md 锚点执行（注意工作区混有并发会话的后端大改，那部分的验证责任在其会话）
