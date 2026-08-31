# 重写前文档冲突审计（2026-08-27）

> ## ⚠️ 本文结论已大面积失效，不要照它动手（2026-08-29 标注）
>
> 逐条核实了它列的 GLOSSARY 四类过期项，**3 类早已被修好**（SeaweedFS 已标「历史评估方案」、
> MinIO 已标「存量迁移对象」、JWT 已标「已废弃」），只有 BFF 一条仍说反（已订正）。
> **文中行号也已全部对不上**——文件在这份审计之后改过多轮。
>
> 更要紧的是它的**判断方法**：体量类结论按「行数多 + 主题相近 = 重复」推导，未逐条比对内容。
> 2026-08-29 按它的建议执行时，6 条里 **4 条前提不成立**——order 两份 README 被判「零入链」
> 而实际一直有入链；`GLOSSARY.md` 被判「删到 ≤80 行」而 189 条是真领域词汇；
> `STACK.md` 被判「复述 TECH.md」而实测**零版本重叠、零标题重叠**；
> `README.md` 被判「与 TECH.md A 表重叠」而两张表结构用途都不同。
>
> **留着它是为了保存当时的分析视角，不是为了执行。** 引用其结论前必须自己复核。

> 目的：在推翻重写 `backend/services` 之前，找出各真相源与设计文档之间互相矛盾的点，
> 避免重写时把「中间态决策」当成最终口径继承下去。
> 方法：captain 亲自核对核心真相源与事件路线，三个子代理分区扫描
> `docs/design/**`、`context/**`、`docs/` 顶层；每条冲突都带 `文件:行号` 与引文，
> 行号以当前未提交工作树为准。
> 状态：审计报告，只列问题与判定，不改任何被审文件。

## 0. 判定基准与时间线重建

当前工作树有大量未提交文档改动。核对 diff 后确认：2026-08-27 当天存在**两次方向相反的
决策改写**，第二次没有清扫完第一次的产物，这是绝大多数高严重度冲突的共同根因。

时间线（依据 diff 方向、悬空引用与文内互引推定）：

1. 2026-08-20：三轮对抗评审定稿「NATS JetStream 为事件主干，Kafka 全家桶退役」。
2. 2026-08-27（前段）：拍板「重新采用 Kafka」。TECH-RADAR、PRIORITY、STACK §十、
   docs/design 多个文件、context 数个文件被改写为「Kafka 目标态 / K0–K6 迁移路线」。
3. 2026-08-27（后段，即本轮核验纠偏）：**撤回 Kafka 目标**。TODO.md、`.service-matrix.yaml`、
   README.md、STACK.md §2.4/§2.8、新建的 `production-scale-goal.md` 与
   `context/project/ecommerce/events/INDEX.md` 改回「NATS-first、Kafka 仅条件式重评」。
4. 第 2 步的产物**大面积残留**，与第 3 步的真相源正面冲突。

「撤回为最终口径」的四条证据：

- `TODO.md:414`「技术选型历史定稿（2026-08-20；**2026-08-27 Kafka 学习迁移目标已撤回**）」——
  撤回记录把采纳当作过去事件引用，只能晚于采纳。
- TECH-RADAR/PRIORITY/STACK §十 引用的「生产目标与 Kafka 路线」「K0–K6」章节在
  `docs/design/platform/production-scale-goal.md` 现文中**不存在**（现文是 NATS-first 的
  P0/P1/P2 分阶段），悬空引用只能由「被引用文档后来重写」产生。
- `.service-matrix.yaml:57`「只有 NATS 经治理和压测仍无法满足量化需求时才重新评估」，
  `production-scale-goal.md:348`「不因『中大型项目都在用』而重新引入 Kafka」。
- 用户本轮给出的核验结论与建议明确按 NATS-first / Kafka 已退役方向执行。

⚠️ 需要显式确认的一点：TECH-RADAR:46 与 TODO:414 都自称「用户拍板」，方向相反。
本报告按「撤回在后、为最终口径」处理；重写文档前建议用户再确认一次。

> **用户终裁（2026-08-28，覆盖本报告 C1 的判定方向）**：
> ① 事件栈**重新采用 Kafka 及其 K0–K6 路线图**——「撤回」被推翻，需要清理的反而是
> 「撤回阵营」的表述（production-scale-goal、TODO:414、matrix:57-58 注记、README:22、
> STACK §2.4、events/INDEX 等），TECH-RADAR/PRIORITY/STACK §十/design 层的 Kafka 路线
> 成为有效方向；「K0–K6 章节在 production-scale-goal 中不存在」的悬空引用问题仍需
> 通过在 v2 基线文档中正式写出路线来闭合。
> ② 现役主库 = node3 Pigsty（CNPG hibernate 仅回切候选）——C3/C5 判定不变。
> ③ 商家模型 = 一个 Merchant 可开多个 Store（1:N），审核对象是店铺。
> ④ 制品 = TCR + GHCR 双推维持（production-scale-goal:186「三选一」不采纳）。
> ⑤ 其余涉及旧代码行为的冲突不再逐条修复，随 v2 重写作废。
> v2 重写基线见同目录 [`rewrite-baseline.md`](rewrite-baseline.md)。

以下判定基准（相对最新口径）：`.service-matrix.yaml`、`TODO.md`、
`docs/design/platform/production-scale-goal.md`、`context/project/ecommerce/events/INDEX.md`
（新建，逐条对过代码）、`docs/reports/2026-08-27-infrastructure-audit.md`（同日实测）。

---

