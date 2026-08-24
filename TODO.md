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
| Kubernetes 编排 | 🟡 | `deploy/{dev,prod}` 已重写并过 `kubectl apply --dry-run=client`；`helm/`、`application-vpa.yml` 已有，集群级压测/弹性未验证 |
| GitOps（ArgoCD） | 🟡 | `argocd-app.yml`、`argocd-proj.yml`、`argocd-repo.yml`（LAN 代理克隆 GitHub）已配置。… |
| 2026-08-19 集群重建后 GitOps 重新接线 | ✅ | 集群 08-16 重建后 ArgoCD 里 0 个 Application、`ecommerce` ns 不存在，CI 回写的 `sha-b482be9` 没有落点。… |
| 2026-08-19 鉴权链路改造：前端 PKCE 直连 + 网关身份头加固 | 🟡 | **起因**：前端每次启动都要先起 user 服务才有 JWT。查下来 user 服务在登录里**只是一层 40 行的 code→token 代理**（`backend/services/user/internal/data/user.go:35` 调 `GetOAuthToken` 后原样返回，不… |
| CI/CD（GitHub Actions） | 🟡 | **2026-08-07 后端 CI 重写为「一份模板 + 矩阵分发」**：`service-ci.yml`（workflow_call 可复用模板：build/vet/test(-race)+structcheck → buildx 多架构镜像推 TCR，tag=`sha-<7位>` 不可变 +… |
| 注册发现（Consul） | 🟡 | Consul 仅保留注册发现；应用配置统一由独立 Config Center 下发。… |
| 提交规范（commitlint + vite-plus 钩子） | ✅ | 仓库根 `package.json` 只装 `@commitlint/cli` + `config-conventional`，规则在 `commitlint.config.mjs`：Angular 十一类 type + 可选 gitmoji（带了就必须与 type 相符）+ subject 末尾禁标点。… |
| 代码规范（oxlint + oxfmt，vite-plus 内置） | 🟡 | biome 在 2026-03 迁移时已被 vite-plus 自带的 oxlint + oxfmt 取代。… |
| API Protobuf 输入约束（Protovalidate） | ✅ | 2026-08-07 完成 `backend/api/` 下 13 个 API 包、14 份源 proto 的 `buf.validate` 覆盖。… |
| 结构性门禁（`backend/structcheck`） | 🟡 | 2026-08-07 新增，随 `go test ./...` 进 CI。五项检查：`.service-matrix.yaml` ↔ `backend/services/` 目录双向对齐（`config` 撞名进程列为已知例外）、matrix 内部一致性（discovery/gateway_pref… |
| 部署入口一致性 | 🟡 | 2026-08-07 将 `.service-matrix.yaml` 的 10 服务清单扩展为部署覆盖真相源，新增 `TestDeploymentListsMatchMatrix` 双向核对 `backend/Makefile`、`backend/compose.yaml`、`helm/value… |
| 统一可执行 runbook（`context/team/runbook.md`） | ✅ | 2026-08-07 新增，把「规则与限制」命令化,供 Codex 等 CLI 直读直跑:动手前必读的限制(拓扑查 matrix、10 服务同构、proto 先读设计、凭据不入库、不可逆动作)+ 提交前验收锚点(`go build/vet`、`structcheck -count=1`、`go te… |
| harness 瘦身（AGENTS.md / context） | ✅ | 2026-08-07，参照 Anthropic/OpenAI 2026 的「减法」prompting 指引：AGENTS.md（根 + ecommerce 两份同步）「项目速览」改为「反直觉约定」，删掉读代码即可发现的技术栈/架构复述；… |
| token 成本治理（对照腾讯《Multi-Agent 降本》复盘） | ✅ | 2026-08-21 六处落地：TODO.md 瘦身 199KB→92KB（证据归档 `docs/progress-archive/`）+ 96KB 预算门禁；`scripts/verify-quick.sh` 并行锚点（绿一行/红失败段）；runbook 硬规则 #6 副本消重；`harness-framework/subagent-dispatch.md` 三条派发约定；kaneo MCP 收窄按需（`.claude/kaneo-mcp.json`）；impeccable 钩子限定 `frontend/`。四要素记录见 evolution-log |
| AI 异构双审（Claude + Codex） | 🟡 | 2026-08-07 评估过 CI 方案(`.github/workflows/ai-review.yml` + 两家 App + secret),因单人流程过重**已取消**该文件。… |
| 冻结验收集门禁（Frozen Nodes） | 🟡 | 2026-08-07 新增，服务于 Graph Engineering 多闭环工作流的「改考题必须走审批」防线。… |
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
| 节点优雅关机约定（`context/team/node-graceful-shutdown.md`） | ✅ | 2026-08-21 固化 `90s/30s` GracefulNodeShutdown；安装器新增 `KCM_TERMINATED_POD_GC_THRESHOLD=100`，已有控制面按次快照、原子更新运行清单并只定向修改 live ClusterConfiguration，中途失败双侧回滚。2026-08-23 已部署 node101：控制器 38 秒内恢复，三层配置均为 `100`，终态 Pod `112→100`；修正 VPA 终态历史误报后，全量 90 阶段及 PVC/LB/可观测链路冒烟全部通过。 |

### 2. 后端微服务（核心）

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| 用户认证 user | 🟡 | `SignIn`、`UserProfile` | 令牌刷新、登出、多端会话、第三方登录适配 |
| 商品 product | 🟡 | `GetProductDetail`（SPU/SKU） | **`ListProducts`（首页无限滚动/游标分页）设计已定，见 `docs/design/product/listing.md`，待落地**；上下架、类目/品牌管理、`ProductChangedEvent` 同步 ES |
| 购物车 cart | 🟡 | `GetCart`、`AddProductToCart`、`RemoveCartItem`、`UpdateCartItemQuantity` + MinIO 缩略图 URL（`GetCartSummary` 已于 2026-08 删除，见下） | **`RemoveCartItem`/`UpdateCartItemQuantity` 前端未接线**（删除/改数量只动本地 store，刷新就回来）；… |
| 订单 order | 🔴 | `CreateOrder`(**假成功桩**)、`CompleteOrder`(**不落库**) | ❗**`CreateOrder` 不是普通的桩，它返回假成功**：service 层把 `req` 整个注释掉、硬编码 `CartItemIDs: nil, AddressID: 0`（`inter… |
| 支付 payment | 🟡 | 5 个 RPC 均为**桩**（显式返回 `Unimplemented`），服务可启动/注册/健康检查，网关 `/payment*` 已通 | **repo 主体待恢复**：原实现依赖已移除的 balance/consumerOrder client（保留在 `data/payment.go` 注释块）；… |
| 库存 inventory | 🔴 | **无可用 RPC**（`Reserve`、`ReleaseReserve` 均已挂载但不可用） | ❗**`Reserve` 静默无操作**（`internal/data/inventory.go:52`，四处叠加：①传 `Version: stock.Version+1` 而 SQL 是 `AND version = @version`，WHERE 比对未来版本号→**永远命中 0 行**；… |
| 搜索 search | 🟡 | `Search`（ES + OTel） | CQRS 读写分离、商品数据实时同步、聚合筛选/智能排序、热门词 |

### 3. 后端微服务（支撑）

| 服务 | 状态 | 已实现 | 主要缺口 |
|------|------|--------|----------|
| 地址 address | 🔴 | CRUD + `SetDefaultAddress` + `ListAddresses`（功能齐全，**但全线越权**） | ❗**安全 BLOCKER**：`Get/Update/Delete/SetDefault` 的 SQL 只按 `address_id` 过滤、无 user 归属校验，`Cr… |
| 商家 merchant | 🔴 | 仅 `Submit`/`Get` 可用；2026-08-13 两段式入驻（成为商家/开设店铺）设计定稿（`docs/design/merchant/onboarding.md`，配《商家入驻协议》v1.0 `docs/MERCHANT_AGREEMENT.md`），`GetMerchantAgree… |
| 履约 fulfillment | ⬜ | — | 发货/物流轨迹、第三方物流对接、售后履约 |
| 结算 settlement | ⬜ | — | 佣金计算、结算单、财务对账 |
| 营销 marketing | ⬜ | — | 优惠券、满减、秒杀、会员/积分 |
| 数据分析 analytics | ⬜ | — | 指标计算、行为分析、经营报表 |
| 行为/推荐 behavior | 🟡 | `Track`、`Recommend`、`SimilarItems`（编译通过；… |

### 4. 网关与 RBAC

| 项目 | 状态 | 说明 |
|------|------|------|
| 2026-08-24 前端切 BFF 会话（P2，Web 端完成） | 🟡 | 鉴权模型翻案为 **BFF + 服务端 session**（control-tower `docs/design/adr-0002-bff-session.md` 取代 ADR-0001；手顺见同目录 `bff-migration.md`）。**Web 端不再持有任何令牌**：网关跑完 OAuth，浏览器只有一枚 httpOnly session id，续期在服务端完成。本仓改动：新增 `packages/configs/src/auth/bff.ts`（`/auth/me`、`startBffLogin`、`bffLogout`）；`packages/api` transport 全量 `credentials:"include"`；consumer `AuthProvider` 改为「Web 走 BFF、Tauri 保留 PKCE+bearer」双分支（网关三轨接受，两条路径长期并存）；consumer vite 加 `/auth` 与 `/api` 同源代理（**dev 必须同源**——会话 cookie 是 SameSite=Lax，跨站不会被带上）；`src/env.ts` 放开 `VITE_GATEWAY_URL` 接受同源前缀。dev 实测过：登录闭环、`/auth/me`、带权 RPC、撤权后自动换发新会话。**待办**：① merchant/admin 复用 `bff.ts` 接入登录（成本已大幅降低——不用各自实现 PKCE）；② pre/prod 需去掉 `SESSION_COOKIE_INSECURE` 并设 `Domain=.apikv.com` |
| 2026-08-24 桌面端切会话轨（P3，代码完成待真机验证） | 🟡 | Tauri 端改用**同一套服务端会话**：网关新增 `mode=native`，登录后把 session id 经**回环回调**交回原生层（`code`/`state` 参数名沿用，故 **Rust 侧一行未改**），前端存内存并以 `X-CT-Session` 头发出。由此 Web 与桌面端的冷启动、401 处理、登出**合并为同一条路径**，PKCE 在两端都退场。本仓改动：新增 `packages/utils/src/sessionStore.ts`；`authInterceptor` 三态（会话头 → bearer → 匿名）；`bff.ts` 加 `buildNativeLoginUrl` 与会话头；`AuthProvider` 两分支合并。**顺带修了一个类型检查发现不了的断裂**：`profile`/`profile/addresses` 的 `beforeLoad` 守卫原按「内存里有没有令牌」判断，BFF 下令牌恒为 null，已登录用户会被误踢去登录页——改为以 `/auth/me` 为准（浏览器实测已登录可正常进入）。**待办**：① 桌面端需真机跑一次（我无 Tauri 构建环境，仅完成代码与网关侧测试）；② 真机通过后即可删 `pkce.ts`/`tokenStore.ts` 与 `/callback` 路由（现已无人使用）；③ 会话 id 仅存内存，重启应用需重新登录，要免登录应存 OS keychain 而非 localStorage |
| 2026-08-23 网关重写迁 control-tower 合一仓（P4 接线完成） | 🟡 | 网关按 connect+buf 重写并与配置中心合一（`github.com/lens077/control-tower`，方案/终裁/实测档案在工作区 `.migration-scratch/`）。本仓已完成：`backend/go.mod` 与 41 处 import 换 `control-tower v0.1.0` SDK（wire 冻结，旧 SDK 跨版本四场景实测过）；structcheck 网关核对改 import 其 `routes` 包（含新增匿名清单双向核对，红绿演练过）；matrix gateway 段改外部仓+六键入册；service-ci/deploy-consistency 增私有 module 凭据步骤。**待办**：~~① Secret `GH_MODULES_TOKEN`~~（2026-08-23 解除：control-tower 转 public，CI 凭据步骤已撤）；~~② Casdoor TTL 15min~~（2026-08-23 已在控制台完成）；③ P5 切流按 control-tower `docs/design/cutover.md`（并行部署→selector 原子切→烘烤→冷回滚演练）；④ 烘烤期满退役 `gateway/` 目录与冻结键。TCR Secrets 已配、`0.1.1` 起双推。merchant/admin 前端**尚无登录会话**（无 callback/restoreSession，属下行「RBAC 三角色」既有待办），短 TTL 不影响，接入时复用 consumer `AuthProvider` 模式 |
| 网关（身份验证/授权/路由守卫） | 🟡 | 【烘烤期旧栈】`gateway/` 已实现，集中式 Casdoor 鉴权 + 策略文件；10 条 endpoint 全部落地（`/user* /search* /product* /cart* /address* /config* /order* /inventory* /merchant* /payment*`）。… |
| 网关服务发现恢复 | ✅ | Consul watcher 改为后台初始化，`Next()` 失效后按阶梯退避重建；… |
| 「刷新几次才出数据」的真实根因 | ✅ | 上一条修好了 watcher，但**首屏仍要刷几次** —— 因为真凶不在网关而在服务注册侧：Consul TTL check 注册后的初始状态是 **critical**，而 `TtlCheckPinger` 进 `for` 循环前**先等一个完整的 `ping_interval`（KV 里是 25s）**才发第一次 `UpdateTTL(pass)`；… |
| 成功调用被记成 `rpc.code: "unknown"` | ✅ | 11 个服务的 `internal/server/logging.go` 都在 `err != nil` 分支之前就算好了 `fields`，而 connect 的 Code 常量从 1 开始、**没有 `CodeOK`**，`connect.CodeOf(nil)` 返回的是 `CodeUnkno… |
| 前端购物车重复请求 | ✅ | `useCartBadge`（走 `GetCartSummary`）与 `useCart`（裸 `useEffect` + `isMounted`，只挡了 `setState` 没挡请求，StrictMode 下双发）各拉各的，购物车页一次挂载打 4 个 POST。… |
| RBAC 三角色（消费者/商家/管理员） | 🟡 | 策略模型（model.conf/policies.csv）已有；order/payment/merchant/inventory 已按 **RPC 粒度**授权（避免整段 `/svc.v1.*` 放行导致的越权），其余服务仍是整段放行待细化 |
| Casdoor 集成 | 🟡 | 登录/令牌解析打通，权限适配持续完善 |

