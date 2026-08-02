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
| 提交规范（husky + commitlint） | ✅ | 仓库根 `package.json` 装 `@commitlint/cli` + `config-conventional` + `husky`，规则在 `commitlint.config.mjs`：Angular 十一类 type + 可选 gitmoji（带了就必须与 type 相符）+ subject 末尾禁标点。**此前四层同时是断的**（`core.hooksPath` 指向不存在的 `frontend/.husky/_`、钩子里是全角连字符 `–`、仓库根无 `package.json`、commitlint 压根没装），2026-08-02 修复并用故意写错的消息验证过拦截；cz-git 从未真正引入，不再提 |
| 代码规范（biome） | 🟡 | 前端已用，未全量接入门禁 |

### 2. 后端微服务（核心）

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| 用户认证 user | 🟡 | `SignIn`、`UserProfile` | 令牌刷新、登出、多端会话、第三方登录适配 |
| 商品 product | 🟡 | `GetProductDetail`（SPU/SKU） | **`ListProducts`（首页无限滚动/游标分页）设计已定，见 Design.md，待落地**；上下架、类目/品牌管理、`ProductChangedEvent` 同步 ES |
| 购物车 cart | ✅ | `GetCart`、`GetCartSummary`、`AddProductToCart`、`RemoveCartItem`、`UpdateCartItemQuantity` + MinIO 缩略图 URL | 选中态服务端持久化（如需） |
| 订单 order | 🟡 | `CreateOrder`(桩)、`CompleteOrder` | **`CreateOrder` 主体待实现**（幂等/核价/拆单/取地址快照/同步 Reserve/事务落库）；proto 待补 `CreateOrderRequest.requestId`(幂等键) 与 `CreateOrderResponse.orderNo/payAmount/payDeadline`；订单查询/列表、取消、状态机、`OrderCreated/Paid/Cancelled` 事件 |
| 支付 payment | 🟡 | 5 个 RPC 均为**桩**（显式返回 `Unimplemented`），服务可启动/注册/健康检查，网关 `/payment*` 已通 | **repo 主体待恢复**：原实现依赖已移除的 balance/consumerOrder client（保留在 `data/payment.go` 注释块）；支付宝凭据（`pay.alipay.*` 在 KV 里是空占位）；退款、幂等/验签加固、每日对账、`PaymentRefundedEvent` |
| 库存 inventory | 🟡 | `Reserve`、`ReleaseReserve` | 扣减确认/回补、库存流水与对账、不足预警事件、Redis 分布式锁 |
| 搜索 search | 🟡 | `Search`（ES + OTel） | CQRS 读写分离、商品数据实时同步、聚合筛选/智能排序、热门词 |

### 3. 后端微服务（支撑）

| 服务 | 状态 | 已实现 | 主要缺口 |
|------|------|--------|----------|
| 地址 address | ✅ | CRUD + `SetDefaultAddress` + `ListAddresses` | — |
| 商家 merchant | 🟡 | 入驻申请生命周期（`Submit/Approve/Reject/Get/Activate`） | 店铺信息管理、商品运营权限、发货/售后、结算账单 |
| 履约 fulfillment | ⬜ | — | 发货/物流轨迹、第三方物流对接、售后履约 |
| 结算 settlement | ⬜ | — | 佣金计算、结算单、财务对账 |
| 营销 marketing | ⬜ | — | 优惠券、满减、秒杀、会员/积分 |
| 数据分析 analytics | ⬜ | — | 指标计算、行为分析、经营报表 |
| 行为/推荐 behavior | 🟡 | `Track`、`Recommend`、`SimilarItems`（编译通过；gorse 侧语义与 product 目录同步已实测，服务本身待起） | 上传带 `recommend:` 的 Consul KV `ecommerce/behavior/dev.yml` → 起服务端到端验证；用户画像（`/api/users` labels）暂未投喂 |

### 4. 网关与 RBAC

| 项目 | 状态 | 说明 |
|------|------|------|
| 网关（身份验证/授权/路由守卫） | 🟡 | `gateway/` 已实现，集中式 Casdoor 鉴权 + 策略文件；10 条 endpoint 全部落地（`/user* /search* /product* /cart* /address* /config* /order* /inventory* /merchant* /payment*`）。远端 `ecommerce-gateway:latest` 此前是旧镜像（仍去 KV 找 `rbac/policies.csv`，而代码常量早已改为 `policies/`），启动即 FATAL —— 已重新多架构构建推送并用 `docker compose up` 拉真实远端镜像验证：10 条路由全建起、7 条鉴权路由 401、支付宝回调 200+code 12、未定义前缀 404 |
| RBAC 三角色（消费者/商家/管理员） | 🟡 | 策略模型（model.conf/policies.csv）已有；order/payment/merchant/inventory 已按 **RPC 粒度**授权（避免整段 `/svc.v1.*` 放行导致的越权），其余服务仍是整段放行待细化 |
| Casdoor 集成 | 🟡 | 登录/令牌解析打通，权限适配持续完善 |

