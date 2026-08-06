# 架构加固：让已划好的服务边界真正生效

Status: ready-for-agent

> 来源：2026-08-03 用 `microservices-architect` 技能对全仓做的架构评审。
> 评审结论完整记录在本文件的「Problem Statement」与「Implementation Decisions」两节。
> 术语沿用 `/codebase-design`（module / interface / implementation / depth / seam / adapter /
> leverage / locality）与 `context/` 的领域词表；结构事实以 `.service-matrix.yaml` 为准。

## Problem Statement

这套系统的**限界上下文划得是对的** —— 11 个后端服务、9 个数据库 schema 与领域概念一一对应，
没有出现共享 common 表这类典型串味。可观测性也是扎实的：11 个服务全都接了 OTel，
W3C TraceContext + Baggage 传播器齐全，`trace_id` 统一注进 zap 日志，
单个请求可以端到端追踪。K8s 探针的读写分离（readiness 走 `/healthz`、liveness 只探 TCP）
是刻意设计且判断正确的。

问题不在边界怎么划，在于**没有任何东西在守这些边界**。当前状态下，开发者面对的是：

1. **schema 边界是命名约定，不是权限边界。**
   9 个 schema 全在同一个 Postgres 库 `ecommerce` 里，而 `helm/values.yaml` 里 8 处 `DB_SOURCE`
   连接串**完全相同**，用的都是超级用户 `postgres`。任何一个服务都能 `SELECT * FROM orders.order_main`，
   也能 `DROP SCHEMA payments`。「database per service」只落实了 schema 隔离这一半，
   而没落实的另一半（独立凭据）恰恰是唯一有强制力的那一半。
   结果：架构评审、Saga 设计、最终一致性讨论全部悬空，因为没有机制阻止一个服务直接改另一个服务的表。

2. **配置约束写了几十条，一条都不生效。**
   各服务 `conf.proto` 里超时（read/write/idle/dial/ping）写得很完整，还带 `buf.validate` 的
   `duration.gte` 与 `required = true`。但配置加载路径只做 mapstructure 解码，
   **从不调用 protovalidate**（`.service-matrix.yaml` 的 `config_validation.known_defect` 已记录）。
   于是 KV 缺块 → 解码不报错 → getter nil-safe → 功能被静默关掉而不是启动失败。
   mapstructure 也没开 `ErrorUnused`，键名写错同样不报错。
   已经有一次真实事故落在 `context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md`。
   这意味着「每个外部调用都有显式超时」这条只在声明层成立，运行时不保证。

3. **仓库里有明文生产凭据。**
   `helm/values.yaml`（8 处）与 `backend/infrastructure/kafka-connect/kafkaconnector.yaml`
   都写着同一个真实数据库口令与真实主机地址。这直接违反 `AGENTS.md` 硬规则 4
   （「密码/密钥只存在 Consul KV 和本地环境，仓库里只写主机名和端口」）。
   `kafkaconnector.yaml` 里已有 TODO 承认了这点。同一个口令被 11 个服务 + Debezium 共用，
   且它是超级用户 —— 一次泄漏等于全库沦陷。口令已进 git 历史，改文件不足以补救。

4. **没有迁移工具，schema 靠手工执行。**
   30 个 `.sql` 里没有一个是版本化迁移。`backend/infrastructure/kafka-connect/setup.sql`
   的注释坦白了做法：「手工执行（仓库没有 migration 工具，和各服务的 schema.sql 一样的做法）」。
   11 个 `sqlc.yaml` 各自读 `internal/data/schema` 生成代码 —— sqlc 只把 DDL 当**类型来源**，
   不负责施加它，也不记录哪个环境跑到了哪一版。
   CDC 让这件事更危险：Debezium 的 publication 表清单必须和 `table.include.list` 手工保持一致，
   任何一次 DDL 漂移都会让下游静默少收变更。

5. **异步骨干的契约形状与定稿设计不一致，且跨越了仓库边界。**
   `TODO.md` §二 定稿的是「Outbox + Kafka 可靠投递」，实现走的是 Debezium CDC。
   CDC 是 log-based outbox 的合法变体，本 spec **不重开这个决策**；但要指出它换掉了契约的形状：
   Outbox 表发布的是稳定的**领域事件**，CDC 发布的是**表行**。
   现在下游 `postgres-kafka-es-streaming-pipeline`（**不在本仓库**）直接耦合在
   `orders.order_main` 等表的列名上。改一个列名 = 跨仓库破坏性变更，且没有门禁能发现
   —— `buf breaking` 只看 proto，管不到 schema。这条 seam 真实存在，但**没有 adapter**。