### 5. 配置中心（Config Center）

> 设计文档见 `docs/design/config-center/design.md`。以 Postgres 为数据源、键值粒度、Casdoor 鉴权、玻璃态前端。

| 项目 | 状态 | 说明 |
|------|------|------|
| 设计文档 | ✅ | `docs/design/config-center/design.md`：架构/数据模型/RPC/鉴权/校验/玻璃态/路线图 |
| 后端 config 服务 | ✅ | 已迁往独立仓 `github.com/lens077/config-center` 并发布 `v0.1.0`：保留原 Postgres schema，服务自身改由本地 `CONFIG_FILE` 自举，Consul 仅服务发现；… |
| 网关接入 config | ✅ | `gateway/configs/config.yaml` 新增 `/config* → discovery:///config-service`;`policies.csv` 新增 `p, admin, /config.v1.ConfigService/*, POST, allow`；… |
| Gateway Config Center 单源迁移（2026-08-13） | 🟡 | **仓库侧已完成，运行时尚未迁移/验收**：参考 Cart 的 `CONFIG_SOURCE_FILE` + `configsource` SDK 模式，正常启动只接受 `type: config_center`，`CONFIG_SOURCE=file` 仅供显式本地测试，无 Consul KV 回退；… |
| 网关/前端错误层统一 | ✅ | 网关侧新增 `gateway/errors/{response,mapping,cors}.go`:404/405/无可用节点/超时等**非业务错误也按 Connect 规范**回 `{code,message,details[]}` + `X-Error-Reason` 头 + `Access-C… |
| 网关 JWT 时钟容差 | ✅ | `gateway/middleware/jwt/jwt.go` 增加 `jwt.WithLeeway(60s)`:修复登录后毫秒级请求因 `nbf` 零容差+微小时钟偏移被判 "token is not valid yet" → 401 → 前端退登死循环 |
| Consul 配置 KV | ✅ | 新增 `ecommerce/config/dev.yml`(真实 DB/Redis/discovery),服务启动从此加载 |
| ListNamespaces RPC | ✅ | 新增 `ListNamespaces` 返回 `NamespaceInfo{namespace, environments, key_count}`,SQL 按 `(namespace, environment)` 分组走 `idx_entry_ns_env`;前端命名空间/环境改为 Autocom… |
| 十服务 Config Center 单源迁移（2026-08-08） | 🟡 | **仓库侧已完成，pre 直发验收已通过，GitOps 尚未闭环**：10 份 `source_sdk.go` 限制 selector 只能是 `config_center`；… |
| 配置加载单测 + 竞态修复 | ✅ | 删除 payment/inventory/address/merchant 4 个引用已删 API(`updateConfig`/`ValidateConfig`/`Server_HTTP.Addr`)的 stale 测试；… |
| 前端配置控制台 | 🟡 | 已迁至独立仓 `config-center/web`：保持 Monaco/玻璃态 CRUD、历史与回滚能力，改为浏览器专用（取消 Tauri 桌面端）并从 `public/config.json` 读取网关与公开 Casdoor 配置。待独立 pnpm 构建与浏览器 CRUD 验证 |
| 配置编辑器增强 | ✅ | 新增 `lib/validate.ts` 统一校验/格式化层:JSON 走 `jsonc-parser`(V8 的 `JSON.parse` 报错常常**不带位置**,拿不到准确行号)、YAML 走 `yaml` 的 `parseDocument`(`toString` 保注释与 anchor)、T… |
| 旧仓 config 前端/桌面入口 | ✅ | 删除 `frontend/apps/config`、`dev:config`/`desktop:config`/`build:config` 及对应 Tauri profile；新控制台由独立仓发布 |
| 下发/Watch 热更新 | ✅ | **不经 Consul 桥接**，配置中心自成一路：`PutKey`/`DeleteKey`/`Rollback` **在写入事务内** `pg_notify('config_changed', 定位信息)`（回滚不会误发；… |
| 不热生效的三段（有意为之） | ✅ | `server`(重新绑端口会切断 in-flight 连接)、`discovery`(需摘节点重注册，滚动重启更可控)、`observability`(重建 tracer provider 会丢未导出的 span)——变更时打 WARN「该配置段已变更，但需要重启服务才会生效」，绝不让人以为改了就生效 |
| 历史页面重做 + 密钥历史脱敏 | ✅ | **页面铺平**：删掉「卡片套卡片」的嵌套外壳，改成一块面板内左右分栏；去掉 `maxWidth:1200` 铺满宽度，diff 从固定 `58vh` 改为 `flex:1` 吃满剩余高度；… |
| 其余 9 个服务全量迁移 | ✅ | address/behavior/inventory/merchant/order/payment/product/search/user 保持 cart 的 `Source`+`Live` 热更新链（`Live`、`PgPool`/`LiveRedis`、`zap.AtomicLevel`），并补齐 cart 已有的本地 file source、统一 SDK 文件命名。… |
| 三份配置对齐 + 灌入配置中心 | ✅ | 以 cart 为标准重排 10 个服务 × dev/pre 共 20 份配置（段序统一 `server → data → 服务专属段 → observability → discovery → search → log → auth`），逐份用各服务**真实的 `Bootstrap` 类型 + 与 `decodeConfig` 完全相同的解码链路**校验。… |
| 凭据不再入库 | ✅ | `configs/.gitignore` 里 **`per.yml` 是 `pre.yml` 的笔误**（`4a3eb70b` 引入），加上 address/behavior/merchant/payment 四个服务压根没有这个文件，结果 **11 份含明文凭据的配置文件（PG/Redis/ES… |
| 配置中心 Go 客户端 SDK | ✅ | 独立仓已提供 `sdk/configsource`、生成契约与 `SourceConfig{file, consul, config_center}`；… |
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
| 链路追踪（OpenTelemetry/Jaeger） | 🟡 | 后端 10 个服务、Gateway 的 OTel 核心 Trace/Metrics 已统一至 `v1.45.0`；… |
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
- [ ] **全链路 trace_id**：事件贯穿 `trace_id`，靠 Jaeger/OTel 追踪定位

---

## 三、近期待办（按优先级）

先打通「消费者核心交易闭环」，再向商家/管理端与非核心能力扩展。

### P0 · 鉴权改造的收尾（2026-08-19，代码已完成，剩下的都在 Casdoor 控制台/基础设施侧）

- [x] ~~**Casdoor 开 `enableSigninSession`**~~ **已完成**（连同 `enableAutoSignin`）。
      这是静默续期的前提：令牌只存内存，刷新页面靠 `prompt=none` 拿 Casdoor 会话 Cookie 换新令牌。
      ⚠️ **验证时别用匿名接口**：`GET /api/get-application` 对未登录请求把
      `enableSigninSession` 一律脱敏成 `false`（而 `enableAutoSignin` 不脱敏），
      照它判断会得出"没生效"的错误结论。必须带管理员登录态读。
- [x] ~~**补 `redirectUris`**~~ **已完成**：现为 `http://localhost:3000/callback`、
      `https://config.app.com/callback`、`https://shop.apikv.com/callback`。
- [x] ~~**newt 重装**~~ **已完成**（2026-08-19）：新站点 `k8s-cluster`(siteId 4) online；
      旧站点 `k8s`(siteId 3) 已删（secret 不回显、旧集群 helm values 已消失，救不回来）。
      现由 **kubernetes 仓 `components/newt/`** 管理（manifest 安装 —— 上游
      `fosrl.github.io/newt` 实测 404，无 chart 仓库）。**链路已实测打通**：
      `config.apikv.com` 200 / `config-api.apikv.com` 401，证明
      公网 → Pangolin → newt → cilium-gateway → 服务 整条可用。
      顺带修好两处旧账：资源 3/4 的 target 还指着旧集群已消失的 ClusterIP `10.97.94.118`；
      两条 HTTPRoute 的 hostname 是 `.app.com` 而非 `.apikv.com`。
