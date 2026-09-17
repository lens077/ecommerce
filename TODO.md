---
todo-spec: 1
---
# 项目待办与进度

> **本文件是 TODO 项的唯一真相源。** 它只回答四件事：有哪些待办、优先级、当前状态、明细在哪。
> 待办明细按 [`docs/TECH.md`](docs/TECH.md) 的章节体系拆分到 [`docs/todo/`](docs/todo/README.md)；
> 本文件承担**全局优先级视图 + 分类索引 + 领域状态表**。
>
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　🔴 有阻断性缺陷　⬜ 未开始　— 不适用/已退役

## 纪律（改待办前先读）

1. **只在改动涉及 TODO 项时才回写本文件**：完成 → 勾选/改状态；部分完成 → 改状态与缺口一句话；
   目标变了 → 改写该项；不再需要 → 删除。与任何 TODO 项无关的改动**不进本文件**。
2. 本文件**不记流水账、不存证据**。「某天做了什么」「实测数字与处置过程」「会话记录」按月追加到
   [`docs/progress-archive/`](docs/progress-archive/) 的 `YYYY-MM-progress-log.md`（不可变历史，没有当月文件就新建）；
   调研报告归 [`docs/reports/`](docs/reports/)；CI 发版行由流水线写进
   [`docs/progress-archive/ci-releases.md`](docs/progress-archive/ci-releases.md)。
   `scripts/verify-context.sh` 的 `[TODO-CLEAN]` 拦两种形态：以日期开头的行、超过 600 字节的单行。
3. 任何待办的新增、勾选、关闭、改优先级，都必须同步本文件的分类索引
   （至少更新该分类的未完成计数与最高优先级项）。分类文件与本文件冲突时，**以本文件为准**。
4. 目标态、选型理由**不写在这里**——技术架构与选型的最高真相源是 [`docs/TECH.md`](docs/TECH.md)，
   业务与领域设计是 [`docs/design/`](docs/design/README.md)，服务拓扑是
   [`.service-matrix.yaml`](.service-matrix.yaml)，运行时事实的写法见
   [`context/team/live-facts.md`](context/team/live-facts.md)。
5. 96000 B 预算门禁保留为兜底；2026-09-16 重构前的全部证据原文见
   [2026-09-16 快照](docs/progress-archive/2026-09-16-todo-status-snapshot.md)。

---

## 一、全局优先级视图

**未完成合计 161 项，其中 P0 共 18 项**（计数口径：各分类文件顶层 `- [ ]` 复选框实数，
`grep -c '^- \[ \]' docs/todo/*.md`，按未完成数降序）。

P0 的判据是**后果**不是紧迫感：「调用会成功但结果是错的」「任何登录用户都能越权」一律 P0——
它们不会在联调时暴露，只在上量后以超卖、丢单、数据泄露的形式爆发。

### P0 · 必须先于一切新功能