6. **`order` 的进程内事件总线容易被误当成可靠投递。**
   `order/internal/eventbus` 是 `GoEventBus.NewEventStore(..., 1<<16, GoEventBus.DropOldest)`
   —— 进程内环形缓冲，满了丢最旧的，`Publish` 立即返回不等确认。
   作为进程内解耦工具它是合理的；一旦有人把「订单已创建」这类跨聚合事件挂上去，
   就成了一个看起来在工作的可靠性黑洞：压力上来静默丢事件，Pod 重启全丢。

此外两项较轻但会持续放血的：**两套部署清单并存且互相不一致**
（`helm/charts/*/values*.yaml` 与 `backend/services/*/deploy/{dev,prod}/`，探针只在后者、
真实凭据只在前者，删掉任何一套都会丢东西 —— 典型的 shallow 重复），
以及**没有渐进式发布**（全仓搜不到 canary / blue-green / argo-rollouts，ArgoCD 是直接 sync）。

## Solution

不拆库、不重构服务划分、不推翻任何已定稿的方案。
用**最小改动把已经写好但不生效的约束激活**，再把守边界的能力从「约定」升级为「机制」。

按杠杆（leverage）从高到低：

- **把凭据移出仓库**，Helm 引 Secret、Strimzi 走 `KubernetesSecretConfigProvider`，
  并轮换已泄漏的口令。CI 加一道 secret 扫描门禁，防止回潮。
- **在配置加载路径补一次 `protovalidate.Validate(bootstrap)` 并开 `ErrorUnused`**。
  这是全仓杠杆最高的一处 —— 一个 module 的一处改动，一次性激活 11 个服务
  `conf.proto` 里已经写好的全部约束，同时让 `.service-matrix.yaml` 那条 known_defect 消失。
- **给每个服务建独立 DB role**，只 `GRANT` 自己 schema 的权限。
  不拆库、不改一行 Go 代码，就把 schema 边界从命名约定变成权限约束。
- **引入版本化迁移工具**，把 11 份 `schema.sql` 纳入版本管理，
  并让 Debezium publication 的表清单从迁移产物派生，不再手工同步。
- **为服务间调用预置统一 adapter**（超时 + 重试预算 + 熔断 + 降级），
  在接线 `order → inventory` **之前**就位，避免等第二个调用出现才补。
- **给 CDC 契约加门禁**：被 `table.include.list` 覆盖的表，其列的增删改需要显式确认。

可观测性与探针两块已经达标，本 spec 不动它们。

## User Stories

### 凭据与安全

1. 作为安全负责人，我希望仓库里搜不到任何真实数据库口令，这样一次仓库泄漏不等于一次数据库泄漏。
2. 作为 SRE，我希望 Helm 渲染出的 Deployment 通过 `secretKeyRef` 拿数据库连接串，这样轮换口令不需要改代码仓库。
3. 作为 SRE，我希望 Debezium connector 的口令来自 Strimzi 的 `KubernetesSecretConfigProvider`，这样 CDC 侧和服务侧的凭据管理方式一致。
4. 作为安全负责人，我希望旧口令被视同已泄漏并完成轮换，这样清理文件不会给我虚假的安全感。
5. 作为后端开发者，我希望 CI 有一道 secret 扫描门禁，这样我不小心粘进去的凭据会在合并前被拦住。
6. 作为后端开发者，我希望这道门禁用一条故意写错的输入验证过确实能拦住，这样我知道它不是又一个静默失效的钩子。
7. 作为安全负责人，我希望 `helm/charts/*/values.dev.yaml` 里的占位口令和真实口令在形式上可区分，这样审计时不用逐个人工确认。

### 配置校验

8. 作为后端开发者，我希望 Consul KV 缺少 `required = true` 的配置块时服务**启动失败**，而不是静默降级，这样问题在部署时暴露而不是在半夜的告警里。
9. 作为后端开发者，我希望配置里的超时值不满足 `duration.gte` 约束时服务启动失败，这样「每个外部调用都有显式超时」这条从声明变成保证。
10. 作为后端开发者，我希望 KV 里多写、写错的键名被拒绝，这样改配置时的手滑当场可见。
11. 作为 SRE，我希望配置校验失败时的错误信息指明是哪个字段、违反了哪条约束，这样我不用翻 proto 才能修。
12. 作为新加入的开发者，我希望 11 个服务的配置加载行为一致，这样我在一个服务学到的东西在另一个服务成立。
13. 作为 AI agent，我希望 `.service-matrix.yaml` 里那条 `known_defect` 在修复后被移除，这样我读到的事实表和代码一致。
14. 作为后端开发者，我希望 behavior 与 product 之间 `recommend` 块 `required` 取值不一致这个已知矛盾一并收敛，这样校验打开后不会立刻炸掉其中一个。

