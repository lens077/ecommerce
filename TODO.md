# 项目实现进度与待办

> **本文件是进度与待办的唯一真相源。**
> 待办明细按 [`docs/TECH.md`](docs/TECH.md) 的章节体系拆分到 [`docs/todo/`](docs/todo/README.md)；
> 本文件承担**全局优先级视图 + 分类索引 + 现状对照**。
>
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　🔴 有阻断性缺陷　⬜ 未开始

## 纪律（改待办前先读）

1. **任何待办的新增、勾选、关闭、改优先级，都必须同步回本文件**的分类索引
   （至少更新该分类的未完成计数与最高优先级项）。分类文件与本文件冲突时，**以本文件为准**。
2. 目标态、选型理由**不写在这里**——技术架构与选型的最高真相源是 [`docs/TECH.md`](docs/TECH.md)，
   业务与领域设计是 [`docs/design/`](docs/design/README.md)，服务拓扑是
   [`.service-matrix.yaml`](.service-matrix.yaml)。
3. 验收证据长文与会话记录按日期归档到 [`docs/progress-archive/`](docs/progress-archive/)
   （**不可变历史，非并行真相源**）；调研报告归 [`docs/reports/`](docs/reports/)。
4. 本文件受 **96000 B 预算门禁**（`scripts/verify-context.sh`）。超限时先把证据长文归档，
   不要提额度。

---

## 一、全局优先级视图

**未完成合计 151 项，其中 P0 共 22 项。** P0 的判据是**后果**不是紧迫感：
「调用会成功但结果是错的」「任何登录用户都能越权」一律 P0——它们不会在联调时暴露，
只在上量后以超卖、丢单、数据泄露的形式爆发。

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
| 15 | 可观测栈自身无独立存活证明（故障时先挂） | [可观测](docs/todo/统一可观测性体系.md) |
| 16 | 一致性底座：Product/Order 事务内 producer、NACK/DLQ、重放审计 | [事件](docs/todo/数据一致性与事件驱动.md) |
| 17 | 领域事件落地（`OrderCreated`/`OrderPaid`/…） | [事件](docs/todo/数据一致性与事件驱动.md) |
| 18 | `KCM_TERMINATED_POD_GC_THRESHOLD=100` 阈值缺陷（僵尸 Pod 卡 97 永不 GC） | [基础设施](docs/todo/基础设施与部署模型.md) |
| 19 | node102/103 内存仍 3.3 GB，N+1 容量目标不成立 | [基础设施](docs/todo/基础设施与部署模型.md) |
| 20 | 平台组件相对硬件严重超配（KEDA/Rollouts/Kyverno 零使用却常驻） | [基础设施](docs/todo/基础设施与部署模型.md) |
| 21 | CiliumEndpointSlice 陈旧无自愈（策略放行却静默拒绝，无告警） | [基础设施](docs/todo/基础设施与部署模型.md) |
| 22 | 轮换 Config Center 预览中暴露的搜索凭据（日志不可撤回） | [鉴权](docs/todo/零信任鉴权与Session.md) |

### 分类索引

| 分类 | 对应 TECH.md | 未完成 | P0 |
|---|---|---:|---:|
| [微服务与交易闭环](docs/todo/微服务与交易闭环.md) | §5 / §4.3 | 23 | 10 |
| [基础设施与部署模型](docs/todo/基础设施与部署模型.md) | §7 | 30 | 4 |
| [文档与协作机制](docs/todo/文档与协作机制.md) | —（harness） | 19 | 0 |
| [统一可观测性体系](docs/todo/统一可观测性体系.md) | §9 | 17 | 3 |
| [零信任鉴权与 Session](docs/todo/零信任鉴权与Session.md) | §8 | 16 | 3 |
| [前端技术栈与工程化](docs/todo/前端技术栈与工程化.md) | §11 | 16 | 0 |
| [数据一致性与事件驱动](docs/todo/数据一致性与事件驱动.md) | §3 / §4 | 14 | 2 |
| [服务发现与配置中心](docs/todo/服务发现与配置中心.md) | §10 | 8 | 0 |
| [供应链与交付流水线](docs/todo/供应链与交付流水线.md) | B 表 / §7.1 | 8 | 0 |