| # | 事项 | 分类 |
|---|---|---|
| 1 | 库存 `Reserve` 静默无操作（WHERE 比对未来版本号，永远命中 0 行） | [微服务](docs/todo/微服务与交易闭环.md) |
| 2 | 库存 `ReleaseReserve` 是 panic 桩 | [微服务](docs/todo/微服务与交易闭环.md) |
| 3 | `CreateOrder` 返回假成功（用户看到「下单成功」但无订单） | [微服务](docs/todo/微服务与交易闭环.md) |
| 4 | `CompleteOrder` 不落库 | [微服务](docs/todo/微服务与交易闭环.md) |
| 5 | 地址服务全线越权（SQL 无 user 归属校验） | [微服务](docs/todo/微服务与交易闭环.md) |
| 6 | 商家审批全表 UPDATE（缺 WHERE） | [微服务](docs/todo/微服务与交易闭环.md) |
| 7 | 登录 token 落日志 | [微服务](docs/todo/微服务与交易闭环.md) |
| 8 | `AddProductToCart` 必然失败（INSERT 缺 `shop_name`） | [微服务](docs/todo/微服务与交易闭环.md) |
| 9 | 商家 `RejectApplication`/`ActivateMerchant` 是 panic 桩 | [微服务](docs/todo/微服务与交易闭环.md) |
| 10 | 给上述路径补测试（22 条发现全在零覆盖路径上，`go test` 却全绿） | [微服务](docs/todo/微服务与交易闭环.md) |
| 11 | 网关补 `redis-tls-ca` Secret（全集群实测确认不存在） | [鉴权](docs/todo/零信任鉴权与Session.md) |
| 12 | 移除 legacy bearer JWT 轨（与 §13 红线直接冲突，需定退役期限） | [鉴权](docs/todo/零信任鉴权与Session.md) |
| 13 | PII 脱敏形同虚设（Lua 不支持 `{n}` 量词，等于空操作） | [可观测](docs/todo/统一可观测性体系.md) |
| 14 | 免鉴权入口身份可伪造（`x-md-global-user-id` 未剥离） | [可观测](docs/todo/统一可观测性体系.md) |
| 15 | 一致性底座：Product/Order 事务内 producer、重试/退避、fail-stop、DLQ 与重放审计 | [事件](docs/todo/数据一致性与事件驱动.md) |
| 16 | 领域事件落地（`OrderCreated`/`OrderPaid`/…） | [事件](docs/todo/数据一致性与事件驱动.md) |
| 17 | 轮换 Config Center 预览中暴露的搜索凭据（日志不可撤回） | [鉴权](docs/todo/零信任鉴权与Session.md) |
| 18 | 轮换 public 仓 git 历史泄露的全部凭据（历史已重写强推、凭据已轮换；剩 GitHub Support 清理悬空对象） | [鉴权](docs/todo/零信任鉴权与Session.md) |

### 分类索引

| 分类 | 对应 TECH.md | 未完成 | P0 |
|---|---|---:|---:|
| [统一可观测性体系](docs/todo/统一可观测性体系.md) | §9 | 25 | 2 |
| [微服务与交易闭环](docs/todo/微服务与交易闭环.md) | §5 / §4.3 | 25 | 10 |
| [基础设施与部署模型](docs/todo/基础设施与部署模型.md) | §7 | 24 | 0 |
| [文档与协作机制](docs/todo/文档与协作机制.md) | —（harness） | 14 | 0 |
| [前端技术栈与工程化](docs/todo/前端技术栈与工程化.md) | §11 | 17 | 0 |
| [零信任鉴权与 Session](docs/todo/零信任鉴权与Session.md) | §8 | 16 | 4 |
| [供应链与交付流水线](docs/todo/供应链与交付流水线.md) | B 表 / §7.1 | 14 | 0 |
| [数据一致性与事件驱动](docs/todo/数据一致性与事件驱动.md) | §3 / §4 | 17 | 2 |
| [服务发现与配置中心](docs/todo/服务发现与配置中心.md) | §10 | 9 | 0 |

---

## 二、领域状态表

> 每行只写「状态 + 一句缺口 + 明细在哪」。**处置过程与证据链**不在这里——重构前的原文见
> [快照](docs/progress-archive/2026-09-16-todo-status-snapshot.md)「二」，之后的按月进 `docs/progress-archive/`。
>
> ⚠️ 下表的运行态断言（GitOps 通没通、某组件在不在跑）**沿用快照里最后一次实测，本轮未重测**。
> 拿它做判断前，按 [live-facts.md](context/team/live-facts.md) 的复验命令核一遍；
> 谁重测了就在对应行补 `〔实测 YYYY-MM-DD〕`。

### 0. 发布与部署