- [x] ~~**Pangolin 资源**~~ `gateway.apikv.com`(resourceId 14) 与 `shop.apikv.com`(resourceId 15)
      已建，target `10.99.145.85:443` https，**SSO 已关**（应用自己走 Casdoor，再套一层会登录两次）。
- [x] ~~**部署网关本体到集群**~~ **2026-08-19 已完成并端到端验证通过**。新建 `gateway/deploy/pre/`
      （dev 那份用的是 `-dev` selector，且三份清单都没写 `namespace`，会随 context 漂）；
      网关的四个条目灌进 Config Center（`namespace=gateway env=pre`，`is_secret=false`）；
      镜像 `sha-03f9fa5`（含本次安全修复）。**三项验证**：
      ① 公网 `https://gateway.apikv.com` → product 免鉴权路由 **200**（业务层参数校验响应）；
      ② `cart.GetCart` 不带 token → **401**；
      ③ **伪造 `x-md-global-user-id` 被剥离并留痕**（日志 `丢弃客户端自带的身份头`）。
      RBAC 角色缓存已接入 Redis（`TLS=true, TTL 5m`）。

      **过程中修掉的四个真问题**（都不是本次改动引入的，是集群重建后的存量）：
      1. **10 个服务全都没有 `CONSUL_HTTP_TOKEN`** —— Consul 08-18 开了 ACL 后没人补。
         失败是**静默的**：注册看似成功、读返回 200 但被 ACL 过滤成空，
         `/v1/catalog/services` 只有 `{"consul":[]}`，表现为"服务活着、网关永远路由不到"。
         已在 `helm/values.yaml` 给 10 个服务统一补上。
      2. 网关配置里 Consul 地址写死成旧集群 LB IP `192.168.3.112`（现已漂到 `.102`），
         且 configMap 指向 **8501/https —— 那个端口根本不存在**（只有 8500/http）。
         症状是 `context deadline exceeded`，像网络抖动。已改走 Service DNS。
      3. **`optional: true` 的 Secret 卷，若 Pod 早于 Secret 创建会挂成空目录且不回填**，
         重启一次才有。`redis-tls-ca` 踩到，表现为"Secret 明明有内容、容器里却是空目录"。
      4. 集群内 Redis 有 `requirepass`，缺密码时组件按设计降级为仅进程内缓存
         （不阻断启动），因此 `NOAUTH` 只在日志出现一次，极易忽略。已补 `REDIS_PASSWORD`。

      **另记一条 GitOps 现场教训**：直接 `kubectl apply` 改 Deployment 会被 ArgoCD 的
      selfHeal 在秒级同步回去（本次实测撞上）。`helm/values.yaml` 是真相源，只能走 Git。
- [x] ~~**部署前端**~~ **已完成**：`https://shop.apikv.com` 首页 200。
- [x] **真浏览器跑通登录后修掉的 5 个问题（2026-08-19）**——它们的共同点是
      **单测和 tsc 一个字都不会说**，要么在响应头里，要么只在「真浏览器 + 真 Casdoor
      + 真跨源」的组合下才显形；页面看着完全正常，但登录态是坏的。
      ①**顶栏用 `isLoggedIn()` 这个非订阅式函数** —— 令牌改内存态后，登录成功不再
      产生任何能触发重渲染的信号，顶栏永远停在首渲结果（表现为"用户资料都拿到了，
      顶栏还显示未登录"）。改用 `useAuthState()`；`isLoggedIn` 已标 `@deprecated`，
      全仓无调用方。②**CSP 漏 `font-src`** —— MUI 图标字体是 base64 `data:` URI，
      只有 `default-src 'self'` 时被全拦（实测 5 条违规），图标是空的但不看控制台
      发现不了。③**`frame-src` 漏 `'self'`** ④**`X-Frame-Options: DENY` 挡死静默续期** ——
      ③④同一个成因：静默续期的最后一跳是 Casdoor 把 iframe **重定向回我们自己的
      `/callback`**，两者都会把这一跳拒掉，`postMessage` 发不出来 → 每次刷新都要重登。
      原注释断言"DENY 只约束别人嵌我们、不影响我们嵌别人"是**错的**；且控制台那条
      CSP 违规写的是被拦的是 shop 自己的 URL，极易看反方向。已改 `SAMEORIGIN` +
      `frame-ancestors 'self'`。⑤**`img-src` 漏 `cdn.casbin.org`**（Casdoor 默认头像）。
      **线上实测已生效**：`curl -D-` 读 `https://shop.apikv.com/` 的响应头，
      CSP 八段与 `X-Frame-Options: SAMEORIGIN` 与仓库一致。
- [x] **删掉 `localStorage.user`，用户资料改从 JWT 派生（2026-08-19）**：它是令牌还存
      localStorage 时代的产物，令牌改内存态后变成纯负债 —— PII 无限期留盘且登出带不走，
      而且它是**未经验证的输入**（`hooks/useAddresses.ts` 直接拿 `account.id` 当 `userId`
      发请求）。**但不能直接删**：它是当时唯一让资料跨刷新存活的东西，删掉会让刷新后
      头像昵称变空、`useAddresses` 拿空 `userId` 发请求，且不报任何错。改为 store 订阅
      令牌变化、从 JWT 解出资料（Casdoor 的 JWT 本来就带这些 claim），一处派生覆盖
      登录/续期/冷启动/登出四条路径。**顺带修掉两个同源问题**：AppBar 的登出是第二条
      并行路径，只调 `clearToken()` 漏了 `stopRenew()`——续期定时器在登出后照跑，到点用
      Casdoor 会话 Cookie 静默换新令牌，即**登出后会自己登回去**；以及 `setAccount({})`
      是 `{...旧值, ...{}}`，**什么都清不掉**，而登出与两处路由守卫全写的这个。
      已补 6 条 store 单测（含反证：注掉订阅后 3 条转红）。
- [x] **登录冒烟测试接进 CI（2026-08-19）**：`apps/consumer/e2e/login.smoke.mjs`，
      `frontend.yml` 里独立 job `smoke-login`，走 `workflow_dispatch` + 每日定时，
      **不挂在发版流水线上** —— 它测的是线上已部署的那一份，放构建前跑等于测上个版本，
      放构建后又要等 ArgoCD 同步完（时长不可控）；且它依赖外部基础设施（Casdoor、
      Pangolin 隧道、网关），红了不该卡发版。断言覆盖 PKCE 参数、无 `client_secret`、
      localStorage 无 token/user、刷新后登录态与头像仍在、全程零 CSP 违规。
      **待办**：仓库要配 `CASDOOR_E2E_USER` / `CASDOOR_E2E_PASS` 两个 secret，
      没配时该 job 整体跳过（不是失败）。
- [ ] ⚠️ **`frontend.yml` 的构建/发布段已经全是死引用，跑起来必失败**（2026-08-19 实查，
      本轮只加了 smoke job，没动它）：`file: frontend/Dockerfile` **不存在**（真实位置是
      `frontend/apps/consumer/Dockerfile`）、`helm/charts/frontend/` **不存在**、
      registry 写的 `harbor.apikv.com:5443` 本集群没部署（前端实际用 TCR）、
      Manifest 仓库路径 `connect-example/frontend/argo.yaml` 是另一个项目的布局。
      前端目前是手工 `kubectl apply frontend/apps/consumer/deploy/pre/` 部署的。
      要么按现状重写这条流水线，要么删掉只留 smoke job，别让它假装还在工作
- [ ] **网关部署补 `redis-tls-ca` Secret**：`deploy/dev/deployment.yaml` 已挂载但标了
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
- [ ] **`UpdateCartItemQuantityParams` 缺 Quantity 字段**（`cart/internal/data/cart.go:57`）
- [ ] **商家 `RejectApplication`/`ActivateMerchant` 是 panic 桩**（`merchant_service.go:57,98`）
- [ ] **网关重试可复制非幂等写**（`gateway/proxy/proxy.go:263-310`）〔2026-08-23：control-tower 新网关已按「默认关闭重试」根治（其 decisions.md），本条随旧网关退役即关；`requestId` 幂等键仍是订单侧待办〕：补 `requestId` 幂等键，
      或对非幂等方法关闭重试（与下方「下单防重的 requestId 一直是假的」一起做）
- [ ] **搜索读的字段与 `docs/design/search/search.md` 的 ES mapping 不兼容**（`search/internal/data/search.go:63-90`）：
      实现读 `id`/`skus[].price`/`sale_detail[].quantity`，设计写 `spu_id`/顶层 `price`/`sale_count`——
      按设计建索引则结果全为零值。二者需对齐（改实现或改设计，待决策）
- [ ] **给上述路径补测试**：本轮 22 条发现全部位于零覆盖路径上，`go test ./...` 却是全绿的——
      不补测试，修完还会重演

### 其余近期待办

- [ ] **集群重装在即（2026-08-21 登记）**：组件数据不保留（拍板），脚本与配置全部以 git 为源自动重建。恢复链均已实测：①`~/lens077/kubernetes` bootstrap 装集群（`/etc/containerd/certs.d`、kubelet 配置等节点自定义项已入库脚本化；动手前逐条过其 `bootstrap/config.env` 尾部「重建须知」，creds 目录——尤其 `dragonfly-password`——先带走）②组件按 config.env 开关重装，external-secrets 注入 AppRole 后密钥自 VPS Vault 流回 ③`ADDON_CNPG` 勾选即自动建 pg-main+`ecommerce` 库 ④建表走 `make migrate-cnpg-up`（12 迁移实测全过）⑤config-center `scripts/deploy-k8s.sh` + bootstrap SQL 直灌 ⑥ArgoCD 按上表「2026-08-19 集群重建后 GitOps 重新接线」行的 runbook 接回（config source Secret/tcr-pull-secret/pg-ca-cert）
- [x] **AI Coding 交付效率治理与日报（2026-08-19）**：阅读腾讯健康实践，将可信状态、
      组织摩擦、P50/P85、长尾指标、人机责任边界和日报证据规则写入
      `context/harness-framework/delivery-efficiency.md`；基于今日 3 个提交及已知本地修改生成
      `docs/reports/2026-08-19.md`，来源不明的并发变更按用户要求排除
- [x] **Go PGO 评估与验收指南（2026-08-19）**：阅读 Go PGO 实测文章，将优化机制、
      profile 代表性、交叉负载验证、收益边界、回退条件与 profile 管理要求补入
      `docs/design/platform/performance.md`；外部实验的 2%–4.7% 提升不作为项目性能承诺
- [x] **go-redis 使用约定补充（2026-08-19）**：阅读 OneUptime 教程，将 cache-aside、连接池、
      `context`、Key/TTL、Pipeline、Pub/Sub 与锁的可靠性边界合并到 `context/team/go-redis.md`；
      同步两级 INDEX，`verify-context` 与 `verify-freeze` 门禁通过
