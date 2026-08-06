# 项目实现进度与待办

> 依据 `README.md` 的目标与 `Design.md` 的架构设计，对照当前代码实现整理。
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　⬜ 未开始

---

## 一、实现进度对照

### 1. 基础设施与工程化

| 项目 | 状态 | 说明 |
|------|------|------|
| 容器化（Docker） | ✅ | 10 个服务的 Makefile/compose 已对齐（见下「构建与部署清单对齐」）；`make docker-deployx` 多架构构建+推送实跑通过 |
| Kubernetes 编排 | 🟡 | `deploy/{dev,prod}` 已重写并过 `kubectl apply --dry-run=client`；`helm/`、`application-vpa.yml` 已有，集群级压测/弹性未验证 |
| GitOps（ArgoCD） | 🟡 | `argocd-app.yml`、`argocd-proj.yml` 已配置 |
| CI/CD（GitHub Actions） | 🟡 | `.github/workflows/backend.yml`、`frontend.yml` 已有，制品推送/清单更新链路待完善 |
| 注册发现（Consul） | 🟡 | `consul-kv.json`、配置中心接入已有 |
| 提交规范（commitlint + vite-plus 钩子） | ✅ | 仓库根 `package.json` 只装 `@commitlint/cli` + `config-conventional`，规则在 `commitlint.config.mjs`：Angular 十一类 type + 可选 gitmoji（带了就必须与 type 相符）+ subject 末尾禁标点。钩子由 **vite-plus** 安装（`frontend/package.json` 的 `prepare: vp config` → `core.hooksPath = frontend/.vite-hooks/_`），husky 已删；`core.hooksPath` 是仓库级设置，后端 Go 的提交同样受管。**此前从 2025-11-04 到 2026-08-02 整整九个月一次都没生效**，层层叠了五处：①`.husky/commit-msg` 里放的是**创建钩子的那条安装命令本身**（`echo "..." > .husky/commit-msg`），每次提交只把自己重写一遍就退出 0 ②它写出的那行里 `–` 是全角连字符、`--no` 是 pnpm 11 已废弃的 exec 参数 ③`@commitlint/cli` 从未出现在任何 devDependencies ④`apps/consumer/.commitlintrc.cjs` 的 `rules: {}` 是空的且无 `extends` ⑤2026-03-19 迁移到 vite-plus 时 `vp config` 的接管守卫看到 `frontend/.husky/_` 选择 skipping，`core.hooksPath` 从此指着一个已删除的目录。2026-08-02 修复并用四条故意写错的消息验证过拦截；cz-git 从未真正引入，不再提 |
| 代码规范（oxlint + oxfmt，vite-plus 内置） | 🟡 | biome 在 2026-03 迁移时已被 vite-plus 自带的 oxlint + oxfmt 取代。`vp lint` / `vp fmt` 此前因四个成因全挂（tanstackRouter 相对路径、`typeAware` 写在 app 层、九个 tsconfig 的 `baseUrl` 被 TS7 判为 Invalid、`vite-plus-core` 装了 0.1.24/0.2.7 两份导致类型重复），2026-08-02 修好，`pnpm ready` 端到端可跑；全仓跑过一次 oxfmt。仍缺：CI 门禁未接入，48 条 warning 未清 |
| 结构性门禁（`backend/structcheck`） | 🟡 | 2026-08-07 新增，随 `go test ./...` 进 CI。四项检查：`.service-matrix.yaml` ↔ `backend/services/` 目录双向对齐（`config` 撞名进程列为已知例外）、matrix 内部一致性（discovery/gateway_prefix 非空唯一、depends_on 指向已知服务）、matrix ↔ 网关实际接线（`gateway/configs/config.yaml` 的 endpoint path 与 `discovery:///` target 双向核对）、10 服务 `internal/pkg` 同构性（服务自身目录名归一化后同名文件必须字节一致）。**实测存量漂移 14 个文件**已记入 `homogeneity_baseline.txt`（棘轮：新漂移即红，收敛后删行），最严重的是 `registry/consul.go` 8 个变体——address 的 Consul check 空指针防护没同步到其余服务、`log/log.go` 4 个变体。**待办：按基线逐个文件收敛（挑对的版本同步到全部服务），清空后删除基线文件** |
| 统一可执行 runbook（`context/team/runbook.md`） | ✅ | 2026-08-07 新增，把「规则与限制」命令化,供 Codex 等 CLI 直读直跑:动手前必读的限制(拓扑查 matrix、10 服务同构、proto 先读设计、凭据不入库、不可逆动作)+ 提交前验收锚点(`go build/vet`、`structcheck -count=1`、`go test -short`、`pnpm ready`、`verify-freeze`)+ 冻结/双审/提交流程。**不是新真相源,冲突以 `context/`/`.service-matrix.yaml`/`TODO.md` 为准**。Codex 只自动读 AGENTS.md,故两份 AGENTS.md(根+ecommerce,已同步)内联了 5 条锚点命令 + 指针,并挂进 `context/team/INDEX.md` |
| harness 瘦身（AGENTS.md / context） | ✅ | 2026-08-07，参照 Anthropic/OpenAI 2026 的「减法」prompting 指引：AGENTS.md（根 + ecommerce 两份同步）「项目速览」改为「反直觉约定」，删掉读代码即可发现的技术栈/架构复述；硬规则 #1 从路径规定改写为「真相源冲突裁决」判据；新增硬规则 #6 不可逆动作（commit/push/合入/deploy/仓外写删）只能由用户明示触发、subagent 永不执行；PROGRESS/TODO 分工成文 `context/harness-framework/progress-and-todo.md` |
| AI 异构双审（Claude + Codex） | 🟡 | 2026-08-07 评估过 CI 方案(`.github/workflows/ai-review.yml` + 两家 App + secret),因单人流程过重**已取消**该文件。改为**本地按需**做异构双审:push 前对着 diff 跑 `/adversarial-review`(隔离 fresh Claude + Codex,已验证合并),核心改动走、小改动跳。无需 GitHub App / secret / CI |
| 冻结验收集门禁（Frozen Nodes） | 🟡 | 2026-08-07 新增，服务于 Graph Engineering 多闭环工作流的「改考题必须走审批」防线。`scripts/freeze.sh <feature> <测试路径...>` 把一组验收测试的内容哈希锁进 `.freeze/<feature>.sha256`（+`.meta` 记 commit/时间）；`scripts/verify-freeze.sh [--all\|<feature>]` 比对工作区与清单,内容变→DRIFT、删/移→MISSING,均退出码 1。新 CI `.github/workflows/freeze-check.yml` 在每个 PR/分支 push 跑 `--all`（与只在 tag 触发部署的 `backend.yml` 分开）。两层防线:CI 拦「偷改测试但没刷新清单」的静默漂移,`.github/CODEOWNERS`（`/.freeze/` + 三个脚本本身）+ `/adversarial-review`「diff 动测试即标红」拦「明改」。脚本兼容 bash 3.2(macOS)与 ubuntu(sha256sum/shasum 双回退),已自测 OK/DRIFT/MISSING/空目录四态。**已 PR #1 合入 github/main、CI 跑绿,并对 main 加分支保护(必需检查 `verify-freeze` strict、code-owner 审批已开、`enforce_admins=false` 不锁死);另补 GitLab 侧 `.gitlab-ci.yml` freeze-check job**。**待办:①本仓 origin 是 GitLab,`.gitlab-ci.yml` 要推到 GitLab 才在那侧生效;②单人仓下 code-owner 审批需第二身份(协作者/bot)才真正强制,现阶段你作为 admin 始终能兜底;③给某核心模块建第一份真实冻结集当范例(如 order/inventory 的验收测试)** |
| DevOps 体系设计（`DEVOPS.md`） | ⬜ | 2026-08-07 新增设计文档 `DEVOPS.md`：以 Three Ways/CALMS/DORA 为骨架、DevOps 边界对齐 DDD 限界上下文，含现状盘点（与本表对齐）与四个落地阶段——①可重复构建（CI 模板化、路径触发、buf breaking、镜像禁 latest+trivy）②可重复交付（GitOps 全链路接管、同 digest 晋级、migration 流水线、副本/PDB 按集群现实分型）③看得见（OTel 全链路、`service.namespace` 唯一标签、SLO+错误预算）④快而不破（契约测试常态化、DORA 四指标自动采集、gitleaks/NetworkPolicy）。每阶段附行为验收标准（实测行为而非配置表面状态）。**状态：设计定稿、实现未开始；实现时逐项回填本表**。文档留在仓库根（就近原则），已在 `context/INDEX.md` 新增「工程体系文档」段登记指向，不复制内容 |
| 可观测性方法论与指标基线（`observability/OBSERVABILITY.md`） | 🟡 | 2026-08-07 新增文档：三支柱分工（Metrics 发现 → Trace 定位 → Logs 看错误）、RED/USE 方法论、每个 Go 服务的最低指标配置（RED 四项、Goroutine/GC/Heap、pgx pool wait、Redis 命中率联动 DB QPS、Kafka Lag 预留）、第一批 7 条告警清单、6 条硬规则（唯一标签防 config 撞名、错误率画比率、控基数、凭据不入日志、告警按注入故障实测验收、监控随功能同一 PR 上线）。判据：**指标异常时答不出「该做什么」的不采**。🟡 依据：采集侧主体已存在（OTel→VM/Loki/Jaeger 端到端、11 服务同构基线），**文档列出的告警 0 条、网关无 meter、collector 自身无监控、无 k8s 对象指标均未落地**（与 `OBSERVABILITY_REVIEW_20260806.md` 一致），落地走 `DEVOPS.md` 阶段 3。文档留在 `observability/`（与看板脚本、评审报告同目录），已在 `context/INDEX.md` 登记指向 |

### 2. 后端微服务（核心）

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| 用户认证 user | 🟡 | `SignIn`、`UserProfile` | 令牌刷新、登出、多端会话、第三方登录适配 |
| 商品 product | 🟡 | `GetProductDetail`（SPU/SKU） | **`ListProducts`（首页无限滚动/游标分页）设计已定，见 Design.md，待落地**；上下架、类目/品牌管理、`ProductChangedEvent` 同步 ES |
| 购物车 cart | 🟡 | `GetCart`、`AddProductToCart`、`RemoveCartItem`、`UpdateCartItemQuantity` + MinIO 缩略图 URL（`GetCartSummary` 已于 2026-08 删除，见下） | **`RemoveCartItem`/`UpdateCartItemQuantity` 前端未接线**（删除/改数量只动本地 store，刷新就回来）；`AddProductToCart` 的 `shop_name` 缺字段导致必然失败；选中态服务端持久化（如需） |
| 订单 order | 🔴 | `CreateOrder`(**假成功桩**)、`CompleteOrder`(**不落库**) | ❗**`CreateOrder` 不是普通的桩，它返回假成功**：service 层把 `req` 整个注释掉、硬编码 `CartItemIDs: nil, AddressID: 0`（`internal/service/order.go:31`），application 层直接 `return &domain.CreateOrderResponse{}, nil`（`application/order.go:61`）——而**结算页已真实接线**（`checkout/index.tsx:110` 调 `mutateAsync` 后跳支付页），用户会看到「下单成功」但系统里没有订单、购物车未清、库存未占。**先改成显式 `CodeUnimplemented` 止血**（学 payment 的做法），再实现主体；❗**`CompleteOrder` 的持久化是空的**：`SaveOrder` 只打一行 debug 日志就返回 nil（`internal/data/order.go:83`），`OrderCompleted` 事件却照发；`CompleteOrderResponse.Order` 还是零字段空 message（`api/order/v1/order.proto:28`）；service 层把 application 的 CodeNotFound 重包成 CodeInternal（`service/order.go:63`），违反本仓的错误分层规范。此外仍缺：`CreateOrder` 主体（幂等/核价/拆单/取地址快照/同步 Reserve/事务落库）；proto 待补 `CreateOrderRequest.requestId`(幂等键) 与 `CreateOrderResponse.orderNo/payAmount/payDeadline`；订单查询/列表、取消、状态机、`OrderCreated/Paid/Cancelled` 事件；`UpdateOrderStatus`/`SaveOrderLog` 仍是 panic |
| 支付 payment | 🟡 | 5 个 RPC 均为**桩**（显式返回 `Unimplemented`），服务可启动/注册/健康检查，网关 `/payment*` 已通 | **repo 主体待恢复**：原实现依赖已移除的 balance/consumerOrder client（保留在 `data/payment.go` 注释块）；支付宝凭据（`pay.alipay.*` 在 KV 里是空占位）；退款、幂等/验签加固、每日对账、`PaymentRefundedEvent` |
| 库存 inventory | 🔴 | **无可用 RPC**（`Reserve`、`ReleaseReserve` 均已挂载但不可用） | ❗**`Reserve` 静默无操作**（`internal/data/inventory.go:52`，四处叠加：①传 `Version: stock.Version+1` 而 SQL 是 `AND version = @version`，WHERE 比对未来版本号→**永远命中 0 行**；②`_, reserveErr :=` 丢弃 `:execrows` 行数，0 行不报错；③`Quantity: stock.Available-item.Quantity` 传给 `available = available - @quantity`，语义颠倒；④错误分支传恒为 nil 的 `err` 而非 `reserveErr`，真失败返回 `(nil,nil)`）——净效果是**返回成功、库存不变、change_log 写入伪造流水**，注释声称的事务/回滚并不存在（无 `ExecTx`，`FOR UPDATE` 在自动提交下失效）。接上下方「建单同步 Reserve（TCC-Try）」即必然超卖；❗**`ReleaseReserve` 是 `panic("implement me")`**（:88），接上取消/超时补偿即每单必炸。此外仍缺：扣减确认/回补、库存流水与对账、不足预警事件、Redis 分布式锁 |
| 搜索 search | 🟡 | `Search`（ES + OTel） | CQRS 读写分离、商品数据实时同步、聚合筛选/智能排序、热门词 |