| 项目 | 状态 | 缺口 / 明细 |
|---|---|---|
| 发布链（tag → CI → 晋级 → 部署） | ✅ | 入口 [PRODUCTION-RELEASE.md](docs/PRODUCTION-RELEASE.md)；打 tag 前本地拦截 `scripts/verify-release-local.sh` |
| 部署清单双真相源（helm ≡ 裸 manifest） | ✅ | 语义由 `scripts/verify-deploy-parity.sh` 守 pre/prod 两环境（[deploy-parity.md](context/team/deploy-parity.md)）；格式由 `scripts/verify-kyaml.sh` 守 KYAML，`helm/files/zero-trust.yaml` 豁免（[kyaml-manifests.md](context/team/kyaml-manifests.md)） |
| 部署环境 | ✅ | 只剩 pre / prod 两层（dev 集群已删，开发走 remote-dev，见 [local-env.md](context/team/local-env.md)） |
| 两远端 CI 职责 | ✅ | GitLab = 每次 push 的代码门禁；GitHub = 仅发布 tag 的构建/签名/发布链。见 [git-commit.md](context/team/git-commit.md) |
| CI 遗留缺口 | 🟡 | `update-manifests` 持有能推 main 的 admin PAT；发布 tag 四条纪律在 CI 零校验；镜像缺一次从 digest 拉起的冒烟。见 [供应链](docs/todo/供应链与交付流水线.md) |
| 首次接管未纳入策略 | 🟡 | `values-prod.yaml` 里 NetworkPolicy 与 OTel ExternalSecret 均关闭（前者从未在线上验过、后者指向不存在的 store），两条独立待办见 [基础设施](docs/todo/基础设施与部署模型.md) |

### 1. 集群与基础设施

| 项目 | 状态 | 缺口 / 明细 |
|---|---|---|
| K8s 集群（node3–node5） | ✅ | 三节点 arm64/amd64 混布；唯一一套集群。容量结论仍只取自近零流量 |
| 节点容量 | 🟡 | node3 周期性内存风暴曾致新 Pod CrashLoop（用户裁决暂不动 node3）；见 [基础设施](docs/todo/基础设施与部署模型.md) P1 |
| 告警未唤起人 | 🔴 | CrashLoop 类故障被探针「连续成功 2 次」判成瞬时抖动；三条慢性告警稀释注意力。待整改：窗口内失败率判定、清慢性告警、critical/warning 分流。见 [可观测](docs/todo/统一可观测性体系.md) |
| PG 证书手册 EKU 陷阱 | 🟡 | 抢修已完成；待整改：`cert-san-resign.md` 的 EKU 改 `serverAuth,clientAuth` 并补「改 PG 证书后必须重启 patroni」。见 [基础设施](docs/todo/基础设施与部署模型.md) |
| 集群内 PG | — | 已清理；node3 Pigsty 是唯一数据面，**集群内回滚路径不再存在** |
| GitOps（ArgoCD） | 🔴 | 零 Application；chart 与实况三处不符，**禁止直接开 selfHeal**。断因链见 [GitOps 演变全景](docs/reports/2026-08-31-gitops-evolution-overview.md) |
| VPA | 🟡 | 只装 recommender；config-center 的 2 个 `InPlace` 是死配置 |
| PDB | 🟡 | 13 个单副本 Deployment 无 PDB、无法无损驱逐 |
| Tetragon | 🟡 | 唯一策略 audit-only；enforcement 待评估 |
| 装而未激活组件 | 🟡 | KEDA / Rollouts / Kyverno 全保留、各绑定激活条件；未按期激活则下轮审计降级卸载 |
| 未安装 | — | Descheduler、OpenCost、Chaos Mesh（条件触发，见 TECH.md B 表） |

### 2. 事件与搜索

| 组件 | 状态 | 缺口 / 明细 |
|---|---|---|
| Kafka（Strimzi，k8s `kafka` ns） | 🟡 | CDC 线在用；领域事件线零业务接线（P0 #15/#16） |
| Elasticsearch（k8s `elasticsearch` ns） | ✅ | 已切流，Sink 写入；待办：聚合筛选、热门词、固定查询集相关性基线 |
| Kafka Connect（Debezium + ES Sink） | ✅ | 定稿为两条数据线共用的生产搬运层；复制槽已声明为 Patroni 永久槽 |
| CDC 链告警 | 🟡 | 规则随 node3 exporter 删除后只剩槽告警；见 [可观测](docs/todo/统一可观测性体系.md) |
| NATS / Meilisearch | — | 均已退役 |
| 两条数据线判据 | ✅ | 行投影线（CDC）vs 领域事件线，判据见 [row-projection-vs-domain-event.md](context/project/ecommerce/events/experience/row-projection-vs-domain-event.md)；施工清单见 [事件](docs/todo/数据一致性与事件驱动.md) |