---

## 二、现状对照

### 0. 最近一次发布（2026-08-29 实测）

已发布 **control-tower `0.2.0`**（config `sha-c30713c`）与 **ecommerce `1.5.5`**；
dev 的 7 个相关服务已滚到 `sha-0b9b9ad`，15/15 Deployment Ready、发布 Pod restart 均为 0。
`helm/values.yaml` 的镜像 tag 已由 CI 回写至 `1.5.5`。

> ⚠️ 同日稍晚集群曾因 node101 内存耗尽发生控制面雪崩（详见下表与
> [基础设施与部署模型](docs/todo/基础设施与部署模型.md) P0 段），已恢复至 15/15；
> **该故障与本次发布无关**，根因是节点容量而非镜像变更。

### 1. 集群与基础设施（2026-08-29 故障恢复后实测）

| 项目 | 状态 | 说明 |
|---|---|---|
| K8s 集群 | ✅ | node101(cp)/node102/node103，v1.36.4，Ubuntu 26.04 / 内核 7.0 / **arm64**；**ecommerce 15/15 Deployment Ready**，17 Pod 分布 **5/6/6**（skew=1，硬 spread 生效） |
| 节点容量 | 🔴 | 每节点 4 vCPU；node101 已扩至 **6.4 GB**，node102/103 仍 3.3 GB。2026-08-29 曾因 node101 内存耗尽（可用 140 MB）引发控制面雪崩 |
| Cilium / Gateway API | ✅ | v1.20.1，KPR 严格模式（无 kube-proxy DS）；3 个 Gateway 全 `PROGRAMMED=True` |
| GitOps（ArgoCD） | 🔴 | 零 Application / 零 ApplicationSet，AppProject 仅 `default`；chart 与实况在资源名/标签/tag 三处不符，**禁止直接开 selfHeal** |
| 镜像 tag 口径 | 🔴 | 集群实跑 5 种风格（`sha-*`/`health-*`/`dev-*`/两个 `@sha256`），**无一个 `:dev`**；`helm/values.yaml` 还钉 `1.4.0` |
| VPA | 🟡 | 只装 recommender（无 updater/webhook）；15 个 ecommerce VPA 全 `Off`/`RequestsOnly` 且 `RecommendationProvided=True`；推荐地板已调至 `10m/32Mi`。**config-center 的 2 个是 `InPlace`——死配置** |
| PDB | 🔴 | 6 个中 5 个 `ALLOWED DISRUPTIONS=0`，**当前无法安全排空任何节点** |
| Tetragon | 🟡 | chart 1.7.1，三节点；唯一策略 `ecommerce-service-account-token-access` 为 **audit-only 不阻断**；enforcement 待评估 |
| 已装但零使用 | 🔴 | KEDA（0 ScaledObject）、Argo Rollouts（0 Rollout）、Kyverno（0 生效策略）——占内存与 etcd 却无产出 |
| 未安装 | — | Descheduler、OpenCost、Chaos Mesh（均为条件触发，见 TECH.md B 表） |

### 2. 事件与搜索（2026-08-29 实测；**目标基础设施已存在，缺业务接线**）

| 组件 | 位置 | 状态 |
|---|---|---|
| **Kafka 4.3.1 (KRaft)** | node3，经 node1 隧道 `:30004` | **运行中**，已建 SCRAM 用户与 `ecommerce.events` topic；本仓 `used_by: []` |
| **Elasticsearch 9.4.5 + IK** | node3 容器（回环 :9200，已开鉴权） | **运行中**；本仓无服务连接 |
| Kafka Connect 4.3.0 | node3 | 2 connector RUNNING（Debezium 3.6.1 + ES sink），属独立 CDC 演示链 |
| NATS JetStream | 集群 `nats` ns | 4/4 Running，`used_by: [search]` |
| Meilisearch v1.53.1 | 集群 `search` ns | 1/1 Running，`used_by: [search]` |

> TECH.md 的目标（Kafka + Elasticsearch）**不是「待搭建」而是「待接线」**。