### 3. 后端微服务（支撑）

| 服务 | 状态 | 已实现 | 主要缺口 |
|------|------|--------|----------|
| 地址 address | 🔴 | CRUD + `SetDefaultAddress` + `ListAddresses`（功能齐全，**但全线越权**） | ❗**安全 BLOCKER**：`Get/Update/Delete/SetDefault` 的 SQL 只按 `address_id` 过滤、无 user 归属校验，`CreateAddress` 的 `user_id` 直接取自请求体（`internal/service/address.go:26,71,84,95`）；网关又整段放行 `p, consumer, /address.v1.AddressService/*`（`gateway/configs/policies/policies.csv:3`）——任何登录用户拿到或遍历到他人地址 UUID 即可读改删其隐私地址。修法：user 一律取自网关注入的身份头，所有查询加 `AND user_id = ?`，网关策略收敛到 RPC 粒度 |
| 商家 merchant | 🔴 | 仅 `Submit`/`Get` 可用 | ❗**`ApproveApplication` 的 SQL 没有 WHERE 子句**（`internal/data/queries/merchant.sql:23`），repo 层还丢弃了 `ApplicationId`（`internal/data/merchant.go:23`）→ **批准一份申请 = 把所有待审申请一起改成 approved**，并覆盖上这一份的审核意见与时间戳；❗`RejectApplication`/`ActivateMerchant` 是 `panic("implement me")`（`internal/service/merchant_service.go:57,98`）——网关已把这两条按 RPC 粒度放行给 admin，调用即 panic。此外仍缺：店铺信息管理、商品运营权限、发货/售后、结算账单 |
| 履约 fulfillment | ⬜ | — | 发货/物流轨迹、第三方物流对接、售后履约 |
| 结算 settlement | ⬜ | — | 佣金计算、结算单、财务对账 |
| 营销 marketing | ⬜ | — | 优惠券、满减、秒杀、会员/积分 |
| 数据分析 analytics | ⬜ | — | 指标计算、行为分析、经营报表 |
| 行为/推荐 behavior | 🟡 | `Track`、`Recommend`、`SimilarItems`（编译通过；gorse 侧语义与 product 目录同步已实测，服务本身待起） | 上传带 `recommend:` 的 Consul KV `ecommerce/behavior/dev.yml` → 起服务端到端验证；用户画像（`/api/users` labels）暂未投喂 |

### 4. 网关与 RBAC

| 项目 | 状态 | 说明 |
|------|------|------|
| 网关（身份验证/授权/路由守卫） | 🟡 | `gateway/` 已实现，集中式 Casdoor 鉴权 + 策略文件；10 条 endpoint 全部落地（`/user* /search* /product* /cart* /address* /config* /order* /inventory* /merchant* /payment*`）。远端 `ecommerce-gateway:latest` 此前是旧镜像（仍去 KV 找 `rbac/policies.csv`，而代码常量早已改为 `policies/`），启动即 FATAL —— 已重新多架构构建推送并用 `docker compose up` 拉真实远端镜像验证：10 条路由全建起、7 条鉴权路由 401、支付宝回调 200+code 12、未定义前缀 404 |
| 网关服务发现恢复 | ✅ | Consul watcher 改为后台初始化，`Next()` 失效后按阶梯退避重建；生命周期与单个路由 applier 解耦，配置热重载关闭旧 client 不再误杀共享 watcher，最后一个 applier 清理后才停止。consumer 查询仅对 `Unavailable` / `DeadlineExceeded` 延迟 300ms 重试一次，避免瞬时 503 被放大为多次 POST。`make dev` 实测发现 `user-identity` 并在热重载后复用缓存；`go test -race ./client` 覆盖 watcher 断线恢复与旧 context 取消场景 |
| 「刷新几次才出数据」的真实根因 | ✅ | 上一条修好了 watcher，但**首屏仍要刷几次** —— 因为真凶不在网关而在服务注册侧：Consul TTL check 注册后的初始状态是 **critical**，而 `TtlCheckPinger` 进 `for` 循环前**先等一个完整的 `ping_interval`（KV 里是 25s）**才发第一次 `UpdateTTL(pass)`；kratos consul registry 用 `passingOnly=true` 查询，于是每次后端启动都有一段 **25 秒「已注册但对外不可见」的盲窗**，网关拿到空节点列表 → `ErrNoAvailable` → 503。用户日志正好坐实：ttl pinger 起于 `00:50:37.264`，首个 RPC 完成于 `00:51:02.526`（25.3s）。修复分四层：①**注册后立即补一次心跳**（11 个服务的 `internal/pkg/registry/consul.go`，pinger 块此前 11 份字节全同），盲窗压到 0，新增 `pinger_test.go` 3 例（先对旧代码跑红：「3s 内没有收到首次心跳」）；②**Consul KV 参数**：`ping_interval` 25s→10s（原值只比 `duration` 少 5s，网络抖一下就掉出 passing）、`deregister_critical_service_after` 6s→**1m**（Consul 对该字段有 1 分钟硬下限，写 6s 会被静默钳制，等于配置在骗人），11 份 `dev.yml` 与 8 份 `pre.yml` 全部更新并读回校验（改前已全量备份 25 个 key 到仓库外；两个环境的值和注释逐字一致）；③**网关内层重试 `defaultMaxRetries` 3→1**：它无延迟、无退避、无条件判断，与路由 `retry.attempts: 2` 相乘等于一个浏览器 POST 最多打上游 6 次，而 ConnectRPC 全是 POST、无幂等保证；④**删掉 15s 兜底轮询 `startRefreshLoop`**（watcher 修好后它只剩害处：刷屏 WARN、并发写 picker、其 Callback 把健康检查失败计数清零）并把 `healthChecker.updateNodes` 从「全删再全加」改为 **diff 语义** —— 原实现让服务发现每推送一次就赦免所有节点，`maxFailures` 永远攒不满，`HealthyNodeFilter` 形同虚设，新增 `health_checker_test.go` 3 例（旧代码 2 例红） |
| 成功调用被记成 `rpc.code: "unknown"` | ✅ | 11 个服务的 `internal/server/logging.go` 都在 `err != nil` 分支之前就算好了 `fields`，而 connect 的 Code 常量从 1 开始、**没有 `CodeOK`**，`connect.CodeOf(nil)` 返回的是 `CodeUnknown` —— 每一次成功调用在日志和 span 属性里都记成 `unknown`，按 `rpc.code` 做的看板与告警全部失真。成功路径改为显式记 `"ok"` |
| 前端购物车重复请求 | ✅ | `useCartBadge`（走 `GetCartSummary`）与 `useCart`（裸 `useEffect` + `isMounted`，只挡了 `setState` 没挡请求，StrictMode 下双发）各拉各的，购物车页一次挂载打 4 个 POST。合并到同一个 TanStack Query `["cart","items"]`（`staleTime` 10s，重试交给 QueryClient），一次挂载 1 个请求；加购后 `invalidateQueries` 让徽标即时刷新。徽标数值不变已核对：`GetCartSummary` 的 SQL 是 `COUNT(*)`（行数，非件数），两个 handler 都按 `CartStatusActive` 过滤，故 `items.length` 与原 `totalCount` 等价。**`GetCartSummary` 已于 2026-08 整条删除**（proto/service/biz/data/sqlc 全链），因为 `GetCartResponse.cart_item_quantity` 在 `data/cart.go` 里就是 `len(rows)`，与它返回的是同一条查询的同一个数——同一个数有两个来源迟早对不上 |
| RBAC 三角色（消费者/商家/管理员） | 🟡 | 策略模型（model.conf/policies.csv）已有；order/payment/merchant/inventory 已按 **RPC 粒度**授权（避免整段 `/svc.v1.*` 放行导致的越权），其余服务仍是整段放行待细化 |
| Casdoor 集成 | 🟡 | 登录/令牌解析打通，权限适配持续完善 |

### 5. 配置中心（Config Center）

> 设计文档见 `CONFIG_CENTER_DESIGN.md`。以 Postgres 为数据源、键值粒度、Casdoor 鉴权、玻璃态前端。

