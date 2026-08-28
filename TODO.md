# 项目实现进度与待办

> 依据 `README.md` 的目标与 `docs/design/` 的架构设计，对照当前代码实现整理。
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　⬜ 未开始
> 本文件只保留**活跃状态**；验收证据长文与会话记录按日期归档在 `docs/progress-archive/`（不可变历史，非并行真相源）。

---

## 一、实现进度对照

> 说明列已裁剪为首句；完整验收证据与历史记录见 [证据归档](docs/progress-archive/2026-08-21-todo-evidence.md)。

### 1. 基础设施与工程化

| 项目 | 状态 | 说明 |
|------|------|------|
| 容器化（Docker） | ✅ | 10 个服务的 Makefile/compose 已对齐（见下「构建与部署清单对齐」）；`make docker-deployx` 多架构构建+推送实跑通过 |
| 本地开发 DNS（devdns） | ✅ | 2026-08-28 修好长期悬空的 `*.dev.test` 解析：DNS 落点定为**集群内** CoreDNS（`devdns` ns，Cilium 专用 `/32` 池把 LB 钉在 `192.168.3.202`），对齐 Mac 既有 splitdns 配置、Mac 侧零改动。分流：`pg→.132`、`dragonfly→.122`、其余通配 `→.121`。**2 副本分节点 + PDB**（唯一解析来源且 consumer dev 代理依赖它；删 Pod 实测零中断）。清单在同级仓 `../kubernetes/components/devdns/devdns.yaml`；教程与三处同步纪律见 `context/team/local-env.md`。**坑**：CoreDNS 同 zone 内 `template` 先于 `hosts` 执行，覆盖记录必须拆独立 zone 块 |
| 前端 dev 代理地址订正 | ✅ | `consumer/vite.config.ts` 的默认网关从已消失的 `http://192.168.3.131:8080` 改为 `https://gateway.dev.test`（经 splitdns；业务 HTTPRoute 只挂 443，故 `changeOrigin:true` + `secure:false`），实测经 `localhost:3000/api` 取到真实商品数据 |
| Kubernetes 编排 | 🟡 | 25 份 ecommerce Deployment 与 10 个 Helm 子 chart 已增加跨服务 hostname topology spread（共同 `part-of` 标签、`maxSkew=1`、`ScheduleAnyway`），structcheck 与 server dry-run 通过。live 当前仍为 node101/node102/node103=`12/4/1`，本轮未获 dev apply 授权；受控 rollout 后复核 skew，集群级压测/弹性仍未验证 |
| dev 零信任与运行时安全 | 🟡 | 2026-08-28 已发布 15 个独立 SA/零 RBAC/token off、ServiceAccount identity CNP、cart 直连 Route 下线、三节点 Tetragon、Hubble Relay TLS 与 Vector→Victoria→vmalert 告警闭环；consumer-next SSR/ISR、Consul 10/10 deep readiness、10 API OTLP auth 已验收。Gorse 两条 Config Center version 3 更新仍等待 Casdoor 管理员登录；address BOLA 按用户决策保留。证据：`docs/reports/2026-08-28-zero-trust-runtime-security.md`；剩余权限治理、长期基线、事件完整性与 enforcement 门禁见 `docs/reports/2026-08-28-tetragon-follow-ups.md` |
| GitOps（ArgoCD） | 🔴 | 2026-08-24 实测控制器在跑但零 Application/ApplicationSet，AppProject 仅 default；Helm 与现网名称/标签/tag 不一致，当前部署走 `backend/services/*/deploy/`，禁止直接开启 selfHeal |
| 2026-08-19 鉴权链路改造：前端 PKCE 直连 + 网关身份头加固 | 🟡 | **起因**：前端每次启动都要先起 user 服务才有 JWT。查下来 user 服务在登录里**只是一层 40 行的 code→token 代理**（`backend/services/user/internal/data/user.go:35` 调 `GetOAuthToken` 后原样返回，不… |
| CI/CD（GitHub Actions） | 🟡 | **2026-08-07 后端 CI 重写为「一份模板 + 矩阵分发」**：`service-ci.yml`（workflow_call 可复用模板：build/vet/test(-race)+structcheck → buildx 多架构镜像推 TCR，tag=`sha-<7位>` 不可变 +… |
| 注册发现（Consul） | 🟡 | Consul 仅保留注册发现；应用配置统一由独立 Config Center 下发。… |
| 提交规范（commitlint + vite-plus 钩子） | ✅ | 2026-08-26 起 commitlint 由 frontend workspace 承载（根三件套已删，钩子直调 `frontend/node_modules/.bin/commitlint` + 显式 `--config frontend/commitlint.config.mjs`，三探针红测通过）：Angular 十一类 type + 可选 gitmoji（带了就必须与 type 相符）+ subject 末尾禁标点。… |
| 代码规范（oxlint + oxfmt，vite-plus 内置） | 🟡 | biome 在 2026-03 迁移时已被 vite-plus 自带的 oxlint + oxfmt 取代。… |
| API Protobuf 输入约束（Protovalidate） | ✅ | 2026-08-07 完成 `backend/api/` 下 13 个 API 包、14 份源 proto 的 `buf.validate` 覆盖。… |
| 结构性门禁（`backend/structcheck`） | 🟡 | 2026-08-07 新增，随 `go test ./...` 进 CI。五项检查：`.service-matrix.yaml` ↔ `backend/services/` 目录双向对齐（`config` 撞名进程列为已知例外）、matrix 内部一致性（discovery/gateway_pref… |
| Bootstrap 配置边界与凭据门禁 | ✅ | 2026-08-29 从 Config Center 与 14 份本地 dev/pre 配置删除 7 个非 search 服务的死 `search.elastic_search` 块；7 个 live key 各升一版并保留 revision，服务全程 Ready。对应 proto 用 `reserved 6` / `reserved "search"` 同时关闭运行时入口，JSON Schema + structcheck 验证 example 与本机 dev/pre；`verify-quick.sh` 新增不打印值的并行凭据扫描。旧 ES 口令在节点、集群 Secret、工作区与当前 Config Center 无复用，且无活 ES/账号可轮换；另清掉两个过期测试 JWT，并把 Kafka Connect DB 口令改为 Secret 注入。Config Center `PutKey` 已前移同一批 Schema 校验，Rollback 同样受控；跨仓顺序固定为先同步/发布 control-tower，再写配置和发布消费服务 |
| 部署入口一致性 | 🟡 | 2026-08-07 将 `.service-matrix.yaml` 的 10 服务清单扩展为部署覆盖真相源，新增 `TestDeploymentListsMatchMatrix` 双向核对 `backend/Makefile`、`backend/compose.yaml`、`helm/value… |
| 统一可执行 runbook（`context/team/runbook.md`） | ✅ | 2026-08-07 新增，把「规则与限制」命令化,供 Codex 等 CLI 直读直跑:动手前必读的限制(拓扑查 matrix、10 服务同构、proto 先读设计、凭据不入库、不可逆动作)+ 提交前验收锚点(`go build/vet`、`structcheck -count=1`、`go te… |
| harness 瘦身（AGENTS.md / context） | ✅ | 2026-08-07，参照 Anthropic/OpenAI 2026 的「减法」prompting 指引：AGENTS.md（根 + ecommerce 两份同步）「项目速览」改为「反直觉约定」，删掉读代码即可发现的技术栈/架构复述；… |
| token 成本治理（对照腾讯《Multi-Agent 降本》复盘） | ✅ | 2026-08-21 六处落地：TODO.md 瘦身 199KB→92KB（证据归档 `docs/progress-archive/`）+ 96KB 预算门禁；`scripts/verify-quick.sh` 并行锚点（绿一行/红失败段）；runbook 硬规则 #6 副本消重；`harness-framework/subagent-dispatch.md` 三条派发约定；kaneo MCP 收窄按需（`.claude/kaneo-mcp.json`）；impeccable 钩子限定 `frontend/`。四要素记录见 evolution-log |
| 飞轮评测与门禁元评测（对照腾讯《Agent 自进化飞轮》） | ✅ | 2026-08-26 四齿对照评测：新增 `scripts/verify-context-canary.sh`（十探针，接两侧 context-gate CI）+ `context/harness-framework/flywheel-audit.md`（评测结论 + 方向性审计约定）。同日对照 Kun Chen《Your AGENTS.md is a Neural Net》补「Session 反传」：首轮蒸馏捞到 1 条漏沉淀（`logout-auto-relogin.md`）+ 1 条陈旧索引行；蒸馏器固化为 `scripts/backpass-distill.sh`（三存储含 DSH），共用能力经 `portable-harness.md` + lens077 根 symlink 分发。四要素见 evolution-log |
| AI 异构双审（Claude + Codex） | 🟡 | 2026-08-07 评估过 CI 方案(`.github/workflows/ai-review.yml` + 两家 App + secret),因单人流程过重**已取消**该文件。… |
| DevOps 体系设计（`docs/DEVOPS.md`） | ⬜ | 2026-08-07 新增设计文档 `docs/DEVOPS.md`：以 Three Ways/CALMS/DORA 为骨架、DevOps 边界对齐 DDD 限界上下文，含现状盘点（与本表对齐）与四个落地阶段——①可重复构建（CI 模板化、路径触发、buf breaking、镜像禁 latest+t… |
| 内环开发 Okteto（`docs/OKTETO.md`） | ✅ | 2026-08-11 落地并**端到端实测通过**。价值定位：不替代 `make dev`（本地 `go run` 更快），替掉的是「改代码 → buildx → 推 TCR → CI 回写 tag → ArgoCD 同步 → Pod 重启」那条分钟级链路，只在**问题成因是集群身份**（pre 配置、Secret 0400 可读性、uid 1000、Pod IP、集群 DNS）时用。… |
| **生产风险：系统 CA 被挂载遮蔽** | ⬜ | 2026-08-11 在 okteto 实测中发现。10 个服务的 Deployment 都把 `db-ca-cert` 挂到 `/etc/ssl/certs`，**这会替换整个目录**——容器内 `ls /etc/ssl/certs` 只剩 `pg_ca.crt`，发行版自带的 CA 包完全不可见。… |
| 测试体系（`docs/TESTING.md`） | ⬜ | 2026-08-11 新增操作手册 `docs/TESTING.md` + 判定规则 `context/team/go-testing.md`（两处不重复：前者「怎么做」，后者「该怎么选」）。… |
| 可观测性方法论与指标基线（`docs/observability/OBSERVABILITY.md`） | 🟡 | 2026-08-07 新增文档：三支柱分工（Metrics 发现 → Trace 定位 → Logs 看错误）、RED/USE 方法论、每个 Go 服务的最低指标配置（RED 四项、Goroutine/GC/Heap、pgx pool wait、Redis 命中率联动 DB QPS、Kafka La… |
| Redis 使用约定（`context/team/go-redis.md`） | ⬜ | 2026-08-07 新增团队级规范（go-redis v9.21.0）：①**客户端热重建下必须每次取 `Client()`**，不得把返回值存进结构体字段（`LiveRedis` 只暴露 `Client()` 就是为此）②`redis.Nil` 是未命中不是故障，缓存回填失败应记 warn 继续… |
| 定时任务约定（`context/team/cron-jobs.md`） | ⬜ | 2026-08-07 新增团队级规范。**本仓没有 `robfig/cron`，周期任务全是 `time.Ticker`**（Consul 心跳 ×11、product→gorse 增量同步、behavior flush/retry、网关健康检查与策略刷新），文档同时约束 Ticker 与将来引入的 cron。… |
| 文档体系整理（2026-08-07） | ✅ | 全仓 105 个 md 盘点后一次性整理：①**`Design.md` → `DESIGN.md`**——git 索引里是小写、工作区显示大写（macOS 大小写不敏感掩盖），Linux 上 24 处大写引用会 404；… |
| 前端 UI 设计系统「灯市」（2026-08-11） | 🟡 | Impeccable 流程落地：根 `PRODUCT.md`（产品真相）+ `DESIGN.md`（纸灯工坊视觉真相源，sidecar `.impeccable/design.json`）；… |
| 设计文档按微服务拆分（2026-08-08） | ✅ | **`DESIGN.md`（985 行单文件）拆分为 `docs/design/` 按微服务分目录**（入口 `docs/design/README.md`，根留 7 行重定向桩兜住旧引用/外部链接）：platform/{architecture,error-handling,performance… |
| 文档体系整理（2026-08-13） | ✅ | 四路并行调查（根文档/docs 顶层/gateway/backend+frontend）后一次性整理：①**Consul KV 退役未同步的过时描述清零**——AGENTS.md 硬规则4（凭据归属改 Config Center+Secret）、README 技术栈表/selector 三选项/co… |
| 根目录文档收纳（2026-08-08） | ✅ | 根目录文档只留 `README` / `AGENTS` / `STACK` / `TODO`（+ `.service-matrix.yaml` 与配置文件）：**`DESIGN.md` 桩删除**——拆分桩使命完成，删前全仓核实已无 link 型引用（仅剩「来源 DESIGN.md §xxx」类纯文… |
| 基础设施 TLS 与网关接入（2026-08-08 实测盘点） | 🟡 | 用 kubectl + curl/openssl 对 ecommerce/config-center 之外的**全部基础设施**逐项实测，清单落在 [`docs/design/platform/pre-environment.md`](docs/design/platform/pre-environ… |

| 静态检查基线棘轮 + 软门禁伤疤面板 | ✅ | 2026-08-08 参照《从 Vibe Coding 到 Harness》（腾讯 TAB）的「基线对比」与「软门禁留伤疤」两处设计落地。… |
| context/ 知识库结构门禁（`scripts/verify-context.sh`） | ✅ | 2026-08-18 参照 `~/lens077/deepseek-harness`（DeepSeek 开源 agent harness：TS monorepo + Cordis 插件架构，doc-sync 门禁族 30+ 脚本）做最小移植：六项检查（AGENTS.md+context/ 链接可达性… |
| harness 演进日志（`context/harness-framework/evolution-log.md`） | ✅ | 2026-08-08 补上「四块拼图」里唯一缺失的**进化**那块。`context/` 记规则是什么、`TODO.md` 记做了什么、`PROGRESS.md` 记完成度，三者都不记**「这条规则为什么是现在这个样子」**——规则能从代码读出来，理由不能，半年后会被人凭直觉改回去。… |
| 技术栈与系统边界核验（`STACK.md`） | ✅ | 2026-08-27 按 matrix、control-tower 与集群审计统一现状：B2B2C 终端边界、容量证据、BFF/网关能力、Pigsty/Dragonfly/Meilisearch、Cilium 安全边界、制品仓库、GitOps 与 Victoria 可观测性；明确「已运行 / 部分落地 / 已选型」 |
| 全库对齐 `docs/TECH.md`（2026-08-28） | ✅ | `docs/TECH.md` 定为技术架构/选型/基础设施最高真相源后，51 份文档一次性对齐：事件主干 Kafka、搜索回 Elasticsearch、链路 VictoriaTraces、对象存储 Silo、数据库外部 Pigsty、鉴权 Casdoor Session+OpenFGA（废 JWT/Casbin）、制品 TCR 主镜像+Harbor Helm+GHCR 可选、Fulfillment/Notification 独立成域、协同模式不做全局强制。原则：选型冲突覆盖、现状不谎报（存量标「迁移中」）、历史记录不改写（加「后续决策覆盖」注记）。`verify-context.sh` 全绿 |
| 技术评估深度调研（2026-08-28） | ✅ | 7 个并行代理一手来源调研，结论存 `docs/reports/2026-08-28-tech-research.md`：valtio→Zustand（已执行）、Next.js 局部迁（已转正）、mirrord/Okteto 内环（Cilium KPR 已知阻断，PoC 前不定主路径）、Kafka Streams/ksqlDB 不引入（维持 franz-go）、ES 回归容量门禁、零信任四件套暂缓、供应链分阶段管线（PR 三件套已全绿；Syft `1.5.2` 与 Cosign 3.1.3 GHCR keyless `1.5.3` 已远端验收；TCR 单服务探测已接线待 tag 实跑）、OpenCost/Pyroscope/Chaos Mesh/Temporal 触发条件、GlitchTip→维持 Bugsink（已改判） |
| 百万/千万级生产化目标 | 🟡 | 目标与完成定义已写入 `docs/design/platform/production-scale-goal.md`；当前优先交易正确性、安全边界、capacity profile、PITR/RTO/RPO 和成本证据。2026-08-28 按 `docs/TECH.md` 定稿：Kafka（外部非 K8s 集群）为目标事件主干、搜索存储回归 Elasticsearch；存量 NATS/Meilisearch 迁移期维护 |
| 节点优雅关机约定（`context/team/node-graceful-shutdown.md`） | ✅ | 2026-08-21 固化 `90s/30s` GracefulNodeShutdown；安装器新增 `KCM_TERMINATED_POD_GC_THRESHOLD=100`，已有控制面按次快照、原子更新运行清单并只定向修改 live ClusterConfiguration，中途失败双侧回滚。2026-08-23 已部署 node101：控制器 38 秒内恢复，三层配置均为 `100`，终态 Pod `112→100`；修正 VPA 终态历史误报后，全量 90 阶段及 PVC/LB/可观测链路冒烟全部通过。 |

### 2. 后端微服务（核心）

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| 用户 user | 🟡 | `SignIn`（存量兼容）、`UserProfile` | BFF 登录/session/刷新已迁 control-tower；本服务应收敛为用户 profile，清理存量 auth SDK/配置债 |
| 商品 product | 🟡 | `GetProductDetail`（SPU/SKU） | `ListProducts`、上下架、类目/品牌管理；事务内 outbox 生产者尚未接，`ProductChangedEvent` 不能稳定同步到 Meilisearch |
| 购物车 cart | 🟡 | `GetCart`、`AddProductToCart`、`RemoveCartItem`、`UpdateCartItemQuantity` + S3-compatible（当前 Silo）缩略图 URL（`GetCartSummary` 已于 2026-08 删除，见下） | **`RemoveCartItem`/`UpdateCartItemQuantity` 前端未接线**（删除/改数量只动本地 store，刷新就回来）；… |
| 订单 order | 🔴 | `CreateOrder`(**假成功桩**)、`CompleteOrder`(**不落库**) | ❗**`CreateOrder` 不是普通的桩，它返回假成功**：service 层把 `req` 整个注释掉、硬编码 `CartItemIDs: nil, AddressID: 0`（`inter… |
| 支付 payment | 🟡 | 5 个 RPC 均为**桩**（显式返回 `Unimplemented`），服务可启动/注册/健康检查，网关 `/payment*` 已通 | **repo 主体待恢复**：原实现依赖已移除的 balance/consumerOrder client（保留在 `data/payment.go` 注释块）；… |
| 库存 inventory | 🔴 | **无可用 RPC**（`Reserve`、`ReleaseReserve` 均已挂载但不可用） | ❗**`Reserve` 静默无操作**（`internal/data/inventory.go:52`，四处叠加：①传 `Version: stock.Version+1` 而 SQL 是 `AND version = @version`，WHERE 比对未来版本号→**永远命中 0 行**；… |
| 搜索 search | 🟡 | `Search`（Meilisearch + OTel） | 查询路径已迁；商品事务生产者、聚合筛选/智能排序、热门词、单节点容量与 HA 仍待补齐 |

### 3. 后端微服务（支撑）

| 服务 | 状态 | 已实现 | 主要缺口 |
|------|------|--------|----------|
| 地址 address | 🔴 | CRUD + `SetDefaultAddress` + `ListAddresses`（功能齐全，**但全线越权**） | ❗**安全 BLOCKER**：`Get/Update/Delete/SetDefault` 的 SQL 只按 `address_id` 过滤、无 user 归属校验，`Cr… |
| 商家 merchant | 🔴 | 仅 `Submit`/`Get` 可用；2026-08-13 两段式入驻（成为商家/开设店铺）设计定稿（`docs/design/merchant/onboarding.md`，配《商家入驻协议》v1.0 `docs/MERCHANT_AGREEMENT.md`），`GetMerchantAgree… |
| 履约（order 域） | ⬜ | 不单独建服务 | 发货、物流轨迹、第三方物流、售后履约并入 order；唯一触发门禁为 `OrderReadyForFulfillment` |
| 结算/营销/数据分析 | — | 不预设独立服务 | 真实需求成立后经 ADR 证明独立伸缩或故障域，再决定模块或服务边界 |
| 行为/推荐 behavior | 🟡 | `Track`、`Recommend`、`SimilarItems`（编译通过；… |

### 4. 网关与 RBAC

| 项目 | 状态 | 说明 |
|------|------|------|
| 2026-08-24 前端切 BFF 会话（P2，Web 端完成） | ✅ | 鉴权改为 **BFF + 服务端 session**（决策 control-tower `adr-0002`，手顺 `bff-migration.md`）：Web 端不再持有令牌，续期在服务端。改动与实测见 [归档](docs/progress-archive/2026-08-24-bff-session-migration.md)。**待办**：pre/prod 去掉 `SESSION_COOKIE_INSECURE` 并设 `Domain=.apikv.com` |
| 2026-08-24 桌面端切会话轨（P3，真机验证通过） | ✅ | Tauri 与 Web 跑在同一套服务端会话上；网关 `mode=native` 经回环回调交回 session id（**Rust 侧一行未改**）。实测：登录→`/auth/me`→业务 RPC 200→登出 204 且索引清理。真机逼出四个 Web 端发现不了的问题，见 [归档](docs/progress-archive/2026-08-24-bff-session-migration.md) |
| 2026-08-24 P4 清理与 merchant/admin 接入登录 | 🟡 | 删除 `pkce.ts`/`tokenStore.ts`/`session.ts`/`utils/casdoor.ts`/`utils/jwt.ts`/consumer `/callback` 与 `authInterceptor` 的 bearer 分支——浏览器侧令牌机制全部退场；顺带修好 `store/users.ts` 靠令牌订阅填资料的静默失效。新增 `packages/ui` 通用 `BffAuthProvider`，merchant/admin 各包一层即有登录能力。**待办**：网关 legacy bearer 轨与撤销名单**暂留**，最不可逆，建议烘烤数日确认无 JWT_* 错误后再拆 |
| control-tower 网关/config 合一与切流 | ✅ | gateway、config、config-web 均已切流；本仓旧 `gateway/` 已删除，config namespace 的旧名称不代表旧镜像仍在运行。backend 钉 `control-tower v0.1.0` SDK，structcheck 直接核对其 routes 包 |
| 网关（BFF/legacy JWT/Casbin/路由） | 🟡 | control-tower 已实现 BFF session、legacy bearer JWT、身份头剥离、Casbin RPC 授权、超时、Consul Watch + P2C 与 Connect 直通；默认无重试。待办：移除 legacy 轨、补数据级授权、默认拒绝 NetworkPolicy 与 workload identity |
| 网关服务发现恢复 | ✅ | Consul watcher 改为后台初始化，`Next()` 失效后按阶梯退避重建；… |
| 「刷新几次才出数据」的真实根因 | ✅ | 上一条修好了 watcher，但**首屏仍要刷几次** —— 因为真凶不在网关而在服务注册侧：Consul TTL check 注册后的初始状态是 **critical**，而 `TtlCheckPinger` 进 `for` 循环前**先等一个完整的 `ping_interval`（KV 里是 25s）**才发第一次 `UpdateTTL(pass)`；… |
| 成功调用被记成 `rpc.code: "unknown"` | ✅ | 11 个服务的 `internal/server/logging.go` 都在 `err != nil` 分支之前就算好了 `fields`，而 connect 的 Code 常量从 1 开始、**没有 `CodeOK`**，`connect.CodeOf(nil)` 返回的是 `CodeUnkno… |
| 前端购物车重复请求 | ✅ | `useCartBadge`（走 `GetCartSummary`）与 `useCart`（裸 `useEffect` + `isMounted`，只挡了 `setState` 没挡请求，StrictMode 下双发）各拉各的，购物车页一次挂载打 4 个 POST。… |
| RBAC 三角色（消费者/商家/管理员） | 🟡 | 策略模型（model.conf/policies.csv）已有；order/payment/merchant/inventory 已按 **RPC 粒度**授权（避免整段 `/svc.v1.*` 放行导致的越权），其余服务仍是整段放行待细化 |
| Casdoor 集成 | 🟡 | gateway 机密客户端 code exchange、BFF session 与登录时角色读取已打通；第三方登录、账号治理和 OpenFGA 对象权限仍待端到端验收 |

### 5. 配置中心（Config Center）

> 设计文档见 `../control-tower/docs/design/architecture.md`。以 Postgres 为数据源、键值粒度、Casdoor 鉴权、玻璃态前端。

| 项目 | 状态 | 说明 |
|------|------|------|
| 设计文档 | ✅ | `../control-tower/docs/design/architecture.md`：架构/数据模型/RPC/鉴权/校验/玻璃态/路线图 |
| 后端 config 服务 | ✅ | 已迁入 `github.com/lens077/control-tower/services/config` 并切流：保留原 Postgres schema，服务自身改由本地 `CONFIG_FILE` 自举，Consul 仅服务发现；… |
| 网关接入 config | ✅ | control-tower gateway 与 config 同仓但独立部署；管理 API 仍经 gateway + Casbin，路由与策略从 Config Center Watch |
| Gateway Config Center 单源迁移（2026-08-13） | ✅ | **control-tower 已切流，运行时迁移完成**：参考 Cart 的 `CONFIG_SOURCE_FILE` + `configsource` SDK 模式，正常启动只接受 `type: config_center`，`CONFIG_SOURCE=file` 仅供显式本地测试，无 Consul KV 回退；… |
| 网关/前端错误层统一 | ✅ | 网关侧新增 `../control-tower/internal/gwerrors`:404/405/无可用节点/超时等**非业务错误也按 Connect 规范**回 `{code,message,details[]}` + `X-Error-Reason` 头 + `Access-C… |
| legacy JWT 时钟容差 | ✅ | control-tower bearer 兼容轨保留 60s leeway；BFF session 主路径不再让浏览器解析或刷新 JWT |
| Consul 配置 KV 退役 | ✅ | Bootstrap 已全部迁 Config Center，Consul 只做注册发现，不存在 KV 回退 |
| ListNamespaces RPC | ✅ | 新增 `ListNamespaces` 返回 `NamespaceInfo{namespace, environments, key_count}`,SQL 按 `(namespace, environment)` 分组走 `idx_entry_ns_env`;前端命名空间/环境改为 Autocom… |
| 十服务 Config Center 单源迁移（2026-08-08） | 🟡 | **仓库侧已完成，pre 直发验收已通过，GitOps 尚未闭环**：10 份 `source_sdk.go` 限制 selector 只能是 `config_center`；… |
| 配置加载单测 + 竞态修复 | ✅ | 删除 payment/inventory/address/merchant 4 个引用已删 API(`updateConfig`/`ValidateConfig`/`Server_HTTP.Addr`)的 stale 测试；… |
| 前端配置控制台 | 🟡 | 已迁至 `control-tower/web`：保持 Monaco/玻璃态 CRUD、历史与回滚能力，改为浏览器专用（取消 Tauri 桌面端）并从 `public/config.json` 读取网关与公开 Casdoor 配置。待独立 pnpm 构建与浏览器 CRUD 验证 |
| 配置编辑器增强 | ✅ | 新增 `lib/validate.ts` 统一校验/格式化层:JSON 走 `jsonc-parser`(V8 的 `JSON.parse` 报错常常**不带位置**,拿不到准确行号)、YAML 走 `yaml` 的 `parseDocument`(`toString` 保注释与 anchor)、T… |
| 旧仓 config 前端/桌面入口 | ✅ | 删除 `frontend/apps/config`、`dev:config`/`desktop:config`/`build:config` 及对应 Tauri profile；新控制台由独立仓发布 |
| 下发/Watch 热更新 | ✅ | **不经 Consul 桥接**，配置中心自成一路：`PutKey`/`DeleteKey`/`Rollback` **在写入事务内** `pg_notify('config_changed', 定位信息)`（回滚不会误发；… |
| 不热生效的三段（有意为之） | ✅ | `server`(重新绑端口会切断 in-flight 连接)、`discovery`(需摘节点重注册，滚动重启更可控)、`observability`(重建 tracer provider 会丢未导出的 span)——变更时打 WARN「该配置段已变更，但需要重启服务才会生效」，绝不让人以为改了就生效 |
| 历史页面重做 + 密钥历史脱敏 | ✅ | **页面铺平**：删掉「卡片套卡片」的嵌套外壳，改成一块面板内左右分栏；去掉 `maxWidth:1200` 铺满宽度，diff 从固定 `58vh` 改为 `flex:1` 吃满剩余高度；… |
| 其余 9 个服务全量迁移 | ✅ | address/behavior/inventory/merchant/order/payment/product/search/user 保持 cart 的 `Source`+`Live` 热更新链（`Live`、`PgPool`/`LiveRedis`、`zap.AtomicLevel`），并补齐 cart 已有的本地 file source、统一 SDK 文件命名。… |
| 三份配置对齐 + 灌入配置中心 | ✅ | 以 cart 为标准重排 10 个服务 × dev/pre 共 20 份配置（段序统一 `server → data → 服务专属段 → observability → discovery → search → log → auth`），逐份用各服务**真实的 `Bootstrap` 类型 + 与 `decodeConfig` 完全相同的解码链路**校验。… |
| 凭据不再入库 | ✅ | `configs/.gitignore` 里 **`per.yml` 是 `pre.yml` 的笔误**（`4a3eb70b` 引入），加上 address/behavior/merchant/payment 四个服务压根没有这个文件，结果 **11 份含明文凭据的配置文件（PG/Redis/ES… |
| 配置中心 Go 客户端 SDK | ✅ | control-tower 已提供 `sdk/configsource`、生成契约与 `SourceConfig{file, consul, config_center}`；… |
| 审批/灰度/密钥加密/审计 | ⬜ | 后续阶段 |

### 6. 推荐链路（gorse）

> 目标：用户漫无目的地逛也能沉淀信号，喂给云上的 gorse，换回个性化/相似/兜底三路召回。

| 项目 | 状态 | 说明 |
|------|------|------|
| gorse 部署排障 | ✅ | `failed to init meta database: unable to open database file: out of memory (14)` 的真凶是 **SQLITE_CANTOPEN(14) 被 gorse 错标成 "out of memory"**：v0.5 的 `--cache-path` 是**目录**不是文件（沿用了 0.4 时代的文件名且没挂 volume）。… |
| `behavior.proto` + behavior 服务 | ✅ | `backend/api/behavior/v1/behavior.proto`：`Track`（批量埋点）/`Recommend`（个性化+会话+兜底三级降级）/`SimilarItems`。… |
| POST vs PUT 语义 | ✅ | gorse 反馈的唯一键是 `(FeedbackType, UserId, ItemId)` 三元组，**POST 累加 `Value`、PUT 覆盖**。… |
| `dislike` 的落法 | ✅ | 当前 gorse 版本的 `config.toml` **没有 `negative_feedback_types`**，负反馈无处安放。… |
| 网关路由 | ✅ | `/behavior* → discovery:///behavior-service`；… |
| `frontend/packages/tracker` | ✅ | 曝光（IntersectionObserver，露出 ≥50% 且连续 ≥1s 才算，会话内去重）/ read / dwell（只计页面可见时间，心跳上报累计值配合 PUT 覆盖）/ cart / favorite / purchase / dislike。… |
| product → gorse item 同步 | ✅ | gorse 只认 item，**反馈引用的 ItemId 不存在会被直接丢弃**，所以目录同步是推荐链路的前置条件而非锦上添花。… |
| 已实测 | ✅ | ① gorse 的 **POST 累加 / PUT 覆盖**在线上验证：两次 POST `read` → Value=2，两次 PUT `dwell`(30→45) → Value=45，与设计一致。… |
| Config Center 配置 | 🟡 | 历史 KV 的缺段问题已在 Config Center 初次灌入时修复，Consul KV 已退役。… |
| 待验证 | ⬜ | Config Center pre 配置部署后端到端实跑 Track/Recommend/SimilarItems；… |

### 7. 前端

**consumer-next（公开可收录页，Next.js App Router）**

| 项目 | 状态 | 说明 |
|------|------|------|
| 公开页局部迁移 Next.js | ✅ | 2026-08-28 POC 判 go 并转正上线 dev：`frontend/apps/consumer-next`（16.3.3，App Router，standalone/arm64），匿名 server transport + `revalidate=60` ISR + 客户端个性化层；2 副本分节点 + PDB + `/healthz` 探针；HTTPRoute 在 `shop.dev.test`/`shop.apikv.com` 按 `/zh` `/en` `/_next` 分流，SPA 保持 `/` catch-all。内网与公网端到端均实测 200 + 真实数据。**架构规则**：公开 ISR 页服务端取数必须匿名，per-request Cookie transport 只用于显式 dynamic 路由。安全基线：独立 `ecommerce-consumer-next` SA、token off、read-only root + ISR `emptyDir`、只到 gateway 的 egress CNP；两副本均验证 MISS→HIT，无 EROFS/ENOENT。证据：`docs/reports/2026-08-28-nextjs-poc.md`、`docs/reports/2026-08-28-zero-trust-runtime-security.md` |
| 扩页（分类/首页） | ⬜ | **受阻**：后端 `ListProducts` RPC 未实现，无列表数据源；待该 RPC 落地后按报告实施序扩页 |
| 登录态 dynamic 路由联调 | ⬜ | 匿名链路已实测；带认证 Cookie 的 dynamic 路由需真实 Casdoor 会话，待人工联调 |
| 多 Pod 缓存一致性 | 🟡 | 已量化：各 Pod 独立 ISR 缓存，当前用短 TTL（60s）压窗口；需严格一致时升级共享 `cacheHandler`（未实测） |

**consumer（消费者端）**

| 页面 | 状态 | 说明 |
|------|------|------|
| 首页 `index` | 🟡 | 已去除 `→/categories` 重定向，改为商品网格首页（卡片+空态）；待接 `ListProducts` 无限滚动（设计见 `docs/design/product/listing.md`） |
| 分类 `categories` | 🟡 | 静态，未接类目 API |
| 商品详情 `product/$spuCode` | ✅ | 已接 `GetProductDetail`（SPU/SKU） |
| 购物车 `cart` | ✅ | 已接购物车 API；本次修复间距 8× 问题并重构紧凑布局 |
| 结算 `checkout` | 🟡 | 已重写：接选中项(useCart 真实 `cart_item_id`)、地址弹层选择+新增(AddressService)、防重 `requestId`、下单调用(`api/order`)；… |
| 订单列表/详情 `orders` | 🟡 | mock 数据，未接订单查询 API |
| 支付结果 `payment/result` | 🟡 | 未接支付状态查询 |
| 个人中心 `profile` | ✅ | 已接真实 API |
| 收货地址 `profile/addresses` | ✅ | 已接 AddressService |
| 登录回调 `callback` | ✅ | Casdoor 登录回调打通 |

**merchant（商家端）** — ⬜ 仅路由骨架（`index/orders/products/reports/settings`），无 `api/` 目录、未接后端

**admin（管理员端）** — ⬜ 仅路由骨架（`index/users/merchants/products/orders/categories/reports/settings`），无 `api/` 目录、未接后端

### 8. 可观测性与测试

| 项目 | 状态 | 说明 |
|------|------|------|
| 链路追踪（OpenTelemetry，链路存储现为 VictoriaTraces） | 🟡 | 后端 10 个服务、Gateway 的 OTel 核心 Trace/Metrics 已统一至 `v1.45.0`；… |
| OTel SDK 装配基线（11 份收敛为一份） | ✅ | `internal/pkg/otel/otel.go` 原本是 11 份同构副本（语义完全一致，只差函数摆放顺序与注释），同样的问题各带一遍。… |
| semconv 必须与 sdk 内部版本对齐 | ✅ | `newResource` 用 `resource.Merge(resource.Default(), ...)` 才能拿到 SDK 自己填的 `telemetry.sdk.*`，但 Merge 在两边 schema URL 不一致时返回 `ErrSchemaURLConflict`，而该文件把 `… |
| pgx span 名（DB 可观测性） | ✅ | otelpgx 默认把**整段带换行的 SQL** 塞进 span name，而 span name 在后端是个索引维度，SQL 文本进去会撑爆基数、Jaeger 的 operation 下拉框也没法用。… |
| 前端性能监控（Web Vitals RUM） | ✅ | 新增 `frontend/packages/perf` + `backend/api/telemetry/v1` + behavior 进程顺带实现 `TelemetryService`。… |
| 日志平面自我放大（已断开，但稳态收益远低于预估） | ✅ | 排查「Loki 吃性能」的结论是**前提不成立**:`kubectl top` 下 loki-0 只有 186Mi/13m,全集群内存排第 13、CPU 第 8;真正的大户是 elasticsearch 1679Mi(Jaeger 后端)、cilium ×3 各约 1Gi、apiserver 1035Mi、kibana 929Mi。… |
| fluent-bit 镜像未钉在 values（已修，且我触发过一次） | ✅ | fluent-bit 的 DaemonSet 镜像是**安装后手工 `kubectl patch`** 打成 `docker.io/fluent/fluent-bit:5.0.7-arm64` 的,从未写进 `otel-fluent-bit-values.yml`。… |
| 日志（Loki/fluent-bit） | 🟡 | 已部署并在收:collector `logs` 管道 → Loki,fluent-bit 另采容器日志(`job=kube-logs`)。… |
| 指标（VictoriaMetrics/Grafana） | 🟡 | 已部署并在收:collector `metrics` 管道 → VM(2026-08 实测 5 族 57 个指标名:`system_*`/`rpc_server_*`/`pgxpool_*`/`db_client_operation_*`/`process_*`)。… |
| Grafana 看板 | 🟡 | `docs/observability/grafana/`:`common.py`(数据源/面板构造器/共用 PromQL) + `build_business_overview.py` + `build_infrastructure.py`,JSON 是产物（**改看板改脚本，不要直接编辑 JSON 或只在 UI 里改**）。… |
| 面板体系重构(三盘 + 全面型告警,对标 ARMS 裁剪为 Go 版) | 🟡 | 2026-08-12,起点是把阿里云 ARMS 应用监控文档摘抄进 `docs/observability/面板设计.md` 做对标,经 grilling 会话敲定后**原地重写**为本仓设计真相源(术语口径/三盘 row 级设计/优先级/ARMS 裁剪对照表 15 条/告警清单)。… |
| GMV 与客单价口径 | ✅ | 业务大盘的订单数、GMV(应付)、客单价、日订单趋势和日 GMV 已从按商家拆分的 `orders.order_main` 改为按用户一次结算的 `orders.order_group`。`order_main` 仍只用于商家子订单状态与支付完成率；金额卡固定两位小数，避免 Grafana 自动精度隐藏角分 |
| service_name 撞名（config-service） | ✅ | 旧 `backend/services/config` 及重复 Config API 已随 `config-center v0.1.0` 退役。… |
| 前端测试（playwright + vitest） | 🟡 | consumer 首个用例落地：`hooks/useCart.test.tsx` 用 `createRouterTransport` 桩 GetCart，锁住「后端数据 → store」这条同步路径在重渲染与 StrictMode 下都只跑一次（effect 写 store → 订阅回调 setState → 再渲染，本身是个反馈环，查询结果引用一不稳就闭合成死循环）。… |
| 后端单元/集成测试 | 🟡 | `internal/pkg/config` **10 个服务全覆盖**(cart + address/payment/inventory/merchant/product/order/search/user/behavior，覆盖率 76%~85%，`-race` 全绿)：用 `httptest`… |
| cart log/registry 单测重写 | ✅ | 两个 stale 测试跟着实现改签名后一直编译不过。`log`:改打 `*confv1.Bootstrap`，并把断言从 `Core().Enabled`(被 otel core Tee 后不可信)换成**接管 `os.Stdout` 断言真实输出** —— 级别过滤/JSON 可解析/console 非 JSON/caller 行号；… |
| 构建与部署清单对齐 | ✅ | **Makefile**：①`--build-arg GOIMAGE` 一直是空传 —— Dockerfile 声明的是 `ARG GO_IMAGE`（下划线），改名后 merchant 那份落后的 `golang:1.25.8` 才真正生效，同步升到 1.26.1（`go.mod` 要求 1.26.1，不升会直接编译失败）；… |
| inventory 注册链路对齐 | ✅ | inventory 是 10 个服务里唯一没跟上 registry 重构的:①`Register()` 用 `SplitHostPort(r.Addr)` 拿的是 **Consul 自己的地址**,把 Consul 登记成了 inventory 的端点,网关按它路由会打回 Consul —— 改为与… |
| Consul 注册路径空指针修复 | ✅ | **10 个服务**的 `registry/consul.go` 同一类"判空写在解引用之后"的错,三处一并修掉:①`consulCfg.Tls.Enable && consulCfg.Tls != nil` —— 配置没写 `tls` 段(本地/内网集群的常态)直接 panic；… |
| payment 上线 + 网关补齐 4 条路由 | ✅ | payment 是 10 个服务里唯一起不来的:①`data.Module` 里 `NewPaymentRepo` 整个被注释掉,`fx.Provide` 却还引用着它,**编译就过不去**,所以它既不在 `SERVICES` 也不在 `compose.yaml` 里 —— 原实现依赖已被移除的 b… |

---

## 二、订单分布式一致性方案（已定）

> 方案本体已移至 **[`docs/design/order/consistency.md`](docs/design/order/consistency.md)**
> （Outbox + TCC-Try + 编舞 Saga 三段式；设计不住进度文件）。下面只留治理项的落地追踪。

编舞 Saga 的四项治理（必须随事件驱动一起落，否则流程失控）：

- [ ] **幂等消费**：consumer 以 `order_no`/事件 ID 去重（消息至少投递一次语义）
- [ ] **显式补偿事件**：`StockReserveFailed → 订单自动取消` 等补偿作为一等公民设计，不散落
- [ ] **状态即真相**：`order_status` 作为"这单走到哪"的唯一可见状态，弥补编舞流程不可见
- [ ] **超时兜底 job**：扫 `pay_deadline` / 卡在中间态的订单做补偿或告警（编舞无中心，必须有 backstop）
- [ ] **全链路 trace_id**：事件贯穿 `trace_id`（Kafka Header 传 W3C `traceparent`），靠 OTel/VictoriaTraces 追踪定位

---

## 三、近期待办（按优先级）

先打通「消费者核心交易闭环」，再向商家/管理端与非核心能力扩展。

### 宪法矛盾修复（2026-08-26，对照 mall 宪法 25 项裁决，详单 `.scratch/constitution-fixes/plan.md`）

P0 文档收敛当日全部完成（消息底座/搜索/缓存/事件表/库存公式/%w/认证位置一说化，performance.md 删、payment 作废横幅、死链清零）。余下代码/基础设施债：

- [ ] [P1] cart 条目契约迁回 cart_item_id（08-26 裁决，checkout v2 依赖）
- [ ] [P1] 清理 5 服务 auth 配置块；东西向服务身份（mTLS/token）
- [ ] [P2] 跨 schema FK→ID+快照；merchant_id/金额类型收敛（ADR）；listing Money 豁免 ADR；性能目标绑压测重立

### P0 · 鉴权改造的收尾（2026-08-19，代码已完成，剩下的都在 Casdoor 控制台/基础设施侧）

已完成 9 项（Casdoor 会话与 `redirectUris`、newt 重装、Pangolin 资源、网关部署与端到端验证（含集群存量四问题）、前端部署、真浏览器登录 5 问题、`localStorage.user` 移除、登录冒烟 CI）与已关闭的「`frontend.yml` 构建/发布段死引用」（2026-08-24 已删死 job，现仅剩 smoke-login）→ [归档](docs/progress-archive/2026-08-28-todo-trim.md)。

- [ ] **网关部署补 `redis-tls-ca` Secret**（2026-08-28 注：旧 `gateway/deploy` 已随目录删除，落点改在 control-tower 网关清单上复核）：部署已挂载但标了
      `optional: true`（缺了只退化成仅进程内缓存，不会让网关起不来）。
      `kubectl -n redis get secret redis-tls -o jsonpath='{.data.ca\.crt}' | base64 -d` 后
      在网关所在命名空间建同名 Secret。
- [ ] **Casdoor 密码策略只有 `AtLeast6`**，且无 IP 限制；正式上线前收紧。
- [ ] **`/api/get-application` 匿名可读**（返回值已脱敏，`clientSecret`/`tokenFormat` 为 `***`），
      仍会泄露应用存在性与部分配置形态。评估是否在 Pangolin 侧限制。

### P0 · 假成功与越权（2026-08-06 对抗评审发现，优先于一切新功能）

> 这批的共同点是**调用会「成功」但结果是错的**，或**任何登录用户都能越权**。
> 比「未实现」更危险：不会在联调时暴露，只在上量后以超卖、丢单、数据泄露的形式爆发。
> 双模型独立评审 + 逐条代码核实，全文见 `docs/reviews/ADVERSARIAL_REVIEW_20260806.md`。
> `payment` 显式返回 `Unimplemented` 的做法是本仓的正确示范，下面几处应向它看齐。

- [ ] **库存 `Reserve` 静默无操作**（`inventory/internal/data/inventory.go:52`）：传当前 version 而非 `+1`、
      检查 execrows 为 0 时返回冲突错误、修正扣减量语义、错误分支传对变量、整段包进 `ExecTx`
- [ ] **库存 `ReleaseReserve` 是 panic 桩**（同文件 :88）：实现或至少改成显式 `Unimplemented`
- [ ] **`CreateOrder` 返回假成功**（`order/internal/service/order.go:31`、`application/order.go:61`）：
      **立即改成显式 `CodeUnimplemented` 止血**——结算页已接线，当前用户会看到「下单成功」但无订单
- [ ] **`CompleteOrder` 不落库**（`order/internal/data/order.go:83`）：实现 `SaveOrder`；
      持久化成功前不得发布 `OrderCompleted`
- [ ] **地址服务全线越权**（`address/internal/service/address.go:26,71,84,95`）：user 取自网关身份头、
      所有查询加 `AND user_id = ?`、网关策略从 `AddressService/*` 整段放行收敛到 RPC 粒度
- [ ] **商家审批全表 UPDATE**（`merchant/internal/data/queries/merchant.sql:23`）：补
      `WHERE application_id = @application_id`，repo 层把 `ApplicationId` 传下去
- [ ] **登录 token 落日志**（`user/internal/data/user.go:39`）：删掉 `u.l.Debug(token.AccessToken)`
- [ ] **`AddProductToCart` 必然失败**（`cart/internal/data/queries/cart.sql:3` vs `schema/cart.sql:17`）：
      INSERT 补 `shop_name`（proto/biz/data 一路补字段）或给 schema 默认值——需先定契约
- [ ] **商家 `RejectApplication`/`ActivateMerchant` 是 panic 桩**（`merchant_service.go:57,98`）
- [ ] **给上述路径补测试**：本轮 22 条发现全部位于零覆盖路径上，`go test ./...` 却是全绿的——
      不补测试，修完还会重演

### 其余近期待办

> 2026-08-28 精简：本节已完成项（规则与环境重对齐、node3 迁移、OTLP 入口鉴权、四服务隧道暴露、效率日报、PGO、go-redis、conf-schema、protovalidate 接线、bootstrap 审计、DB 迁移工具、结算页前端、cart_item_id、zustand 迁移、观测已修项等）→ [归档](docs/progress-archive/2026-08-28-todo-trim.md)。

- [ ] **集群外依赖已成硬依赖**：node3 或 Pangolin 隧道故障 = 数据面连不上库 + 观测全断。CNPG 是 hibernate 不是删除，回滚路径还在（改回 `pg-main-rw.postgresql.svc:5432` 并取消 hibernation 注解）
- [ ] **GitOps 断线待修**：ArgoCD 在跑但零 Application/ApplicationSet。`helm/` 与集群实况在**资源名、标签方案、镜像 tag** 三处都不符（chart 渲染 `user`/`app.kubernetes.io/name`/`1.4.0`，集群是 `ecommerce-user-deploy`/`app: ecommerce-user`/`:dev`），且 chart 里缺 `control-tower-gateway`/`outbox-relay`/`search-indexer` 三个在跑的工作负载。**直接 apply `argocd-app.yml` 会起一整套影子服务，并因 chart 里 `CONSUL_ENABLED=true` 经 Consul 抢走网关流量**——已把 `automated` 注释掉并在文件顶部写了告警。修复顺序：改 chart 描述真实拓扑 → `helm template` 与集群 diff 为空 → 再放开 selfHeal

- [ ] **集群重装在即（2026-08-21 登记）**：组件数据不保留（拍板），脚本与配置全部以 git 为源自动重建。恢复链均已实测：①`~/lens077/kubernetes` bootstrap 装集群（`/etc/containerd/certs.d`、kubelet 配置等节点自定义项已入库脚本化；动手前逐条过其 `bootstrap/config.env` 尾部「重建须知」，creds 目录——尤其 `dragonfly-password`——先带走）②组件按 config.env 开关重装，external-secrets 注入 AppRole 后密钥自 VPS Vault 流回 ③`ADDON_CNPG` 勾选即自动建 pg-main+`ecommerce` 库 ④建表走 `make migrate-cnpg-up`（12 迁移实测全过）⑤config-center `scripts/deploy-k8s.sh` + bootstrap SQL 直灌 ⑥ArgoCD 按上表「2026-08-19 集群重建后 GitOps 重新接线」行的 runbook 接回（config source Secret/tcr-pull-secret/pg-ca-cert）
- [ ] **全量 `make generate`/`make conf` 是坏的（2026-08-18 发现，先于本轮存在）**：order/payment/address/cart/merchant 五个服务目录下各有一份 `services/<svc>/third_party/validate/validate.proto` 复制品，与 `backend/third_party/validate/validate.proto` 的扩展号 1159/1160 冲突，buf 全量 build 直接失败（`field number used more than once`）；带 `--path` 的按服务生成不受影响（conf-schema 就是这么绕的）。修法：删掉五份复制品（先确认没有 proto 以相对路径 import 它们）
- [ ] **文档整理遗留（2026-08-07 盘点，2026-08-28 复核裁剪）**：①`docs/SCAFFOLD.md` §四内嵌的 AGENTS.md 模板还是旧版「项目速览」结构，与真身已分叉，需同步 ②`frontend/apps/{admin,merchant}` 缺 README（与 consumer/desktop 不对称）③`.scratch/architecture-hardening/` 只有 spec.md 没按 `docs/agents/issue-tracker.md` 拆 issues/。〔原 backend.yml/frontend.yml 与旧 `gateway/` 各子项已随 2026-08-07 CI 重写、2026-08-24 删除动作解决〕
- [ ] **订单服务**：补 `GetOrder` / `ListOrders` / `CancelOrder` RPC 与订单状态机（带守卫的状态迁移 + `order_log`）
- [ ] **集群 CNPG 首次 `make migrate-baseline`（等发布窗口）**：goose v3 迁移工具、10 服务 migrations/seeds 与本地 postgres:18 全量验收已于 2026-08-21 完成（全文 → [归档](docs/progress-archive/2026-08-28-todo-trim.md)；规范 `context/team/db-migrations.md`，手册 `backend/tools/dbmigrate/README.md`）；只剩集群侧 port-forward 后 `make migrate-baseline` 接管存量库
- [ ] **一致性底座**：PostgreSQL outbox 是领域事件的唯一发布意图，consumer 用 Inbox 幂等。当前 relay → NATS JetStream 与 search indexer 已完成回灌/积压重放验证；下一步补 Product/Order 事务内生产者、NACK/DLQ、重放审计、积压 SLO 与 R3 恢复证据，不在业务 transaction 内双写其他 broker
- [ ] **建单全链路**：cart 补"按 CartItemIds 取选中项"RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车
- [ ] **consumer 结算页（待后端联通）**：后端补 `CreateOrderRequest.requestId`、`CreateOrderResponse.orderNo` 并 `make api` 后，提交订单接真实响应、跳真实支付页（现为固定 `/payment/result` 占位）
- [ ] **下单防重的 `requestId` 一直是假的（迁 connect-query 时查实）**：旧代码 `client.createOrder(message as Parameters<...>[0])` 在假装 proto 有这个字段，而 `CreateOrderRequest` 只有 `cartItemIds`/`addressId`/`remark` 三个，那个 UUID 运行时直接被丢掉 —— 也就是说**防重从来没生效过**。迁移时删掉了那个 cast 和对应的 `useState`，把「假装成立」改成了明面上不成立，结算页留了 TODO。要真生效得先补 proto 字段再 `make api`，与上一条一起做
- [ ] **cart 的删除/改数量前端未接线**：后端 `RemoveCartItem`/`UpdateCartItemQuantity` 均已实现（原「`UpdateCartItemQuantityParams` 缺 Quantity 字段」已补齐，2026-08-28 复核生成代码含 `Quantity *int32`）；前端 `useCart` 的 `removeItem`/`updateQuantity` 只动本地 store 不发请求 —— **用户删掉商品后刷新页面它会回来**（`GetCart` 拉的还是旧数据，同步 effect 会 clear 再灌回去），即删除与改数量这两个功能对用户实际不存在。修法：两个 hook 各接 `useMutation` + `invalidateQueries`，模式与现有 `addProductToCart` 同构
- [ ] **consumer 订单页**：订单列表/详情接真实查询 API，替换 mock
- [ ] **支付闭环**：`payment/result` 接支付状态查询 + 回调后订单状态同步（订单订阅 `OrderPaid`）
- [ ] **库存联动**：下单同步 `Reserve`（TCC-Try），支付成功确认扣减，取消/超时 `ReleaseReserve`
- [ ] **商品服务 ListProducts（设计已定，见 `docs/design/product/listing.md`）**：首页无限滚动 + 游标(keyset)分页，无总数；`ProductCard` 含 brand/价格区间(min~max)。落地：`product.proto`→`make api`→`query.sql`→`make sqlc`→biz/data/service 样板→前端 `useInfiniteQuery` 接首页
- [ ] **推荐链路收尾**：~~建表~~ / ~~修 gorse 部署~~ / ~~product item 同步实测~~ 已完成；product/behavior dev `bootstrap.yaml` 已有 `recommend`（均为 version 3），只差 Casdoor 管理员登录后把 product endpoint 改为 `https://gorse.apikv.com`、为两者写入 node2 当前 Gorse key，再重启并端到端验证 Track/Recommend/SimilarItems。machine token 只有 Get/Watch，不得绕过 Config Center 直写数据库。当前 product 对退役 endpoint 的重试由 `EcommerceNetworkPolicyDeniedBurst` 如实告警。
- [ ] **安全 · 轮换 Config Center 预览中暴露的搜索凭据**：2026-08-28 一次跨行正则预览越过目标段，既有凭据进入会话工具日志；临时文件已删、仓库未落值，但日志不可撤回，应按已暴露处理。管理窗口内同步轮换 Elasticsearch 与 Config Center，滚动受影响消费者并验收旧凭据失效；固定手顺见 `context/project/ecommerce/config/experience/config-preview-allowlist.md`。
- [ ] **consumer 接入 tracker**：`tsconfig.json` 加 `@ecommerce/tracker` paths、`package.json` 加 `workspace:*` 依赖、入口 `initTracker({gatewayUrl})`、商品卡挂 `useImpression`、详情页挂 `useProductView`、加购/收藏/支付成功处补 `tracker().cart/favorite/purchase`
- [ ] **领域事件**：目标主干按 `docs/TECH.md` 为 Outbox → Kafka（存量 outbox→NATS 链迁移期维护）；落地 `OrderCreated/OrderPaid/OrderCancelled/OrderReadyForFulfillment`——按 TECH.md §3 混合协同：Order 内 Saga 编排器驱动强一致主流程，事件编舞驱动副作用；Protobuf envelope（event_id/aggregate_id/tenant_id/trace_id/schema_version/occurred_at）
- [ ] **事件 E0 容量与拓扑**：为每个 Kafka topic 声明 owner、partition（key=`aggregate_id`）、replication、retention、最长积压和恢复 SLO；用真实 payload 压测吞吐、磁盘和成本（存量 NATS stream 迁移期同口径）
- [ ] **事件 E1 producer 正确性**：Product/Order 业务写与 outbox 同 transaction；relay 只在 broker ack（Kafka `acks=all`）后标记 published，补 ack 后崩溃、落库前崩溃和积压恢复测试
- [ ] **事件 E2 consumer 治理**：consumer Inbox 幂等（`(consumer_group,event_id)` 唯一键）、retry/backoff、max deliver、DLQ（连续失败超 5 次转投并告警）、poison message 分类、重放权限和审计；业务副作用不得依赖 broker exactly-once
- [ ] **事件 E3 搜索恢复**：固定真实商品数据集，验证 projection count/checksum/query diff、全量 rebuild、checkpoint、积压恢复和索引 swap（目标 Elasticsearch；存量 Meilisearch 迁移期同口径）
- [ ] **事件 E4 交易事件演练**：Order/Inventory/Payment 完成重复投递、乱序、超时、依赖断连、积压和人工重放；没有 Inbox 与补偿证据前禁止产生支付/库存副作用
- [ ] **分析 CDC 证据门禁**：出现真实 ClickHouse/报表需求后独立评估逻辑复制/CDC；数据库行变更与领域事件保持两套语义
- [ ] **Kafka 迁移推进**（2026-08-28 按 `docs/TECH.md` 改判，原「NATS 不满足才评估 Kafka」门禁作废）：Kafka 为定稿事件主干，部署于非 K8s 独立集群；先迁可重建的搜索投影链，验收后迁交易事件，NATS 随之退役；路线见 `docs/design/platform/production-scale-goal.md`
- [ ] **订单缺陷修复**：金额改 `decimal`（现为 `float64`）、修 `AddressPostalCode` 空指针、统一 `merchant_id` 类型（UUID）、`Complete()` 应要求已发货
- [ ] **merchant 端**：新增 `api/` 客户端，接商家入驻/商品/订单
- [ ] **admin 端**：新增 `api/` 客户端，接商家审核/用户/类目管理
- [ ] **RBAC**：补齐三角色细粒度权限校验与网关策略（按 `docs/TECH.md` §8：粗粒度角色归 Casdoor，对象级授权以 OpenFGA 关系模型实现，存量 Casbin 迁移期维持）
- [ ] **测试**：补 consumer 关键路径 playwright/vitest 用例、后端核心 biz 单测
- [ ] **日志限流（方案已定稿，待拍板实现）**：防"基础设施故障 → 周期性错误日志"风暴（真实暴露面：PG 挂时 behavior `flush()` 每 2s 一条 ERROR、Consul 断连时 11 个服务的 `TtlCheckPinger` 各每 10s 一条，且都经 otelzap 走网络到 Loki，故障时恰是网络最脆弱时；DEBUG 级别现在能热改，忘改回去的风险也变高了）。**机制**：用 zap 内置 Sampler Core 包在 `newLogger` 的 Tee 外层（两条通路 stdout+otelzap 都受管），按 message 键控——结构化日志的 message 是常量串，等价于 VM 按调用位置限流；不选 fluent-bit/collector 侧（只保护存储，保护不了应用自身 I/O）。**分级**：FATAL/PANIC 永不限；ERROR/WARN 每秒同消息前 3 条放行、之后 1/100；INFO 前 10 条；DEBUG 跟随或不限。**压制必须可见**：丢弃钩子打 OTel counter `logs_suppressed_total`（带 level 标签）进 VM——压制速率突增本身就是故障信号，比日志更早；静默压制是最大反模式。**配置**：第一版写常量不动 proto（阈值不是按环境调的东西），要调再走 `Log.Application` 加字段。**铺开**：`internal/pkg/log/log.go` 10 份复制关系全改（同日志级别热生效那轮的改法），网关日志栈不同这轮不动。**测试**（先跑红）：①1s 内 1000 条同消息 ERROR 只写出 ~13 条 ②counter 记到 ~987 ③风暴中其他消息与 FATAL 直通；端到端停 PG 实测"前 3 条 + 稀疏心跳"。待定两点：阈值 3/100 可调；INFO 是否纳管（更保守就只管 ERROR/WARN）
- [ ] **可观测性 · kubeletstats 待启用**：`k8s_cluster` + `k8sobjects` 已落地（VM 27 个 `k8s.*` 指标、VL 可查真实 Event），节点/Pod 实际 CPU/内存仍待 kubeletstats receiver（其余已修观测项 → [归档](docs/progress-archive/2026-08-28-todo-trim.md)）
- [ ] **可观测性 · fluent-bit k8s 标签失效**：`fluent-bit.conf:78` 的 `Label_keys $k8s.pod_name, $k8s.namespace_name, $k8s.container_name` 取不到值，Loki 里这三个标签的值是字面量 `".pod_name"` 之类，日志按 pod/namespace 下钻不了。根因：第 61-62 行 `Nested_under kubernetes` + `Add_prefix k8s.` 把字段拍平成了名字里带点的**扁平 key**，而 record accessor 把 `.` 当嵌套分隔符。改 `$['k8s.pod_name']` 形式（2026-08-28 注:存量链问题;目标链 Vector→外置 OTel Collector→VictoriaLogs 的 pod/namespace 可查询性在迁移验收中保证）
- [ ] **可观测性 · 恢复网关时延看板**：control-tower 网关已带 otelhttp meter（ParentBased 与后端对齐）且已切流，原「网关指标未实现」条按其自述条件关闭；把旧网关无指标时删掉的「网关→上游 HTTP 时延」图加回 `docs/observability/grafana/` 看板脚本
- [ ] **可观测性 · 10 个电商服务缺 Go 运行时指标**：goroutine/堆/进程 CPU 内存全都没有。唯一在报的是**独立仓 config-center**（它实现了 `internal/pkg/sysstat`），而不是本仓任何服务；它以 `service.namespace=config-center` 区分遥测。把那套搬进 10 个服务，或抽成共享埋点。附带：config-center 未装 OTel ErrorHandler，导出失败没有任何日志（本仓 10 个服务已在 2026-08-06 那轮补上，可照抄）
- [ ] **技术债**：修复 `product/$spuCode.tsx:156` 的 `shopName` 类型报错；清理其余 mock 数据

### 技术选型历史定稿（2026-08-20；2026-08-27 Kafka 学习迁移目标曾撤回；2026-08-28 起以 `docs/TECH.md` 为最终定稿——Kafka 外部集群、Elasticsearch、VictoriaTraces、Silo、OpenFGA、TCR/Harbor/GHCR 制品分工、错误监控维持 Bugsink）

定稿结论与三轮对抗评审的回填记录全文已移入 [证据归档](docs/progress-archive/2026-08-21-todo-evidence.md)；
判定方法沉淀在 `context/team/tech-selection.md`，此处不再保留副本。

### 搜索引擎切换 Meilisearch（2026-08-16 拍板；2026-08-28 已被 `docs/TECH.md` 覆盖）

> 搜索存储定稿回归 **Elasticsearch**（`SearchCatalog` 接口后的只读投影，支持从 PG 全量重建）；Meilisearch 为当前存量实现，回迁 Elasticsearch 待立项（见上「事件 E3 搜索恢复」「Kafka 迁移推进」）。两仓迁移完成记录、选型背景与相关性抽查 → [归档](docs/progress-archive/2026-08-28-todo-trim.md)。

### 可观测性「统一关联底座」评审新增待办（2026-08-06,全文见 `docs/reviews/OBSERVABILITY_REVIEW_20260806.md`)

> 该轮用集群真实数据 + 双模型对抗评审验证「五维统一采集·存储·查看·分析」目标。§234/236/237/238 四条**已被本轮实测复核确认仍未修**(尤其 §236 fluent-bit 标签,Loki 里 `k8s__pod_name` 就是 `.pod_name`,日志按 pod 下钻彻底不可用)。以下为**新查出的确认缺陷**:

- [ ] **可观测性 · PII 脱敏形同虚设(P0 安全)**:部署中 fluent-bit lua 手机号脱敏用 `(%d{3})%d{4}(%d{4})`,**Lua 模式不支持 `{n}` 量词**,匹配不上任何手机号=空操作;更严重的是 `Merge_Log On`+`Keep_Log On` 保留原始 `log` 明文字段,连有效的 email 脱敏也被绕过——完整未脱敏 JSON 整条进 Loki。且脱敏只碰顶层 `email`/`phone` 两键,漏掉 `payment/internal/server/logging.go` dump 的 `form_data`(交易/回调数据)、RUM 的 `user_id`/`session_id`、debug 日志里的 bearer token。改法:`Keep_Log Off` + 手机号用有效 pattern + 扩展脱敏字段名单（2026-08-28 注:fluent-bit→Loki 为存量链;按 `docs/TECH.md` §9,PII 脱敏最终统一在外置 OTel Collector 管道执行,随 Vector→VictoriaLogs 迁移收敛本项）
- [ ] **可观测性 · RUM 与后端 trace 无 join key**:前端 `packages/perf` 用 web-vitals + 手写 Connect-JSON,无 `@opentelemetry/*`、不透传 traceparent、后端不回 Server-Timing——慢 `frontend.api.duration` 无法关联到后端 span,`anon_id`/`session_id` 只在日志不在 metric/span。且只有 consumer 一个前端调 `initPerf`,merchant/admin/config 三个没接。设计声称的「前端→网关→微服务全链路」（见 `docs/observability/OBSERVABILITY.md`）前端那段不存在
- [ ] **可观测性 · 网关 5xx 被记成成功**:`tracing.go:81-90` 只在 `err!=nil`(传输层错误)时 `SetStatus(Error)`,后端返回 HTTP 503 但 `err==nil` → span 状态 OK、`logging.go` 记成 `LevelInfo`。链路错误检索(VictoriaTraces)、日志 error 级告警都漏掉真实 5xx。改法:按 `reply.StatusCode>=500` 设 span/日志级别
- [ ] **可观测性 · 网关采样口径与后端相反**:gateway `AlwaysSample()`(非 `ParentBased`),后端 `ParentBased`;网关是 trace 根永远 100% 采样,设 `sample_ratio` 也压不住,高峰会压垮 collector 与链路后端。网关改 `ParentBased(TraceIDRatioBased)` 并统一读同一采样率;最终采样决策按 `docs/TECH.md` §9 由外置 OTel Collector 尾采样承担
- [ ] **可观测性/安全 · 免鉴权入口身份可伪造**:gateway jwt 中间件命中白名单(`telemetry.v1/CollectWebVitals`、`behavior.v1/Track`)时直接 return 不剥离入站头,rewrite/remove-header 中间件在 config.yaml 全注释掉;`behavior/identity()` 又把 `x-md-global-user-id` 当可信源。攻击者带 `x-md-global-user-id:<受害者ID>` 即可冒名上报,污染统一口径身份基座。补一条入站 `x-md-*` 剥离中间件
- [ ] **可观测性 · 看板两处口径错**:①`build_infrastructure.py:133-139`「DB 错误率」= `(errors or count*0)` 画的是**错误/秒不是比率**,1 err/s 混在 10000 ops/s 里飘红误报,需除以操作总量;②`build_infrastructure.py:38-41` 节点覆盖 stat 阈值 ≥2 为绿、desc 说「node1 是 control-plane collector 不调度」——**实测已不成立**(collector/fluent-bit DaemonSet 现 3/3,VM 里 node1/2/3 各 32 条 system 序列),阈值应对齐 3 节点否则掉 1 节点仍绿
- [ ] **可观测性 · 部署变更维度仍未采**：Kubernetes Event、Pod/workload 状态与 restart 已由 OTel `k8sobjects`/`k8s_cluster` 补齐；ArgoCD 变更历史/部署 marker 仍不进面
- [ ] **可观测性 · 生产级 HA 缺失**:Jaeger(badger 本地盘)、VM(single 本地 PV)、Loki(single-binary)、Grafana 均单副本,承载卷节点故障时无法带数据漂移。整个可观测栈在 `cloud-native-deploy` 的 imperative `install.sh` 里、未纳 GitOps,节点上还手改过 loki values;`loki/helm/other/install.sh:51` 等处 MinIO 凭据明文进 Git（2026-08-28 注:集群内 Jaeger/Loki 栈已属存量退役面,HA 要求按 `docs/TECH.md` §9 对外置 VictoriaLogs/VictoriaMetrics/VictoriaTraces 栈复核）
- [ ] **可观测性 · `OTEL_LOGS_EXPORTER: "none"` 是死配置**:该 env 无任何 Go 代码读(grep OTEL_ 零命中),`log.go` 无条件 `NewTee(stdout, otelOTLP)`。日志实际同时经 stdout→fluent-bit 和 OTLP→collector→Loki 两条路进 Loki,标签 schema 不兼容(`k8s__*` vs `service_name`),无单一 LogQL 覆盖全部日志。要么真接 autoexport 让该 env 生效,要么删掉误导性注释

### 基础设施 TLS 收敛（2026-08-08 实测盘点，清单见 `docs/design/platform/pre-environment.md`）

> 目标态是「每个基础设施都 TLS」。下面按**代价从低到高**排序，前两条是一次性小改动即可拿到大部分收益。
> ⚠️ 验收一律以**实测握手/协议响应**为准，不以 listener 配置表面状态为准——本段第 2、5 条正是
> 「配置看着对、实际不通/未启用」被实测揪出来的。

- [x] **已完成项已归档**：10 项（2026-08-19~08-24，dragonfly Passthrough、CNPG TLSRoute、MinIO TLS、node2 接入 Pangolin、gorse 恢复、彻底登出、node1 Redis TLS、端口随机化、harbor 修复、Redis 持久化卷）→ [`tls-convergence-done-20260824.md`](docs/progress-archive/tls-convergence-done-20260824.md)；另 6 项（ntfy 告警闭环、ZeroSSL 续期、僵尸 LB 清理、Gatus/Healthchecks、Bugsink、newt 恢复）→ [`2026-08-28-todo-trim.md`](docs/progress-archive/2026-08-28-todo-trim.md)

- [ ] **12 条基础设施 HTTPRoute 从 http listener 迁到 https**（一行改动一批，收益最大）：grafana / vm / kibana / es / kafka-ui(×2 hostname) / minio-api / minio-ui / jaeger-ui / jaeger-http / seata / consul-ui / argocd-server 目前全挂 `sectionName: http`（80 明文），改挂 `https` 即获得网关终止的 TLS（泛域名证书 `global-default-tls` 已覆盖 `*.dev.test`，无需新签）。**验收**：改前 `https://<host>` 返回 404、改后返回与 http 相同的业务响应；同时决定 80 listener 是保留（做 301 跳转）还是关闭
- [ ] **公网明文端点（优先级高于所有集群内明文）**：casdoor `apikv.com:8000`（=114.132.233.129）承载 OAuth code/token 交换，**走公网 http**。node2（8.138.194.254）上的 minio 与 gorse 已于 2026-08-19 全部解决，见下条
- [ ] **`restoreSession` 与 callback 的竞态**：`AuthProvider` 用 `router.state.location.pathname` 判断是否跳过 `restoreSession()`，但那要等 TanStack Router 初始化完，effect 首跑时可能还是 `/`，防护形同虚设。已改用 `window.location.pathname`（不依赖框架初始化）。**Casdoor 开「保持登录会话」后 `silentRenew` 更容易成功，这个竞态被放大**。改动已验证不影响登录，但没有回归测试守着
- [ ] **`e2e/login.smoke.mjs` 缺少隐私弹窗处理**：首页的 Privacy policy 模态会盖住顶栏，**点不到 SIGN IN**，脚本会在第一步就超时。本地实测必须先点 `Reject all`/`Accept all` 才能往下走。这条 e2e 至今没在 CI 里真跑过（secret 刚配上），跑起来第一次大概率就挂在这里
- [ ] **前端没进 GitOps（2026-08-19 记录，用户明确暂缓）**：`frontend/apps/consumer/deploy/` 下 7 份 manifest（`deployment/service/configMap` + `pre/` 四份）是手工 `kubectl apply` 的，不在 ArgoCD 里。而且**和线上对不上**：manifest 写 `harbor.apikv.com/ecommerce/frontend:dev`，线上实际跑 `ccr.ccs.tencentyun.com/sumery/ecommerce-frontend:sha-auth4`（deploy 名 `ecommerce-frontend-deploy`，ns `ecommerce`，revision 5）。镜像 tag 是手打的（`sha-bf8dae2`→`sha-csp1`→`sha-auth2`→`sha-auth4`），不是 CI 产物。**基础设施稳定后再收口**
- [ ] **接入企业微信告警（2026-08-19 探明拓扑与落点，只差凭据）**

  ⚠️ **2026-08-29 重新核对：下面 ①③④ 原先记的是已下线的 `192.168.3.210` 和已删除的集群内 Grafana，落点已整体搬到 node3，值全部换过。**

  **① 先分清两个端，别配错地方**（`192.168.3.210` 已停机下线；集群内 `observability` ns 的 Grafana 已 `helm uninstall`，那两个端都不存在了）：

  | 端 | 是什么 | 发不发告警 |
  |---|---|---|
  | `https://node3-grafana.apikv.com`（node3 `:3000`） | Pigsty 自带 **13.1.3** | ❔ 未复核 contact point；旧机上是纯看板 |
  | `https://node3-alerts.apikv.com`（node3 `:9059`） | Pigsty **Alertmanager 0.33.1** | ✅ **唯一发送方** |
  | `https://node3-vmalert.apikv.com`（node3 `:8880`） | vmalert | 规则求值，投递交给上面的 Alertmanager |

  ⚠️ Alertmanager 配置里那行 `wechat_api_url` 是它的**全局默认值**（指向 `qyapi.weixin.qq.com`），**不代表已配企业微信**。

  **② 两种企业微信形态，给的凭据不一样 —— 这是选型的关键分岔**：
  - **应用消息**（`corp_id` + `agent_id` + `api_secret`）：Alertmanager 的 `wechat_configs` **只吃这种**；Grafana 的 WeCom 也支持。**推荐**，两边统一且不必再引入转换层
  - **群机器人 webhook**：Grafana 能用，**Alertmanager 不能**（它发自己的格式，群机器人不认），只能经 PrometheusAlert 转换

  **③ 凭据获取步骤**（[work.weixin.qq.com/wework_admin](https://work.weixin.qq.com/wework_admin/)）：
  1. `corp_id`：「我的企业」→ 页面最下方「企业ID」
  2. 「应用管理」→「应用」→「自建」→「创建应用」，**可见范围决定谁能收到告警**；创建后详情页拿 **AgentId**，**Secret** 点「查看」会推送到手机企业微信
  3. ⚠️ **必须配「企业可信IP」**：应用详情 →「开发者接口」→「企业可信IP」→ 填 **node3 的出口 IP `211.144.221.226`**（2026-08-29 实测；旧记录里的 `171.105.164.78` 是已下线 210 的家宽出口，**不要再填**）。不配则调 API 报 `not allow to access from your ip`，**且该错误只在 Alertmanager 日志里，界面无感知**。云主机出口 IP 也可能变 —— 以后告警突然静默，先查它

  **④ 落点**（2026-08-29 在 node3 重新核对）：ssh 别名 `node3`，**用户名 `root`**；配置在 **`/etc/alertmanager.yml`**（不是 `/etc/alertmanager/alertmanager.yml`，路径从 `ps -eo args` 的 `--config.file=` 反查）。
  **现有结构与旧机不同**：`route.receiver` 是 `local-audit`（一个 webhook），receivers 只有 `default` / `local-audit` —— **node3 上没有飞书链路**，所以「用 `continue: true` 并进飞书和企业微信」那个旧改法不适用，得先决定飞书要不要一起重建。
  ⚠️ **Pigsty 侧必须模板与已部署文件双改**，否则 `./infra.yml -t alertmanager` 重跑会覆盖回去。这次实测出的两个真实路径：
  - 模板 `node3:/root/pigsty-deploy/roles/infra/templates/prometheus/alertmanager.yml`
  - 部署产物 `node3:/etc/alertmanager.yml`（owner `prometheus:infra` 0644，已有备份 `.bak-20260824135114`）

  **⑤ 仍缺**：企业微信三件套；node3 Grafana（13.1.3）的 admin 口令在 `node3:/root/pigsty-deploy/pigsty.yml`（不入库）。原先记的「集群 Grafana 12.3.1 密码」已随该实例删除而作废

  **⑥ 验收不能只测「发得出去」**：造一条 `severity=CRIT` 的假告警，确认进企业微信（若同时重建了飞书，确认两边**都**收到）；再造一条 `WARN`，确认**不**进企业微信 —— 否则路由条件没生效等于全量轰炸
- [ ] **给 Config Center 灌 gorse 的 api_key**：`backend/services/behavior/configs/{dev,pre}.yml` 与 `product/configs/pre.yml` 的 `api_key` 按硬规则 4 **保持空串**，但 gorse 侧鉴权已开——**KV 里不填真值的话业务调用会全部 401**。真值在 node2 的 `/home/docker/gorse/config.toml`
- [ ] **收窄 node1 公网数据端口**：测试期 Redis `61246`、PostgreSQL `52288` 对 `0.0.0.0/0` 开放；上线前按 `context/team/pangolin-tunnel.md` 收窄来源。Redis 有 TLS/强凭据但仍会被扫描
- [ ] **node1 PostgreSQL 加 TLS、轮换弱凭据**：当前 `52288` 明文且全网可达；与上一条同时收口
- [ ] **Config Center 同步 cart MinIO endpoint**：KV 改为 `https://minio.apikv.com`（443），同步前先验证 `/minio/health/live`
- [ ] **Consul 启用 TLS 并修 prod 清单**：当前 8501/HTTPS 不存在、gossip 未加密，但 prod 清单仍写 `https://consul-server.consul.svc:8501`
- [ ] **统一 cart `pre.yml` 的 OTel TLS 口径**：三个 exporter 对同一明文 `:4318` 的 `insecure_skip_verify` 值不一致；修前先恢复实际 OTel workload
- [ ] **应用直发 OTel logs 鉴权失败**：多个服务访问 `node3-otlp.apikv.com/v1/logs` 返回 `401 missing or empty authorization header`；stdout/Vector 与 k8s Event 管道正常，单独收敛 SDK endpoint/header
- [ ] **（观察项）dragonfly 重启历史**：旧集群曾 57 天重启 32 次；2026-08-20 转正为缓存主力（原生 TLS 新 Deployment）后基数清零重新观察——排查 redis 相关问题时仍先看它的重启历史，别默认它一直在线
- [ ] **Gateway certificateRef 收敛**：集群直连 listener 仍呈现 `dev.test`；与公网 newt/502 修复拆开跟踪
- [ ] **后续 PoC**：异机 Silo + repo encryption/restore、错误监控 Source Map（定稿**维持 Bugsink**，`sentry-cli` debug ID 链路验收；接入见 `docs/reports/2026-08-28-bugsink-integration-research.md`）、imgproxy 服务端签名单路径；边界与门禁见审计报告

---

## 四、实施路线

### 第一阶段：交易正确性与消费者闭环

- 修复 order 假成功、inventory CAS/版本错误和 payment 未实现 RPC。
- 以 PostgreSQL 事务、唯一约束、幂等键和状态机为正确性锚点；Dragonfly 不承载库存锁或业务真相。
- 打通商品 → 购物车 → 结算 → 库存预占 → 支付 → 订单状态 → 取消/退款的成功与失败路径。
- 修复 address/user/merchant 数据归属校验，完成 BFF cookie 的 pre/prod 安全属性和 legacy bearer 收尾。
- 交付标准：固定集成测试与浏览器用例可重复验证完整购物流程，不再出现假成功。

### 第二阶段：商家、管理与履约能力

- 完成 merchant/admin 的商品、订单、审核、售后、对账与审计页面及 API。
- 履约并入 order 域，先实现发货、物流单、轨迹与第三方物流 adapter；没有独立伸缩/故障域证据时不新建 fulfillment 服务。
- 落实商家子账号与 `merchant_id` 数据隔离；对象级授权按 `docs/TECH.md` §8 落 OpenFGA 关系模型（merchant/store/order），存量 RPC 级 Casbin 仅迁移期维持。
- 将 WMS/仓储作业视为外部系统集成边界；只有真实仓内流程成立时才立独立仓储端。

### 第三阶段：事件、交付与可靠性闭环

- 接入 Product/Order 事务内 outbox，完成 Kafka topic/partition（key=`aggregate_id`）、consumer Inbox、retry/DLQ、保留、重放、积压 SLO 与恢复验收（存量 NATS 链迁移期同口径维护）。
- 统一裸 manifest、Helm 与实际 workload，再重建 ArgoCD Application；未对齐前禁止启用 selfHeal。
- 完成 PostgreSQL/对象存储备份、PITR、RTO/RPO 和恢复演练。
- 完成 VictoriaMetrics/Logs/Traces 的 SLO 看板，以及 Alertmanager failure/resolved 外部通知实测。
- 收紧 Cilium/标准 NetworkPolicy、直连入口与服务工作负载身份，使「只信任网关」可被强制执行。

### 第四阶段：容量与弹性验收

- 明确用户、SPU/SKU、订单、库存流水、行为事件的总量、日增量与保留期，建立容量模型。
- 用 k6 固化读写比、热点 SKU、峰值并发和固定数据集，记录 P50/P95/P99、错误率、饱和度与成本。
- 根据证据决定 PostgreSQL 分区/归档、搜索（Elasticsearch）拓扑、Kafka partition/保留、缓存容量和对象存储（Silo）策略；不按「千万级」口号预先堆组件。
- 在 Consul 退役、Service 路由与观测指标可信后，再验收 KEDA、Argo Rollouts、限流、熔断和灰度发布。

### 技术风险与应对方案

| 风险 | 不能采用的伪解法 | 当前应对 |
|---|---|---|
| 库存超卖/重复扣减 | Redis 分布式锁叠 PG 锁 | PostgreSQL 条件更新/CAS、行锁、唯一约束、库存流水、幂等和对账补偿 |
| 支付状态不一致 | 只相信一次回调 | 回调验签、数据库幂等、主动查询、outbox 事件、日对账与可重放补偿 |
| 峰值过载 | 把所有同步请求丢进 Kafka/NATS；未压测先开全局限流 | 热点识别、cache-aside、防击穿、容量基线、按 procedure 限流、K8s 弹性与降级演练 |
| 绕过网关伪造身份 | 只依赖「服务在内网」 | 移除外部直连、默认拒绝 NetworkPolicy、可信身份头剥离/重注入、workload identity、owner 条件 |
| 搜索/事件投影漂移 | 把搜索引擎（Elasticsearch/存量 Meilisearch）当主存储 | PostgreSQL 为真相源；投影可全量回灌，消费者幂等并监控 lag/DLQ/重放 |
| 微服务复杂度失控 | 为每个名词新建服务 | 以事务、一致性、独立伸缩与故障域为拆分门槛；新增服务先 ADR，拓扑由 matrix + structcheck 守门 |

---
## 五、会话记录（已归档）

2026-08 配置中心迁移与 Cart 灰度的会话问答记录已移入 [证据归档](docs/progress-archive/2026-08-21-todo-evidence.md)。
此后会话记录不再进入本文件——按日期归档到 `docs/progress-archive/`。