### 3. 后端服务

| 服务 | 状态 | 主要缺口 |
|---|---|---|
| user | 🟡 | BFF 登录/session 已迁 control-tower；本服务收敛为 profile，清理存量 auth SDK/配置债 |
| product | 🟡 | `ListProducts`、上下架、类目/品牌；事务内 outbox 生产者未接 |
| cart | 🟡 | `RemoveCartItem`/`UpdateCartItemQuantity` **前端未接线** |
| order | 🔴 | `CreateOrder` 假成功、`CompleteOrder` 不落库（P0 #3/#4） |
| payment | 🟡 | 5 个 RPC 均为显式 `Unimplemented` 桩；repo 主体待恢复。存量库需跑 `make migrate-up MIGRATE_SVC=payment` |
| inventory | 🔴 | `Reserve` 静默无操作、`ReleaseReserve` panic（P0 #1/#2） |
| search | 🟡 | ES 运行时已切流；待办：聚合筛选、热门词 |
| address | 🔴 | 功能齐全**但全线越权**（P0 #5） |
| merchant | 🔴 | 仅 `Submit`/`Get` 可用；两段式入驻已设计未实现（P0 #6/#9） |
| behavior | 🟡 | `Track`/`Recommend`/`SimilarItems` 已编译通过 |
| 履约 | ⬜ | 不单独建服务，并入 order 域 |
| 共享基础设施（go-connect-kit） | 🟡 | 六模块已上提到 kit，服务只留薄适配层；棘轮余 2 条。存量服务吃模板演进需先手工补 `+co:anchor`，未对任何存量服务真实执行 `co upgrade --write`。方案 `.scratch/shared-infra-kit/spec.md` |
| Consul 注册 | 🟡 | 已改守护循环并部署，当前 10 个服务 `CONSUL_ENABLED=false`、网关走 `direct://`；重开 Consul 时需同时翻开关 + 路由改回 `discovery:///`，并补「注册数 < 预期」告警 |

### 4. 网关与鉴权

| 项目 | 状态 | 缺口 / 明细 |
|---|---|---|
| control-tower 网关 / config 合一 | ✅ | 均已切流；本仓旧 `gateway/` 已删除 |
| BFF 会话（Web + 桌面） | ✅ | Web 用 httpOnly cookie、Tauri 用 session header，`/auth/me` 为登录态真相源 |
| legacy bearer JWT 轨 | 🔴 | **仍在网关**，与 TECH.md §13 红线冲突，需定退役期限（P0 #12） |
| RBAC | 🟡 | order/payment/merchant/inventory 已按 RPC 粒度授权；其余整段放行待细化。**未核**：线上 `policies.csv` 第四列，带门禁的网关上线前必须先核 |
| OpenFGA | 🟡 | 集群已就绪，**业务未接线**；对象级授权仍是 Casbin |
| 匿名购物访客轨 | 🟡 | 第 1–3 步代码已落地未部署；未完成：main.go 装配 `GuestCookie`、routes.yaml 推 Config Center、C 级服务接 `RequireUser`、`MergeGuestCart` 与前端改造。设计 [anonymous-shopping.md](docs/design/platform/anonymous-shopping.md) |

### 5. 前端