| 项目 | 状态 | 说明 |
|------|------|------|
| 设计文档 | ✅ | `CONFIG_CENTER_DESIGN.md`：架构/数据模型/RPC/鉴权/校验/玻璃态/路线图 |
| 后端 config 服务 | ✅ | 已迁往独立仓 `github.com/lens077/config-center` 并发布 `v0.1.0`：保留原 Postgres schema，服务自身改由本地 `CONFIG_FILE` 自举，Consul 仅服务发现；主仓旧服务及重复 Config API 已退役，所有服务和 `config-seed` 使用独立模块契约 |
| 网关接入 config | ✅ | `gateway/configs/config.yaml` 新增 `/config* → discovery:///config-service`;`policies.csv` 新增 `p, admin, /config.v1.ConfigService/*, POST, allow`;已同步 Consul KV,网关热重载并发现 config-service |
| 网关/前端错误层统一 | ✅ | 网关侧新增 `gateway/errors/{response,mapping,cors}.go`:404/405/无可用节点/超时等**非业务错误也按 Connect 规范**回 `{code,message,details[]}` + `X-Error-Reason` 头 + `Access-Control-Expose-Headers`(跨域下前端才读得到该头);`proxy.go` 的散装 `writeError` 收敛到统一实现。前端侧新增 `packages/api/src/errors.ts` 的 `toAppError(e) → {code,codeName,reason,message,metadata,raw}`:**message 保证非空**(空 message 会让 connect-web 整个错误体退化成「未知错误」),并区分 `AUTH_REASONS`(退登)与 `PERMISSION_REASONS`(仅提示,不退登)——原先无差别退登会把「无权限」误判成「未登录」。`ErrorHandler.tsx`/`interceptors/error.ts` 改用该层,config 前端删掉 `String((error as Error)?.message)` 的兜底 hack。测试:`gateway/errors/response_test.go` + `gateway/proxy/error_response_test.go`(不重启在跑的网关,用 `httptest` 直打 handler,断言 details 的 `type`/`value` 非空——为空会被 connect-web 的 `errorFromJson` 静默丢弃) |
| 网关 JWT 时钟容差 | ✅ | `gateway/middleware/jwt/jwt.go` 增加 `jwt.WithLeeway(60s)`:修复登录后毫秒级请求因 `nbf` 零容差+微小时钟偏移被判 "token is not valid yet" → 401 → 前端退登死循环 |
| Consul 配置 KV | ✅ | 新增 `ecommerce/config/dev.yml`(真实 DB/Redis/discovery),服务启动从此加载 |
| ListNamespaces RPC | ✅ | 新增 `ListNamespaces` 返回 `NamespaceInfo{namespace, environments, key_count}`,SQL 按 `(namespace, environment)` 分组走 `idx_entry_ns_env`;前端命名空间/环境改为 Autocomplete 下拉(freeSolo,仍可输新值),删除写死的默认 namespace `ecommerce`,首次加载自动落到真实存在的 namespace。直连与经网关(401 非 404,前缀路由已匹配)均验证 |
| 十服务三配置源 | ✅ | cart 与 address/behavior/inventory/merchant/order/payment/product/search/user 均使用独立仓 `sdk/configsource`：本地 `CONFIG_SOURCE_FILE` 的 `SourceConfig` 选择 `file` / `consul` / `config_center`，无自动降级。SDK 负责携带 `x-config-center-service-token`，修复手写 Connect 客户端漏该机器凭据造成的 401；旧 `CONFIG_SOURCE=configcenter` 显式快速失败，避免回退到无 token 的路径。十个服务的默认 `make dev` 读忽略的 `configs/source.dev.yaml` 并走配置中心，`make dev-consul` 保留历史 KV 路径；示例 selector 不含 token，集群须以 Secret 挂载。依赖钉住 `github.com/lens077/config-center v0.1.0`（`backend/go.mod:18`） |
| 配置加载单测 + 竞态修复 | ✅ | 删除 payment/inventory/address/merchant 4 个引用已删 API(`updateConfig`/`ValidateConfig`/`Server_HTTP.Addr`)的 stale 测试；重写 product 同类 stale 测试(还停在 `Init(configPath)` 文件配置时代)。新用例在 `-race` 下抓到**真实生产竞态**:9 个服务的 `Init` 写 `conf` 未持锁，而 `GetConfig` 用 `RLock` 读(cart 已在双源改造时修过)——已统一补 `confMu.Lock()` |
| 前端配置控制台 | 🟡 | 已迁至独立仓 `config-center/web`：保持 Monaco/玻璃态 CRUD、历史与回滚能力，改为浏览器专用（取消 Tauri 桌面端）并从 `public/config.json` 读取网关与公开 Casdoor 配置。待独立 pnpm 构建与浏览器 CRUD 验证 |
| 配置编辑器增强 | ✅ | 新增 `lib/validate.ts` 统一校验/格式化层:JSON 走 `jsonc-parser`(V8 的 `JSON.parse` 报错常常**不带位置**,拿不到准确行号)、YAML 走 `yaml` 的 `parseDocument`(`toString` 保注释与 anchor)、TOML 走 `smol-toml` + 自写的 `lib/toml-format.ts` 按行格式化(**注释全保留**,代价是不重排 key 顺序;放弃 `@taplo/lib` —— 实测是 34MB 内联 wasm)。编辑器:300ms 防抖实时校验、错误行红波浪线(marker owner `config-format` 与服务端错误的 `server` 分开,互不覆盖)、状态 Chip 显示「第 N 行 第 M 列: 原因」且可点击跳转、格式化按钮 + `Alt+Shift+F`、**校验不过禁用保存**(服务端校验仍是最后一道)、CSS 覆盖层全屏(非原生 Fullscreen API)。布局:`__root.tsx` 改 `height:100dvh` 把滚动容器下沉到 `<main>`,编辑器靠 `flex:1` 吃满剩余高度,不硬编 AppBar 高度。25 个单测(含「同一份 YAML 选 YAML 通过、选 JSON 报错」,锁住校验跟的是下拉选的格式而非文件名) |
| 旧仓 config 前端/桌面入口 | ✅ | 删除 `frontend/apps/config`、`dev:config`/`desktop:config`/`build:config` 及对应 Tauri profile；新控制台由独立仓发布 |
| 下发/Watch 热更新 | ✅ | **不经 Consul 桥接**，配置中心自成一路：`PutKey`/`DeleteKey`/`Rollback` **在写入事务内** `pg_notify('config_changed', 定位信息)`（回滚不会误发；payload 只带 ns/env/key/version，值由订阅方回查，顺带避开 8000 字节上限与密钥）→ `config/internal/data/watcher.go` 用独立 `pgx` 连接 `LISTEN`（不占池槽位）+ 进程内扇出（每订阅者 cap 16 的 channel，**满了丢事件不阻塞监听协程**；断线重连前先 `Fail()` 掉全部订阅者，宁可让客户端重连重取快照，也不留一条「还连着但永远收不到事件」的死流）→ 新增 `WatchKeys` server-stream RPC（先订阅再发快照，反过来会漏掉两步之间的变更；30s 心跳）。cart 侧 `source_configcenter.go` 实现可选的 `Watcher` 接口（类型断言发现，consul 源一行不改，保持「启动读一次」），指数退避 1s→30s 重连。**读取路径同步改造**（只推不改等于没改：原先所有消费者都在构造期拿走 `*Bootstrap` 快照）：`config.Live`(`atomic.Pointer`+订阅) → `data.PgPool` 实现 `models.DBTX` 与 `otelpgx.PoolStats`（指标注册在壳上，换池后一直有效；`Queries` 与 5 处调用点零改动）、`data.LiveRedis`、`pkg/log` 改 `zap.AtomicLevel`。**改完即可生效**：Ping 通过才换池、旧池延迟 30s 关闭（立刻 Close 会掐断 in-flight 查询）、建池失败记 ERROR 保留旧池。顺带修掉一个致命 bug：`http.Server.WriteTimeout`(5s) 会把长连接流在第一个心跳上打断（客户端每 30s 重连重取快照，看着正常实则一直在抖），新增 `withoutWriteTimeout` 只对流式路由清写截止时间。已在本地集群端到端实跑 6 项：MinIO 域名/日志级别/DB 连接池热生效、`server.addr` 只出 WARN 且端口不变、Redis 改坏记 ERROR 保留旧客户端（`/healthz` 全程 healthy）改回即重建、kill config-service 触发退避重连并由 SNAPSHOT 自愈。**其余 9 个服务已照此全量迁移**，见下一行 |
| 不热生效的三段（有意为之） | ✅ | `server`(重新绑端口会切断 in-flight 连接)、`discovery`(需摘节点重注册，滚动重启更可控)、`observability`(重建 tracer provider 会丢未导出的 span)——变更时打 WARN「该配置段已变更，但需要重启服务才会生效」，绝不让人以为改了就生效 |
| 历史页面重做 + 密钥历史脱敏 | ✅ | **页面铺平**：删掉「卡片套卡片」的嵌套外壳，改成一块面板内左右分栏；去掉 `maxWidth:1200` 铺满宽度，diff 从固定 `58vh` 改为 `flex:1` 吃满剩余高度；diff 栏补 `minWidth:0`（缺了它 Monaco 的固有宽度会把这一栏顶成窄条，正是截图里配置文本被拦腰截断的样子），并开 `useInlineViewWhenSpaceIsLimited`+`renderSideBySideInlineBreakpoint:900`+`wordWrap`——窄容器自动切内联视图，长值折行而不是被裁掉。**真实历史列表**：每行给出 `vN` + 当前/初始标记 + 相对上一版的 `+增 −删` 行数（新增 `lib/linediff.ts`，掐公共前后缀后求 LCS，超 25 万格退化为整段替换；9 个单测）+ 备注 + 作者·相对时间（精确时间在 tooltip）；内容与上一版完全相同的标「无变更」。**「暂无历史」的真凶**：原页面把 `isError` 和「真的没有历史」画成同一个空态——一个 v22 的 key 在后端短暂不可用时看着像从没改过，错误被彻底吞掉；现在分成 加载中/加载失败(带真实 message + 重试)/空 三态，回滚错误也改走 `toAppError`。回滚移到 diff 工具条并加确认弹层（会产生新版本且立刻下发），新增「对比当前 / 对比上一版」切换，左右标签不再出现 `v—`。**后端**：`toPBRevision` 此前不脱敏，`GetKey` 里被打成 `****** ` 的密钥换 `ListRevisions`/`GetRevision` 就能原样读出来——`biz.ConfigRevision` 增 `IsSecret`（由 repo 从所属 entry 带过来），service 层与 `toPBEntry` 共用 `maskedValue` 常量；领域内部（`Rollback`）读到的仍是真值。3 个单测 + 实跑验证（密钥 key 三条读路径全部 `******`，非密钥 key 回滚仍取到真实值） |
| 其余 9 个服务全量迁移 | ✅ | address/behavior/inventory/merchant/order/payment/product/search/user 保持 cart 的 `Source`+`Live` 热更新链（`Live`、`PgPool`/`LiveRedis`、`zap.AtomicLevel`）。配置源也已改为同一 SDK selector：生产代码不再保留手写 Config Center Connect 客户端，`make dev` 默认 `CONFIG_SOURCE_FILE=configs/source.dev.yaml`，`make dev-consul` 是唯一显式的历史 KV 入口；所有 selector 示例都要求用 Secret/忽略文件注入 service token。现有 16 份 deploy 清单仍显式选 Consul，待集群迁移时应改为挂载 selector Secret，不能恢复旧 `CONFIG_CENTER_*` 直连变量。**config 服务不迁**：配置中心的配置存进它自己就没人能把它拉起来，它必须从 Consul KV 自举，因此连 `source_configcenter.go` 都不给它 |
| 三份配置对齐 + 灌入配置中心 | ✅ | 以 cart 为标准重排 10 个服务 × dev/pre 共 20 份配置（段序统一 `server → data → 服务专属段 → observability → discovery → search → log → auth`），逐份用各服务**真实的 `Bootstrap` 类型 + 与 `decodeConfig` 完全相同的解码链路**校验。修掉三处内容错误：**behavior 的 KV 一直是 cart 的复制品**（带着它 proto 里没有的 `store`/`search`，缺 `required=true` 的 `recommend`，这就是 `.service-matrix.yaml` 里那条 known_gap）、**product 的 KV 缺 `recommend`**、**payment 的仓库副本缺 `pay`**；补齐 4 份缺失文件（behavior/payment 的 pre 从无到有，product 的 pre 在仓库里缺，**cart 的 pre 缺 `store` 段**——`internal/data/cart.go` 拼 MinIO 缩略图 URL 要用它，pre 环境的图片链接一直是坏的）。**product 的 KV pre.yml 根本不是 pre**：连的是 `pg-dev.app.com`/`consul.app.com` 这些外部域名，是 dev 换了个端口，集群内跑必然解析不到。新增 `backend/tools/config-seed` 把 KV 灌进配置中心（源取 KV 而不是仓库文件，因为后者按硬规则 4 不入库、每台机器都不一样），默认 dry-run，写完逐份读回比对；20 个 key 全部写入校验通过 |
| 凭据不再入库 | ✅ | `configs/.gitignore` 里 **`per.yml` 是 `pre.yml` 的笔误**（`4a3eb70b` 引入），加上 address/behavior/merchant/payment 四个服务压根没有这个文件，结果 **11 份含明文凭据的配置文件（PG/Redis/ES 密码、Casdoor `client_secret`、证书）一直被 git 跟踪**，直接违反 AGENTS.md 硬规则 4。已 `git rm --cached` 停止跟踪（本地文件保留）并给 10 个服务统一 `.gitignore`，`git check-ignore` 逐份验过 20/20 拦得住。⚠️ 历史提交里仍有这批凭据，彻底清除需要单独做 history rewrite；这些密码已经泄露过，真要安全得轮换 |
| 配置中心 Go 客户端 SDK | ✅ | 独立仓已提供 `sdk/configsource`、生成契约与 `SourceConfig{file, consul, config_center}`；**`v0.1.0` 语义化 tag 已发布并被 `backend/go.mod:18` 钉住**（本行原写「Cart 已改用远程默认分支伪版本，后续再发布 v0.1.0」，与同表「后端 config 服务」行及 go.mod 自相矛盾，2026-08-06 回扫订正）。升级用 `go get github.com/lens077/config-center@v0.x.y`——`go mod tidy` 只增删不升级 |
| 审批/灰度/密钥加密/审计 | ⬜ | 后续阶段 |

### 6. 推荐链路（gorse）

> 目标：用户漫无目的地逛也能沉淀信号，喂给云上的 gorse，换回个性化/相似/兜底三路召回。