### 3. 后端服务

| 服务 | 状态 | 主要缺口 |
|---|---|---|
| user | 🟡 | BFF 登录/session 已迁 control-tower；本服务收敛为 profile，清理存量 auth SDK/配置债 |
| product | 🟡 | `ListProducts`、上下架、类目/品牌；事务内 outbox 生产者未接 |
| cart | 🟡 | `RemoveCartItem`/`UpdateCartItemQuantity` **前端未接线** |
| order | 🔴 | `CreateOrder` 假成功、`CompleteOrder` 不落库 |
| payment | 🟡 | 5 个 RPC 均为显式 `Unimplemented` 桩（**本仓正确示范**）；repo 主体待恢复 |
| inventory | 🔴 | `Reserve` 静默无操作、`ReleaseReserve` panic |
| search | 🟡 | 查询路径已迁；商品事务生产者、聚合筛选、热门词待补 |
| address | 🔴 | 功能齐全**但全线越权** |
| merchant | 🔴 | 仅 `Submit`/`Get` 可用；两段式入驻已设计未实现 |
| behavior | 🟡 | `Track`/`Recommend`/`SimilarItems` 已编译通过 |
| 履约 | ⬜ | 不单独建服务，并入 order 域 |

### 4. 网关与鉴权（2026-08-29 实测）

| 项目 | 状态 | 说明 |
|---|---|---|
| control-tower 网关/config 合一 | ✅ | gateway、config、config-web 均已切流；本仓旧 `gateway/` 已删除 |
| BFF 会话（Web + 桌面） | ✅ | Web 用 httpOnly cookie、Tauri 用 session header，`/auth/me` 为登录态真相源；浏览器侧令牌机制全部退场 |
| legacy bearer JWT 轨 | 🔴 | **仍在网关**，与 TECH.md §13 红线冲突，需定退役期限 |
| RBAC | 🟡 | order/payment/merchant/inventory 已按 RPC 粒度授权；其余服务整段放行待细化 |
| OpenFGA | 🟡 | 集群 2/2 Running，**业务未接线**；对象级授权仍是 Casbin |

### 5. 前端

| 应用 | 状态 | 说明 |
|---|---|---|
| consumer-next | ✅ | 公开可收录页已转正上线 dev（App Router + 匿名 transport + ISR `revalidate=60`，2 副本 + PDB）；扩页受阻于 `ListProducts` |
| consumer | 🟡 | 商品详情/购物车/个人中心/地址/登录回调已接真实 API；首页、分类、订单、支付结果待接 |
| merchant / admin | ⬜ | 仅路由骨架，无 `api/` 目录、未接后端 |
| 状态管理 | ✅ | 2026-08-28 完成 valtio→**Zustand** 全量迁移，valtio 依赖已移除 |
| 错误监控 | 🟡 | Bugsink 服务端已运行（node3，2.5.0）；**前端 SDK + Source Map 未接** |

### 6. 可观测性

| 项目 | 状态 | 说明 |
|---|---|---|
| 采集层 | 🟡 | Vector **3/3**、集群内 OTel Collector **1/1**；**VMAgent 缺位**（TECH.md §9 要求） |
| 存储层 | ✅ | node3：VictoriaMetrics v1.149.0 / VictoriaLogs v1.52.0 / VictoriaTraces v0.10.0 |
| 存量链 | ✅ | Loki / fluent-bit / Jaeger / 集群内 Grafana **均已退役且确认不存在** |
| 告警 | 🟡 | node3 Alertmanager 0.33.1，`route.receiver=local-audit`；**无企业微信、无飞书**（配置里全是注释） |
| 链路追踪 | 🟡 | 10 个服务 + 网关 OTel 已统一至 v1.45.0；网关采样口径与后端相反待修 |
| Go 运行时指标 | 🔴 | 10 个电商服务 **全缺**（goroutine/堆/进程 CPU 内存） |

---

## 三、实施路线

> 阶段归属，不承载勾选状态；具体条目状态见上方分类索引。