### 数据所有权

15. 作为后端开发者，我希望每个服务用自己的数据库 role 连接，这样我能从连接串一眼看出这个进程被授权碰哪些数据。
16. 作为安全负责人，我希望 `order` 服务尝试读 `payments` schema 时被数据库拒绝，这样边界违规在第一次发生时就暴露。
17. 作为架构评审者，我希望「database per service」这条检查点有可执行的验证方式，而不只是文档声明。
18. 作为 SRE，我希望降权发生在应用无感的前提下，这样这次改动不需要协调所有服务同时发版。
19. 作为后端开发者，我希望 `debezium_user` 的权限维持在最小集（只对 publication 覆盖的表有 SELECT），这样 CDC 账号不会成为新的越权入口。

### Schema 迁移

20. 作为后端开发者，我希望 schema 变更是版本化的迁移文件，这样我能知道某个环境跑到了哪一版。
21. 作为后端开发者，我希望迁移可以在 CI 里对一个干净的库跑通，这样「手工 psql 执行」不再是唯一路径。
22. 作为后端开发者，我希望 sqlc 的类型来源和实际施加到库上的 DDL 是同一份，这样生成的代码不会和真实表结构漂移。
23. 作为 SRE，我希望 Debezium 的 publication 表清单从迁移产物派生，这样加表时不会忘记同步而导致下游静默少收变更。
24. 作为后端开发者，我希望迁移工具的选择被记录下来并给出理由，这样下一个人不会再纠结一次。

### 服务间调用韧性

25. 作为后端开发者，我希望有一个统一的 adapter 构造服务间 Connect client，这样超时、重试预算、熔断、降级不用每个调用点各写一遍。
26. 作为 SRE，我希望每个服务间调用都有显式超时，这样一个慢服务不会把上游的连接池吃干。
27. 作为 SRE，我希望重试有预算上限，这样重试不会在故障时把下游打得更死。
28. 作为 SRE，我希望熔断在服务侧也有，而不只在 gateway，这样 gateway 之后的调用链也受保护。
29. 作为后端开发者，我希望这个 adapter 在接线 `order → inventory` **之前**就位，这样第一个真实调用就是对的。
30. 作为后端开发者，我希望现存的唯一一条服务间调用（`cart → config`）迁到这个 adapter 上，这样它成为示范而不是例外。
31. 作为架构评审者，我希望「一个 adapter 是假想的 seam，两个才是真的」这条被尊重 —— 在有第二个调用点之前，adapter 的 interface 保持最小。

### 异步与契约

32. 作为后端开发者，我希望 `order/internal/eventbus` 的文档明确写出它是进程内、有损、不可靠的，这样没人会把跨聚合事件挂上去。
33. 作为后端开发者，我希望 `DropOldest` 真的丢弃事件时有指标或日志，这样静默丢失变成可见丢失。
34. 作为下游 ES pipeline 维护者，我希望被 CDC 覆盖的表的列变更有门禁，这样我不会在别人改列名之后才发现同步断了。
35. 作为架构评审者，我希望「CDC 发布表行、而非领域事件」这个事实被显式记录，这样它是一个知情的取舍而不是一次疏忽。
36. 作为后端开发者，我希望 CDC 的契约边界（哪些表、哪些列对外）写在一个下游能读到的地方，这样跨仓库的耦合至少是有据可查的。

### 部署

37. 作为 SRE，我希望 `helm/charts/*` 和 `backend/services/*/deploy/*` 之间的职责被切开，这样我知道该改哪一份。
38. 作为 SRE，我希望两套清单的探针配置一致，这样 Helm 路径部署出来的 Pod 不会缺探针。
39. 作为 SRE，我希望有一份成文的渐进式发布策略（canary 或 blue-green），这样上线不是全量替换。
40. 作为 AI agent，我希望 `TODO.md` 与 `.service-matrix.yaml` 在本轮改动后与代码一致，这样我下次读到的是事实。

## Implementation Decisions

### 涉及的 module

| module | 位置 | 改动性质 |
|---|---|---|
| 配置加载 | 各服务 `internal/pkg/config` | 修改 implementation，**interface 不变** |
| 部署凭据 | `helm/`、`backend/infrastructure/kafka-connect/` | 替换为 Secret 引用 |
| 数据库授权 | `backend/services/*/internal/data/schema/` 或新的迁移目录 | 新增 role/grant DDL |
| Schema 迁移 | 新目录（工具待定） | 新增 |
| 服务间调用 adapter | 新 module，位置随各服务 `internal/pkg/` 惯例 | 新增，interface 保持最小 |
| CDC 契约门禁 | CI | 新增 |