| 项目 | 状态 | 说明 |
|------|------|------|
| gorse 部署排障 | ✅ | `failed to init meta database: unable to open database file: out of memory (14)` 的真凶是 **SQLITE_CANTOPEN(14) 被 gorse 错标成 "out of memory"**：v0.5 的 `--cache-path` 是**目录**不是文件（沿用了 0.4 时代的文件名且没挂 volume）。另外三处同类问题：`GORSE_CACHE_STORE` 把 Redis 指到了 5432、`vector_store` 用相对路径、`[blob] uri` 没挂 volume；镜像 entrypoint 本身已带 `-c /etc/gorse/config.toml`，不必重复传。已按上述修复部署到 `node2:8088`，`/api/health/ready` 全绿 |
| `behavior.proto` + behavior 服务 | ✅ | `backend/api/behavior/v1/behavior.proto`：`Track`（批量埋点）/`Recommend`（个性化+会话+兜底三级降级）/`SimilarItems`。服务按 search 的模板竖切：conf(v1) → data(pg/redis/gorse) → biz → service → server，`go build`/`go vet` 全绿。**摄入侧**：内存队列 + 批量 flush（无消息队列可用，不为此引 Kafka），`behaviors.events` 表的 `synced_at IS NULL` 当 outbox 做补偿重投；Track 非阻塞，队列满即丢并计数，绝不拖慢前端。**时钟纠偏**：客户端时间戳偏移超阈值就用服务端时间，否则会污染 gorse 的 `positive_feedback_ttl` 淘汰 |
| POST vs PUT 语义 | ✅ | gorse 反馈的唯一键是 `(FeedbackType, UserId, ItemId)` 三元组，**POST 累加 `Value`、PUT 覆盖**。只有 `read`/`impression` 走 POST（要配合 `read>=3` 计次），`dwell`（绝对秒数）/`cart`/`favorite`/`purchase`（布尔事实）一律走 PUT —— 加过三次购物车不该拿到 3 倍权重。官方 SDK 还是 `v0.5.0-alpha` 且没有 PUT，故自写 `backend/pkg/gorse` 最小客户端 |
| `dislike` 的落法 | ✅ | 当前 gorse 版本的 `config.toml` **没有 `negative_feedback_types`**，负反馈无处安放。`dislike` 只落 `behaviors.events`，由 behavior 服务在返回推荐结果前自己过滤（`excludeDisliked`，召回时多取 20 条兜底）；`PendingSync` 也把它排除在外，否则补偿循环会对着一个永远同步不出去的事件空转 |
| 网关路由 | ✅ | `/behavior* → discovery:///behavior-service`；三个 RPC 在 `jwt`/`rbac` 的 `router_filter` 里放行 —— **匿名浏览正是最该采集的时段**，要求登录等于把冷启动数据全丢了；服务端仍以网关注入的 `x-md-global-user-id` 优先于请求体的 `anon_id`（后者客户端可伪造）。超时 2s、只重试 1 次：重放埋点会把曝光计数刷虚 |
| `frontend/packages/tracker` | ✅ | 曝光（IntersectionObserver，露出 ≥50% 且连续 ≥1s 才算，会话内去重）/ read / dwell（只计页面可见时间，心跳上报累计值配合 PUT 覆盖）/ cart / favorite / purchase / dislike。**手写 Connect unary JSON 线格式**而不用生成的 connect-web 客户端：`navigator.sendBeacon` 不允许设自定义头（`Connect-Protocol-Version`），而页面关闭时那一次上报带着最完整的停留时长，只有 beacon 送得出去。`anonId` 存 localStorage（跨会话画像的唯一线索）、`sessionId` 存 sessionStorage（曝光去重窗口），Safari 隐私模式降级为一次性 id。`tsc` 通过 |
| product → gorse item 同步 | ✅ | gorse 只认 item，**反馈引用的 ItemId 不存在会被直接丢弃**，所以目录同步是推荐链路的前置条件而非锦上添花。product 服务没有 SPU 写入 RPC，无处挂写钩子；且只靠写路径也补不回 gorse 重装/网络抖动的缺口 —— 改为按 `updated_at` 游标的**增量对账**（游标存 Redis，回拨 1s 防批次边界切开同 `updated_at` 的行；扫满一批立即续扫不等下一个 tick）。下架用 `IsHidden` 而非删除（删了连带作废该商品上已积累的全部反馈）；标签给 brand/category/price_band（价格带取在售 SKU 最低价，`LEFT JOIN` 保证暂无在售 SKU 的 SPU 也同步）。另导出 `SyncByCodes`，将来的写路径直接调 |
| 已实测 | ✅ | ① gorse 的 **POST 累加 / PUT 覆盖**在线上验证：两次 POST `read` → Value=2，两次 PUT `dwell`(30→45) → Value=45，与设计一致。② `behaviors.events` 已在 `ecommerce` 库建表（4 个索引齐全）。③ product 的目录同步走**真实 DB + 真实 gorse** 跑通：4 个 SPU 全量入库，`Categories`/`brand`/`price_band` 标签正确，`/api/latest/1001` 能按分类召回 |
| Consul KV 配置 | ⬜ | KV 里 `ecommerce/{product,behavior}/dev.yml` **仍缺 `recommend:` 块**（behavior 的还是 cart 派生版，带无用的 `store:`/`search:`）。配置解码用 mapstructure 未开 `ErrorUnused`，多余键不报错，但缺 `recommend` 时生成的 getter 是 nil-safe 的 —— **gorse 会被静默关掉而不是启动失败**。待上传的两份完整内容已用服务自身的 `decodeConfig` 验证可解析 |
| 待验证 | ⬜ | Consul KV 上传后端到端实跑 Track/Recommend/SimilarItems；清理 gorse 里的 `smoke-a/b/c` 测试数据；consumer 前端接入 tracker（`tsconfig` paths + `package.json` 依赖 + 入口 `initTracker` + 商品卡/详情页埋点） |

### 6. 前端

**consumer（消费者端）**

| 页面 | 状态 | 说明 |
|------|------|------|
| 首页 `index` | 🟡 | 已去除 `→/categories` 重定向，改为商品网格首页（卡片+空态）；待接 `ListProducts` 无限滚动（设计见 Design.md） |
| 分类 `categories` | 🟡 | 静态，未接类目 API |
| 商品详情 `product/$spuCode` | ✅ | 已接 `GetProductDetail`（SPU/SKU） |
| 购物车 `cart` | ✅ | 已接购物车 API；本次修复间距 8× 问题并重构紧凑布局 |
| 结算 `checkout` | 🟡 | 已重写：接选中项(useCart 真实 `cart_item_id`)、地址弹层选择+新增(AddressService)、防重 `requestId`、下单调用(`api/order`)；运费恒 0、去优惠券、统一 `sp[]`。待后端补 `CreateOrderRequest.requestId` 与 `CreateOrderResponse.orderNo` 后接通 |
| 订单列表/详情 `orders` | 🟡 | mock 数据，未接订单查询 API |
| 支付结果 `payment/result` | 🟡 | 未接支付状态查询 |
| 个人中心 `profile` | ✅ | 已接真实 API |
| 收货地址 `profile/addresses` | ✅ | 已接 AddressService |
| 登录回调 `callback` | ✅ | Casdoor 登录回调打通 |

**merchant（商家端）** — ⬜ 仅路由骨架（`index/orders/products/reports/settings`），无 `api/` 目录、未接后端

**admin（管理员端）** — ⬜ 仅路由骨架（`index/users/merchants/products/orders/categories/reports/settings`），无 `api/` 目录、未接后端

### 6. 可观测性与测试