| 应用 / 项目 | 状态 | 缺口 / 明细 |
|---|---|---|
| consumer-next | ✅ | 首页与商品详情 SSR 已上线，Lighthouse 四项满分；扩页受阻于 `ListProducts`；首页设 ISR 需同时改卷挂载 |
| consumer（SPA） | 🟡 | 商品详情/购物车/个人中心/地址/登录回调已接真实 API；首页、分类、订单、支付结果待接。SPA 首屏阻塞 CSS / 启动瀑布 / icons tree-shaking 三项另立待办。`useCart` 匿名仍发一次注定 401 的请求 |
| merchant / admin | ⬜ | 仅路由骨架，无 `api/` 目录、未接后端 |
| 页内智能助手 `@ecommerce/copilot` | 🟡 | 已合入 main，**未发布**；merchant 订单页仍是 mock，写动作/确认仅为设计。边界见 [copilot.md](docs/design/copilot/copilot.md) §九 |
| 状态管理 | ✅ | Zustand，valtio 已移除 |
| 错误监控 | 🟡 | Bugsink 服务端已运行（k8s `ops` ns）；**前端 SDK + Source Map 未接** |
| 无障碍性 | 🟡 | lint / axe / Lighthouse 三层自动化已落地；待办：键盘/VoiceOver 手动走查、登录态页 snapshot 审计、渐变背景对比度抽查。手册 [accessibility.md](docs/frontend/accessibility.md) |
| 语义化 HTML | 🟡 | 标题语义已修并有断言；待办：Google Rich Results Test（需公网）、merchant `/reports` 手动走查。手册 [semantic-html.md](docs/frontend/semantic-html.md) |
| Web 性能 | 🟡 | 首页 SSR 方案与七个坑见 [web-performance.md](docs/frontend/web-performance.md)；SPA 页剩余差距是架构上限 |
| 全链路体素沙盘 S1–S3 | ⬜ | P2，设计见 [voxel-construction-site.md](docs/design/platform/voxel-construction-site.md) |

### 6. 可观测性

| 项目 | 状态 | 缺口 / 明细 |
|---|---|---|
| 采集层 | 🟡 | k8s OTel/Vector 已切 node3 Pigsty；VMAgent 缺位、与 otel-node 路线需二选一；Pod 级用量缺 kubeletstats；容器级 CFS 限流指标完全缺采（P2） |
| 黑盒探活 | ✅ | node3 `ecommerce-gatus` 独立于集群探测（刻意留在集群故障域外） |
| 主机侧巡检 | ✅ | 三台机器 `host-watchdog`；判据 [host-watchdog.md](context/team/host-watchdog.md) |
| 告警卫生 | 🟡 | 指标口径已统一（VM 下划线 / VictoriaLogs 点号 / VictoriaTraces 前缀）；慢性告警清理已交接独立会话（见分类 P1） |
| 存储层 | ✅ | node3 Victoria 三件套；k8s 侧 VM/VL/VT/Alertmanager 已删除 |
| 告警通道 | 🟡 | ntfy 现役且验收通过；企业微信为可选第二通道 |
| 链路追踪 | 🟡 | 10 个服务 + 网关 OTel 已统一；网关采样口径与后端相反待修 |
| Go 运行时指标 | 🔴 | 10 个电商服务**全缺**（goroutine/堆/进程 CPU 内存） |

---

## 三、阶段推进

> 只写「做什么 + 完成判据」，不写预估时间。阶段是**依赖顺序**不是日历；
> 条目勾选状态一律在分类文件里维护，此处只做安排。P0 全部落在阶段 0 与阶段 1。

### 阶段 0 · 集群止血 —— ✅ 六项全部完成

受控重平衡、KCM 阈值、CES 巡检告警、黑盒探活、N+1 容量验证、平台组件审计。
验收证据见 [快照](docs/progress-archive/2026-09-16-todo-status-snapshot.md)「三」与
[N+1 演练报告](docs/reports/2026-08-31-n-plus-1-drill.md)。

### 阶段 1 · 交易正确性与消费者闭环（P0 主体：微服务 10 + 鉴权 3 + 可观测 2 + 事件 2）

以 PostgreSQL 事务、唯一约束、幂等键和状态机为正确性锚点（Dragonfly 不承载库存锁或业务真相）：

1. inventory：修 `Reserve` WHERE 版本号错误、实现 `ReleaseReserve`（P0#1/#2）
2. order：修 `CreateOrder` 假成功、`CompleteOrder` 落库（P0#3/#4）
3. cart：修 `AddProductToCart` INSERT 缺列（P0#8）；前端接线 Remove/UpdateQuantity
4. address：全线补 user 归属校验（P0#5）
5. merchant：审批 UPDATE 补 WHERE、实现 `RejectApplication`/`ActivateMerchant`（P0#6/#9）
6. user：登录 token 不落日志（P0#7）；payment：恢复 repo 主体、实现 5 个桩 RPC
7. **给上述全部路径补测试**（P0#10，判据：22 条发现路径纳入 `go test` 后仍全绿）
8. 鉴权：补 `redis-tls-ca` Secret（P0#11）、legacy bearer JWT 定退役期限（P0#12）、
   轮换已暴露搜索凭据（P0#17）