### 关键决策

**D1 — 配置校验补在 `Init` 而不是 `decodeConfig`。**
`decodeConfig` 的职责是「把 map 解成结构体」，加校验会让它变浅（shallow）。
`Init` 已经是「拿到一份可用的 Bootstrap」这个完整语义的持有者，校验属于它。
`decodeConfig` 只增加 `ErrorUnused: true`，这是解码语义的一部分。
校验失败必须让 `Init` 返回 error 并阻止启动 —— 不做降级，不打 warning 继续。

**D2 — 不拆库，改用独立 role。**
把 9 个 schema 拆成 9 个库的收益远小于代价（跨 schema 的运维、备份、CDC 都要重做），
而**独立 role + 按 schema GRANT 能拿到边界强制力这个主要收益**，且零 Go 代码改动。
每个服务一个 role，`GRANT USAGE ON SCHEMA <own>` + 该 schema 下表的 DML 权限，
不给跨 schema 权限，不给 DDL 权限（DDL 走迁移工具的专用 role）。
这条与「database per service」的字面表述有出入，属于知情取舍，理由记录在此。

**D3 — 不重开 CDC vs Outbox 的决策。**
`TODO.md` §二 已定稿「Outbox + Kafka 可靠投递」，实现走了 Debezium CDC。
本 spec 接受 CDC 作为既成事实，只要求补上它缺的那部分：**契约的显式化与门禁**。
如果后续要回到应用层 Outbox，那是一次独立的决策，应当开 ADR，不在本 spec 范围内。

**D4 — 服务间 adapter 的 interface 保持最小。**
目前真实的服务间调用只有 `cart → config` 一条。按「一个 adapter 是假想的 seam，
两个才是真的」，adapter 先只暴露构造 client 所需的最小 interface
（目标服务名 + 超时 + 熔断策略），不预先设计通用重试 DSL。
第二个调用点（`order → inventory`）出现时再根据两个真实用例决定 interface 的最终形状。

**D5 — 凭据轮换与文件清理是两件事，都要做。**
删掉 `helm/values.yaml` 里的明文只解决未来，不解决过去 —— 口令已在 git 历史里。
必须完成一次真实的口令轮换。是否重写 git 历史由维护者决定（涉及三个 remote），
但**轮换本身不可选**。

**D6 — 迁移工具选型待定，但必须支持「校验当前版本」而不只是「向前推进」。**
候选 golang-migrate / atlas。选型标准：能对一个环境查出当前版本、能对 schema 做 diff、
能被 CI 在干净库上跑通。选定后在 `context/team/` 下记一条。

**D7 — 探针配置以 `backend/services/*/deploy/*` 为准。**
那一套的 readiness/liveness 拆分（readiness 走 `/healthz` 返回 503 摘流量、
liveness 只探 TCP 避免数据库抖动导致连环重启）是刻意且正确的设计，
比通用模板更好。Helm 那套向它对齐，而不是反过来。

**D8 — 渐进式发布本轮只出策略文档，不落地。**
它依赖前面几项（尤其是配置校验生效后启动失败会被正确捕获）才有意义。
先成文，落地放到后续。

### 不涉及

- 不改任何 proto 的 message 定义（`conf.proto` 里的约束已经写好，只是没被执行）
- 不改服务边界、不合并或拆分服务
- 不改 gateway 的 JWT/RBAC 链路
- 不改 OTel 接入方式

## Testing Decisions

### 什么是好测试

只测**外部可观察行为**，不测 implementation 细节。对本 spec 而言具体是：

- 测「KV 缺 `recommend` 块时 `Init` 返回 error」，不测「`protovalidate` 被调用了几次」
- 测「以 `order` 的 role 连接后读 `payments.xxx` 被拒绝」，不测「GRANT 语句的文本」
- 测「`helm template` 的输出里不含明文口令」，不测「values.yaml 的某一行长什么样」

### seam 选择

按「已有 seam 优先、seam 越高越好、总数越少越好」，本 spec 用 **两个 seam**：

**Seam 1（已有）—— `internal/pkg/config` 的 `Init` / `decodeConfig`。**
这是最高、且已经存在的 seam：11 个服务全都有 `config_test.go`，
已有 15 个测试覆盖 `TestDecodeConfig` / `TestDecodeConfig_IgnoresUnknownFields` /
`TestInit_InvalidYAML` / `TestGetConfigFromConsul_KeyNotFound` 等。
**prior art 充足，新测试直接沿用同一模式。**
注意：现有的 `TestDecodeConfig_IgnoresUnknownFields` 断言的正是本 spec 要推翻的行为
（未知字段被忽略）—— 它需要改成断言拒绝，这是行为变更的正确信号，不是回归。