## C1（高·系统性）：事件栈路线「一仓两史」

同一工作树内，两组文档对「事件主干是什么、往哪迁」给出相反答案。

**撤回阵营（最终口径）**：

| 出处 | 关键句 |
|---|---|
| `TODO.md:414` | 「2026-08-27 Kafka 学习迁移目标已撤回」 |
| `TODO.md:52` | 「Kafka 不再是目标事件主干，node3 现存实例保持应用 `used_by=[]`」 |
| `TODO.md:389-396` | NATS J0–J4 治理路线 + 「Kafka 采用门禁……才提交新 ADR 评估」 |
| `.service-matrix.yaml:57-58` | Kafka「仅记录现存实验资源」；NATS「当前事件主干」 |
| `README.md:22` | 「当前优先补 NATS R3、Inbox、NACK/DLQ、重放」 |
| `STACK.md:199-201` | NATS 为当前主干；Kafka「应用 used_by=[]……才重新评估」 |
| `docs/design/platform/production-scale-goal.md:23,147,326,348` | Kafka 只是 P2 触发项，「企业常见度和学习兴趣不是触发条件」 |
| `context/project/ecommerce/events/INDEX.md:9-11` | 当前链路 = outbox → NATS → indexer；「不存在 Kafka Adapter」 |

**Kafka 阵营（第 2 步残留，全部待改）**：

| 出处 | 关键句 | 严重度 |
|---|---|---|
| `docs/TECH-RADAR.md:10` | 「后续决策覆盖（2026-08-27）……重新采用 Apache Kafka……NATS 仅保留迁移期当前搜索链，完成 Kafka 业务链后目标退役」 | 高 |
| `docs/TECH-RADAR.md:23,42,46,48,56,288` | §1 总览与明细全部按「Kafka 目标主干、NATS 🟡 迁移期」改写 | 高 |
| `docs/PRIORITY.md:100,126,127,157,158` | 一致性底座/领域事件改为「Kafka relay / Kafka 承载」；新增「Kafka K0 学习环境」「Debezium/Kafka Connect PoC」条目 | 高 |
| `docs/PRIORITY.md:270-271` | 附录 B 依赖图整条按「Kafka K0/K1→K2 影子链→K3 切流→K4 交易事件→K6 NATS 退役」画 | 高 |
| `STACK.md:553` | 「Kafka producer Adapter 与 destination-aware relay 已有代码和测试场景……仍处于 K1 迁移地基阶段」 | 高 |
| `STACK.md:554` | 「Kafka 仅有代码 Adapter 且未部署」 | 高 |
| `STACK.md:565` | 「先完成 Kafka 学习沙箱和 ProductChanged 搜索影子链，再迁 Order/Inventory/Payment」 | 高 |
| `docs/design/platform/architecture.md:5,25,27,48,53,69` | 「2026-08-27 已决策迁往 Kafka 主干」；order/inventory 技术栈标注「Kafka（目标态；NATS 迁移中）」 | 高 |
| `docs/design/order/checkout.md:16,242,299,316` | 「2026-08-27 已决策迁往 Kafka」；「Kafka partition key = group_no」；「NATS 仅为迁移期现有搜索链」 | 高 |
| `docs/design/order/consistency.md:12` | 「当前 relay 写 NATS JetStream；2026-08-27 目标改为 Kafka」 | 高 |
| `docs/design/search/search.md:6,13,77,98` | 「已决策把本链作为 NATS→Kafka 的首条迁移链，先写 shadow index 再切流」；`:98` 仍假定「目标 Kafka consumer」 | 高 |
| `docs/design/inventory/inventory.md:57` | 「库存事务写 broker-neutral outbox，目标经 relay 发布到 Kafka」 | 高 |
| `docs/design/merchant/roadmap.md:16,67` | 「目标 broker 已改为 Kafka；当前 NATS 只保留迁移期搜索链」 | 高 |
| `docs/design/product/sales.md:9,22` | 「必须先完成 Outbox/Kafka 迁移」；「订单支付成功 → Kafka 发布『销量变更事件』（经 outbox；当前 NATS 迁移中）」 | 高 |
| `docs/design/platform/pre-environment.md:3` | 历史快照的**顶部现行横幅**写「2026-08-27 Kafka 已作为新目标重新纳入」——正文历史部分有充分警示，唯这一句是现行断言 | 高 |
| `docs/design/platform/gin-b2c-mall-comparison.md:54,78` | 「当前 NATS 搜索链，目标 Kafka 主干」「Kafka 目标链尚未开始」（应为「未通过采用门禁」） | 中 |
| `context/team/go-redis.md:216,225` | 「目标主干已改为 Apache Kafka」「新领域事件不得继续扩大 NATS 面，按 K0–K6 路线接 Kafka」 | 高 |
| `context/team/db-migrations.md:53` | 「等 Kafka 切流和回滚窗口结束后再删除」 | 高 |
| `context/team/local-env.md:172` | 「本仓已有未部署的 producer Adapter」 | 中 |
| `docs/observability/OBSERVABILITY.md:74` | 「Kafka consumer lag……迁移期同时看 NATS pending/redelivery」——重写版观测文档也残留迁移措辞 | 中 |
| `context/team/runbook.md:43` | 必读路由行把链接命名为「生产目标与 Kafka 路线」（目标文档已无 Kafka 路线），行标签以 Kafka 领头 | 低 |