- [x] **配置 YAML 的 IDE 校验（2026-08-18）**：`make conf-schema` 从各服务 `conf.proto` 生成 `configs/bootstrap.schema.json`（protovalidate `in`/`required` → schema `enum`/`required`，Duration 后处理成 Go 风格正则），IDEA 映射在 `.idea/jsonSchemas.xml`（gitignore，工作区 `~/lens077/.idea` 与仓库 `.idea` 各一份），GoLand 实测能拦枚举/类型/未知键/缺段。顺带修掉三处「约束从没匹配过现实」的 proto 漂移（server.addr 带端口、casdoor.endpoint 是 URL、consul.addr 端口可选）+ behavior 配置里 proto 未定义的 `log.elasticsearch` 块。详见 `context/project/ecommerce/config/INDEX.md`
- [x] **运行时 protovalidate 接线（2026-08-18，matrix config_validation 的 known_defect 已修）**：10 个服务的 `decodeConfig` 开 `ErrorUnused`（未知键报错），`Init`/热更新在解码后调 `protovalidate.Validate`；启动校验失败直接起不来，热更新校验失败保留当前配置只记 ERROR。先跑红后跑绿（未知键/缺 required 段/校验失败保留配置三用例），每服务新增 `TestRealConfigFiles_DecodeAndValidate` 在本机验证真实 dev/pre.yml（CI 自动 skip）。**接线立即暴露并修掉一批规则类型错配**：`uint32` 字段挂 `int32` 规则、`repeated string` 挂标量 `string` 规则（protovalidate 运行时编译直接报错，schema 生成器此前静默忽略）——`allowed_origins`/ES `addresses` 改为 `repeated.items.string.uri`（真实值都带 scheme）。structcheck 同构门禁与全量构建通过
- [x] **发布前置：配置中心 bootstrap.yaml 审计（2026-08-18 完成）**——经确认本地 `configs/{dev,pre}.yml` 即配置中心内容的副本。20 份全部通过「解码 + protovalidate」全链路（`go test -run TestRealConfigFiles ./services/*/internal/pkg/config/`），并用严格 YAML 解析器扫过无重复键。期间修掉 user/dev.yml 里 redis 块整套键重复（换本地 Redis 时旧 dragonfly 尾部键没删，Go 解析器静默取后者不报错，IDE 才看得见）。以后改配置后照这两条命令复验即可
- [ ] **全量 `make generate`/`make conf` 是坏的（2026-08-18 发现，先于本轮存在）**：order/payment/address/cart/merchant 五个服务目录下各有一份 `services/<svc>/third_party/validate/validate.proto` 复制品，与 `backend/third_party/validate/validate.proto` 的扩展号 1159/1160 冲突，buf 全量 build 直接失败（`field number used more than once`）；带 `--path` 的按服务生成不受影响（conf-schema 就是这么绕的）。修法：删掉五份复制品（先确认没有 proto 以相对路径 import 它们）
- [ ] **文档整理遗留（2026-08-07 盘点发现，本轮未动）**：①`docs/SCAFFOLD.md` §四内嵌的 AGENTS.md 模板还是旧版「项目速览」结构，与真身已分叉，需同步 ②~~`.github/workflows/backend.yml` 过时~~（2026-08-07 已重写为模板+矩阵，见上「CI/CD」行）；`frontend.yml`（2025-11）仍是 `connect-example-*` 旧身份待重写——**且它本就是 tag 触发：2026-08-20 起每个发布 tag 都会唤起它并在 Setup pnpm 步失败（pnpm/action-setup 自装炸），发布页红噪直到重写** ④`gateway/README.md` 的 CI badge 与 `go.mod` module 名仍是上游 `go-kratos/gateway` 身份 ⑤`frontend/apps/{admin,merchant}` 缺 README（与 consumer/desktop 不对称）⑥`gateway/.github/workflows/gitee-sync.yaml` 上游残留可删 ⑦`.scratch/architecture-hardening/` 只有 spec.md 没按 `docs/agents/issue-tracker.md` 拆 issues/
- [x] **`service_name` 撞名**：已退役 `backend/services/config`；独立 config-center 用 `service.namespace=config-center` 区分遥测，系统查询精确筛选，电商 Grafana 看板排除其基础设施指标
- [ ] **订单服务**：补 `GetOrder` / `ListOrders` / `CancelOrder` RPC 与订单状态机（带守卫的状态迁移 + `order_log`）
- [x] **数据库迁移工具落地（2026-08-21，异构对抗第4轮终裁 goose v3）**：10 服务 `internal/data/schema/*.sql` 全部转为 `internal/data/migrations/*.sql`（goose 注解、DDL 语义原样，仅两处真实修复：user 删模板残留 `CREATE DATABASE connect_example`、inventory 修非法 `warehouse_id VARCHAR DEFAULT 1`）；examples 示例数据改写为**幂等种子** `internal/data/seeds/*.sql`（goose no-versioning：ON CONFLICT/NOT EXISTS 守卫、外键改业务键子查询，删掉故意冲突演示与 TRUNCATE；order 示例 650.50×5≠3250 的金额不一致已修）；工具 `backend/tools/dbmigrate`（goose 库内嵌零外部 CLI，per-service 版本表 `public.goose_db_version_<svc>` + per-service 咨询锁 + `baseline` 接管存量库）+ `make migrate-up/-status/-down/-create/seed/seed-down`；sqlc 的 `schema:` 全部改指 migrations 目录（官方支持解析 goose 注解），**连真库重生成暴露并补齐三笔生成物欠账**（merchant 缺整张 agreement 表与两列、order `merchant_id` int64→UUID、product SKU 枚举名规范化 `ProductsSkusStatusEnum`）；postgres:18-alpine 实测 up/幂等重跑/seed×2 计数不变/down-to 0 回滚/up 重放/baseline 记账+拒绝重复 全绿。规范沉淀 `context/team/db-migrations.md`（含 `SET search_path` 毒版本表等三坑），操作手册 `backend/tools/dbmigrate/README.md`。集群 CNPG 首次接管手顺：port-forward 后 `make migrate-baseline`（未执行，等发布窗口）
- [ ] **一致性底座**：落 Outbox 表 + **自写 relay → NATS JetStream**（2026-08-20 选型定稿，原「Kafka relay」表述作废，见下「技术选型定稿」小节），替换现有进程内 `GoEventBus`（跨服务事件当前到不了其他服务）。**2026-08-21 底座代码与 dev 集群 worker 已落地并完成回灌/积压重放验证**（见「③NATS JetStream 落地」行的进展注），剩 Product Service 事务内生产者、order 侧接线、NATS 鉴权与声明式治理
- [ ] **建单全链路**：cart 补"按 CartItemIds 取选中项"RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车
- [x] **consumer 结算页（前端）**：已接选中项/地址弹层选择+新增/防重 requestId/下单调用，去优惠券、运费恒 0、统一 sp[]；生成 `api/order` 客户端并在 `gen/api` 导出 order
- [ ] **consumer 结算页（待后端联通）**：后端补 `CreateOrderRequest.requestId`、`CreateOrderResponse.orderNo` 并 `make api` 后，提交订单接真实响应、跳真实支付页（现为固定 `/payment/result` 占位）
- [ ] **下单防重的 `requestId` 一直是假的（迁 connect-query 时查实）**：旧代码 `client.createOrder(message as Parameters<...>[0])` 在假装 proto 有这个字段，而 `CreateOrderRequest` 只有 `cartItemIds`/`addressId`/`remark` 三个，那个 UUID 运行时直接被丢掉 —— 也就是说**防重从来没生效过**。迁移时删掉了那个 cast 和对应的 `useState`，把「假装成立」改成了明面上不成立，结算页留了 TODO。要真生效得先补 proto 字段再 `make api`，与上一条一起做
- [ ] **cart 的删除/改数量前端未接线**：`RemoveCartItem` 后端实现完整；**`UpdateCartItemQuantity` 后端也不完整**——`UpdateCartItemQuantityParams` 里根本没有 Quantity 字段（`internal/data/cart.go:57`），即便前端接上也改不了数量，需先补字段（本行原写「后端实现完整」，2026-08-06 回扫订正）。前端 `useCart` 的 `removeItem`/`updateQuantity` 只动本地 valtio store 不发请求 —— **用户删掉商品后刷新页面它会回来**（`GetCart` 拉的还是旧数据，同步 effect 会 clear 再灌回去），即删除与改数量这两个功能对用户实际不存在。修法：两个 hook 各接 `useMutation` + `invalidateQueries`，模式与现有 `addProductToCart` 同构。**同批的 `GetCartSummary` 已删**（2026-08，见下一条）
- [x] **购物车 cart_item_id 修复（前后端已闭环）**：后端 `AddProductToCart` SQL 改 `RETURNING id`、`AddProductToCartResponse` 增 `cart_item_id`（proto/biz/data/service 已改，`make api` 已跑，`make sqlc` 需在有 DB 的环境重跑以校验，手写已对齐）；前端 `store/cart.ts` 删除伪造 ID、`useCart` 从 `GetCart` 取真实 ID、`api/cart` 乐观新增改用后端返回的真实 `cart_item_id`
- [ ] **consumer 订单页**：订单列表/详情接真实查询 API，替换 mock
- [ ] **支付闭环**：`payment/result` 接支付状态查询 + 回调后订单状态同步（订单订阅 `OrderPaid`）
- [ ] **库存联动**：下单同步 `Reserve`（TCC-Try），支付成功确认扣减，取消/超时 `ReleaseReserve`
- [ ] **商品服务 ListProducts（设计已定，见 `docs/design/product/listing.md`）**：首页无限滚动 + 游标(keyset)分页，无总数；`ProductCard` 含 brand/价格区间(min~max)。落地：`product.proto`→`make api`→`query.sql`→`make sqlc`→biz/data/service 样板→前端 `useInfiniteQuery` 接首页
- [x] **商品示例数据**：`schema/examples/spu.sql`+`sku.sql` 追加 3 个商品（罗技鼠标/索尼耳机/Nike 跑鞋，SPU 5–7，多 SKU）
- [ ] **推荐链路收尾**：~~建表~~ / ~~修 gorse 部署~~ / ~~product item 同步实测~~ 已完成；只差把带 `recommend:` 的 `ecommerce/{product,behavior}/dev.yml` 上传 Consul KV → 起服务端到端验证 Track/Recommend/SimilarItems → 删掉 gorse 里的 `smoke-a/b/c`
- [ ] **consumer 接入 tracker**：`tsconfig.json` 加 `@ecommerce/tracker` paths、`package.json` 加 `workspace:*` 依赖、入口 `initTracker({gatewayUrl})`、商品卡挂 `useImpression`、详情页挂 `useProductView`、加购/收藏/支付成功处补 `tracker().cart/favorite/purchase`
- [ ] **领域事件**：引入 **NATS JetStream**（2026-08-20 选型定稿替代 Kafka），落地 `OrderCreated/OrderPaid/OrderCancelled` 事件驱动（编舞 Saga）+ CloudEvents 信封（TECH-RADAR 1.6）
- [ ] **订单缺陷修复**：金额改 `decimal`（现为 `float64`）、修 `AddressPostalCode` 空指针、统一 `merchant_id` 类型（UUID）、`Complete()` 应要求已发货
- [ ] **merchant 端**：新增 `api/` 客户端，接商家入驻/商品/订单
- [ ] **admin 端**：新增 `api/` 客户端，接商家审核/用户/类目管理
- [ ] **RBAC**：补齐三角色细粒度权限校验与网关策略
- [ ] **测试**：补 consumer 关键路径 playwright/vitest 用例、后端核心 biz 单测
- [ ] **日志限流（方案已定稿，待拍板实现）**：防"基础设施故障 → 周期性错误日志"风暴（真实暴露面：PG 挂时 behavior `flush()` 每 2s 一条 ERROR、Consul 断连时 11 个服务的 `TtlCheckPinger` 各每 10s 一条，且都经 otelzap 走网络到 Loki，故障时恰是网络最脆弱时；DEBUG 级别现在能热改，忘改回去的风险也变高了）。**机制**：用 zap 内置 Sampler Core 包在 `newLogger` 的 Tee 外层（两条通路 stdout+otelzap 都受管），按 message 键控——结构化日志的 message 是常量串，等价于 VM 按调用位置限流；不选 fluent-bit/collector 侧（只保护存储，保护不了应用自身 I/O）。**分级**：FATAL/PANIC 永不限；ERROR/WARN 每秒同消息前 3 条放行、之后 1/100；INFO 前 10 条；DEBUG 跟随或不限。**压制必须可见**：丢弃钩子打 OTel counter `logs_suppressed_total`（带 level 标签）进 VM——压制速率突增本身就是故障信号，比日志更早；静默压制是最大反模式。**配置**：第一版写常量不动 proto（阈值不是按环境调的东西），要调再走 `Log.Application` 加字段。**铺开**：`internal/pkg/log/log.go` 10 份复制关系全改（同日志级别热生效那轮的改法），网关日志栈不同这轮不动。**测试**（先跑红）：①1s 内 1000 条同消息 ERROR 只写出 ~13 条 ②counter 记到 ~987 ③风暴中其他消息与 FATAL 直通；端到端停 PG 实测"前 3 条 + 稀疏心跳"。待定两点：阈值 3/100 可调；INFO 是否纳管（更保守就只管 ERROR/WARN）
- [x] **可观测性**：Loki 日志采集、VictoriaMetrics 指标、Grafana 看板（业务盘 + 基础设施盘）均已落地，见 `docs/observability/grafana/`
- [x] **前端错误基线**：`vp lint` 的 25 条告警已清零；修复未处理导航 Promise、定位 API 的 async Promise executor、SKU JSON 属性的 `[object Object]` 展示风险与 `VirtualList` 对函数式 `sx` 的错误展开。consumer、merchant、admin 的生产构建均通过
- [x] **merchant 首包拆分**：补齐已安装但未启用的 TanStack Router Vite 插件，修正报表路由的 `as any` 非字面量声明后启用 `autoCodeSplitting`。首页入口从 `926.92 kB`（gzip `298.70 kB`）降至 `340.92 kB`（gzip `108.89 kB`）；ECharts 报表移至仅访问 `/reports` 才加载的独立 `526.58 kB` chunk
- [x] **可观测性 · RPC 指标基数失控（已修）**：11 个服务的 otelconnect 拦截器加 `WithoutServerPeerAttributes()`。`net_peer_port` 按 TCP 连接取值，实测 cart 单个 `rpc_server_duration_milliseconds_count` 就有 39 条序列、每条只有一个样本且永不递增 → `rate()` 恒为 0，「请求率/错误率/P95」在改之前算的都是错的值。代价：server span 与指标上不再有 `net.peer.*`（调用方 IP 仍能从 trace 上游 span 看到）
- [x] **可观测性 · 采样率可配（已落地）**：`observability.trace.sample_ratio`（wrapper 类型，不配=1.0 全采）+ `observability.metric.export_interval`（不配=30s）。上生产前把 `sample_ratio` 显式调下来；采样器是 `ParentBased(TraceIDRatioBased(x))`，整条链的采样决策一致，不会采出半截 trace
- [ ] **可观测性 · 采集管道自盲（优先级最高，代价最小）**：`otelcol_*` 不在 VM 里，只在每个 collector pod 的 `:8888`，没有任何东西采集它。后果是"遥测有没有在半路丢"只能靠 `kubectl port-forward` 逐个 pod 看——2026-08-06 排查 trace 断链时就是这么干的。补法：collector 加 `prometheus` receiver 自采 `127.0.0.1:8888`，约 30 个序列。做完基础设施盘补一行 accepted/sent/send_failed + 队列深度
- [ ] **可观测性 · k8s 视角（单独一轮，勿与看板混做）**：上 `kubelet_stats`（容器/Pod CPU 内存）+ `k8s_cluster`（Pod 重启次数、Deployment 副本状态）receiver，distro 里都有、无需引入新组件。两个前置约束：①都是基数敏感的，`kubelet_stats` 要按 collector CR 里已有的那套思路控制维度（**别带 pod 名**，Pod 名带 ReplicaSet 哈希，每次发版全部序列作废重开一套）②`k8s_cluster` 是集群单例语义，在 DaemonSet 下**必须配 `k8s_leader_elector`**，否则每个 pod 各采一遍 = N 倍重复计数，且要加 ClusterRole
- [ ] **可观测性 · fluent-bit k8s 标签失效**：`fluent-bit.conf:78` 的 `Label_keys $k8s.pod_name, $k8s.namespace_name, $k8s.container_name` 取不到值，Loki 里这三个标签的值是字面量 `".pod_name"` 之类，日志按 pod/namespace 下钻不了。根因：第 61-62 行 `Nested_under kubernetes` + `Add_prefix k8s.` 把字段拍平成了名字里带点的**扁平 key**，而 record accessor 把 `.` 当嵌套分隔符。改 `$['k8s.pod_name']` 形式
- [ ] **可观测性 · 网关指标未实现**〔2026-08-23：control-tower 新网关已带 otelhttp meter + ParentBased 采样对齐后端，切流后本条关闭并恢复看板〕：`gateway/` 下没有任何 meter（只有 tracing 中间件），`http_server_*` 整族不存在，所以看板上「网关→上游 HTTP 时延」这张图已删。要看网关侧耗时得先加 metrics 中间件
- [ ] **可观测性 · 10 个电商服务缺 Go 运行时指标**：goroutine/堆/进程 CPU 内存全都没有。唯一在报的是**独立仓 config-center**（它实现了 `internal/pkg/sysstat`），而不是本仓任何服务；它以 `service.namespace=config-center` 区分遥测。把那套搬进 10 个服务，或抽成共享埋点。附带：config-center 未装 OTel ErrorHandler，导出失败没有任何日志（本仓 10 个服务已在 2026-08-06 那轮补上，可照抄）
- [ ] **技术债**：修复 `product/$spuCode.tsx:156` 的 `shopName` 类型报错；清理其余 mock 数据
### 技术选型定稿（2026-08-20 三轮对抗评审，已归档）