**Seam 2（新增，CI 级）—— 仓库与渲染产物的静态门禁。**
不是 Go seam，测的是仓库本身：
secret 扫描、`helm template` 输出扫描、CDC 覆盖表的列变更检测。
这个 seam 必须用**一条故意写错的输入**验证真能拦住
（`context/harness-framework/` 里已有先例：commitlint 钩子九个月静默失效的教训）。

**明确不新增的 seam：**

- 数据库授权**不引入 Go 层抽象**。它在数据库里测：用各服务的 role 连接，
  断言跨 schema 访问被拒。这是集成测试，不需要新 seam。
- 迁移工具用它自己的 CLI 在 CI 里对干净库跑通，不包一层。
- 服务间 adapter 在只有一个真实调用点之前**不单独测**
  —— 通过 `cart → config` 这条既有路径的行为测试覆盖。

### 待测 module

| module | 测试类型 | prior art |
|---|---|---|
| `internal/pkg/config`（11 份） | 单元 | 各服务已有的 `config_test.go` |
| 数据库授权 | 集成 | 无，本 spec 新建 |
| Helm 渲染产物 | CI 静态检查 | 无，本 spec 新建 |
| CDC 契约门禁 | CI 静态检查 | 无，本 spec 新建 |
| `cart → config` 调用 | 行为 | 现有调用路径 |

## Out of Scope

- **拆库**（9 个 schema 拆成 9 个独立数据库实例）—— 见 D2，收益不抵代价。
- **CDC 换回应用层 Outbox** —— 见 D3，属于独立决策，需要单开 ADR。
- **`order/internal/eventbus` 的替换** —— 本 spec 只要求把它的有损语义写清楚、
  把丢弃变成可观测；换成可靠投递属于 `TODO.md` §二 那条定稿方案的落地，不在这里。
- **渐进式发布的落地** —— 见 D8，本轮只出策略文档。
- **`TODO.md` §二 定稿的分布式一致性方案本身**（A 段同步 `inventory.Reserve` TCC-Try +
  B 段编排式 Saga）—— 不重新讨论，只要求它落地时能用上本 spec 建立的 adapter。
- **服务边界的重新划分** —— 评审结论是边界划得对，问题在于没人守。
- **可观测性与探针** —— 已达标。
- **git 历史重写** —— 涉及三个 remote，由维护者决定；本 spec 只要求完成口令轮换。
- **gateway 的 8 条 `anonymous_paths`** —— 需要单独的安全评审，不在架构加固范围内。

## Further Notes

**评审的检查点结论**（`microservices-architect` 六步）：

| 检查点 | 结论 |
|---|---|
| 1 域分析 | 边界划分通过；数据独占**不通过**（共享库 + 共享超级用户） |
| 2 通信设计 | 服务间调用几乎未接线，暂无法判定；异步骨干是 CDC，契约形状与定稿设计不一致 |
| 3 数据策略 | **不通过**：共享 schema、无迁移工具 |
| 4 韧性 | 熔断只在 gateway；超时**声明层通过、运行时不保证**（配置校验静默失效）；无重试预算、无 bulkhead |
| 5 可观测性 | **通过**，全仓最扎实的一块 |
| 6 部署 | 探针**通过**且优于通用模板；渐进式发布**不通过** |

**一个正面记录：** `kafkaconnector.yaml` 的注释显示已经抓到过一次相关泄漏 ——
原来的 `table.include.list: .*\..*` 会把 `config.entry` 和 `config.revision`
（配置中心存密钥及其历史版本）明文流进 Kafka topic，当时已修掉。那次判断是对的。
本 spec 的第 3 条问题是同一类问题的另一个面。

**执行顺序建议：** 1（凭据）→ 2（配置校验）→ 3（DB role）→ 4（迁移）→ 5（adapter）→ 6（CDC 门禁）。
前三条互不依赖可并行；第 4 条依赖第 3 条确定 DDL 归属哪个 role；
第 5 条必须早于 `order → inventory` 接线。

**提交时注意：** 按 `AGENTS.md` 硬规则 3 与 `context/team/git-commit.md`，
提交前先更新 `TODO.md`；只改 `.scratch/` 的提交用 `docs` 类型。
本 spec 落地后需同步移除 `.service-matrix.yaml` 里的 `config_validation.known_defect`
与 `known_gaps` 中已解决的条目。