**对抗评审证据链站在撤回一侧**（子代理 C 核实）：
已删除的 2026-08-21 过程稿原文为「双方一致维持 outbox → 自写 relay → NATS JetStream →
search 消费者 → Meilisearch」「Kafka/Debezium 刚整体退役，资源预算紧」，首轮终裁也选择
NATS。TECH-RADAR 的 08-27 覆盖没有留下等价的对抗/量化反证，属于未走完证据流程的翻案。

**附带的事实层错误**（不止方向问题，陈述本身已不成立）：

- 「Kafka producer Adapter / destination-aware relay 已有代码」为假：
  `grep -rn 'franz|kgo|kafka' backend --include='*.go'` 零命中；
  `backend/tools/outbox-relay/` 无 destination/Kafka 字样；
  `events/INDEX.md:10` 明言「不存在 broker-neutral EventSink、Kafka Adapter 或 Kafka CLI 模式」。
  代码应已随撤回删除，但 STACK:553、TECH-RADAR:42、local-env.md:172 仍宣称存在。
- `backend/go.mod:35-38` 残留 franz-go 四件套（franz-go / kadm / kfake / kmsg），
  已无任何代码引用，属死依赖，待 `go mod tidy` 清理。

---

## C2（高）：STACK.md 自相矛盾

同一文件内，§2.4/§2.8 与 §十 对事件栈方向相反：

- `STACK.md:199-201`（§2.4）：NATS 是当前主干，Kafka「只有 NATS 经治理和压测仍不能满足
  量化需求时才重新评估」。
- `STACK.md:553-554,565`（§十）：Kafka「K1 迁移地基阶段」，优先顺序第 3 条要求
  「先完成 Kafka 学习沙箱……再迁 Order/Inventory/Payment」。

另一处独立矛盾：

- `STACK.md:406-408`（§6.1）：「address / search → `search`」——声称 address 消费 search 配置块。
- `.service-matrix.yaml:179`：address `extra_config: [auth]`；
  `backend/services/address/internal/conf/v1/conf.proto:28,59`：`reserved "search"` /
  `reserved "elasticsearch"`（ES 清理时已删）。
- 判定：matrix 与 conf.proto 为准，STACK §6.1 的 address 是残留。严重度：中。

第三处（STACK vs TODO，告警口径）：