定稿结论与三轮对抗评审的回填记录全文已移入 [证据归档](docs/progress-archive/2026-08-21-todo-evidence.md)；
判定方法沉淀在 `context/team/tech-selection.md`，此处不再保留副本。

### 搜索引擎切换 Meilisearch（2026-08-16 拍板：ES → Meilisearch，两仓合计约 2 人日）

> 背景：新集群安装器（`~/lens077/kubernetes`；2026-08-17 重构后为 `bootstrap/` + `components/`，原 `system/` 与节点 `/root/.k8s-installer-credentials` 路径不复存在——路径订正 2026-08-21）的搜索组件已从 OpenSearch 改为 **Meilisearch v1.53**（svc: `search/meilisearch:7700`，master key 落安装器 STATE_DIR `creds/`——节点 `/var/lib/k8s-installer/creds/`、Mac 执行为 `~/.local/state/k8s-installer/creds/`）。选型依据：官方 `go-elasticsearch` v8+/v9 客户端带产品头校验，连 OpenSearch 直接拒连；而本仓搜索面极小（search 服务仅 1 条 Search + 1 条 Index），正是 Meilisearch 甜点区——中文分词开箱（ES 需自定义 IK 镜像）、~300Mi 内存（ES 单节点需 1.5Gi 堆）、typo 容忍/即时搜索默认开启。**已知取舍**：无 ES 级聚合分析，将来若要在搜索数据上做统计报表需重新评估；排序语义与 ES 不同，切换后必须用真实商品数据抽查相关性。

- [x] **[本仓] search 服务 ES→Meilisearch（2026-08-21 完成）**：`go-elasticsearch/v9` typed API 已替换为 `meilisearch-go` v0.36.3；查询使用 `q` 与 `status = online` 过滤，结果按 `backend/pkg/searchindex.Doc` 的扁平字段解析；启动与 `/healthz` 先检查 Meilisearch `/health`，再以最小查询验证 API key、`products` 索引和 `status` 过滤设置；search 运行时不再初始化未使用的 PostgreSQL、Redis 和 Casdoor 客户端。合成在线、离线文档的端到端 RPC 验收通过，离线文档未返回，测试数据已清理
- [x] **[本仓] address 服务清理 ES 残留（2026-08-21 完成）**：删除无业务调用的客户端字段、Fx Provider、`NewElasticSearchClient` 与健康检查项；address 已恢复 Ready
- [x] **[本仓] 配置与依赖收尾（2026-08-21 完成）**：Config Center `dev` 与本地配置改为 Meilisearch；服务使用仅限 `products` 索引 `search` 动作的 API key；`backend/go.mod` 已移除 `go-elasticsearch/v9` 与 `elastic-transport-go`。Compose 和 Helm 不含搜索引擎连接值，继续只挂 Config Center selector
- [x] ~~**[postgres-kafka-es-streaming-pipeline 仓] CDC 写入端 ES→Meilisearch**~~（**2026-08-21 整条作废**：该仓属 Debezium+Kafka 管道，随 Kafka 退役失去载体；替代实现已在本仓落地——`backend/pkg/searchindex` 消费 JetStream 事件写 Meili，含 tombstone 删除映射与 index swap 全量重建，见上「③NATS JetStream 落地」2026-08-21 进展注）
- [x] **[两仓] 重建索引时一次洗掉三笔历史债（2026-08-21 完成）**：`backend/pkg/searchindex.Doc` 与 search 服务读路径已统一为顶层 `id`、`price`、`sale_count`；价格是数值投影，只用于展示和排序，不参与交易金额计算
- [x] **[本仓] `SearchRequest.index` 从前端收回服务端（2026-08-21 完成）**：索引固定为服务端配置的 `products`；proto 字段 1 保留并标记 deprecated，服务端忽略传入值；前端已删除常量和参数
- [x] **dev 商品相关性抽查（2026-08-21）**：使用仓库幂等 seed 的 7 个代表性 SPU 回灌，不冒充生产客户数据；`降噪`、`咖啡`、`修护`、`无线鼠标`、`跑鞋`、`快速充电`、SPU code 与拼写容错 `Nespreso` 共 8 组 top1 正确，price=8999 与 sale_count=9 投影一致。已知 `苹果手机` 无法召回英文名称，后续用真实业务大样本补同义词/拼音评测集