9. 可观测安全：入站 `x-md-*` 剥离（P0#14）、PII 脱敏随 OTel Collector 管道收敛（P0#13）
10. 事件正确性底座：Product/Order 事务内 producer、重试/退避、fail-stop、DLQ、重放审计与领域事件落地（P0#15/#16）
11. 前端闭环：consumer 首页/分类/订单/支付结果接线；`ListProducts` 实现后 consumer-next 扩页

**完成判据**：固定集成测试 + 浏览器用例可重复验证
商品→购物车→结算→库存预占→支付→订单状态→取消/退款的成功与失败路径，不再出现假成功。

### 阶段 2 · 商家、管理与履约能力

1. merchant/admin 前端：商品、订单、审核、售后、对账与审计页面及 API（当前仅路由骨架）
2. 商家两段式入驻（已设计未实现）；商家子账号与 `merchant_id` 数据隔离
3. 对象级授权按 TECH.md §8 落 OpenFGA（集群已就绪，缺业务接线）
4. 履约并入 order 域（发货、物流单、轨迹、第三方 adapter）；
   没有独立伸缩/故障域证据不新建 fulfillment 服务
5. 通知与客服两个新服务（设计已定：[notification](docs/design/notification/notification.md) 系统发信 →
   [support](docs/design/support/support.md) 客服收件）；新增 Casdoor `support` 角色，客服复用 admin app；
   工单是 OpenFGA 首个接线试点（与第 3 项合流）。细目见分类文件 P2

### 阶段 3 · 事件、交付与可靠性闭环

1. Kafka 业务接线（Strimzi 已运行、topic 已建，本仓零客户端）：topic/partition 规划、
   consumer Inbox、retry/DLQ、保留、重放、积压 SLO 与恢复验收。
   定为「线 B」，刻意不预建：触发条件（第一个跨服务副作用的业务写）、四步施工清单与未决选择
   固定在 [`docs/todo/数据一致性与事件驱动.md`](docs/todo/数据一致性与事件驱动.md)「线 B」节；
   搬运层用 Debezium Outbox Router，不再自写 relay
2. Elasticsearch 运行时切流 —— ✅ 已完成（网络入口、API key、Config Center 写入、`search_catalog`
   迁移、alias、发布、增量验收、Meilisearch 退役、CDC 链告警）；**剩余**：固定查询集作相关性基线。
   ⚠️ 旧 search 镜像已无直接回滚路径，紧急回退必须显式重装退役组件并重建索引
3. GitOps 接回：chart 对齐实况（资源名/标签/tag 三处）→ `helm template` 与集群 diff 为空
   → 重建 Application（**未对齐前禁止 selfHeal**）；统一镜像 tag 口径是前置
4. PostgreSQL/对象存储备份、PITR、RTO/RPO 与恢复演练（node3 已成唯一数据面，无集群内回滚路径）
5. SLO 看板 + Alertmanager 企业微信实测（含 CRIT 进/WARN 不进的路由验证）
6. Cilium default-deny 补全与工作负载身份，使「只信任网关」可被强制执行
7. 采集层收敛：VMAgent vs otel-node 二选一、kubeletstats 启用、Go 运行时指标铺 10 服务

### 阶段 4 · 容量与弹性验收

1. 容量模型：用户、SPU/SKU、订单、库存流水、行为事件的总量、日增量与保留期
2. k6 基线：固定数据集、读写比、热点 SKU、峰值并发，记录 P50/P95/P99、错误率、饱和度
3. VPA 推荐值（≥7 天观测 + k6 窗口）交叉验证后人工写回 requests
4. 依据证据决定 PG 分区/归档、Elasticsearch 拓扑、Kafka partition/保留、缓存容量与 Silo 策略
5. 在 Consul 退役、Service 路由与观测指标可信后，验收 KEDA、Argo Rollouts、限流、熔断与灰度
   （或按阶段 0 审计结论卸载）