| 项目 | 状态 | 说明 |
|------|------|------|
| 链路追踪（OpenTelemetry/Jaeger） | 🟡 | 后端 10 个服务、Gateway 的 OTel 核心 Trace/Metrics 已统一至 `v1.45.0`；Logs 为 `v0.21.0`，`otelhttp` 为 `v0.70.0`，`otelpgx` 为 `v0.11.1`。10 个 Connect 服务端拦截器均同时启用 `WithTrustRemote()` 与 `WithoutServerPeerAttributes()`：保留可信上游 trace context，避免由服务端写入不可靠或高基数的 peer 属性。Gateway 同步迁到 `semconv/v1.41.0` 的稳定 HTTP 属性键。服务端 `otelhttp` 中间件、ES OTel 传输已接入；Config Center 已对齐并通过 Go 测试。补记 `WithoutServerPeerAttributes()` 的实际影响：`net_peer_port` 是**按 TCP 连接**取值的，实测 cart 一个 `rpc_server_duration_milliseconds_count` 就有 39 条序列、`net_peer_port` 39 个不同值,每条只有一个样本且永不递增 —— 于是 **`rate()` 恒为 0**，不只错误率，「请求率 by 服务」「P95 时延 by 服务」在改之前都算不出真实值(不是空图,是错的值)。otelconnect 自己的文档也写明该默认行为 "produces very high-cardinality data"。这与 collector CR 里对 pod 名、lxc 网卡做的基数纪律是同一件事,只是发生在应用侧 |
| OTel SDK 装配基线（11 份收敛为一份） | ✅ | `internal/pkg/otel/otel.go` 原本是 11 份同构副本（语义完全一致，只差函数摆放顺序与注释），同样的问题各带一遍。2026-08 收敛成一份标准实现再分发，并修 7 处：①`AlwaysSample` → `ParentBased(TraceIDRatioBased(x))`，x 走配置 `observability.trace.sample_ratio`。**`ParentBased` 那层不是可选的**：只用 `TraceIDRatioBased` 时每个服务各自掷骰子，ratio=0.1 下一条 5 跳链完整留存的概率是 0.1⁵，拿到的是满屏残缺半截 trace，比不采样更难用；包上之后下游无条件跟随上游决策、只有链路入口才掷骰子 —— 与 `WithTrustRemote` 是配套的（前者让 trace 连得起来，后者让它不被采样采断）②补 `service.instance.id`（`AppInfo.ID` 一直在生成却没进 resource，多副本在指标上被聚成一条曲线，「哪个 pod 在抖」查不了）③自造 attribute `GolangVersion` → `semconv.ProcessRuntimeName/Version`（自造 key 后端无法按标准维度聚合）④装上 `otel.SetErrorHandler` —— SDK 内部错误（导出失败/队列溢出/endpoint 不通）默认是被丢弃的，此前 collector 挂掉应用侧一行日志都没有，表现成「服务一切正常但 Jaeger 里什么都没有」⑤三条管道开 gzip（trace/log 走 443 ingress 出网，原先明文全量上传）⑥metric 导出间隔硬编码 3s → 可配、缺省 30s（3s 是 SDK 默认值 60s 的 20 倍频率，乘服务数后 collector 侧不划算）⑦删掉 `TraceOption/MetricOption/LogOption` 三套 option 类型约 150 行 —— 它们只是为建个临时 struct 再取出 `.tls`，没有任何调用方用可变参数，收敛为一个 `tlsClientConfig`。**配置新增的两个字段刻意用 wrapper 类型**：proto3 裸 `double` 的零值就是 0.0，与「没配置」无法区分 —— 存量配置都还没有 `sample_ratio`，用裸 double 的话升级后会被解析成 0.0 = 一条 trace 都不采，且不报任何错；wrapper 让「没配」是 null 回落到 1.0（与升级前 `AlwaysSample` 一致），同时保留显式配 0.0 彻底关掉的能力，`TestSampleRatio_UnsetFallsBackToOne` 专门守这条 |
| semconv 必须与 sdk 内部版本对齐 | ✅ | `newResource` 用 `resource.Merge(resource.Default(), ...)` 才能拿到 SDK 自己填的 `telemetry.sdk.*`，但 Merge 在两边 schema URL 不一致时返回 `ErrSchemaURLConflict`，而该文件把 `newResource` 的错误当致命处理 —— 所以这**不是「resource 少几个属性」这种 degradation，是 11 个服务在 fx 启动阶段全部起不来**。2026-08-06 升 otel v1.44→v1.45 时真实发生：sdk 内部 semconv 从 v1.41.0 换成 v1.43.0，`otel.go` 没跟着改，`TestNewResource` 里的 `assert.NotEmpty(res.SchemaURL())` 按预期先红（11 个服务 otel 包全 FAIL），而不是等部署时才发现服务拉不起来。**以后升 otel sdk 先做这一步**：`grep -rhoE "otel/semconv/v[0-9.]+" "$(go env GOMODCACHE)/go.opentelemetry.io/otel/sdk@<新版本>/resource/"*.go` 取到内部版本，同步改 `otel.go` 的 semconv import |
| pgx span 名（DB 可观测性） | ✅ | otelpgx 默认把**整段带换行的 SQL** 塞进 span name，而 span name 在后端是个索引维度，SQL 文本进去会撑爆基数、Jaeger 的 operation 下拉框也没法用。踩了两个坑：①先按文档用 `WithTrimSQLInSpanName()`，它取「SQL 的第一个词」，而 sqlc 生成的语句第一个词是注释符 `--`，结果所有查询的 span 名都变成 `query --` —— 基数是降到 1 了，但也彻底分不出哪条是哪条，比不改更糟 ②改用 `WithSpanNameFunc` 后发现**两个选项必须一起给**：`tracer.go` 里是 `if t.trimQuerySpanName { spanName = t.spanNameCtxFunc(...) }`，`WithTrimSQLInSpanName` 才是「启用自定义 span 名」的开关，只给 `WithSpanNameFunc` 的话 span 名依旧是整段 SQL（第一版就白改了一次）。最终写法 `otelpgx.NewTracer(WithTrimSQLInSpanName(), WithSpanNameFunc(otelpkg.SQLSpanName))`，`SQLSpanName` 从 sqlc 的 `-- name: X :kind` 头取查询名 → span 名形如 `query GetCartItems`，完整 SQL 仍在 `db.query.text`。函数放 `internal/pkg/otel` 而不是各自的 `data.go`：它需要测试，写在 data.go 就得复制 11 份且没人测；`TestSQLSpanName_DistinctQueriesStayDistinct` 守「不同查询必须得到不同 span 名」这条。otelpgx v0.10.0→v0.11.1 已核该开关语义未变 |
| 前端性能监控（Web Vitals RUM） | ✅ | 新增 `frontend/packages/perf` + `backend/api/telemetry/v1` + behavior 进程顺带实现 `TelemetryService`。采集：五大指标走 **web-vitals/attribution**（LCP 定格/CLS 会话窗口/INP 高分位这三块手写极易错且错了不报错），LongTask 与 fetch/xhr 耗时拆解（DNS/TCP/TTFB/transferSize）手写 `PerformanceObserver`；**自身上报端点与 Track 埋点从采集中排除**（否则每次上报催生下一次上报）。上报：vitals 攒到 `pagehide`/`visibilitychange(hidden)` 一次 `sendBeacon`（Connect JSON 自包含体，与 tracker 同约定），API 批量走 keepalive fetch，失败不重试。落点：服务端转 OTel histogram（**显式桶**，CLS 用分数刻度；attr 只挂 page/rating —— `page` 是路由模式不是 URL，基数纪律）→ VictoriaMetrics；明细带 attribution 走 zap→otelzap→Loki（字段成结构化元数据可直接查）。网关 `/telemetry*` 路由 + jwt/rbac 白名单（sendBeacon 带不了 JWT 头）已同步 Consul KV。端到端实测：直连/经网关/CORS 预检/空请求 400/非法枚举 400 全过，VM 查得到 `web_vitals_lcp_milliseconds_bucket`（2100ms 落 le=2500 桶）、Loki 查得到带 attribution 的行。顺带删掉 consumer 里 CRA 残留的死代码 `reportWebVitals.ts`（`if (onPerfEntry)` 恒假，web-vitals chunk 从未加载过）。**浏览器真实点击流未跑**（等 consumer 日常使用即自然产生）；Grafana 看板未建（datasource 本就是手工配的） |
| Kafka Connect(Debezium CDC)完全没在跑 | ⬜ | 排查日志量时发现的,**比日志量本身重要得多**:`my-connect-cluster-connect-0` 处于 `CrashLoopBackOff`,**已重启 484 次**,`lastState` 是 `OOMKilled`(exit 137)、`startedAt 07:37:19 / finishedAt 07:37:23` —— **启动 4 秒就被杀**。所以它占的那 19.9% 日志量不是 CDC 数据,是**同一段启动日志重复了 484 遍**(含一行完整的 `jvm.classpath`,这就是它单行平均 1335B 的来源)。两个独立成因:①**OOM 来自节点内核而不是容器 limit** —— `kubectl get events` 有 `node/node3 SystemOOM ... victim process: java`;Connect 的 `spec.resources` 是**空的**(既无 limits 也无 requests → BestEffort QoS,节点内存紧张时第一个被杀),JVM 也只有 `-Xms128M`、**没有 `-Xmx`**,无容器 limit 时 JVM 按节点内存(6.4Gi)推导最大堆约 1.6Gi,而 node3 实际已用 78% ②**connector 配置从 2026-06-09 起就是非法的**:`postgres-source-connector` 的 `binary.handling.mode: utf8` 不是合法值,Debezium 直接 400 —— `Value must be one of bytes, base64, hex, base64-url-safe`。即**CDC 从来没成功跑起来过**。修法与约束:Connect 无 PVC(已确认),是无状态的,**可以调度到 node2**(内存 requests 余量约 3.1Gi;node3 已占 99% 放不下),所以 ①给 KafkaConnect CR 设 `spec.resources`(requests/limits)②`spec.jvmOptions` 显式设 `-Xmx` 并留出堆外空间 ③**删掉 `binary.handling.mode` 这一行**,而不是换个值。已核实两点:(a) 该属性在 Debezium **3.5.0.Final**(仓库 `examples/debezium-postgres-connector-build.yml:41` 钉的版本)源码里`CommonConnectorConfig.BinaryHandlingMode` 枚举正好 4 个值 —— `BYTES("bytes", SchemaBuilder::bytes)` / `BASE64("base64", ::string)` / `BASE64_URL_SAFE("base64-url-safe", ::string)` / `HEX("hex", ::string)`,**没有 `utf8`**(不是只凭报错信息,是拉 v3.5.0.Final 的源码看的);(b) **这个库压根没有二进制列** —— 实库 `information_schema.columns` 普查:varchar 79、timestamptz 39、bigint 38、text 25、int 21、numeric 17、uuid 13、USER-DEFINED 9、jsonb 6…… `bytea`/`bit`/`bit varying` **0 个**。所以这个属性对本库是彻底的 no-op,删掉最干净。**原本的意图也确认了**:配置里它紧跟在注释「数值处理(解决 Base64 问题)」下面 —— 而数值侧的 Base64 问题(numeric → Connect Decimal → JSON 里变 Base64)已经由同一段的 `decimal.handling.mode: double` 解决了;`binary.handling.mode: utf8` 是照着它类推加上去的、猜了一个不存在的值,结果把整个 connector 打死了两个月。将来真加了 bytea 列又不想要 Base64,唯一可选的是 `hex` —— 另外三个里 `bytes` 会得到 Connect BYTES,JsonConverter 序列化时照样输出 Base64,`base64`/`base64-url-safe` 本身就是 Base64。修好之后这 19.9% 的日志量会自己消失,不需要在 fluent-bit 侧排除它 |
| 日志平面自我放大（已断开，但稳态收益远低于预估） | ✅ | 排查「Loki 吃性能」的结论是**前提不成立**:`kubectl top` 下 loki-0 只有 186Mi/13m,全集群内存排第 13、CPU 第 8;真正的大户是 elasticsearch 1679Mi(Jaeger 后端)、cilium ×3 各约 1Gi、apiserver 1035Mi、kibana 929Mi。**写入侧**用 Loki volume API 查得近 24h:`kube-logs`(fluent-bit 采的全部容器日志)438 MiB 占 **99.9%**,而 10 个业务服务经 OTLP 上报的日志合计 0.24 MiB 占 0.05%。把 `kube-logs` 按行内 `k8s.pod_name` 归类(标签坏了只能从正文解析)发现日志平面在自我记录:fluent-bit 33.8% + loki-0 17.7% + VPA 29.7%。**回路**:查一次 Loki → Loki 打一条 ~914B 的 `metrics.go` 统计日志 → fluent-bit 采走 → 推回 Loki → 再记一条 push 日志。**五项改动**:①fluent-bit throttle 的 `Print_Status true→false`(它每 5s 窗口都打一行,有没有真限流都打)②Loki `server.log_level info→warn`(它自己的日志里 `tables_manager.go` 占 44%、`table.go` 21%)③fluent-bit `[INPUT] tail` 加 `Exclude_Path` 排除 fluent-bit 与 loki 自己的容器日志 —— 这两个组件坏的时候本来也不能靠 Loki 查,该用 `kubectl logs` ④VPA `vpa-recommender` 加 `--v=1`(它原本**没有 args**、走镜像默认,每轮把 63 个 VPA 对象的 checkpoint 各打一行)、`vpa-updater` `--v=4→--v=1`(实测 `--v=2` 几乎没用:56 行/120s → 12 行/120s 才是 `--v=1` 的效果)⑤给 loki StatefulSet 建 `loki-vpa`(`updateMode: "Off"` 只出推荐)—— 原先 `loki` 命名空间只有盯 nginx 网关的 `loki-gateway-vpa`,真正会 OOM 的 StatefulSet 反而没被纳管。**实测效果与我的预估不符,如实记**:回路确实断了(fluent-bit 与 loki-0 已完全不再出现在 Loki 的 stream 里),VPA 两个组件按字节占比从 29.7% 降到 9.6%;但**稳态日志量只从 12.01 MiB/h 降到 11.29 MiB/h,约 6%**,而不是我预估的「1/5」。预估错在方法:我拿一个 5 分钟、被 `limit=1000` 截断、且恰好在自己密集查询 Loki 期间取的样本去外推 24h 字节量 —— 那个窗口高估了 fluent-bit / loki-0(两者都与我的查询活动正相关),又完全漏掉了 `elastic-operator`、`my-connect-cluster-connect-0` 这类周期性大写入方(它们在那 5 分钟里一行都没出现)。所以这五项的真实价值在**消除查询压力下的放大**(那正是 OOMKill 的机制),而非稳态降量。**改完后真正的大头**(按字节,最近 15min):elastic-operator 20.5%(单行 1508B)、openebs-lvm-controller 15.8%(1223B)、kafka-connect 14.4%(1335B)、argocd-repo-server 9.0%、kibana 7.7% —— 都不在本轮范围内,要继续降量得从它们下手 |
| fluent-bit 镜像未钉在 values（已修，且我触发过一次） | ✅ | fluent-bit 的 DaemonSet 镜像是**安装后手工 `kubectl patch`** 打成 `docker.io/fluent/fluent-bit:5.0.7-arm64` 的,从未写进 `otel-fluent-bit-values.yml`。于是任何一次 `helm upgrade` 都会把它冲回 chart 默认的 `cr.fluentbit.io/fluent/fluent-bit:5.0.7` —— 那个 registry 从本集群不通(`Head https://registry-1.docker.io/... i/o timeout`),而且默认 tag 不带架构后缀,本集群三个节点全是 arm64。2026-08-06 我做上面那轮改动时正好踩爆:`helm upgrade` 后 DaemonSet 滚到一半,新 pod `ErrImagePull`,node2 的日志采集中断约 4 分钟。已把 `image.repository` / `image.tag` 钉进 values 并重新 upgrade(revision 3),两个 pod 恢复 1/1。教训:`helm get values` 只显示**安装时供的值**,看不出后来手工 patch 过什么 —— 升级前应先 `kubectl get ds -o jsonpath={..image}` 和渲染结果对一遍 |
| Loki 每 8 小时被 OOMKill（已修） | ✅ | `loki-0` 在 55 天里 **OOMKilled 25 次**(exit 137),每次死前的日志形态一致:同一个 `query_hash` 几十条并发 `executing query` → ingester 自身健康检查 `DeadlineExceeded`(它连的是自己的 IP `10.244.2.252:9095`,SingleBinary 部署里 distributor/ingester/querier 同进程)→ `POST /loki/api/v1/push (500)` → 进程被杀。**两个成因叠加**:①内存上限只有 **512Mi**,而空载实测已占 344Mi、只剩约 168Mi 余量,一条查询扫 87MB chunk 就过线;values 里只写了 `limits`,k8s 把 `requests` 补成同值 = Guaranteed,一超立刻 OOMKill ②`limits_config` 里**没有任何查询护栏**,`tsdb_max_query_parallelism` 是默认 **128** —— 一条 range query 能扇出 128 个并发子查询,这正是日志里那片并发 `executing query` 的来源。**修法**(改 node101 上的 `/home/kubernetes/loki/loki-monolithic-mode-values.yml` + `helm upgrade`,已备份 `.bak-20260806`,revision 1→2):`requests` 显式钉在 512Mi、`limits` 抬到 1Gi(转 Burstable);`limits_config` 加 `tsdb_max_query_parallelism: 8`、`max_query_parallelism: 8`、`max_chunks_per_query: 200000`(默认 2000000 等于没有上限)、`split_queries_by_interval: 15m→1h`。**为什么不是简单加内存**:node3 的内存 `requests` 已占 **99%**(6290Mi/6442Mi),把 requests 抬到 1Gi 这个 Pod 会直接调度不上去;而它也换不了节点 —— PV 是 `openebs-lvmpv`、带 `openebs.io/nodename In [node3]` 硬亲和,换节点等于迁数据。所以主力是砍查询峰值,内存只在 requests 不变的前提下给突发留余量。代价:Burstable 在节点内存压力下比 Guaranteed 先被驱逐,但对比「每 8 小时必死一次」划算。**验证**:升级后 restarts 归 0、`/ready` 200、四条护栏在 `/config` 里逐条核对生效;连打 3 次 OOM 前那种查询(6h 范围扫全部 stream)全部 200、最慢 0.61s、进程不重启,内存 275Mi/1Gi;push 5xx 与 DeadlineExceeded 均为 0 条,新日志查得到 |
| 日志（Loki/fluent-bit） | 🟡 | 已部署并在收:collector `logs` 管道 → Loki,fluent-bit 另采容器日志(`job=kube-logs`)。**但 k8s 标签是坏的** —— `k8s__pod_name`/`k8s__namespace_name`/`k8s__container_name` 的值是字面量 `".pod_name"` 之类,所以日志按 pod/namespace 下钻不了,只能按 `detected_level` 聚合。根因在 `fluent-bit.conf:78` 的 `Label_keys $k8s.pod_name, ...`:上面第 61-62 行用 `Nested_under kubernetes` + `Add_prefix k8s.` 把字段拍平了,记录里是一个**名字里带点的扁平 key** `k8s.pod_name`,而 Fluent Bit 的 record accessor 把 `.` 当嵌套分隔符去找 `record["k8s"]["pod_name"]`,找不到就把剩余部分原样输出。正确写法是 `$['k8s.pod_name']`（待修） |
| 指标（VictoriaMetrics/Grafana） | 🟡 | 已部署并在收:collector `metrics` 管道 → VM(2026-08 实测 5 族 57 个指标名:`system_*`/`rpc_server_*`/`pgxpool_*`/`db_client_operation_*`/`process_*`)。看板见 `observability/grafana/`（业务盘 + 基础设施盘，脚本生成，两张盘互跳）。**三个采集缺口**:①**采集管道自身健康 `otelcol_*` 不在 VM 里** —— 只在每个 collector pod 的 `:8888`,没有任何东西采集它,所以现在无法回答「遥测有没有在半路丢」（补法:collector 加 `prometheus` receiver 自采 `127.0.0.1:8888`，约 30 个序列，代价极小，**优先级最高**）②**无 k8s 对象/容器级指标** —— 没有 kube-state-metrics、没有 cAdvisor（`metrics-server` 只服务 HPA），「pod 重启几次/副本齐不齐/哪个容器吃内存」查不了；补法是 `kubelet_stats` + `k8s_cluster` receiver（distro 里都有，无需引入新组件），但两者都基数敏感，且 `k8s_cluster` 在 DaemonSet 下**必须配 `k8s_leader_elector`**，否则每个 pod 都采一遍变成 N 倍重复 —— 2026-08-06 决定单独一轮做，不与看板混做 ③**node1(control-plane) 没有主机指标** —— collector DaemonSet desired=2 不调度过去，节点面板只覆盖 node2/node3，要覆盖得加 toleration |
| Grafana 看板 | 🟡 | `observability/grafana/`:`common.py`(数据源/面板构造器/共用 PromQL) + `build_business_overview.py` + `build_infrastructure.py`,JSON 是产物（**改看板改脚本，不要直接编辑 JSON 或只在 UI 里改**）。搬自 cloud-native-deploy 时逐条拿 VM 实测校对，修了五处指标名/口径错误（①`pgxpool_*_conns` 不存在，otelpgx 导出的是 `*_connections`，该面板从建盘起就是空图 ②CLS 的 unit 是 `"1"` 故后缀是 `_ratio` 不是 `_milliseconds` ③`http_server_*` 整族不存在 ④文件系统缺 mountpoint 过滤导致画出 8 条 kubelet PVC bind mount，且分母 `used+free` 漏了 `reserved` 这个 state ⑤**错误率零错误时是空图**），详见该目录 README 的「修正记录」。⑤ 单独说明：`rpc_connect_rpc_error_code` 这个标签**只挂在出错的序列上**，零错误时分子一条序列都没有，相除得空集而不是 0 —— 而空图看起来像看板坏了、不像「没有错误」（实测踩到:服务明明健康，错误率图一片空白，第一反应是查询写错了）。改成用分母乘 0 兜底：`(sum by (svc) (rate(m{code!=""})) or sum by (svc) (rate(m)) * 0) / sum by (svc) (rate(m))`。**刻意不用 `or on() vector(0)`**：实测它在 VictoriaMetrics 上能出结果（VM 把无标签单序列当标量广播到右侧每个分组），但 Prometheus 不做这个广播，无标签左操作数匹配不上带 `service_name` 的右操作数，结果仍是空 —— 换后端就又坏了；按分组乘 0 两边都对。该惯用法收在 `common.py` 的 `zero_filled()`（含原因 docstring），它有一个有意的性质:只给分母里存在的分组补 0，完全没流量的服务仍然不出现 —— 不该给一个没跑起来的服务画 0% 让人误以为健康。同类毛病还修了基础设施盘的「DB 错误率」（`db_client_operation_errors_total` 在从没出错过的服务上整条序列都不存在，实测 cart 做了 51 次 DB 操作零错误、面板里就没有 cart）。判断标准是「该指标是否覆盖分母里的每一个分组」而不是「它有没有序列」—— 按后者筛会漏掉 DB 那个；核过确实没问题的：`system_network_errors_total`/`dropped_total`（hostmetrics 恒发，2 节点×2 方向 4 条全在）、`pgxpool_empty_acquire_total`/`canceled_acquires_total`（RecordStats 恒发，覆盖全部上报服务）。56 条 PromQL 已全部在 VM 实跑验证语法（失败 0）。仍缺:**网关 HTTP 指标未实现**（`gateway/` 下没有任何 meter，只有 tracing 中间件，所以「网关→上游耗时」这张图删掉了）；**11 个电商服务没有 Go 运行时指标**（只有独立仓 config-center 实现了 `internal/pkg/sysstat`）。~~实测其 `process_*` 在 2026-08-06 12:52 后停止上报而同进程 `pgxpool_*` 仍正常，是 sysstat 侧问题~~ —— **这条诊断是错的，已核实并推翻**：那两族指标根本不来自同一个进程。`process_*` 停在 12:52 是因为带 sysstat 的那个本地测试实例在那一刻被关掉了；继续发 `pgxpool_*` 的是 **`backend/services/config`**（本仓的旧配置服务），它恰好也报同一个 `service_name`。核实方法：`lsof -ti :30010` 拿到当时在跑的 PID，其二进制里 `sysstat`/`gopsutil`/`promql`/`system.v1` 四个符号的出现次数**全是 0**，即它压根不含那份代码。根因见下一行的「service_name 撞名」，不是 sysstat 的 bug |
| GMV 与客单价口径 | ✅ | 业务大盘的订单数、GMV(应付)、客单价、日订单趋势和日 GMV 已从按商家拆分的 `orders.order_main` 改为按用户一次结算的 `orders.order_group`。`order_main` 仍只用于商家子订单状态与支付完成率；金额卡固定两位小数，避免 Grafana 自动精度隐藏角分 |
| service_name 撞名（config-service） | ✅ | 旧 `backend/services/config` 及重复 Config API 已随 `config-center v0.1.0` 退役。独立服务保留 `service_name="config-service"` 以兼容 Consul/网关，并发布 `service_namespace="config-center"`；配置中心 System 查询同时要求两项标签，电商两张 Grafana 看板排除该基础设施服务，历史同名序列不会再混入 |
| 前端测试（playwright + vitest） | 🟡 | consumer 首个用例落地：`hooks/useCart.test.tsx` 用 `createRouterTransport` 桩 GetCart，锁住「后端数据 → store」这条同步路径在重渲染与 StrictMode 下都只跑一次（effect 写 store → 订阅回调 setState → 再渲染，本身是个反馈环，查询结果引用一不稳就闭合成死循环）。config app 另有 `linediff`/`validate` 两组。仍缺：e2e 与其余 app |
| 后端单元/集成测试 | 🟡 | `internal/pkg/config` **10 个服务全覆盖**(cart + address/payment/inventory/merchant/product/order/search/user/behavior，覆盖率 76%~85%，`-race` 全绿)：用 `httptest` 起 Consul KV / ConnectRPC 桩打**真实客户端**，覆盖选源、YAML 解析、duration 钩子、404/空值/不可达/context 取消等错误分支。cart 的 `internal/pkg/log`(100%)、`internal/pkg/registry`(90.1%) 已重写；address/merchant/payment 的 registry 及 gateway 的 config/cors/jwt/rbac/routerfilter 过时测试已收敛为本地可重复单测。6 个 stale `log` 测试包已随配置迁移一并重写（10 个服务的 `internal/pkg/log` 现已全绿，含日志级别热生效用例）。仍缺：各服务 biz/data/service 层 |
| cart log/registry 单测重写 | ✅ | 两个 stale 测试跟着实现改签名后一直编译不过。`log`:改打 `*confv1.Bootstrap`，并把断言从 `Core().Enabled`(被 otel core Tee 后不可信)换成**接管 `os.Stdout` 断言真实输出** —— 级别过滤/JSON 可解析/console 非 JSON/caller 行号；顺带纠正老用例的错误断言(非法级别回落的是 **Debug** 不是 Info)。`registry`:删掉已不存在的 `ParseToTCPAddr`/`TtlDuration` 用例，改用 **httptest 桩 Consul Agent**(注册/心跳/注销三端点)打真实 client，断言注册报文的端口取自 `Server.Addr`、地址取自 `AppInfo.Host`、CheckID 为 `service:<ID>`、`Deregister` 先掐心跳再摘节点；并覆盖 fx `Module` 的完整生命周期与三条降级分支 |
| 构建与部署清单对齐 | ✅ | **Makefile**：①`--build-arg GOIMAGE` 一直是空传 —— Dockerfile 声明的是 `ARG GO_IMAGE`（下划线），改名后 merchant 那份落后的 `golang:1.25.8` 才真正生效，同步升到 1.26.1（`go.mod` 要求 1.26.1，不升会直接编译失败）；②`docker-build` 传的 `GOOS/GOARCH` 无人消费（Dockerfile 用 buildx 注入的 `TARGETOS/TARGETARCH`），改为由 `--platform $(GOOS)/$(GOARCH)` 单一来源决定，顶部默认从 `arm64` 改回与命令一致的 `amd64`；③`docker-build` 硬编 `-t ...:dev` 而 `docker-push` 推 `:$(VERSION)`，`VERSION!=dev` 时 `docker-deploy` 必然推空 —— 统一走 `$(VERSION)`；④address 的 `dev`/`pre` 从 order 抄来（`CONSUL_PATH=ecommerce/order/*`，读的是别人的配置）、payment 的 `SERVICE_NAME="payment-service "` 带尾空格（注册进 Consul 的服务名就带空格，网关按 `payment-service` 永远找不到节点）；⑤`CONSUL_ADDR=consul.app.com` 从宿主机不通，10 份统一改为 `CONSUL_KV_ADDR ?= 192.168.3.112:8500`。**deploy**：7 个服务是扁平布局，而 `make k8s-dev` 跑的是 `kubectl apply -f deploy/dev`（必然 no such file）；address/inventory/merchant/payment 四份还停在 `example/example:dev` 模板，config 是 cart 的整份复制，order/product 的 dev+prod 是 user 的整份复制。全部按 `deploy/{dev,prod}` 重生成：端口取自 Consul KV 真实 `server.addr`（user 30001…config 30010），`SERVICE_NAME` 对齐网关 `discovery:///<name>`（原先的 `cart-service-v1`/`user-identity-v1` 后缀会让路由找不到节点），删掉 `RUN_MODE`/`CONFIG_CENTER`/`CONFIG_PATH` 这套代码早已不读的 configMap；就绪探针打 `/healthz`、存活探针只探 TCP（`/healthz` 会连 DB/缓存，拿它做存活会让一次数据库抖动把所有 Pod 连环重启）。**compose**：10 份全是错的（address/merchant/payment 三份起的是 search，order 起的是 user，inventory/product 起的是 `connect-example-backend`），环境变量整体重写为与 `make dev` 逐项一致，并补 `backend/compose.yaml` 一把拉起全部服务。**.gitignore**：10 个服务里有 7 个的 `.gitignore` 写了 `Makefile`，构建入口从来没进过版本库（inventory/order/product 三个是跟踪的，说明是复制粘贴带进来的误伤）——修好的 Makefile 只存在于本机、CI 也拿不到，已移除该行并把 7 份 Makefile 一并纳入版本控制 |
| inventory 注册链路对齐 | ✅ | inventory 是 10 个服务里唯一没跟上 registry 重构的:①`Register()` 用 `SplitHostPort(r.Addr)` 拿的是 **Consul 自己的地址**,把 Consul 登记成了 inventory 的端点,网关按它路由会打回 Consul —— 改为与其余 9 个一致的 `info.Host` + 自身 `server.addr` 端口,tag 补 `info.Version`,TTL/注销时长改从 `discovery.consul.check` 读(并补上 Check.Ttl 的判空);②心跳挂在 `OnStart` 的 ctx 上,而那个 ctx 只管启动超时、`OnStart` 一返回就被取消,心跳立刻退出,服务 30s 后被 Consul 判死摘除 —— 改用 `context.Background()`;③删掉调试用的 `fmt.Printf("拆分失败")` 与无人调用的 `ParseToTCPAddr`(其 6 个用例还依赖真实 DNS 解析 example.com)。**线上 Consul KV** 的 `discovery.consul.addr` 被人手工改成 `consul.app.com:8500`(→192.168.3.110:8500,connection refused)去迁就①的 `SplitHostPort`,已按 CAS 改回与仓库种子/其余 9 个服务一致的 `consul.app.com`;`consul-kv.json` 因此无 diff。验证:`172.22.0.7:30005` tags `[v1 fx ttl]`、TTL check passing,与 cart 同形 |
| Consul 注册路径空指针修复 | ✅ | **10 个服务**的 `registry/consul.go` 同一类"判空写在解引用之后"的错,三处一并修掉:①`consulCfg.Tls.Enable && consulCfg.Tls != nil` —— 配置没写 `tls` 段(本地/内网集群的常态)直接 panic；②`Register` 裸解引用 `Discovery.Consul.Check.Ttl.Duration`，没写 `check` 段同样 panic，改为返回错误(而非裸注册：没有健康检查的实例会被 Consul 一直当健康的，流量照打进来，比注册失败更难发现)；③`TtlCheckPinger` 把 `ping_interval` 直接喂给 `time.NewTicker`，缺失或为 0 时 panic —— 且它跑在独立 goroutine 里，**panic 会带走整个进程**，改为回落 10s 默认值。原有 5 个服务的判空版本也只判了 nil 没判 `>0`，一并统一。cart 侧由 `TestModule_WithoutTLSConfig` / `TestRegister_MissingCheckConfig` / `TestTtlCheckPinger_MissingPingInterval` 覆盖 |
| payment 上线 + 网关补齐 4 条路由 | ✅ | payment 是 10 个服务里唯一起不来的:①`data.Module` 里 `NewPaymentRepo` 整个被注释掉,`fx.Provide` 却还引用着它,**编译就过不去**,所以它既不在 `SERVICES` 也不在 `compose.yaml` 里 —— 原实现依赖已被移除的 balance/consumerOrder 两个 client,恢复是另一件事,先把 repo 做成显式返回 `Unimplemented`(code 12) 的桩:服务能起、能注册,调用方拿到的是"未实现"而不是网关 503,分得清是链路不通还是功能没做;②`NewAlipay` 裸解引用 `c.Alipay.AppId`,而**没有任何一份 KV 写过 `pay:` 段**,fx 的 provider 一 panic 整个进程就没了 —— 支付宝私钥/证书是真实凭据不可能进仓库,改为缺配置时返回 nil + WARN;③payment 的 KV 是全场唯一的异类:Consul 指向已过期的 `consul.sumery.com:443`(其 CA 2026-07-27 到期)、缺 `check:` 段(注册会静默失败)、`store:` 段它的 proto 根本没有 —— 按 cart 的模板整份重生成并补空 `pay:` 占位。**网关**:`/order* /inventory* /merchant* /payment*` 四条 endpoint 此前完全没有(前端打过来是 404),补齐并配 policies —— 按 RPC 粒度而非整段放行:`CompleteOrder` 只给 merchant(给 consumer 等于允许自己把订单标记完成)、merchant 的审批/激活只给 admin(否则申请人能自己批自己)、`/inventory.v1.*` 只给 admin(服务间调用,放给 consumer 等于任何登录用户能预占/释放任意 SKU);支付宝的 `HandlePaymentNotify/Callback` 由支付宝服务端发起,不可能带 JWT,在 jwt+rbac 两个 `router_filter` 里放行,可信性靠报文验签。验证:10 个容器全 healthy 且注册 passing,四条新路由实发流量得 401(路由命中/JWT 拒绝)、回调得 200+code 12、未定义前缀得 404 作对照,accesslog 显示 `backend=172.22.0.6:30008` |