### 可观测性「统一关联底座」评审新增待办（2026-08-06,全文见 `docs/reviews/OBSERVABILITY_REVIEW_20260806.md`)

> 该轮用集群真实数据 + 双模型对抗评审验证「五维统一采集·存储·查看·分析」目标。§234/236/237/238 四条**已被本轮实测复核确认仍未修**(尤其 §236 fluent-bit 标签,Loki 里 `k8s__pod_name` 就是 `.pod_name`,日志按 pod 下钻彻底不可用)。以下为**新查出的确认缺陷**:

- [ ] **可观测性 · PII 脱敏形同虚设(P0 安全)**:部署中 fluent-bit lua 手机号脱敏用 `(%d{3})%d{4}(%d{4})`,**Lua 模式不支持 `{n}` 量词**,匹配不上任何手机号=空操作;更严重的是 `Merge_Log On`+`Keep_Log On` 保留原始 `log` 明文字段,连有效的 email 脱敏也被绕过——完整未脱敏 JSON 整条进 Loki。且脱敏只碰顶层 `email`/`phone` 两键,漏掉 `payment/internal/server/logging.go` dump 的 `form_data`(交易/回调数据)、RUM 的 `user_id`/`session_id`、debug 日志里的 bearer token。改法:`Keep_Log Off` + 手机号用有效 pattern + 扩展脱敏字段名单
- [ ] **可观测性 · RUM 与后端 trace 无 join key**:前端 `packages/perf` 用 web-vitals + 手写 Connect-JSON,无 `@opentelemetry/*`、不透传 traceparent、后端不回 Server-Timing——慢 `frontend.api.duration` 无法关联到后端 span,`anon_id`/`session_id` 只在日志不在 metric/span。且只有 consumer 一个前端调 `initPerf`,merchant/admin/config 三个没接。设计声称的「前端→网关→微服务全链路」（见 `docs/observability/OBSERVABILITY.md`）前端那段不存在
- [ ] **可观测性 · 网关 5xx 被记成成功**:`tracing.go:81-90` 只在 `err!=nil`(传输层错误)时 `SetStatus(Error)`,后端返回 HTTP 503 但 `err==nil` → span 状态 OK、`logging.go` 记成 `LevelInfo`。Jaeger 错误检索、日志 error 级告警都漏掉真实 5xx。改法:按 `reply.StatusCode>=500` 设 span/日志级别
- [ ] **可观测性 · 网关采样口径与后端相反**:gateway `AlwaysSample()`(非 `ParentBased`),后端 `ParentBased`;网关是 trace 根永远 100% 采样,设 `sample_ratio` 也压不住,高峰会压垮 collector + 单副本 Jaeger。网关改 `ParentBased(TraceIDRatioBased)` 并统一读同一采样率
- [ ] **可观测性/安全 · 免鉴权入口身份可伪造**:gateway jwt 中间件命中白名单(`telemetry.v1/CollectWebVitals`、`behavior.v1/Track`)时直接 return 不剥离入站头,rewrite/remove-header 中间件在 config.yaml 全注释掉;`behavior/identity()` 又把 `x-md-global-user-id` 当可信源。攻击者带 `x-md-global-user-id:<受害者ID>` 即可冒名上报,污染统一口径身份基座。补一条入站 `x-md-*` 剥离中间件
- [ ] **可观测性 · 看板两处口径错**:①`build_infrastructure.py:133-139`「DB 错误率」= `(errors or count*0)` 画的是**错误/秒不是比率**,1 err/s 混在 10000 ops/s 里飘红误报,需除以操作总量;②`build_infrastructure.py:38-41` 节点覆盖 stat 阈值 ≥2 为绿、desc 说「node1 是 control-plane collector 不调度」——**实测已不成立**(collector/fluent-bit DaemonSet 现 3/3,VM 里 node1/2/3 各 32 条 system 序列),阈值应对齐 3 节点否则掉 1 节点仍绿
- [ ] **可观测性 · 事件/变更两维未采**:无 kube-state-metrics、无 k8s event exporter,Kubernetes 事件、Pod 状态、ArgoCD 变更历史/部署 marker 都不进面。CrashLoopBackOff+内存压力的发布事故无 event/restart 序列可查(与 §235 k8s 视角一并做)
- [ ] **可观测性 · 生产级 HA 缺失**:Jaeger(badger 本地盘)、VM(single 本地 PV)、Loki(single-binary)、Grafana 均单副本,承载卷节点故障时无法带数据漂移。整个可观测栈在 `cloud-native-deploy` 的 imperative `install.sh` 里、未纳 GitOps,节点上还手改过 loki values;`loki/helm/other/install.sh:51` 等处 MinIO 凭据明文进 Git
- [ ] **可观测性 · `OTEL_LOGS_EXPORTER: "none"` 是死配置**:该 env 无任何 Go 代码读(grep OTEL_ 零命中),`log.go` 无条件 `NewTee(stdout, otelOTLP)`。日志实际同时经 stdout→fluent-bit 和 OTLP→collector→Loki 两条路进 Loki,标签 schema 不兼容(`k8s__*` vs `service_name`),无单一 LogQL 覆盖全部日志。要么真接 autoexport 让该 env 生效,要么删掉误导性注释

### 基础设施 TLS 收敛（2026-08-08 实测盘点，清单见 `docs/design/platform/pre-environment.md`）

> 目标态是「每个基础设施都 TLS」。下面按**代价从低到高**排序，前两条是一次性小改动即可拿到大部分收益。
> ⚠️ 验收一律以**实测握手/协议响应**为准，不以 listener 配置表面状态为准——本段第 2、5 条正是
> 「配置看着对、实际不通/未启用」被实测揪出来的。