- `STACK.md:252`：「Alertmanager 当前 receiver 仍未形成可靠的飞书/企业微信/**ntfy** 外部闭环」。
- `TODO.md:484`：「[x] authenticated ntfy 告警闭环……Alertmanager firing/resolved bridge……均已实测」；
  `docs/INFRASTRUCTURE-OPERATIONS.md:79` 同。
- 判定：ntfy 已闭环、飞书/企业微信未接。STACK:252 与 README:26 的「外部告警未闭环」
  措辞把 ntfy 一并算进去，与进度真相源相反。严重度：中。

---

## C3（高）：TECH-RADAR「评估基线订正」与现状整体倒置

`docs/TECH-RADAR.md:13`：「集群现实已是 `redis.redis.svc`（TLS），dragonfly 为残留部署待清理；
PG 已迁集群内 CNPG（Pigsty 关机）」。

与现状逐项相反：

| TECH-RADAR:13 | 现状（判定基准） |
|---|---|
| dragonfly 是残留待清理 | `.service-matrix.yaml:55`：Dragonfly 是现役缓存 + BFF session；「旧 redis namespace 已删除」；`TODO.md:494`「2026-08-20 转正为缓存主力」 |
| PG 已迁集群内 CNPG | `.service-matrix.yaml:54`：「已切到 node3 Pigsty……CNPG 已 hibernate，仅作为回切候选」 |

补充：`docs/TECH-RADAR.md:100`（§3 CNPG 补强）、`:178`（T2 资源预算「不可砍：CNPG×2……redis」、
把 dragonfly 列入砍除清单）、`:235`（Velero+CNPG-Barman）均基于旧数据面快照。
TECH-RADAR 是「定稿」文档，但其基线段没有随 08-24 node3 迁移更新。
注意区分：`:13` 的「Pigsty 关机」指旧局域网 Pigsty（192.168.3.210），
不是现役的 node3 Pigsty（node3）——同名两机，见 C9。

另：`docs/TECH-RADAR.md:31`（§9 定稿含「ko」构建）与 `STACK.md:226-228`
（现行 Docker Buildx 多阶段构建）之间是「已选型未实施」关系，TECH-RADAR 未标注差距。严重度：低。

---

## C4（高）：PRIORITY.md 与 TODO §四新路线冲突

`docs/PRIORITY.md` 文首自declared「冲突时以 TODO.md 为准」，但当前它在多个方向性问题上
与 TODO 相反，作为「先做哪个」的入口会直接误导排期：

| 出处 | 问题 | 对立面 |
|---|---|---|
| `docs/PRIORITY.md:126-127,157-158,270-271` | 事件路线按 Kafka K0–K6 排（见 C1） | `TODO.md:389-396` NATS J0–J4 |
| `docs/PRIORITY.md:100` | 引用「`production-scale-goal.md` K0–K6」 | 该文档现无 K 章节（悬空引用） |
| `docs/PRIORITY.md:146` | 企业微信告警要「集群 Grafana admin 密码」，落点是 210 的 Alertmanager | 集群内 Grafana 已删（matrix:89）；现行告警链是 node3 vmalert→Alertmanager→ntfy（`TODO.md:484,496`） |
| `docs/PRIORITY.md:155` | 「修 dragonfly 网关路径 Terminate→Passthrough」仍开放 | `TODO.md:451` 已列入「已完成的 10 项证据已归档」 |
| `docs/PRIORITY.md:53,176,177,178,183,184` | P0/P5 多条针对 fluent-bit/Loki/Jaeger 的开放缺陷 | 三者已删除（matrix:89-93）；PII 脱敏等关切需要迁移到 Vector/VictoriaLogs 语境重提 |
| `docs/PRIORITY.md:79` | 「网关重试可复制非幂等写 — `proxy.go:263-310`」 | 旧 go-kratos 网关已删；control-tower 网关默认无重试（`STACK.md:165`） |
| `docs/PRIORITY.md:207-210` | P6 仍规划独立「履约 fulfillment / 结算 settlement / 营销 marketing / 数据分析 analytics」四个服务 | `architecture.md:37-38` 2026-08-26 裁决：四者「不再作为独立服务规划」，履约并入 order；matrix:250、`TODO.md:522`、`STACK.md:33`（新增服务须先 ADR） |

判定：PRIORITY 的 P0-P2 安全/假成功部分仍然有效；P3 事件条目、P4 基础设施条目、
P5 可观测性条目需要按撤回后口径与 node3 现状重排。

---

## C5（高）：context 知识库冲突（子代理 B 全量核实）

### 数据库口径未收口

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `context/team/db-migrations.md:28` | baseline 接管对象写死「集群 CNPG」 | matrix:54 主库已是 node3 Pigsty | 高 |
| `context/team/go-testing.md:38` | 「PG 镜像 tag 必须与生产一致——生产是 CloudNativePG 集群 pg-main」 | `STACK.md:195` CNPG 已 hibernate | 高 |
| `context/team/local-env.md:88,94` | 本地开发主路径引导连 CNPG（`pg-main-rw.postgresql.svc` / `192.168.3.132:5432`） | 同文件 `:112,120`「CNPG 入口……不得作为当前配置」——同篇自相矛盾 | 高 |
| `context/team/local-env.md:461,467` | 「Config Center 留在 CNPG」 | 同文件 `:569`「Config Center 也已切到 node3，CNPG 已 hibernate（08-24 补做）」——旧段未标历史 | 高 |
| `context/INDEX.md:18` | 摘要「goose + CNPG 基线接管」把旧环境固化进方法名 | db-migrations 正文 frontmatter 只说「baseline 接管存量库」 | 高 |

### 可观测性入口漂移

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `context/INDEX.md:79-80` | 把已改写为现状的 OBSERVABILITY.md 整体定性「目标态、等待实现」，并把 08-06 旧 review 当现行缺陷入口 | `STACK.md:238-252` 现行 node3 Victoria 栈 | 高 |
| `context/team/runbook.md:58` | 同上定性「尚未实现的体系」 | 同上 | 高 |
| `context/project/ecommerce/frontend-api/sop/web-vitals-reporting.md:14,24` | 现行 SOP 链路图写「otelzap → Loki」「VM/Loki」 | Loki 已删，现为 VictoriaLogs | 高 |
| `context/team/local-env.md:508,520` | 「集群已装能力」表仍列 `vm-single`、`grafana + jaeger`、`loki` 为存活 | matrix:89「集群内可观测已整体删除」 | 高 |
| `context/team/local-env.md:557-559` | pre 环境 Bootstrap 约定仍指向 `otel-collector.observability:4318` | matrix:91 现为 `node3-otlp.apikv.com:443`；照写会生成不可用配置 | 高 |
| `context/team/local-env.md:294` | 「容器日志走 vector / fluent-bit 这条 DaemonSet 通路」并列已删组件 | `STACK.md:251` fluent-bit 已删 | 中 |

### GitOps / Okteto 操作规则互相冲突

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `context/INDEX.md:29`、`context/team/INDEX.md:21` | 两级索引摘要无条件要求「okteto 前必须关 ArgoCD 自动同步」 | `AGENTS.md`：GitOps 断线，该步骤「当前不适用」；正文 `okteto-inner-loop.md:27` 已是条件句 | 高 |
| `context/team/okteto-inner-loop.md:40` | 断言 `argocd-devwindow.sh off` 会「直接报错退出（不是空转）」 | `scripts/argocd-devwindow.sh:47-54` 注释明写「零 Application 就诚实地空转」；`evolution-log.md:220` 记录了这次修改——okteto 文说的正好是改掉前的行为 | 高 |
| `context/team/okteto-inner-loop.md:4` | frontmatter 摘要仍是无条件「必须先关」 | 正文条件句 | 中 |
| `context/team/runbook.md:54` | okteto 失败后果按 GitOps 已接通描述 | matrix:255 零 Application | 中 |

### 其他

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `context/team/local-env.md:80` | 「配置缺子块会被静默关掉而不是启动失败」当现行行为 | matrix:37-42：2026-08-18 起 ErrorUnused + protovalidate 已接线，缺 required 段直接起不来 | 高 |
| `context/harness-framework/knowledge-layering.md:51` | gateway 模块映射到已删除的本仓 `gateway/` 目录 | AGENTS.md：该目录 08-24 已删，现在同级仓 control-tower | 高 |
| `context/INDEX.md:51` | 服务级模块枚举漏 `events`（新建） | `context/project/ecommerce/INDEX.md:13` 已列 | 中 |
| `context/project/ecommerce/INDEX.md:9` | gateway 一句话摘要仍以现在时描述旧网关健康检查事故 | experience 正文已注明「旧实现已消亡、教训进新网关契约」 | 中 |
| `context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md:11-12` | 以「前端拿 token / 清 token」为主路径叙述，未标注 legacy | `STACK.md:161` 主路径已是 BFF session | 中 |
| `context/project/ecommerce/config/experience/config-center-self-bootstrap-blindspot.md:40` | 防再发清单把 Consul 与已退役 ES 并列为可关停项 | `STACK.md:203` Consul 仍在注册发现热路径，迁移未实施 | 中 |
| `context/project/ecommerce/registry/consul-dual-check-runbook.md:9` | 缺「Consul 定稿退役，仅现状复验」限定 | `STACK.md:203` | 低 |
| `context/team/local-env.md:568` | 链接显示文本带仓根前缀但解析基准是 `context/team/`（非死链，仅混用） | — | 低 |

---

## C6（高→低）：docs 顶层文档（子代理 C 全量核实 + captain 抽查）

### C6.1 部署与 GitOps

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `helm/values.yaml:1-2` | 文件头自称「ArgoCD GitOps 的集群权威真相源」「subchart 由 ApplicationSet 渲染」「镜像 tag 由 CI 的 update-manifests job 回写」 | `argocd-app.yml:3`「集群零 Application、零 ApplicationSet」；matrix:226「当前只是一份待重建的部署描述，不是真相源」 | 高 |
| `helm/values.yaml:32` | `tag: 1.4.0` | `argocd-app.yml:10` 集群实跑 `:dev / meili-dev-* / cdc-dev-*`；`:12,17` 直接 apply 会起影子服务并经 Consul 分走真实流量 | 高 |
| `docs/OKTETO.md:21,51-59,66,74-89` | 外环写成「CI 回写 helm tag → ArgoCD 同步」正常运转；「第一步永远是关掉 ArgoCD 自动同步」「开发后必须恢复」无条件 | GitOps 断线（matrix:255）；`argocd-devwindow.sh:47` 已诚实空转；AGENTS「当前不适用」 | 高 |
| `docs/DEVOPS.md:27-30` | 「现状盘点」仍含 `freeze-check.yml`（机制已删）、Loki 在用、两节点旧集群 | AGENTS（.freeze 已删）、`STACK.md:251`、现网 3 节点 | 中 |
| `docs/DEVOPS.md:36-38` | 「合入主干即触发流水线」「路径触发」写成分支流程规则 | 现行 CI 仅由裸 semver tag 触发（AGENTS/README） | 高 |
| `docs/DEVOPS.md:69,87,121,130` | ArgoCD 接管/CD 主路径未紧邻标注当前断线；仍引用 freeze 验收；把网关当本仓流水线参数化对象 | matrix:255,257；网关在同级仓 control-tower | 中 |

### C6.2 可观测性操作文档

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `docs/observability/grafana/README.md:40` vs `:130` | 同一文件先教 `kubectl -n observability apply` 历史告警 ConfigMap，文尾又写「不得直接 apply 历史 ConfigMap」 | `面板设计.md:253` 同样禁止——执行指令互相否定 | 高 |
| `docs/observability/grafana/README.md:17,30,32` | 排障主入口仍是 `jaeger-ui.dev.test`；操作步骤仍读集群内 Grafana Secret、port-forward `svc/grafana` | Jaeger/集群内 Grafana 已删（matrix:89）；现网 Grafana 在 node3 | 高 |
| `docs/observability/grafana/README.md:44,51,109` | 「告警当前不配通知渠道」；数据源默认 `GRAFANA_DS_LOKI`；声称「Strimzi metricsConfig 与 kafka receiver 已配」 | ntfy 闭环已实测（TODO:484）；Loki 已删；Strimzi 不在栈内 | 高/中 |
| `docs/observability/面板设计.md:52,112,128,140,151-152` | 正文仍按 Jaeger/Loki 设计跳转与数据源 | 文首 `:4` 与 `:253` 已有迁移警示，属「已知未迁」 | 低 |
| `docs/DEVOPS.md:98` | 目标态日志架构仍指定「结构化 JSON + Loki」 | 日志栈拍板是 VictoriaLogs + Vector（`claude2-日志栈拍板:15`）——目标态本身过时 | 中 |
| `docs/observability/OBSERVABILITY.md` | 已改写为 node3 Victoria 现状 + 自警示（除 `:74` 的 Kafka 迁移措辞，已入 C1） | 基本无冲突 | — |

### C6.3 术语表与脚手架

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `docs/GLOSSARY.md:200` | 「转向 BFF 属架构演进规划，不应表述为已完成」 | BFF + 服务端 session 已是当前主路径（`STACK.md:160-161`、08-24 迁移归档）——术语表落后一代 | 高 |
| `docs/GLOSSARY.md:205,309,319` | 网关/身份词条以「JWT 验签 + 注入身份」为主描述 | JWT 仅 legacy 兼容轨 | 高 |
| `docs/GLOSSARY.md:656,671` | 「MinIO……现役承载」「SeaweedFS 是 MinIO 的定稿接替者」 | 现役实现是 Silo 分叉；SeaweedFS 定稿未迁（matrix:62） | 中 |
| `docs/SCAFFOLD.md:19,63-65,94,119,183-186,244,248,711,737` | 脚手架整体复刻旧世界：仓内 `gateway/`（含 bbr/circuitbreaker）、「Consul KV 前缀」、`source_consul.go` 配置源、「鉴权：Casdoor + 网关集中式 JWT/RBAC」、go-kratos/gateway 身份 | 网关在 control-tower（无 BBR/熔断）、Consul KV 退役、BFF session；`TODO.md:371`① 只登记了 AGENTS 模板一处 | 高 |
| `docs/SCAFFOLD.md:138,808,817,818` | 验收标准仍是「trace 在 Jaeger 看」「JWT 校验带 leeway」「ArgoCD ApplicationSet + manifest 回写」 | VictoriaTraces；session 主路径；GitOps 断线且有影子服务事故告警 | 高 |
| `docs/TECH-RADAR.md:24-32` | 总览行状态混写：§3「CNPG 既成事实补强」、§4「OpenFGA/ESO+OpenBao+SOPS 采纳」、`:30`「Jaeger 保持」、§6「Consul 退役」按完成态措辞 | 现役 Pigsty/Casbin/ESO+Vault/VictoriaTraces/Consul 仍在热路径——「已选型」与「已实施」未区分 | 高/中 |
| `docs/PRIORITY.md:55` | Casdoor 条目只提密码策略，未承接 08-20 定稿的「收编进集群」路线（matrix:59 已登记） | 决策已定稿、未进入优先级路线——方向遗漏 | 中 |

---

## C7（中）：TODO.md 内部陈旧开放条目

进度真相源里挂着针对**已删除组件/已退役机制**的未完成任务，重排期时会浪费在幽灵目标上：

| 出处 | 问题 |
|---|---|
| `TODO.md:387` | 推荐链路收尾要求把配置「上传 Consul KV」——Consul KV 已退役（硬规则 4），应为 Config Center |
| `TODO.md:371` | ④⑥ 两条针对已删除的 `gateway/` 目录（README badge、gitee-sync workflow） |
| `TODO.md:374` 尾 | 「集群 CNPG 首次接管手顺：port-forward 后 make migrate-baseline（未执行，等发布窗口）」——接管对象已换成 node3 Pigsty |
| `TODO.md:410,435,437,438,442,443` | fluent-bit 标签/PII 脱敏、Jaeger 错误检索/采样/单副本、Loki schema 等开放缺陷，组件均已删除；其中 PII 脱敏、5xx span 状态两条的**关切本身仍有效**，需迁移到 Vector/VictoriaLogs/control-tower 语境重立 |
| `TODO.md:453` | 12 条 HTTPRoute 迁 https 的清单含 kibana/es/kafka-ui/jaeger/seata/consul-ui——多数组件已删，且孤儿 HTTPRoute 已清（commit 45bdd9c） |
| `TODO.md:458-483` | 企业微信告警落点是 210 的 Alertmanager 与「集群内 grafana.dev.test」——告警链已迁 node3（`TODO.md:484,496` 自己已记录），本条整段拓扑需重探 |
| `TODO.md:485,488` | 「KV 里不填真值」「KV 改为 https://minio.apikv.com」——「KV」措辞沿用 Consul KV 时代，实指 Config Center；且 minio 端点现为 Silo |

---

## C8（低-中）：matrix 内部与跨文档命名

| 出处 | 问题 |
|---|---|
| `.service-matrix.yaml:65` vs `:71-76` | 「Pigsty」一词指两台机器：`:65` 说「≠ Pigsty 那台 192.168.3.210」（旧局域网 Pigsty，已关机），`:71` 定义 node3 Pigsty（node3）为现役。同文件内同名异指，未互相注明 |
| `docs/PRIORITY.md:257` | 「node3 二义」警示本身已过时：现在 node3 有第三个所指（node3 的 Pigsty 机），警示只列了两个 |
| `.service-matrix.yaml:62` | 外部项键名仍叫 `minio`，note 里实为 Silo 分叉——命名债务，易被摘要工具误判为集群内 MinIO（子代理 B 判定：非事实冲突） |
| `README.md:96` | 「基础设施地址（PG、Dragonfly、Meilisearch、NATS、Kafka、对象存储等）配置在 Config Center」——Kafka 无任何服务消费（matrix:57 `used_by=[]`），列入易误读 |

---

## C9（高→低）：docs/design 层其余冲突（子代理 A 复核 + captain 亲读定案）

事件栈条目已并入 C1；production-scale-goal 悬空引用的施引方清单
（architecture:5、STACK:565、PRIORITY:100/126-127/157-158/270-271、TECH-RADAR:10/288、
runbook:43）也已在 C1/C4 列全。其余：

| 出处 | 问题 | 对立面 | 严重度 |
|---|---|---|---|
| `docs/design/order/consistency.md:14` | B 段编舞仍是 v1 事件链：「支付回调发 `OrderPaid`（库存 Confirm、订单转已支付）」，补偿事件为 `StockReserveFailed → 订单自动取消` | `docs/design/order/checkout.md:211-227`（v2 支付后事件链）：`PaymentCaptured → InventoryConfirmRequested → ConfirmReservationGroup → InventoryConfirmed → OrderReadyForFulfillment`，失败走 `InventoryConfirmationFailed → 补占一次 → PaymentRefundRequested`；`:227`「OrderPaid 不再被履约订阅」。两份设计对同一条支付后链路给出不同事件目录 | 高 |
| `TODO.md:389` | 计划事件目录 `OrderCreated/OrderPaid/OrderCancelled/OrderReadyForFulfillment` 混用两代事件名，缺 checkout v2 的 `PaymentCaptured`/`InventoryConfirm*` 系列 | 同上 checkout v2 | 低 |
| `docs/design/merchant/roadmap.md:39-40` | 「平台统一收单（payment + 支付宝已接）」「『支付时锁定库存』inventory 预占已实现」——把未实现能力当成功能裁剪依据 | payment 5 个 RPC 显式 Unimplemented、`pay.alipay.*` 空占位（matrix:206）；inventory Reserve 静默无操作、ReleaseReserve panic（PRIORITY:72-73） | 高 |
| `docs/design/platform/admin-roadmap.md:53,70-71` | 「当前仅 order→inventory 一处」东西向调用、「order→inventory 已是同样处境的既有短板」——把 planned 当已接线 | matrix:187 order `depends_on: []`；matrix:248「10 个服务的 depends_on 当前均为空」 | 中 |
| `docs/design/platform/admin-roadmap.md:38,63` | 预设第 11 个 `admin-service`（独立 proto 包/注册名/网关前缀）且「落地登记（立项即做）」 | `STACK.md:33` 新增服务须先 ADR；production-scale-goal「不为每个名词立即创建微服务」——需降级为 proposal 或补 ADR | 中 |
| `docs/design/platform/admin-roadmap.md:52` | 立项理由引用「TODO 第二阶段本就按能力立服务（商家/履约/结算三个扩展微服务）」 | `TODO.md:519-524` 第二阶段已改写为「履约并入 order……不新建 fulfillment 服务」——被引用的依据已不存在 | 中 |
| `docs/design/payment/payment.md:42` | 退款流程含「履约服务同步更新订单状态」（独立履约服务残留），整体为被 checkout v2 取代的 v1 单轴模型 | 文首横幅与 design README 已标「已作废」，属有警示的历史稿 | 低 |
| `docs/design/inventory/inventory.md:19` vs `docs/design/order/checkout.md:85-88` | 库存表示法两可：inventory 称 available 是「计算公式」（派生值），checkout 操作矩阵把 available 当独立存储列显式增减（`Reserve: available -= q, reserved += q`）。captain 验算：矩阵每步都保持 `available + reserved + locked == on_hand`，**不是算术矛盾**；但「派生 vs 冗余列」未裁决，且 `inventory.md:66-67` 早期表只有 `on_hand/locked` 两列，是第三种模型 | 建模裁决缺失——写 schema/SQL 前必须定一种规范表示（子代理 A 初判「数学冲突·高」与 captain 初判「无冲突」均不准确，各偏一侧） | 中 |
| `docs/design/inventory/inventory.md:41` | 「已锁定 → 可用：订单全额退款」未标未实现 | `checkout.md:227`「ReleaseLocked/Unlock……本期只定义契约不实现」 | 中 |
| `docs/design/platform/error-handling.md:27,30` | **全服务通用规范**的示例代码把 access token 写进 Debug 日志（`u.l.Debug(token.AccessToken)`），并把 access token 经 `Data` 返回业务层/前端——旧 token 代理模型 | 凭据不得落日志（同一问题已列 PRIORITY P0:52）；`rbac.md:49`「前端不保存或解析 access/refresh token」；STACK §三仍把该文当通用规范引用 | 高 |
| `docs/design/platform/error-handling.md:48-49` vs `:69` | 映射规则 `ErrAuthFailed → CodeInvalidArgument`，终端示例却显示 `rpc.code: internal` | 同文件内部矛盾 | 中 |
| `docs/design/order/checkout.md:268` | 可信身份来源仍称「网关 JWT 过滤器验证后注入」 | 主鉴权已是 BFF session（JWT 仅 legacy 轨），应表述为「网关认证（session 或 legacy JWT）后注入」 | 中 |
| `docs/design/order/checkout.md:3` | 「9 个 P0 全部关闭」易被读作实现完成 | 同文件 `:287` 自述 CreateOrder 仍是假成功桩——关闭的是设计评审问题，措辞需限定 | 中 |
| `docs/design/order/checkout.md:11` | 「settlement 名称保留给 platform/architecture.md **既有的**结算服务」 | `architecture.md:37` 已裁决结算「不再作为独立服务规划」——被引用对象不存在 | 中 |
| `docs/design/platform/admin-roadmap.md:21,93` vs `docs/design/merchant/onboarding.md:50,68` | admin 路线仍以「商家」为审核状态机对象（申请→审核→激活→冻结/清退），P0 围绕旧 Approve/Reject/ActivateMerchant | onboarding 两段式定稿：「merchant 创建即生效……不再有审核态」「审核对象从商家变成店铺」 | 中 |
| `docs/design/merchant/roadmap.md:60` vs `docs/design/merchant/store-settings.md:538` | P0「固定模板直发邮件，不建通知服务」 vs 竞品映射「通知 → 独立通知模板中心」（未标分期/目标态） | 分期口径不一致 | 中 |
| `docs/design/merchant/personal-store-compliance.md:68-70` vs `onboarding.md:64` | 个人店多项标「MVP」 vs 「MVP 先做企业店……个人店实现可分批」 | 个人店是否属于 MVP 验收范围未统一；compliance 标题级「允许」也比正文四类豁免+10 万元限额宽 | 中 |
| `docs/design/product/sales.md:256` | 「可支撑百万级数据下的商家分析秒级响应」——无数据集、硬件、P95/P99、执行计划 | `STACK.md:37` 容量结论、production-scale-goal:60「只报告峰值 QPS 不算通过」 | 高 |
| `docs/design/product/sales.md:119`、`docs/design/cart/api-decisions.md:41` | 示例保留 `StatisticsService`、「营销价格引擎（Promotion Service）」专名 | 二者均非登记服务（matrix 仅 10 个）；production-scale-goal:350「不为……每个名词立即创建微服务」——诱导新增服务 | 中 |
| `docs/design/cart/api-decisions.md:6` vs `:10-12` vs `:80` | 「§3 方案未被采纳」/「08-26 裁决 §3 论证成立、并行数组属未记录翻转」/「本节方案已被翻转」三处时态互斥 | 需拆成「当前 proto 实现」与「P1 迁移目标」两个明确标签 | 中 |
| `docs/design/README.md:22` | 索引摘要把「角色×独立 admin-service×专属页面」当既定结论转述 | admin-service 未立项、未进 matrix——索引放大 admin-roadmap 的拓扑误导 | 中 |
| `docs/design/merchant/onboarding.md:37` | 「实现时由服务端从 session 取（设备信息）」——若「服务端」指业务服务则越过 session owner 边界 | `rbac.md:12`「control-tower 是 session owner……业务服务不解析浏览器凭据」；**待核**具体指哪一端 | 中 |
| `docs/design/platform/production-scale-goal.md:186` vs `STACK.md:228` | 「TCR/GHCR/Harbor 只能选一个主制品真相源」 vs 现行「TCR + GHCR 双推」 | 目标与现行策略相反，需显式拍板（保留双推或收敛单仓） | 中 |
| `docs/design/order/schema.md:14` vs `checkout.md:75`；`architecture.md:25` | 订单状态集合两代并存（7 态单轴 vs order_group 三态 + 预留），architecture 把物流状态混进 Order 主状态机 | schema 已标「早期稿」；重写必须区分 order_group / 子订单 / 履约三层状态，防止单轴万能状态机 | 中 |
| `product/listing.md:4`（Money vs int64 分）、`product/schema.md:4-9`（表名/DECIMAL/BIGINT 漂移）、`order/schema.md:45`（跨 schema 外键） | 均已**自标**与现行铁律冲突，属有警示的历史债 | 重写时以实际 migration 与金额/UUID 铁律为准，不得照抄 | 低 |
| `platform/rbac.md`、`platform/i18n-routing.md`、pre-environment 正文、gin 对照其余部分、`frontend/README.md` | 逐项复核与基线一致（rbac 的 BFF/Casbin/owner/OpenFGA 口径、i18n 草案自标、4 app + 9 包与 matrix 一致、无物流/仓储端残留） | **无冲突** | — |

---

## 汇总：按主题的「以哪边为准」

| 主题 | 最终口径 | 待清理的反方 |
|---|---|---|
| 事件栈 | PG outbox + NATS JetStream 主干；Kafka 仅 P2 证据触发重评 | TECH-RADAR §1 与 :10、PRIORITY 6 处、STACK §十 3 处、design 层 6 文件、context 3 文件、OBSERVABILITY:74、go.mod franz-go |
| 核心库 | node3 Pigsty 现役；CNPG hibernate 仅回切候选 | TECH-RADAR:13/§3、db-migrations、go-testing、local-env 前段、context/INDEX 摘要 |
| 可观测性 | node3 VM/VL/VT + Vector + Grafana + vmalert/Alertmanager；集群内 Loki/Jaeger/fluent-bit 已删 | context/INDEX:79、runbook:58、web-vitals SOP、local-env 三处、grafana/README 五处、DEVOPS:98、TODO/PRIORITY 开放条目 |
| 告警通知 | authenticated ntfy 闭环已实测；飞书/企业微信未接 | STACK:252、README:26 把 ntfy 一并写成未闭环；TODO:458-483/PRIORITY:146 企业微信落点指向旧 210/集群 Grafana |
| 部署交付 | `backend/services/*/deploy/` 实况；GitOps 断线、helm 非真相源 | helm/values.yaml 文件头、OKTETO.md、okteto-inner-loop 两级摘要与 :40、runbook:54、DEVOPS:36-38 |
| 鉴权 | BFF + 服务端 session 主路径，legacy JWT 迁移期 | GLOSSARY 三处、jwt-nbf 经验未标 legacy、SCAFFOLD、checkout:268、error-handling 示例（token 落日志/返前端） |
| 配置 | Config Center 唯一 Bootstrap 源，缺段启动即失败 | local-env:80、TODO:387 与「KV」措辞、SCAFFOLD |
| 脚手架 | 以现行栈重写或标注「历史架构模板」 | SCAFFOLD.md 全文 |

## 清理顺序建议（供重写基线使用）

1. **先拍板事件栈**（一句话决定），然后一次性清 C1 全表 + go.mod 死依赖——它污染面最大，
   且直接决定重写方案的事件章节。
2. 清 context 高频入口（C5：两级 INDEX、runbook、okteto、local-env、db-migrations、
   go-testing、go-redis）——这些是 AI 与人每轮都读的路由，错一条影响所有后续工作。
3. 重排 PRIORITY.md 或降级为「仅 P0-P2 有效」（P6 的四个独立服务条目按 08-26 裁决改写），
   TODO 清扫 C7 幽灵条目；有效关切（PII 脱敏、5xx span、企业微信通知）在新组件语境下重立。
   consistency.md 的 v1 事件链按 checkout v2 收敛为唯一事件目录。
4. SCAFFOLD.md 重写或标废；GLOSSARY 网关/身份词条改为 BFF session 模型；
   error-handling.md 换掉「token 落日志/返回前端」的旧示例（它是全服务通用规范，被 STACK §三引用）。
   同时裁决四个建模缺口：库存 available 表示法（派生 vs 冗余列）、订单三层状态、
   制品主仓（双推 vs 单仓）、admin 审核对象（商家 vs 店铺）。
5. 低严重度命名与链接（C8）随手修。