---

## 二、订单分布式一致性方案（已定）

下单跨服务事务采用 **混合模式**，不引入 Seata（Java 生态，Go 栈不适配）：

1. **可靠投递底座（必选）**：本地事务 + **Outbox 表 + Kafka**。写订单与写 outbox 同一事务，独立 relay 投递，杜绝"落库成功但事件丢失"的双写问题。
2. **A 段·建单↔库存预占（强一致 + 快反馈）**：建单事务内 **同步 RPC 调 `inventory.Reserve`**（即 TCC 的 Try），预占成功才建单成功，用户即时得到"库存不足"反馈；`inventory` 现有 `Reserve`/`ReleaseReserve` 天然是 Try/Cancel，支付成功后的确认扣减为 Confirm。
3. **B 段·建单后→支付→履约/营销（最终一致）**：走 **编舞式 Saga（Choreography）**。经 Outbox 发 `OrderCreated`；支付回调发 `OrderPaid`（库存 Confirm、订单转已支付）；取消/超时发 `OrderCancelled`（库存 `ReleaseReserve` 补偿）。

编舞 Saga 的四项治理（必须随事件驱动一起落，否则流程失控）：

- [ ] **幂等消费**：consumer 以 `order_no`/事件 ID 去重（消息至少投递一次语义）
- [ ] **显式补偿事件**：`StockReserveFailed → 订单自动取消` 等补偿作为一等公民设计，不散落
- [ ] **状态即真相**：`order_status` 作为"这单走到哪"的唯一可见状态，弥补编舞流程不可见
- [ ] **超时兜底 job**：扫 `pay_deadline` / 卡在中间态的订单做补偿或告警（编舞无中心，必须有 backstop）
- [ ] **全链路 trace_id**：事件贯穿 `trace_id`，靠 Jaeger/OTel 追踪定位