- [ ] **12 条基础设施 HTTPRoute 从 http listener 迁到 https**（一行改动一批，收益最大）：grafana / vm / kibana / es / kafka-ui(×2 hostname) / minio-api / minio-ui / jaeger-ui / jaeger-http / seata / consul-ui / argocd-server 目前全挂 `sectionName: http`（80 明文），改挂 `https` 即获得网关终止的 TLS（泛域名证书 `global-default-tls` 已覆盖 `*.dev.test`，无需新签）。**验收**：改前 `https://<host>` 返回 404、改后返回与 http 相同的业务响应；同时决定 80 listener 是保留（做 301 跳转）还是关闭
- [x] **修 dragonfly 网关路径：Terminate → Passthrough**（✅ 2026-08-20 随「缓存切回 dragonfly + 原生 TLS」整组解决：dragonfly 进程自身终结 TLS，网关重写为 TCP 6380 直通 listener（TCPRoute→svc:6379），Terminate 死路整组替换；见 kubernetes 仓 `components/dragonflydb/gateway/`）。~~现状 listener 是 `Terminate`，网关解密后把明文 redis 协议转给只收 TLS 的后端——这条路径是坏的~~
- [x] **CNPG 宿主网 TLSRoute（2026-08-24）**：postgres 安装器在 `pg-main-rw` 就绪后自动应用 Gateway + TLSRoute；dev VIP `192.168.3.132:5432`。宿主网以 SNI `pg.dev.test`、`verify-full`、direct TLS 实查 `ecommerce/app` 与 TLSv1.3；另留 TCPRoute 示例兼容旧客户端
- [ ] **公网明文端点（优先级高于所有集群内明文）**：casdoor `apikv.com:8000`（=114.132.233.129）承载 OAuth code/token 交换，**走公网 http**。node2（8.138.194.254）上的 minio 与 gorse 已于 2026-08-19 全部解决，见下条
- [x] **MinIO 上 TLS + 管理台收回内网（2026-08-19 完成）**：`8.138.194.254` 的 ssh 别名是 **`node2`（端口 34124，阿里云，与集群内 node2 `192.168.3.202` 重名但完全无关）**，同机还跑着 harbor 与 gorse。MinIO 是 docker 容器 `pgsty/minio`，compose 在 `/home/docker/minio/compose.yml`（**服务器侧是真相源**，备份 `compose.yml.bak-20260819`）。三处改动：①挂 node1 那张 ZeroSSL 泛域名证书 `*.apikv.com` 到 `/root/.minio/certs`——**宿主机侧必须自带空 `CAs/` 目录**，整卷挂载会遮蔽容器内原有结构，且挂 `:ro` 后 MinIO 无法自建（与 helm `db-ca-cert` 遮蔽系统 CA 是同一个坑）②9001 由 `9001:9001` 改 `127.0.0.1:9001:9001`，运维走 `ssh -p 34124 -L 9001:127.0.0.1:9001 node2` ③healthcheck 由 `mc ready local`（alias 硬编码 `http://localhost:9000`，启用 TLS 后必失败）改 `curl -fsk https://localhost:9000/minio/health/live`。**实测验收**：9001 公网 http/https 均 `000`、9000 明文 http 返 `400`、`https://minio.apikv.com:9000` **不带 `-k` 的严格校验** 200（证书 3 张链完整，SAN `*.apikv.com`+`apikv.com`，ECDSA P-256）
- [x] **node2 接入 Pangolin + 全部端口收回回环（2026-08-19 完成）**：⚠️ **先记住这条硬约束**——`8.138.194.254` 是阿里云机，`apikv.com` **未在阿里云备案**，任何经该域名访问本机的请求都被阿里云在网络层拦掉（HTTP 返 403 `Server: Beaver` + `<title>Non-compliance ICP Filing</title>`，HTTPS 直接 reset）。`harbor`/`img` 两个早就存在的子域同样被拦。**所以"给这台机的服务配域名+证书直连"这条路根本走不通，唯一解是让公网流量落到 node1 再经隧道回来**。做法：node2 装 newt 1.15.0（二进制 `/home/docker/newt/newt` + systemd `newt.service`，`systemctl link` 自 `/home/docker/newt/`，凭据在同目录 `newt.env` 权限 600，不入库），建站点 **siteId 5 `node2`**；建资源 `minio.apikv.com`(rid 16, SSO off, target `127.0.0.1:9000` https) 与 `gorse.apikv.com`(rid 17, **SSO on**, target `127.0.0.1:8088` http)。随后 minio 9000/9001、gorse 8086/8088 **全部改绑 `127.0.0.1`**。**实测**：四个端口公网均 `000`，`https://minio.apikv.com` 严格校验 200，`https://gorse.apikv.com` 302（被 SSO 挡住）
- [x] **gorse 恢复 + 自带鉴权（2026-08-19 完成）**：故障链是「**Redis 被停 → gorse 启动时 fatal**」：`node1:6379` 的 redis 容器 2026-08-18 15:40 被主动停掉（SIGTERM、退出码 0、正常存盘 36 keys，重启策略 `no` 不自愈），而此前 gorse 是 6 月启动的老实例，带着断掉的连接空转（`Ready:false`）才显得"还活着"——**一重启就再也过不了启动检查**，这类隐性故障只有在重启时才暴露。恢复后还差一步：redis/pg 起来了但 **node2 仍连不上 6379**，根因是**腾讯云 Lighthouse 防火墙没放行 6379**（5432 早就是 `0.0.0.0/0` 所以 PG 一直通）。已加规则但**锁定源 IP 为 `8.138.194.254/32`**（Redis 密码是 `msdnmm` 弱口令，绝不能对全网开），实测本机连 6379 超时、node2 连通、对照组 443 两边都通。gorse 侧同时配好自己的鉴权（`config.toml` 备份 `config.toml.bak-20260819`）：`[server] api_key`、`admin_api_key`、`[master] dashboard_user_name/password` 原本**全是空串**。**实测验收**：`Ready:true`（两个 store 都连上）；经 `https://gorse.apikv.com` 无 key/错 key 均 **401**、正确 key 404（鉴权已过）、Dashboard 未登录 302→`/login`、`verify=0`；IP 直连 8088 仍 `000`。SSO 已关（改由 gorse 自身鉴权），三份业务配置已切到 `https://gorse.apikv.com`
- [x] **彻底登出 + 修掉登录入口的两套机制混用（2026-08-19，本地实测通过）**：改动三处——①`logout()` 末尾跳 Casdoor 的 `end_session_endpoint`（`/api/logout`）②**必须带 `id_token_hint`**，缺了它 Casdoor 返回 `{"status":"error","msg":"Missing parameter: id_token_hint"}` 且**不结束会话**，页面还停在那段 JSON 上；为此把 `id_token` 一路接进 `TokenResult`→`setTokens`→`tokenStore`（同样只存内存），登出时**先取后清** ③`AppBar` 的登录按钮由 `window.location.href = getSigninUrl()`（casdoor-js-sdk 老路径，state 写进 `casdoor-state`、**不生成 code_verifier**）改为 `useAuthActions().login()`（PKCE）。**②③ 是两个独立的既有 bug，不是本次引入**：入口走 SDK、回调走 `exchangeCode()` 读 `oauth_state`/`oauth_code_verifier`，必然报「OAuth state 校验失败」——**线上同样是坏的**，只是开了「自动登录」的用户靠 `silentRenew` 直接静默登入，走不到那个按钮所以没暴露。**实测判据**（生产构建 + 全新浏览器）：登录成功 → 登出后自动跳回应用且未登录 → 刷新仍未登录 → **再点登录时 Casdoor 要求重新输密码**（最后这条才是「会话真的结束」的证据，前两条只能证明本地清理生效）
- [ ] **`restoreSession` 与 callback 的竞态**：`AuthProvider` 用 `router.state.location.pathname` 判断是否跳过 `restoreSession()`，但那要等 TanStack Router 初始化完，effect 首跑时可能还是 `/`，防护形同虚设。已改用 `window.location.pathname`（不依赖框架初始化）。**Casdoor 开「保持登录会话」后 `silentRenew` 更容易成功，这个竞态被放大**。改动已验证不影响登录，但没有回归测试守着
- [ ] **`e2e/login.smoke.mjs` 缺少隐私弹窗处理**：首页的 Privacy policy 模态会盖住顶栏，**点不到 SIGN IN**，脚本会在第一步就超时。本地实测必须先点 `Reject all`/`Accept all` 才能往下走。这条 e2e 至今没在 CI 里真跑过（secret 刚配上），跑起来第一次大概率就挂在这里
- [ ] **前端没进 GitOps（2026-08-19 记录，用户明确暂缓）**：`frontend/apps/consumer/deploy/` 下 7 份 manifest（`deployment/service/configMap` + `pre/` 四份）是手工 `kubectl apply` 的，不在 ArgoCD 里。而且**和线上对不上**：manifest 写 `harbor.apikv.com/ecommerce/frontend:dev`，线上实际跑 `ccr.ccs.tencentyun.com/sumery/ecommerce-frontend:sha-auth4`（deploy 名 `ecommerce-frontend-deploy`，ns `ecommerce`，revision 5）。镜像 tag 是手打的（`sha-bf8dae2`→`sha-csp1`→`sha-auth2`→`sha-auth4`），不是 CI 产物。**基础设施稳定后再收口**
- [ ] **接入企业微信告警（2026-08-19 探明拓扑与落点，只差凭据）**

  **① 先分清三个端，别配错地方**（版本都不同，很容易混）：

  | 端 | 是什么 | 发不发告警 |
  |---|---|---|
  | `grafana.dev.test` | **集群内** `observability` ns，**12.3.1** | ✅ k8s 侧发送方，已有飞书 contact point |
  | `192.168.3.210:3000` | Pigsty 自带，**13.1.3** | ❌ 实测 **0 contact point / 0 规则**，纯看板 |
  | `192.168.3.210:9059` | Pigsty **Alertmanager** 0.33.1 | ✅ 基础设施侧发送方 |

  ⚠️ Alertmanager 配置里那行 `wechat_api_url` 是它的**全局默认值**（指向 `qyapi.weixin.qq.com`），**不代表已配企业微信** —— receivers 实际只有 `default` 和 `feishu`。

  **② 两种企业微信形态，给的凭据不一样 —— 这是选型的关键分岔**：
  - **应用消息**（`corp_id` + `agent_id` + `api_secret`）：Alertmanager 的 `wechat_configs` **只吃这种**；Grafana 的 WeCom 也支持。**推荐**，两边统一且不必再引入转换层
  - **群机器人 webhook**：Grafana 能用，**Alertmanager 不能**（它发自己的格式，群机器人不认），只能经 PrometheusAlert 转换

  **③ 凭据获取步骤**（[work.weixin.qq.com/wework_admin](https://work.weixin.qq.com/wework_admin/)）：
  1. `corp_id`：「我的企业」→ 页面最下方「企业ID」
  2. 「应用管理」→「应用」→「自建」→「创建应用」，**可见范围决定谁能收到告警**；创建后详情页拿 **AgentId**，**Secret** 点「查看」会推送到手机企业微信
  3. ⚠️ **必须配「企业可信IP」**：应用详情 →「开发者接口」→「企业可信IP」→ 填 **`171.105.164.78`**（210 与集群 Grafana 实测是同一条家宽出口）。不配则调 API 报 `not allow to access from your ip`，**且该错误只在 Alertmanager 日志里，界面无感知**。这是家宽出口 IP，**会漂** —— 以后告警突然静默，先查它

  **④ 落点已就绪**（2026-08-19）：210 的 SSH 已通，**用户名是 `root` 不是 `sumery`**（用后者会被 publickey/password 拒）；配置在 **`/etc/alertmanager.yml`**（不是 `/etc/alertmanager/alertmanager.yml`，路径从 `ps -eo args` 的 `--config.file=` 反查），已备份 `.bak-wecom-20260819`。现有结构：`route` 下两条子路由（`severity="CRIT"`→feishu/4h、`severity="WARN"`→feishu/24h），receivers 只有 `default`/`feishu`。**改法**：加 `wecom` receiver，CRIT 那条路由用 `continue: true` 让它同时进飞书和企业微信，不动现有飞书链路。⚠️ 按 `context/team/local-env.md`，Pigsty 侧要**模板与已部署文件双改**，否则 `./infra.yml -t alertmanager` 重跑会覆盖回去

  **⑤ 仍缺**：企业微信三件套；**集群 Grafana（12.3.1）的 admin 密码**（用户此前给的 `FMU5...` 经实测是 210:3000 那个 13.1.3 的，对集群那个 401）

  **⑥ 验收不能只测「发得出去」**：造一条 `severity=CRIT` 的假告警，确认**同时**进飞书和企业微信；再造一条 `WARN`，确认**不**进企业微信 —— 否则路由条件没生效等于全量轰炸
- [ ] **告警链路已断：PrometheusAlert 转换层随 210 停机消失（2026-08-19 发现）**：`context/team/local-env.md` 记的链路是「k8s Grafana → PrometheusAlert(192.168.3.210:8080) → 飞书」，但 **210 已于 2026-08-19 停机**，实测 8080/9059/3000 全部不可达。集群里只有 Grafana（`observability` ns，12.3.1），**没有 alertmanager / prometheusalert**。所以飞书告警此刻发不出去，而且是**静默失败**（Grafana 侧只会在 UI 留错误）。Grafana 12 原生支持企业微信（`wecom` contact point）与飞书需要转换层不同，**接企业微信不必重建转换层**；但飞书那条要么把转换层迁到集群里，要么改用别的通道
- [ ] **`HELM_REGISTRY_PASS` secret 缺失**：`.github/workflows/frontend.yml` 的 chart 推送用 `helm registry login harbor.apikv.com -u rebot@github`，但仓库里只有 `MANIFEST_PUSH_TOKEN`/`TCR_*`/`CASDOOR_E2E_*`，没有这个。要在 harbor 里建机器人账号 `rebot@github` 并把 token 配成 secret，否则打 tag 后 chart 推送步骤必失败
- [ ] **给 Config Center 灌 gorse 的 api_key**：`backend/services/behavior/configs/{dev,pre}.yml` 与 `product/configs/pre.yml` 的 `api_key` 按硬规则 4 **保持空串**，但 gorse 侧鉴权已开——**KV 里不填真值的话业务调用会全部 401**。真值在 node2 的 `/home/docker/gorse/config.toml`
- [x] **node1 的 Redis 上 TLS + 强随机密码（2026-08-19 完成）**：`/home/docker/redis/conf/redis.conf` 改为 **`port 0` + `tls-port 6379`**（明文端口彻底关闭），证书复用本机那张 ZeroSSL `*.apikv.com`（`/home/docker/redis/tls/`，**属主必须是 uid 999**，redis 官方镜像以该用户运行，否则读不到私钥启动即失败）；`tls-auth-clients no` 时 Redis 仍强制要求 `tls-ca-cert-file`，用 fullchain 自身充数即可。密码换成 40 位随机（原 `msdnmm`）。客户端必须 **`rediss://` + 连 `redis.apikv.com`**——证书无 IP SAN，连 `114.132.233.129` 校验必失败。gorse 的 `GORSE_CACHE_STORE` 已切换，实测 `Ready:true` / `CacheStoreConnected:true` / `DBSIZE` 回升。**实测验收**：公网 TLS 握手 + 系统 CA 严格校验通过（TLSv1.2，SAN `*.apikv.com`）、明文连接收到 TLS Alert `\x15\x03\x03`、未认证 `PING` 返回 `NOAUTH`、错误密码 `WRONGPASS`
- [x] **公网 docker 端口随机化（2026-08-19 完成）**：全部改到 **>32767**（避开 k8s NodePort 的 30000-32767 段）。node1：redis `6379 → 61246`、postgres `5432 → 52288`（Lighthouse 防火墙同步迁移，**先加新规则再删旧规则**）；node2：harbor `5080 → 41311`、`5443 → 49600`（`harbor.yml` 与 `docker-compose.yml` **两处都要改**，前者供下次 `prepare` 用，否则会被覆盖回去）。gorse 的两个连接串已同步。**实测**：旧端口全 `000`、新端口可达、gorse `Ready:true`
- [ ] **⚠️ Redis 61246 目前对 `0.0.0.0/0` 开放（测试期，上线前必须收窄）**：用户明确要求测试阶段公网可达。虽有 TLS + 40 位随机密码 + 非常规端口，但公网 Redis 会被持续扫描，**且 `protected-mode no` 仍在**。收窄命令见 `context/team/pangolin-tunnel.md` 的 Lighthouse 小节，把 `CidrBlock` 改回实际来源（如 `8.138.194.254/32`）。postgres 的 52288 同理
- [x] **harbor 修复：换掉过期证书 + 经 Pangolin 暴露（2026-08-19 完成）**：浏览器报红有**两个叠加原因**，只修一个不够——①**证书早已过期**：harbor 用的是 `Apr 22 → Jul 21 2026` 那张（6 月放进去的），而 node1 上有效的是 `Jul 29 → Oct 27`；②**即使换新证书也还是红**：`*.apikv.com` 证书配 IP 访问必然域名不匹配，而域名访问又被阿里云 ICP 拦截。所以真正的解法是走 Pangolin：资源 `harbor.apikv.com`(rid 18, SSO off——docker login 过不了 SSO, target `127.0.0.1:49600` **https**；41311 是 http 会 308 跳转，用它会把浏览器导回被拦的地址)，并删掉 `harbor` 的 DNS A 记录让它回落泛解析到 node1。**证书要放两处**：`harbor.yml` 指定的 `ssl/`（原本是空目录，`prepare` 会从这里取）和 `data/secret/cert/`（实际生效的副本）。**实测**：`https://harbor.apikv.com` 严格证书校验通过、HTTP 200、`/v2/` 返回 401（registry API 正常）。仓库里 6 处 `harbor.apikv.com:5443` 引用已同步改为不带端口
- [ ] **node1 的 PostgreSQL 5432 对全网开放且仍是明文 + `msdnmm` 弱口令**：比 Redis 更糟（Redis 至少已上 TLS+强密码）。同一张 `*.apikv.com` 证书可直接用于 PG 的 `ssl_cert_file`，改法参照上面 Redis 那条；密码也该一并轮换
- [x] **修掉 node1 Redis 无持久化卷的隐患（2026-08-19）**：compose 原本只挂 `./conf`，**RDB 落在容器可写层**，`docker compose up --force-recreate` 一重建就丢——2026-08-19 已因此丢过一次 gorse 的 36 个缓存 key（可重建，无实质损失，重启后已回升到 28）。已加 `data:/data` 具名卷
- [ ] **Config Center 的 cart KV 同步 MinIO 新端点**：仓库副本 `backend/services/cart/configs/{dev,pre}.yml` 已改为 `https://minio.apikv.com`（**443，不带 9000**——入口是 Pangolin 的 Traefik），但 KV 是另一份（「三份配置对齐」的教训）。灌之前先 `curl https://minio.apikv.com/minio/health/live` 确认隧道在
- [ ] **证书续期现在是三处同步**：`*.apikv.com`（ZeroSSL，**2026-10-27 到期**）部署在 blog ssl / pangolin traefik certs / node2 的 `/home/docker/minio/certs`，而 node1 续期链路缺位（见 `context/team/pangolin-tunnel.md:26`）。影响面有别：前两处过期会让**所有** Pangolin 资源挂（blog/config/casdoor/minio/gorse 全部），node2 那份因 Traefik 侧 `insecureSkipVerify` 过期也不影响转发——**但别因此忘了它**
- [ ] **Consul 启用 TLS**：8501/HTTPS 未启用、gossip `encrypted=false`。**连带修复**：`backend/services/*/deploy/prod/` 全部写着 `CONSUL_ADDR=consul-server.consul.svc:8501` + `CONSUL_SCHEME=https`——**这个端点不存在**，prod 清单照此起不来（与 known_gaps 里「prod.yml 键不存在」是两个独立断点）
- [ ] **Elasticsearch 恢复 HTTP 层 TLS**：ECK 的 `spec.http.tls.selfSignedCertificate.disabled=true`，是被主动关掉的；打开后 search 服务的客户端配置需同步（CA 或 skip_verify）
- [ ] **Kafka 启用 9093 TLS listener**：Strimzi 已定义 `tls:9093`（`tls=true`，Strimzi 自签 CA）但无人使用，现用 `plain:9092`。Kafka 客户端代码为 0，**接 Kafka 时直接从 9093 起步**，别先接明文再改。两个 listener 都是 `internal` 型、无外部入口；将来若需外部访问，走 TLSRoute Passthrough 而非新开 LB
- [ ] **清理两个僵尸 LoadBalancer（占 IP）**：`default/dragonfly`（192.168.3.113，无 endpoint，实测 nc 拒绝——deploy 实际在 dragonfly ns，default 只剩 svc 残留）、`kube-system/cilium-ingress`（192.168.3.108，集群内**没有任何 Ingress 资源**）
- [ ] **统一 cart `pre.yml` 的 OTel exporter TLS 口径**：三个 exporter 的 `tls.insecure_skip_verify` 写成 false/true/false 三处不一致，而端点是集群内明文 `otel-collector.observability:4318`——需统一并核对 exporter 在明文端点下对该字段的实际行为
- [ ] **（观察项）dragonfly 重启历史**：旧集群曾 57 天重启 32 次；2026-08-20 转正为缓存主力（原生 TLS 新 Deployment）后基数清零重新观察——排查 redis 相关问题时仍先看它的重启历史，别默认它一直在线

### 评审对既有证据的订正

- 上一轮认为「基础设施盘 Loki 面板 `{service_name=~".+"}` 只能看到 0.05% 的 OTLP 流」**方向反了**:实测 Loki `service_name` 值就是 `"kube-logs"`(从 `job` fallback),`.+` 匹配得上主体(约 99.9%);真正缺陷是 §236 的坏 `k8s__*` 标签,不是「面板几乎空」
- 「代码里完全没有 exemplar」措辞过强:OTel Go SDK v1.45 默认启用 trace-based exemplar filter,但 VM 数据源 + Grafana 未配 exemplar 导航,查询层做不到 metric→trace 跳转,实际结论(无法跳转)仍成立

---

## 四、实施路线

### 分阶段迭代实施策略

采用敏捷迭代模式，先核心后扩展，分四个阶段落地，保障业务快速闭环，同时控制技术风险：

第一阶段：核心业务 MVP

- 核心目标：完成电商核心交易闭环，实现可上线的最小可用版本
- 核心工作：
  1. 完成基础设施搭建：Kubernetes 集群、PostgreSQL 集群、Redis 集群、Kafka、可观测性组件部署
  2. 落地 6 个核心微服务：认证服务、商品服务、订单服务、支付服务、库存服务、搜索服务
  3. 完成核心交易流程：商品浏览→下单→支付→订单状态同步全流程打通
  4. 前端用户端核心页面开发：商品详情、购物车、下单、支付、订单列表
- 交付成果：可上线的 MVP 版本，支持用户完成完整的购物流程

第二阶段：商家与平台能力落地

- 核心目标：完成 B2B2C 平台核心能力，支持商家入驻、运营，平台管理
- 核心工作：
  1. 落地商家服务、履约服务、结算服务三个扩展微服务
  2. 完成商家后台开发：商品管理、订单履约、售后处理、财务结算
  3. 完成平台管理后台开发：商家审核、类目管理、订单仲裁、平台配置
  4. 完善 RBAC 权限体系，实现商家、管理员的细粒度权限管控
- 交付成果：完整的 B2B2C 平台版本，支持商家入驻运营，平台统一管理

第三阶段：性能优化与高可用加固

- 核心目标：优化系统性能，完善高可用架构，支撑高并发流量
- 核心工作：
  1. 全链路压测，优化慢查询、性能瓶颈，达到预设的 QPS/TPS 目标
  2. 完善多级缓存架构，提升缓存命中率，降低数据库压力
  3. 完善限流熔断、弹性扩缩容机制，应对流量波动
  4. 完善可观测性体系，补全监控指标、告警规则、链路追踪
- 交付成果：高性能、高可用的生产级版本，可支撑大促峰值流量

第四阶段：营销与扩展能力落地

- 核心目标：完善平台营销能力、数据分析能力，提升平台竞争力
- 核心工作：
  1. 落地营销服务、数据分析服务两个扩展微服务
  2. 实现优惠券、满减、秒杀等营销活动能力
  3. 完成数据分析平台搭建，实现商家经营报表、平台运营报表
  4. 完善搜索推荐能力，实现个性化推荐、智能搜索
- 交付成果：具备完整营销能力、数据分析能力的全功能平台版本

### 技术风险与应对方案

| 风险类型       | 风险描述                         | 应对方案                                                                                                 |
|------------|------------------------------|------------------------------------------------------------------------------------------------------|
| 库存超卖与数据不一致 | 高并发下单场景下，库存扣减异常，导致超卖、库存数据不一致 | 1. 采用 Redis 分布式锁 + PostgreSQL事务行锁双重保障；2. 所有库存扣减 SQL 添加库存校验条件；3. 库存操作全链路流水记录，支持对账与补偿；4. 定期库存对账，修复数据差异 |
| 支付状态不一致    | 支付回调异常，导致订单支付状态与第三方支付状态不一致   | 1. 支付回调验签 + 幂等处理，避免重复回调异常；2.主动轮询查询支付状态，作为回调的兜底方案；3. 每日自动对账，修复状态差异；4. 支付状态变更通过事件驱动，保证各服务数据同步          |
| 大促峰值流量过载   | 秒杀、大促场景下，流量突增导致系统响应慢、甚至宕机    | 1. 采用 Kafka 实现请求削峰，同步转异步；2.多级缓存架构，热点数据全缓存，避免请求打穿到数据库；3. 全链路限流熔断，保护核心服务；4. 基于 K8s 实现弹性扩缩容，快速应对流量增长    |
| 微服务复杂度失控   | 微服务数量过多，服务间依赖复杂，导致运维、迭代难度提升  | 1. 严格遵循 DDD 领域边界划分，避免微服务过度拆分；2.采用事件驱动架构，解耦服务间依赖；3. 统一的代码规范、工程结构，降低维护成本；4. 完善的可观测性体系，快速定位问题           |

## 建议

1. 代码规范与工程化：统一前后端代码规范、工程结构，通过 CI/CD 流水线实现代码门禁、单元测试、自动部署，保障代码质量，避免技术债务累积。
2. 先闭环后优化：优先完成核心交易闭环，再逐步优化性能、扩展功能，避免过早优化导致的开发周期延长，快速验证业务模式。
3. 全链路压测前置：每个阶段上线前，都需要进行全链路压测，提前发现性能瓶颈、隐藏 bug，避免线上故障。
4. 数据备份与灾备：核心数据定期备份，制定完善的故障恢复预案，定期进行故障演练，保障数据安全与系统可用性。
5. 文档同步维护：维护完善的架构文档、API 文档、数据库设计文档，同步更新，避免文档与代码脱节，降低团队协作成本。

---
## 五、会话记录（已归档）

2026-08 配置中心迁移与 Cart 灰度的会话问答记录已移入 [证据归档](docs/progress-archive/2026-08-21-todo-evidence.md)。
此后会话记录不再进入本文件——按日期归档到 `docs/progress-archive/`。