### 阶段外并行线（与阶段 1 无文件冲突，可随时插队）

| 并行线 | 与阶段 1 的冲突面 | 备注 |
|---|---|---|
| 慢性告警清理 | 零（PG 侧动手需窗口） | **已交接独立会话**：[`.scratch/chronic-alerts-cleanup/HANDOFF.md`](.scratch/chronic-alerts-cleanup/HANDOFF.md) |
| [供应链](docs/todo/供应链与交付流水线.md)：Kyverno `verifyImages` 等 | 零（纯 CI/签名域） | 组件审计裁决的绑定条件，优先级最高的并行项 |
| [前端](docs/todo/前端技术栈与工程化.md)：Bugsink SDK + Source Map | 零（`frontend/`） | 服务端早就绪 |
| [可观测](docs/todo/统一可观测性体系.md) P1 散件：dead-man、VM import 认证等 | 低（网关 5xx/采样归 control-tower 线） | |
| [文档协作](docs/todo/文档与协作机制.md) / [服务发现](docs/todo/服务发现与配置中心.md) / TLS P2 | 零 | 无 P0，见缝插针 |
| [事件](docs/todo/数据一致性与事件驱动.md)：DuckDB 试点 D0–D3 | 零（跑批工具链，不动交易路径与 outbox） | 补排未开工。**门槛在 D0**——分析消费者为 0，触发条款未成立就不开工；正式版发布后按 D2 复核 |
| QQ 机器人接入（**独立仓 `../qqbot`，不落本仓**） | 零（不动存量） | MVP 已实现并全门禁绿；**唯一阻塞：公网 HTTPS 入站端点**，须新建 `qqbot.apikv.com` 独立 HTTPRoute。评估见 [报告](docs/reports/2026-09-01-qq-bot-evaluation.md)。`/查订单`/`/物流` 未做是因 order 服务没有查询 RPC，硬依赖 P0 #3/#4 |

> 阶段 2/3/4 **不建议提前抢跑**——地基是阶段 1；事件 outbox 底座（P0#15/16）已排在阶段 1 内。

### 技术风险与应对

| 风险 | 不能采用的伪解法 | 当前应对 |
|---|---|---|
| 库存超卖/重复扣减 | Redis 分布式锁叠 PG 锁 | PostgreSQL 条件更新/CAS、行锁、唯一约束、库存流水、幂等与对账补偿 |
| 支付状态不一致 | 只相信一次回调 | 回调验签、数据库幂等、主动查询、outbox 事件、日对账与可重放补偿 |
| 峰值过载 | 把同步请求全丢进消息队列；未压测先开全局限流 | 热点识别、cache-aside、防击穿、容量基线、按 procedure 限流、弹性与降级演练 |
| 绕过网关伪造身份 | 只依赖「服务在内网」 | 移除外部直连、默认拒绝 NetworkPolicy、可信身份头剥离/重注入、workload identity |
| 搜索/事件投影漂移 | 把搜索引擎当主存储 | PostgreSQL 为真相源；投影可全量回灌，消费者幂等并监控 lag/DLQ/重放 |
| 微服务复杂度失控 | 为每个名词新建服务 | 以事务、一致性、独立伸缩与故障域为拆分门槛；新增服务先 ADR，拓扑由 matrix + structcheck 守门 |
| **控制面单点拖垮全集群** | 「节点 Ready 就等于健康」 | 控制面节点需内存余量与 iowait 告警；僵尸 Pod 回收阈值需可触发；CES/ipcache 一致性需巡检 |

---

## 四、归档

- **验收证据长文、日期流水账与会话记录** → [`docs/progress-archive/`](docs/progress-archive/)（不可变历史，按月 `YYYY-MM-progress-log.md`）
- **CI 发版记录** → [`docs/progress-archive/ci-releases.md`](docs/progress-archive/ci-releases.md)（流水线自动追加）
- **调研与评估报告** → [`docs/reports/`](docs/reports/)
- **harness 演进理由** → [`context/harness-framework/evolution-log.md`](context/harness-framework/evolution-log.md)