---

## 三、近期待办（按优先级）

先打通「消费者核心交易闭环」，再向商家/管理端与非核心能力扩展。

### P0 · 假成功与越权（2026-08-06 对抗评审发现，优先于一切新功能）

> 这批的共同点是**调用会「成功」但结果是错的**，或**任何登录用户都能越权**。
> 比「未实现」更危险：不会在联调时暴露，只在上量后以超卖、丢单、数据泄露的形式爆发。
> 双模型独立评审 + 逐条代码核实，全文见 `ADVERSARIAL_REVIEW_20260806.md`。
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
- [ ] **网关重试可复制非幂等写**（`gateway/proxy/proxy.go:263-310`）：补 `requestId` 幂等键，
      或对非幂等方法关闭重试（与下方「下单防重的 requestId 一直是假的」一起做）
- [ ] **搜索读的字段与 `DESIGN.md:335-370` 的 ES mapping 不兼容**（`search/internal/data/search.go:63-90`）：
      实现读 `id`/`skus[].price`/`sale_detail[].quantity`，设计写 `spu_id`/顶层 `price`/`sale_count`——
      按设计建索引则结果全为零值。二者需对齐（改实现或改设计，待决策）
- [ ] **给上述路径补测试**：本轮 22 条发现全部位于零覆盖路径上，`go test ./...` 却是全绿的——
      不补测试，修完还会重演

### 其余近期待办

- [x] **`service_name` 撞名**：已退役 `backend/services/config`；独立 config-center 用 `service.namespace=config-center` 区分遥测，系统查询精确筛选，电商 Grafana 看板排除其基础设施指标
- [ ] **订单服务**：补 `GetOrder` / `ListOrders` / `CancelOrder` RPC 与订单状态机（带守卫的状态迁移 + `order_log`）
- [ ] **一致性底座**：落 Outbox 表 + Kafka relay，替换现有进程内 `GoEventBus`（跨服务事件当前到不了其他服务）
- [ ] **建单全链路**：cart 补"按 CartItemIds 取选中项"RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车
- [x] **consumer 结算页（前端）**：已接选中项/地址弹层选择+新增/防重 requestId/下单调用，去优惠券、运费恒 0、统一 sp[]；生成 `api/order` 客户端并在 `gen/api` 导出 order
- [ ] **consumer 结算页（待后端联通）**：后端补 `CreateOrderRequest.requestId`、`CreateOrderResponse.orderNo` 并 `make api` 后，提交订单接真实响应、跳真实支付页（现为固定 `/payment/result` 占位）
- [ ] **下单防重的 `requestId` 一直是假的（迁 connect-query 时查实）**：旧代码 `client.createOrder(message as Parameters<...>[0])` 在假装 proto 有这个字段，而 `CreateOrderRequest` 只有 `cartItemIds`/`addressId`/`remark` 三个，那个 UUID 运行时直接被丢掉 —— 也就是说**防重从来没生效过**。迁移时删掉了那个 cast 和对应的 `useState`，把「假装成立」改成了明面上不成立，结算页留了 TODO。要真生效得先补 proto 字段再 `make api`，与上一条一起做
- [ ] **cart 的删除/改数量前端未接线**：`RemoveCartItem` 后端实现完整；**`UpdateCartItemQuantity` 后端也不完整**——`UpdateCartItemQuantityParams` 里根本没有 Quantity 字段（`internal/data/cart.go:57`），即便前端接上也改不了数量，需先补字段（本行原写「后端实现完整」，2026-08-06 回扫订正）。前端 `useCart` 的 `removeItem`/`updateQuantity` 只动本地 valtio store 不发请求 —— **用户删掉商品后刷新页面它会回来**（`GetCart` 拉的还是旧数据，同步 effect 会 clear 再灌回去），即删除与改数量这两个功能对用户实际不存在。修法：两个 hook 各接 `useMutation` + `invalidateQueries`，模式与现有 `addProductToCart` 同构。**同批的 `GetCartSummary` 已删**（2026-08，见下一条）
- [x] **购物车 cart_item_id 修复（前后端已闭环）**：后端 `AddProductToCart` SQL 改 `RETURNING id`、`AddProductToCartResponse` 增 `cart_item_id`（proto/biz/data/service 已改，`make api` 已跑，`make sqlc` 需在有 DB 的环境重跑以校验，手写已对齐）；前端 `store/cart.ts` 删除伪造 ID、`useCart` 从 `GetCart` 取真实 ID、`api/cart` 乐观新增改用后端返回的真实 `cart_item_id`
- [ ] **consumer 订单页**：订单列表/详情接真实查询 API，替换 mock
- [ ] **支付闭环**：`payment/result` 接支付状态查询 + 回调后订单状态同步（订单订阅 `OrderPaid`）
- [ ] **库存联动**：下单同步 `Reserve`（TCC-Try），支付成功确认扣减，取消/超时 `ReleaseReserve`
- [ ] **商品服务 ListProducts（设计已定，见 Design.md）**：首页无限滚动 + 游标(keyset)分页，无总数；`ProductCard` 含 brand/价格区间(min~max)。落地：`product.proto`→`make api`→`query.sql`→`make sqlc`→biz/data/service 样板→前端 `useInfiniteQuery` 接首页
- [x] **商品示例数据**：`schema/examples/spu.sql`+`sku.sql` 追加 3 个商品（罗技鼠标/索尼耳机/Nike 跑鞋，SPU 5–7，多 SKU）
- [ ] **推荐链路收尾**：~~建表~~ / ~~修 gorse 部署~~ / ~~product item 同步实测~~ 已完成；只差把带 `recommend:` 的 `ecommerce/{product,behavior}/dev.yml` 上传 Consul KV → 起服务端到端验证 Track/Recommend/SimilarItems → 删掉 gorse 里的 `smoke-a/b/c`
- [ ] **consumer 接入 tracker**：`tsconfig.json` 加 `@ecommerce/tracker` paths、`package.json` 加 `workspace:*` 依赖、入口 `initTracker({gatewayUrl})`、商品卡挂 `useImpression`、详情页挂 `useProductView`、加购/收藏/支付成功处补 `tracker().cart/favorite/purchase`
- [ ] **领域事件**：引入 Kafka，落地 `OrderCreated/OrderPaid/OrderCancelled` 事件驱动（编舞 Saga）
- [ ] **订单缺陷修复**：金额改 `decimal`（现为 `float64`）、修 `AddressPostalCode` 空指针、统一 `merchant_id` 类型（UUID）、`Complete()` 应要求已发货
- [ ] **merchant 端**：新增 `api/` 客户端，接商家入驻/商品/订单
- [ ] **admin 端**：新增 `api/` 客户端，接商家审核/用户/类目管理
- [ ] **RBAC**：补齐三角色细粒度权限校验与网关策略
- [ ] **测试**：补 consumer 关键路径 playwright/vitest 用例、后端核心 biz 单测
- [ ] **日志限流（方案已定稿，待拍板实现）**：防"基础设施故障 → 周期性错误日志"风暴（真实暴露面：PG 挂时 behavior `flush()` 每 2s 一条 ERROR、Consul 断连时 11 个服务的 `TtlCheckPinger` 各每 10s 一条，且都经 otelzap 走网络到 Loki，故障时恰是网络最脆弱时；DEBUG 级别现在能热改，忘改回去的风险也变高了）。**机制**：用 zap 内置 Sampler Core 包在 `newLogger` 的 Tee 外层（两条通路 stdout+otelzap 都受管），按 message 键控——结构化日志的 message 是常量串，等价于 VM 按调用位置限流；不选 fluent-bit/collector 侧（只保护存储，保护不了应用自身 I/O）。**分级**：FATAL/PANIC 永不限；ERROR/WARN 每秒同消息前 3 条放行、之后 1/100；INFO 前 10 条；DEBUG 跟随或不限。**压制必须可见**：丢弃钩子打 OTel counter `logs_suppressed_total`（带 level 标签）进 VM——压制速率突增本身就是故障信号，比日志更早；静默压制是最大反模式。**配置**：第一版写常量不动 proto（阈值不是按环境调的东西），要调再走 `Log.Application` 加字段。**铺开**：`internal/pkg/log/log.go` 10 份复制关系全改（同日志级别热生效那轮的改法），网关日志栈不同这轮不动。**测试**（先跑红）：①1s 内 1000 条同消息 ERROR 只写出 ~13 条 ②counter 记到 ~987 ③风暴中其他消息与 FATAL 直通；端到端停 PG 实测"前 3 条 + 稀疏心跳"。待定两点：阈值 3/100 可调；INFO 是否纳管（更保守就只管 ERROR/WARN）
- [x] **可观测性**：Loki 日志采集、VictoriaMetrics 指标、Grafana 看板（业务盘 + 基础设施盘）均已落地，见 `observability/grafana/`
- [x] **前端错误基线**：`vp lint` 的 25 条告警已清零；修复未处理导航 Promise、定位 API 的 async Promise executor、SKU JSON 属性的 `[object Object]` 展示风险与 `VirtualList` 对函数式 `sx` 的错误展开。consumer、merchant、admin 的生产构建均通过
- [x] **merchant 首包拆分**：补齐已安装但未启用的 TanStack Router Vite 插件，修正报表路由的 `as any` 非字面量声明后启用 `autoCodeSplitting`。首页入口从 `926.92 kB`（gzip `298.70 kB`）降至 `340.92 kB`（gzip `108.89 kB`）；ECharts 报表移至仅访问 `/reports` 才加载的独立 `526.58 kB` chunk
- [x] **可观测性 · RPC 指标基数失控（已修）**：11 个服务的 otelconnect 拦截器加 `WithoutServerPeerAttributes()`。`net_peer_port` 按 TCP 连接取值，实测 cart 单个 `rpc_server_duration_milliseconds_count` 就有 39 条序列、每条只有一个样本且永不递增 → `rate()` 恒为 0，「请求率/错误率/P95」在改之前算的都是错的值。代价：server span 与指标上不再有 `net.peer.*`（调用方 IP 仍能从 trace 上游 span 看到）
- [x] **可观测性 · 采样率可配（已落地）**：`observability.trace.sample_ratio`（wrapper 类型，不配=1.0 全采）+ `observability.metric.export_interval`（不配=30s）。上生产前把 `sample_ratio` 显式调下来；采样器是 `ParentBased(TraceIDRatioBased(x))`，整条链的采样决策一致，不会采出半截 trace
- [ ] **可观测性 · 采集管道自盲（优先级最高，代价最小）**：`otelcol_*` 不在 VM 里，只在每个 collector pod 的 `:8888`，没有任何东西采集它。后果是"遥测有没有在半路丢"只能靠 `kubectl port-forward` 逐个 pod 看——2026-08-06 排查 trace 断链时就是这么干的。补法：collector 加 `prometheus` receiver 自采 `127.0.0.1:8888`，约 30 个序列。做完基础设施盘补一行 accepted/sent/send_failed + 队列深度
- [ ] **可观测性 · k8s 视角（单独一轮，勿与看板混做）**：上 `kubelet_stats`（容器/Pod CPU 内存）+ `k8s_cluster`（Pod 重启次数、Deployment 副本状态）receiver，distro 里都有、无需引入新组件。两个前置约束：①都是基数敏感的，`kubelet_stats` 要按 collector CR 里已有的那套思路控制维度（**别带 pod 名**，Pod 名带 ReplicaSet 哈希，每次发版全部序列作废重开一套）②`k8s_cluster` 是集群单例语义，在 DaemonSet 下**必须配 `k8s_leader_elector`**，否则每个 pod 各采一遍 = N 倍重复计数，且要加 ClusterRole
- [ ] **可观测性 · fluent-bit k8s 标签失效**：`fluent-bit.conf:78` 的 `Label_keys $k8s.pod_name, $k8s.namespace_name, $k8s.container_name` 取不到值，Loki 里这三个标签的值是字面量 `".pod_name"` 之类，日志按 pod/namespace 下钻不了。根因：第 61-62 行 `Nested_under kubernetes` + `Add_prefix k8s.` 把字段拍平成了名字里带点的**扁平 key**，而 record accessor 把 `.` 当嵌套分隔符。改 `$['k8s.pod_name']` 形式
- [ ] **可观测性 · 网关指标未实现**：`gateway/` 下没有任何 meter（只有 tracing 中间件），`http_server_*` 整族不存在，所以看板上「网关→上游 HTTP 时延」这张图已删。要看网关侧耗时得先加 metrics 中间件
- [ ] **可观测性 · 10 个电商服务缺 Go 运行时指标**：goroutine/堆/进程 CPU 内存全都没有。唯一在报的是**独立仓 config-center**（它实现了 `internal/pkg/sysstat`），而不是本仓任何服务；它以 `service.namespace=config-center` 区分遥测。把那套搬进 10 个服务，或抽成共享埋点。附带：config-center 未装 OTel ErrorHandler，导出失败没有任何日志（本仓 10 个服务已在 2026-08-06 那轮补上，可照抄）
- [ ] **技术债**：修复 `product/$spuCode.tsx:156` 的 `shopName` 类型报错；清理其余 mock 数据