**第一阶段 · 交易正确性与消费者闭环**
修复 order 假成功、inventory CAS/版本错误和 payment 未实现 RPC；以 PostgreSQL 事务、
唯一约束、幂等键和状态机为正确性锚点（Dragonfly 不承载库存锁或业务真相）；
打通商品→购物车→结算→库存预占→支付→订单状态→取消/退款的成功与失败路径；
修复 address/user/merchant 数据归属校验，完成 BFF cookie 的 pre/prod 安全属性与 legacy bearer 收尾。
**交付标准**：固定集成测试与浏览器用例可重复验证完整购物流程，不再出现假成功。

**第二阶段 · 商家、管理与履约能力**
完成 merchant/admin 的商品、订单、审核、售后、对账与审计页面及 API；
履约并入 order 域（发货、物流单、轨迹、第三方 adapter），
没有独立伸缩/故障域证据时不新建 fulfillment 服务；
落实商家子账号与 `merchant_id` 数据隔离，对象级授权按 TECH.md §8 落 OpenFGA。

**第三阶段 · 事件、交付与可靠性闭环**
接入 Product/Order 事务内 outbox，完成 Kafka topic/partition、consumer Inbox、
retry/DLQ、保留、重放、积压 SLO 与恢复验收；统一裸 manifest、Helm 与实际 workload
后再重建 ArgoCD Application（未对齐前禁止 selfHeal）；完成 PostgreSQL/对象存储备份、
PITR、RTO/RPO 与恢复演练；完成 Victoria 三件套的 SLO 看板与 Alertmanager 外部通知实测；
收紧 Cilium/NetworkPolicy 与工作负载身份，使「只信任网关」可被强制执行。

**第四阶段 · 容量与弹性验收**
明确用户、SPU/SKU、订单、库存流水、行为事件的总量、日增量与保留期，建立容量模型；
用 k6 固化读写比、热点 SKU、峰值并发与固定数据集，记录 P50/P95/P99、错误率、饱和度与成本；
根据证据决定 PG 分区/归档、Elasticsearch 拓扑、Kafka partition/保留、缓存容量与 Silo 策略；
在 Consul 退役、Service 路由与观测指标可信后，再验收 KEDA、Argo Rollouts、限流、熔断与灰度。

### 技术风险与应对

| 风险 | 不能采用的伪解法 | 当前应对 |
|---|---|---|
| 库存超卖/重复扣减 | Redis 分布式锁叠 PG 锁 | PostgreSQL 条件更新/CAS、行锁、唯一约束、库存流水、幂等与对账补偿 |
| 支付状态不一致 | 只相信一次回调 | 回调验签、数据库幂等、主动查询、outbox 事件、日对账与可重放补偿 |
| 峰值过载 | 把同步请求全丢进消息队列；未压测先开全局限流 | 热点识别、cache-aside、防击穿、容量基线、按 procedure 限流、弹性与降级演练 |
| 绕过网关伪造身份 | 只依赖「服务在内网」 | 移除外部直连、默认拒绝 NetworkPolicy、可信身份头剥离/重注入、workload identity |
| 搜索/事件投影漂移 | 把搜索引擎当主存储 | PostgreSQL 为真相源；投影可全量回灌，消费者幂等并监控 lag/DLQ/重放 |
| 微服务复杂度失控 | 为每个名词新建服务 | 以事务、一致性、独立伸缩与故障域为拆分门槛；新增服务先 ADR，拓扑由 matrix + structcheck 守门 |
| **控制面单点拖垮全集群** | 「节点 Ready 就等于健康」 | 控制面节点需内存余量与 iowait 告警；僵尸 Pod 回收阈值需可触发；CES/ipcache 一致性需巡检（2026-08-29 事故） |

---

## 四、归档

- **验收证据长文与会话记录** → [`docs/progress-archive/`](docs/progress-archive/)（不可变历史）
- **调研与评估报告** → [`docs/reports/`](docs/reports/)
- **选型对抗过程存档** → [`docs/技术栈选型对抗/`](docs/技术栈选型对抗/)（结论一律以 `docs/TECH.md` 为准）
- **harness 演进理由** → [`context/harness-framework/evolution-log.md`](context/harness-framework/evolution-log.md)