### 5. 配置中心（Config Center）

> 设计文档见 `CONFIG_CENTER_DESIGN.md`。以 Postgres 为数据源、键值粒度、Casdoor 鉴权、玻璃态前端。

| 项目 | 状态 | 说明 |
|------|------|------|
| 设计文档 | ✅ | `CONFIG_CENTER_DESIGN.md`：架构/数据模型/RPC/鉴权/校验/玻璃态/路线图 |
| 后端 config 服务 | ✅ | 竖切代码 + **端到端联调通过**：proto + sqlc(entry/revision) + CRUD + 版本历史 + Rollback(事务) + 服务端 yml/toml/json 格式校验；已接本地集群真实 Postgres(verify-ca)/Redis(dragonfly:443)/Consul(192.168.3.112:8500);直连与经网关(admin JWT→RBAC→x-md-global-name)7 个 RPC 全部验证(含语法校验拒绝、删后 404) |
| 网关接入 config | ✅ | `gateway/configs/config.yaml` 新增 `/config* → discovery:///config-service`;`policies.csv` 新增 `p, admin, /config.v1.ConfigService/*, POST, allow`;已同步 Consul KV,网关热重载并发现 config-service |
| 网关/前端错误层统一 | ✅ | 网关侧新增 `gateway/errors/{response,mapping,cors}.go`:404/405/无可用节点/超时等**非业务错误也按 Connect 规范**回 `{code,message,details[]}` + `X-Error-Reason` 头 + `Access-Control-Expose-Headers`(跨域下前端才读得到该头);`proxy.go` 的散装 `writeError` 收敛到统一实现。前端侧新增 `packages/api/src/errors.ts` 的 `toAppError(e) → {code,codeName,reason,message,metadata,raw}`:**message 保证非空**(空 message 会让 connect-web 整个错误体退化成「未知错误」),并区分 `AUTH_REASONS`(退登)与 `PERMISSION_REASONS`(仅提示,不退登)——原先无差别退登会把「无权限」误判成「未登录」。`ErrorHandler.tsx`/`interceptors/error.ts` 改用该层,config 前端删掉 `String((error as Error)?.message)` 的兜底 hack。测试:`gateway/errors/response_test.go` + `gateway/proxy/error_response_test.go`(不重启在跑的网关,用 `httptest` 直打 handler,断言 details 的 `type`/`value` 非空——为空会被 connect-web 的 `errorFromJson` 静默丢弃) |
| 网关 JWT 时钟容差 | ✅ | `gateway/middleware/jwt/jwt.go` 增加 `jwt.WithLeeway(60s)`:修复登录后毫秒级请求因 `nbf` 零容差+微小时钟偏移被判 "token is not valid yet" → 401 → 前端退登死循环 |
| Consul 配置 KV | ✅ | 新增 `ecommerce/config/dev.yml`(真实 DB/Redis/discovery),服务启动从此加载 |
| ListNamespaces RPC | ✅ | 新增 `ListNamespaces` 返回 `NamespaceInfo{namespace, environments, key_count}`,SQL 按 `(namespace, environment)` 分组走 `idx_entry_ns_env`;前端命名空间/环境改为 Autocomplete 下拉(freeSolo,仍可输新值),删除写死的默认 namespace `ecommerce`,首次加载自动落到真实存在的 namespace。直连与经网关(401 非 404,前缀路由已匹配)均验证 |
| cart 双配置源 | ✅ | `cart/internal/pkg/config` 抽出 `Source` 接口,`source_consul.go` / `source_configcenter.go` 各自独立(自带 env 解析与客户端构造,删掉任一文件另一个仍可编译);`CONFIG_SOURCE=consul\|configcenter` 显式二选一,**不做失败自动降级**(静默降级会让服务用一份已废弃配置跑起来,比启动失败更难查);默认 `consul` 保证现有部署零改动。启动日志打印实际生效数据源。两条路径 + 两个错误分支(拼错值/缺必填 env)均实跑验证;`deployment.yaml`/`compose.yaml`/`Makefile`(`make dev` / `make dev-cc`)同步 |
| 配置加载单测 + 竞态修复 | ✅ | 删除 payment/inventory/address/merchant 4 个引用已删 API(`updateConfig`/`ValidateConfig`/`Server_HTTP.Addr`)的 stale 测试；重写 product 同类 stale 测试(还停在 `Init(configPath)` 文件配置时代)。新用例在 `-race` 下抓到**真实生产竞态**:9 个服务的 `Init` 写 `conf` 未持锁，而 `GetConfig` 用 `RLock` 读(cart 已在双源改造时修过)——已统一补 `confMu.Lock()` |
| 前端 apps/config | 🟡 | 竖切页面 + 登录健壮性:token 有效性(过期)校验 + 认证失败死循环保护(登录后仍 401 则停在登录页) + `listKeys` 仅在已认证时发起;`vite build`/`tsc` 通过。玻璃态 UI,复用 Casdoor 登录,后端链路已通(网关 :8080)。待浏览器实测完整 CRUD/历史/回滚 |
| 配置编辑器增强 | ✅ | 新增 `lib/validate.ts` 统一校验/格式化层:JSON 走 `jsonc-parser`(V8 的 `JSON.parse` 报错常常**不带位置**,拿不到准确行号)、YAML 走 `yaml` 的 `parseDocument`(`toString` 保注释与 anchor)、TOML 走 `smol-toml` + 自写的 `lib/toml-format.ts` 按行格式化(**注释全保留**,代价是不重排 key 顺序;放弃 `@taplo/lib` —— 实测是 34MB 内联 wasm)。编辑器:300ms 防抖实时校验、错误行红波浪线(marker owner `config-format` 与服务端错误的 `server` 分开,互不覆盖)、状态 Chip 显示「第 N 行 第 M 列: 原因」且可点击跳转、格式化按钮 + `Alt+Shift+F`、**校验不过禁用保存**(服务端校验仍是最后一道)、CSS 覆盖层全屏(非原生 Fullscreen API)。布局:`__root.tsx` 改 `height:100dvh` 把滚动容器下沉到 `<main>`,编辑器靠 `flex:1` 吃满剩余高度,不硬编 AppBar 高度。25 个单测(含「同一份 YAML 选 YAML 通过、选 JSON 报错」,锁住校验跟的是下拉选的格式而非文件名) |
| root 脚本 dev:config | ✅ | `frontend/package.json` 增加 `dev:config → vp run config#dev`,与 `dev:merchant` 同款 |
| 下发/Watch 热更新 | ✅ | **不经 Consul 桥接**，配置中心自成一路：`PutKey`/`DeleteKey`/`Rollback` **在写入事务内** `pg_notify('config_changed', 定位信息)`（回滚不会误发；payload 只带 ns/env/key/version，值由订阅方回查，顺带避开 8000 字节上限与密钥）→ `config/internal/data/watcher.go` 用独立 `pgx` 连接 `LISTEN`（不占池槽位）+ 进程内扇出（每订阅者 cap 16 的 channel，**满了丢事件不阻塞监听协程**；断线重连前先 `Fail()` 掉全部订阅者，宁可让客户端重连重取快照，也不留一条「还连着但永远收不到事件」的死流）→ 新增 `WatchKeys` server-stream RPC（先订阅再发快照，反过来会漏掉两步之间的变更；30s 心跳）。cart 侧 `source_configcenter.go` 实现可选的 `Watcher` 接口（类型断言发现，consul 源一行不改，保持「启动读一次」），指数退避 1s→30s 重连。**读取路径同步改造**（只推不改等于没改：原先所有消费者都在构造期拿走 `*Bootstrap` 快照）：`config.Live`(`atomic.Pointer`+订阅) → `data.PgPool` 实现 `models.DBTX` 与 `otelpgx.PoolStats`（指标注册在壳上，换池后一直有效；`Queries` 与 5 处调用点零改动）、`data.LiveRedis`、`pkg/log` 改 `zap.AtomicLevel`。**改完即可生效**：Ping 通过才换池、旧池延迟 30s 关闭（立刻 Close 会掐断 in-flight 查询）、建池失败记 ERROR 保留旧池。顺带修掉一个致命 bug：`http.Server.WriteTimeout`(5s) 会把长连接流在第一个心跳上打断（客户端每 30s 重连重取快照，看着正常实则一直在抖），新增 `withoutWriteTimeout` 只对流式路由清写截止时间。已在本地集群端到端实跑 6 项：MinIO 域名/日志级别/DB 连接池热生效、`server.addr` 只出 WARN 且端口不变、Redis 改坏记 ERROR 保留旧客户端（`/healthz` 全程 healthy）改回即重建、kill config-service 触发退避重连并由 SNAPSHOT 自愈。**其余 9 个服务照搬 cart 这套模板即可**（`internal/pkg/config` 是同一份） |
| 不热生效的三段（有意为之） | ✅ | `server`(重新绑端口会切断 in-flight 连接)、`discovery`(需摘节点重注册，滚动重启更可控)、`observability`(重建 tracer provider 会丢未导出的 span)——变更时打 WARN「该配置段已变更，但需要重启服务才会生效」，绝不让人以为改了就生效 |
| 历史页面重做 + 密钥历史脱敏 | ✅ | **页面铺平**：删掉「卡片套卡片」的嵌套外壳，改成一块面板内左右分栏；去掉 `maxWidth:1200` 铺满宽度，diff 从固定 `58vh` 改为 `flex:1` 吃满剩余高度；diff 栏补 `minWidth:0`（缺了它 Monaco 的固有宽度会把这一栏顶成窄条，正是截图里配置文本被拦腰截断的样子），并开 `useInlineViewWhenSpaceIsLimited`+`renderSideBySideInlineBreakpoint:900`+`wordWrap`——窄容器自动切内联视图，长值折行而不是被裁掉。**真实历史列表**：每行给出 `vN` + 当前/初始标记 + 相对上一版的 `+增 −删` 行数（新增 `lib/linediff.ts`，掐公共前后缀后求 LCS，超 25 万格退化为整段替换；9 个单测）+ 备注 + 作者·相对时间（精确时间在 tooltip）；内容与上一版完全相同的标「无变更」。**「暂无历史」的真凶**：原页面把 `isError` 和「真的没有历史」画成同一个空态——一个 v22 的 key 在后端短暂不可用时看着像从没改过，错误被彻底吞掉；现在分成 加载中/加载失败(带真实 message + 重试)/空 三态，回滚错误也改走 `toAppError`。回滚移到 diff 工具条并加确认弹层（会产生新版本且立刻下发），新增「对比当前 / 对比上一版」切换，左右标签不再出现 `v—`。**后端**：`toPBRevision` 此前不脱敏，`GetKey` 里被打成 `****** ` 的密钥换 `ListRevisions`/`GetRevision` 就能原样读出来——`biz.ConfigRevision` 增 `IsSecret`（由 repo 从所属 entry 带过来），service 层与 `toPBEntry` 共用 `maskedValue` 常量；领域内部（`Rollback`）读到的仍是真值。3 个单测 + 实跑验证（密钥 key 三条读路径全部 `******`，非密钥 key 回滚仍取到真实值） |
| 配置中心 Go 客户端 SDK | ⬜ | 后续：把 cart 的 `internal/pkg/config` 抽成共享包，避免 10 份复制 |
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
| 链路追踪（OpenTelemetry/Jaeger） | 🟡 | 服务端 `otelhttp` 中间件、ES OTel 传输已接入 |
| 日志（Loki/fluent-bit） | ⬜ | 部署与采集链路未落地 |
| 指标（VictoriaMetrics/Grafana） | ⬜ | 采集/看板未落地 |
| 前端测试（playwright + vitest） | ⬜ | 仅 `vite.config.ts`，缺用例 |
| 后端单元/集成测试 | 🟡 | `internal/pkg/config` **10 个服务全覆盖**(cart + address/payment/inventory/merchant/product/order/search/user/config，覆盖率 76%~85%，`-race` 全绿)：用 `httptest` 起 Consul KV / ConnectRPC 桩打**真实客户端**，覆盖选源、YAML 解析、duration 钩子、404/空值/不可达/context 取消等错误分支。cart 的 `internal/pkg/log`(100%)、`internal/pkg/registry`(90.1%) 已重写。仍缺：其余 9 个 stale 测试包(6 个 `log` + 3 个 `registry`，见下条)；各服务 biz/data/service 层 |
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

- [ ] **订单服务**：补 `GetOrder` / `ListOrders` / `CancelOrder` RPC 与订单状态机（带守卫的状态迁移 + `order_log`）
- [ ] **一致性底座**：落 Outbox 表 + Kafka relay，替换现有进程内 `GoEventBus`（跨服务事件当前到不了其他服务）
- [ ] **建单全链路**：cart 补"按 CartItemIds 取选中项"RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车
- [x] **consumer 结算页（前端）**：已接选中项/地址弹层选择+新增/防重 requestId/下单调用，去优惠券、运费恒 0、统一 sp[]；生成 `api/order` 客户端并在 `gen/api` 导出 order
- [ ] **consumer 结算页（待后端联通）**：后端补 `CreateOrderRequest.requestId`、`CreateOrderResponse.orderNo` 并 `make api` 后，提交订单接真实响应、跳真实支付页（现为固定 `/payment/result` 占位）
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
- [ ] **可观测性**：落地 Loki 日志采集、VictoriaMetrics + Grafana 指标看板
- [ ] **技术债**：修复 `product/$spuCode.tsx:156` 的 `shopName` 类型报错；清理其余 mock 数据

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