### 可观测性「统一关联底座」评审新增待办（2026-08-06,全文见 `observability/OBSERVABILITY_REVIEW_20260806.md`)

> 该轮用集群真实数据 + 双模型对抗评审验证「五维统一采集·存储·查看·分析」目标。§234/236/237/238 四条**已被本轮实测复核确认仍未修**(尤其 §236 fluent-bit 标签,Loki 里 `k8s__pod_name` 就是 `.pod_name`,日志按 pod 下钻彻底不可用)。以下为**新查出的确认缺陷**:

- [ ] **可观测性 · PII 脱敏形同虚设(P0 安全)**:部署中 fluent-bit lua 手机号脱敏用 `(%d{3})%d{4}(%d{4})`,**Lua 模式不支持 `{n}` 量词**,匹配不上任何手机号=空操作;更严重的是 `Merge_Log On`+`Keep_Log On` 保留原始 `log` 明文字段,连有效的 email 脱敏也被绕过——完整未脱敏 JSON 整条进 Loki。且脱敏只碰顶层 `email`/`phone` 两键,漏掉 `payment/internal/server/logging.go` dump 的 `form_data`(交易/回调数据)、RUM 的 `user_id`/`session_id`、debug 日志里的 bearer token。改法:`Keep_Log Off` + 手机号用有效 pattern + 扩展脱敏字段名单
- [ ] **可观测性 · RUM 与后端 trace 无 join key**:前端 `packages/perf` 用 web-vitals + 手写 Connect-JSON,无 `@opentelemetry/*`、不透传 traceparent、后端不回 Server-Timing——慢 `frontend.api.duration` 无法关联到后端 span,`anon_id`/`session_id` 只在日志不在 metric/span。且只有 consumer 一个前端调 `initPerf`,merchant/admin/config 三个没接。DESIGN.md 声称的「前端→网关→微服务全链路」前端那段不存在
- [ ] **可观测性 · 网关 5xx 被记成成功**:`tracing.go:81-90` 只在 `err!=nil`(传输层错误)时 `SetStatus(Error)`,后端返回 HTTP 503 但 `err==nil` → span 状态 OK、`logging.go` 记成 `LevelInfo`。Jaeger 错误检索、日志 error 级告警都漏掉真实 5xx。改法:按 `reply.StatusCode>=500` 设 span/日志级别
- [ ] **可观测性 · 网关采样口径与后端相反**:gateway `AlwaysSample()`(非 `ParentBased`),后端 `ParentBased`;网关是 trace 根永远 100% 采样,设 `sample_ratio` 也压不住,高峰会压垮 collector + 单副本 Jaeger。网关改 `ParentBased(TraceIDRatioBased)` 并统一读同一采样率
- [ ] **可观测性/安全 · 免鉴权入口身份可伪造**:gateway jwt 中间件命中白名单(`telemetry.v1/CollectWebVitals`、`behavior.v1/Track`)时直接 return 不剥离入站头,rewrite/remove-header 中间件在 config.yaml 全注释掉;`behavior/identity()` 又把 `x-md-global-user-id` 当可信源。攻击者带 `x-md-global-user-id:<受害者ID>` 即可冒名上报,污染统一口径身份基座。补一条入站 `x-md-*` 剥离中间件
- [ ] **可观测性 · 看板两处口径错**:①`build_infrastructure.py:133-139`「DB 错误率」= `(errors or count*0)` 画的是**错误/秒不是比率**,1 err/s 混在 10000 ops/s 里飘红误报,需除以操作总量;②`build_infrastructure.py:38-41` 节点覆盖 stat 阈值 ≥2 为绿、desc 说「node1 是 control-plane collector 不调度」——**实测已不成立**(collector/fluent-bit DaemonSet 现 3/3,VM 里 node1/2/3 各 32 条 system 序列),阈值应对齐 3 节点否则掉 1 节点仍绿
- [ ] **可观测性 · 事件/变更两维未采**:无 kube-state-metrics、无 k8s event exporter,Kubernetes 事件、Pod 状态、ArgoCD 变更历史/部署 marker 都不进面。CrashLoopBackOff+内存压力的发布事故无 event/restart 序列可查(与 §235 k8s 视角一并做)
- [ ] **可观测性 · 生产级 HA 缺失**:Jaeger(badger 本地盘)、VM(single 本地 PV)、Loki(single-binary)、Grafana 均单副本,承载卷节点故障时无法带数据漂移。整个可观测栈在 `cloud-native-deploy` 的 imperative `install.sh` 里、未纳 GitOps,节点上还手改过 loki values;`loki/helm/other/install.sh:51` 等处 MinIO 凭据明文进 Git
- [ ] **可观测性 · `OTEL_LOGS_EXPORTER: "none"` 是死配置**:该 env 无任何 Go 代码读(grep OTEL_ 零命中),`log.go` 无条件 `NewTee(stdout, otelOTLP)`。日志实际同时经 stdout→fluent-bit 和 OTLP→collector→Loki 两条路进 Loki,标签 schema 不兼容(`k8s__*` vs `service_name`),无单一 LogQL 覆盖全部日志。要么真接 autoexport 让该 env 生效,要么删掉误导性注释

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

## 五、会话记录：配置中心迁移与 Cart 灰度（2026-08）

### 问题：遗留的 registry 测试、网关测试包和 Check Connect import 应如何处理？

**回答：** 目标是让测试只覆盖仍存在的实现：按照当前 registry/config 接口重写 stale
测试，修正网关包的依赖与断言，并将 `checkv1connect` 的旧
`connect-go-example/...` import 改为本仓模块路径；若仓库中已没有对应实现，则删除失效测试。
本次迁移摘要没有保留这些子任务的可验证完成记录，继续处理前应重新运行相关包测试确认现状。

**步骤：**

1. 分别运行 address、merchant、payment 的 registry 测试，以及网关 config/cors/jwt/rbac/routerfilter 测试。
2. 以仍在使用的构造函数、环境变量和接口为准改写断言，删除只引用已删 API 的用例。
3. 搜索并替换 Check API 生成代码及调用处的旧 module import。
4. 对每个修复后的包运行 `go test`，不要把其他代理的工作区改动纳入提交。

### 问题：Cart 如何接入独立配置中心，同时支持随时切换配置来源？

**回答：** Cart 已改用独立 `github.com/lens077/config-center` Go SDK。启动时读取本地
`CONFIG_SOURCE_FILE` 的 `SourceConfig`，由 `type` 选择 `file`、`consul` 或
`config_center`；不做静默自动降级。默认 `make dev` 走配置中心，`make dev-consul`
保留历史 Consul 路径。

**步骤：**

1. 维护未入库的 `backend/services/cart/configs/source.dev.yaml`，填写当前灰度 source。
2. 通过 `make dev` 启动 Cart，并确认它与独立配置中心建立连接。
3. 需要回退或对照时使用 `make dev-consul`，而不是改业务代码。
4. 生产迁移使用独立 SDK 的远端模块版本，不使用本地 `replace`。

### 问题：使用既有配置进行配置中心和 Cart 灰度，应如何验证？

**回答：** 已使用历史 Consul 中的 `ecommerce/config/dev.yml` 为独立配置中心启动自举，
且不把敏感配置写入工作区。Config Center 的 `/healthz`（30010）与 Cart 的
`/healthz`（30006）均返回 `200`；Cart 与 30010 存在已建立连接，说明 SDK 的
`config_center` source 生效。

**步骤：**

1. 将历史 bootstrap 仅经标准输入传给配置中心的 `make dev`。
2. 配置中心健康后启动 Cart 的 `make dev`。
3. 用只读 `curl` 验证 `/healthz`、`GetCart`，避免测试写入共享开发数据。
4. 集群阶段另建 Config Center IAM/bootstrap/Cart selector Secret，并以单副本 Cart canary 发布。

### 问题：如何提供方便 IDE 调试的 Cart HTTP 请求并发布包含 SDK 的 dev 镜像？

**回答：** `backend/services/cart/internal/tests/req.http` 已整理为本地直连的 Connect
HTTP Client 请求，使用正确的 `x-md-global-user-id` 元数据与 RPC 字段，并明确标记
会写入开发购物车的请求。`make docker-deploy VERSION=dev` 已构建并推送 Linux/amd64
镜像 `ccr.ccs.tencentyun.com/sumery/cart:dev`。

**步骤：**

1. 在 IDE 打开 `internal/tests/req.http`，先运行健康检查和只读的 GetCart。
2. 仅在需要时运行 Add/Update/Remove 三个写请求，之后可用 GetCart 确认结果。
3. 使用等价 `curl` 进行自动化本地烟测；本次三条只读调用均返回 `HTTP 200`。
4. 使用 `make docker-deploy VERSION=dev` 生成并推送镜像；构建基础镜像必须满足根
   `go.mod` 的 Go 版本要求（目前为 `golang:1.26.5-alpine3.23`）。

**验证记录：** `go test ./services/cart/...` 已通过；远端 `:dev` OCI index 摘要为
`sha256:d4daa8ca7fa2f2e8272d449e1e6d887ec9cf07e05b63fa912edb3fd909ba2a74`，Linux/amd64
manifest 为 `sha256:26537ddf368b58ea10067a58948c636a6de862307a20df5a54a784b92b525d5c`。

**提交注意：** Cart 的 Dockerfile、Makefile 和 HTTP 请求文件应只单独暂存。提交钩子
调用裸 `pnpm exec commitlint`；若环境仅有 `corepack pnpm` 而 PATH 中没有 `pnpm`，应先
修复 pnpm shim，再正常提交，不能以 `--no-verify` 绕过规则。
