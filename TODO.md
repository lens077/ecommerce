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

**未完成合计 155 项，其中 P0 共 17 项**（计数口径：各分类文件顶层 `- [ ]` 复选框实数；
2026-09-01 新增 1 条基础设施 P2「证书续期后手工同步 PG 与 Redis」——PG/Redis 用的是 Traefik 证书的**拷贝**而非软链，自动续期不传导，用户已决定不做钩子故必须人工执行；
2026-09-01 关闭 1 条基础设施 P2「casdoor 8000 明文端点」——**复测判定为误报**：原证据只探了 `localhost`，从 node2/node3 两个外部位置实测 8000 超时、443 正常，公网一律经 Pangolin 终止 TLS；
2026-09-01 关闭 1 条基础设施 P2「node1 PostgreSQL 加 TLS、轮换弱凭据」（复用 Pangolin 的 ZeroSSL 证书，`hostssl` 强制加密、明文实测被拒，root 口令已轮换，gorse 与 casdoor 均已切 `verify-full` 并验证健康）；
2026-09-01 关闭 1 条基础设施 P2「收窄 node1 公网数据端口」（Redis 61246 / PG 52288 已按来源收窄并双向验证）；
2026-09 DuckDB 试点补排 4 条 P2（TECH.md B 表 2026-08-28 已采纳但从未进过待办文件）；
2026-09 搜索文档同步关闭 1 条文档冲突；此前 2026-08-31 更新：阶段 0 收官关闭 4 条 P0 与 3 条当日项，新增 5 条实测发现；同日复审对齐：
鉴权分类去掉「地址越权」重复登记、「搜索凭据」升入分类 P0 与全局 #17 对齐、供应链关闭
Trivy 拦截项、matrix 的 CI 校验待办迁入服务发现；档案死链经用户裁决纳入 `[DEAD-LINK]`
门禁扫描并当日落地）。P0 的判据是**后果**不是紧迫感：
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
| 15 | 一致性底座：Product/Order 事务内 producer、NACK/DLQ、重放审计 | [事件](docs/todo/数据一致性与事件驱动.md) |
| 16 | 领域事件落地（`OrderCreated`/`OrderPaid`/…） | [事件](docs/todo/数据一致性与事件驱动.md) |
| 17 | 轮换 Config Center 预览中暴露的搜索凭据（日志不可撤回） | [鉴权](docs/todo/零信任鉴权与Session.md) |

〔2026-08-31 关闭四条 P0，证据见分类文件勾选记录：KCM 阈值（三处改 20 + 真实 GC/告警闭环验证）、
CES 巡检告警（CronJob 2m + vmalert firing 闭环）、可观测黑盒探活（node3 ecommerce-gatus + canary 闭环）、
平台组件审计（用户裁决全保留 + 条件绑定）。**基础设施分类 P0 清零。**〕

### 分类索引

| 分类 | 对应 TECH.md | 未完成 | P0 |
|---|---|---:|---:|
| [统一可观测性体系](docs/todo/统一可观测性体系.md) | §9 | 24 | 2 |
| [微服务与交易闭环](docs/todo/微服务与交易闭环.md) | §5 / §4.3 | 23 | 10 |
| [基础设施与部署模型](docs/todo/基础设施与部署模型.md) | §7 | 19 | 0 |
| [文档与协作机制](docs/todo/文档与协作机制.md) | —（harness） | 17 | 0 |
| [前端技术栈与工程化](docs/todo/前端技术栈与工程化.md) | §11 | 16 | 0 |
| [零信任鉴权与 Session](docs/todo/零信任鉴权与Session.md) | §8 | 15 | 3 |
| [供应链与交付流水线](docs/todo/供应链与交付流水线.md) | B 表 / §7.1 | 14 | 0 |
| [数据一致性与事件驱动](docs/todo/数据一致性与事件驱动.md) | §3 / §4 | 18 | 2 |
| [服务发现与配置中心](docs/todo/服务发现与配置中心.md) | §10 | 9 | 0 |

〔计数 2026-09 随搜索文档同步：`grep -c '^- \[ \]' docs/todo/*.md`，按未完成数降序〕

---

## 二、现状对照

### 0. 发布与部署（2026-08-31 对齐）

- **最近发布 tag：ecommerce `1.6.3`**（2026-08-30）。`1.6.0` 为买家实体 Customer 全仓重命名，
  `1.6.1`–`1.6.3` 为供应链门禁修复系列；签名前 Trivy 阻断与 SARIF→main 可见告警链在
  `1.6.2`/`1.6.3` 上完成真实验证（见 [供应链与交付流水线](docs/todo/供应链与交付流水线.md)）。
  helm 回写：CI 的 `1.6.3` 回写已随 `ad1bb33`（chore(sync)）合并进 main，
  `helm/values.yaml` 现为 `1.6.3`〔实测 2026-08-31 晚：github/gitlab/本地三方一致；
  同日午间实测时 GitHub main 尚无该回写〕。该文件仍**不是**集群真相源（见 §1）。
- **最近一次部署到 dev**〔实测 2026-08-29〕：control-tower `0.2.0`（config `sha-c30713c`）
  与 ecommerce `1.5.5`；dev 的 7 个相关服务滚到 `sha-0b9b9ad`，15/15 Deployment Ready、
  发布 Pod restart 均为 0。**1.6.x 尚未部署到 dev**，集群实跑 tag 见 §1「镜像 tag 口径」行。

> ⚠️ 同日稍晚集群曾因 node101 内存耗尽发生控制面雪崩（详见下表与
> [基础设施与部署模型](docs/todo/基础设施与部署模型.md) P0 段），已恢复至 15/15；
> **该故障与本次发布无关**，根因是节点容量而非镜像变更。
>
> 〔2026-08-30 实测新增〕发布之后集群又经历一次**全集群统一重启**（三节点内存扩容至 6.4 GB，
> 所有 ns 的 Pod age 同为 ~16h）；control-tower-gateway 已滚到 `0.2.1`；
> 新增 otel-node hostmetrics DaemonSet（节点级指标采集）。
>
> 〔2026-08-30 处置记录〕重启遗留的两笔债当日已清：①14/2/1 倾斜已受控重平衡回 **6/6/5**；
> ②config-center/dragonfly 的 **CES 陈旧**被容器重启潮引爆（14 Pod CrashLoop + 网关双副本齐崩），
> 删陈旧 CES + 重建 Pod 恢复，端到端复验绿（healthz 200/56ms + 真实 RPC + SSR）。
> 另：96 个僵尸 Pod 已手清、`victoriametrics`/`observability` 空置 ns 已删。
> 病理沉淀见 [`context/team/cilium-datapath-ops.md`](context/team/cilium-datapath-ops.md) 第二节。
>
> 〔2026-08-31 阶段 0 三件套落地〕KCM 阈值 / CES 巡检告警 / 黑盒探活并行完成并逐项验收
> （AgentTeams 三成员执行，队长故障注入独立复验）。**同日黑盒探活首捕一个回归并当日恢复**：
> 网关改造（Service 改名 `ecommerce-gateway-service:8080`、镜像 0.2.5）中间态删掉了外部
> HTTPRoute（API 入口 404），经裁决补建后本机与 node3 公网双向 healthz/RPC 均 200，
> Gatus gateway 两探测启用，6/6 全绿。集群实跑网关镜像 `0.2.5`〔实测 2026-08-31〕。

### 1. 集群与基础设施（2026-08-30 实测）

| 项目 | 状态 | 说明 |
|---|---|---|
| K8s 集群 | ✅ | node101(cp)/node102/node103，v1.36.4，Ubuntu 26.04 / 内核 7.0 / **arm64**；**ecommerce 15/15 Deployment Ready**（17 Pod） |
| 节点容量 | 🟡 | 每节点 4 vCPU / **6.4 GB**（三节点对齐）；**N+1 非控制面演练已通过**〔实测 2026-08-31：交易面零级联 Pending，两节点稳态内存 67%/38%〕，但搜索域不成立（meilisearch 本地 PV）且结论取自近零流量。2026-08-29 曾因 node101 内存耗尽引发控制面雪崩 |
| Pod 分布 | ✅ | **6/6/5（skew=1）**——2026-08-30 受控重平衡完成（原 14/2/1 为扩容重启遗留）；执行中引爆并修复了 CES 陈旧故障（见 §0 处置记录） |
| 僵尸 Pod | ✅ | 存量已清零；KCM 阈值改 **20** 且三处一致（manifest/bootstrap/kubeadm-config），真实注入实测 GC 与 `K8sFailedPodsAccumulating` 告警闭环〔实测 2026-08-31〕 |
| CES 巡检 | ✅ | `ces-audit` CronJob 每 2m 对账（只读 RBAC），`ces_stale_entries` 入 VM + vmalert 告警，假样本 firing 闭环已验〔实测 2026-08-31〕 |
| 黑盒探活 | ✅ | node3 `ecommerce-gatus` 独立于集群探测 shop/SSR/Pangolin/node1（带响应体校验）+ 采集器 Ready 告警，canary 闭环已验〔实测 2026-08-31〕 |
| 网关外部路由 | ✅ | 改造中间态曾致 HTTPRoute 消失（外部 404），已按裁决补建并双向验证（本机 + node3 公网 healthz/RPC 均 200），Gatus gateway 两探测启用后 6/6 全绿〔实测 2026-08-31〕 |
| Cilium / Gateway API | ✅ | v1.20.1，KPR 严格模式（无 kube-proxy DS）；**2 个** Gateway `PROGRAMMED=True`（`.132` pg-passthrough 已随 postgresql ns 清理） |
| 集群内 PG | — | `postgresql`/`cnpg-system` ns 与 CNPG CRD **均已清理**；node3 Pigsty 是唯一数据面，**集群内回滚路径不再存在** |
| 告警未唤起人（本次事故暴露） | 🔴 | **不是「没告警」，是「告警看起来像自愈抖动」**〔2026-09-01 取证〕。链路全程正常：Gatus 21:03 TRIGGERED → Alertmanager → `pigsty-alert-audit` 桥 → ntfy，桥日志里 `GatusBlackboxEndpointDown` 共 19 条。但呈现形态是**两次短抖动**（09-01 00:08–00:13 六端点、05:03–05:08 四端点，**各 5 分钟内 resolved**）而非持续 6 小时的红。成因：探针 `interval: 30s` + `failure-threshold: 2`/`success-threshold: 2`，而 CrashLoopBackOff 的 Pod 在重启间隙会短暂 Ready，凑够 2 次成功即判恢复 → 每轮崩溃都被记成「瞬时抖动已自愈」。**次要因素**：`send-on-resolved: false` 使 Gatus 侧 RESOLVED 计数为 0，与 Alertmanager 的过期不同源，排障时易误判；同期还有 3 条慢性告警（`NodeMemSwapped` 已连续 3d21h、`EcommerceNetworkPolicyDeniedBurst`、`AlertFiringTooLong`）持续占用同一 ntfy topic，稀释注意力——这正是 TECH.md §9.3「慢性 firing 掩盖急性事故」写过的模式，本次实地复现。**待整改**：①对 CrashLoop 类故障用「窗口内失败率」而非「连续失败次数」判定，或把 `success-threshold` 提高到跨越退避周期 ②清掉三条慢性告警 ③critical 与 warning 分流不同 topic（Alertmanager 现为单 receiver `local-audit`，子路由全被注释） |
| PG 证书 EKU 事故 | ✅ | **2026-09-01 抢修完成**。**责任源已查明**〔2026-09-01 取证〕：不是自动化，是**人工执行的重签手册** `~/lens077/pigsty-deploy/cert-san-resign.md`（文件 mtime 08-30 18:16，与证书备份 `server.crt.bak-20260830-181443` 逐秒吻合）。该手册「步骤 B」为 PG 重签时写死 `extendedKeyUsage=serverAuth`，且第 194 行明确声明「客户端证书（mTLS）不在本文范围」——作者主动排除了 client cert 场景，**却不知道 `/pg/cert/server.crt` 本身就是 patroni 连 etcd 的客户端证书**。**为何延迟两天爆炸**：手册用 `pg_reload_conf()` 热加载、不重启 patroni，故当天 PG 照常服务，直到 08-31 晚 patroni 重启才需要重新用该证书连 etcd。certbot 已排除（cron 有 `! -d /run/systemd/system` 守卫，node3 跑 systemd 故从不执行）。**待整改**：修正该手册的 EKU 为 `serverAuth,clientAuth` 并补一条「改 PG 证书后必须重启 patroni 验证，不能只热加载」。故障态：node3 PG 停摆约 6 小时 → Config Center 起不来 → 网关加载不了 routes.yaml → ecommerce 命名空间 **14 个 Pod CrashLoop/Error**（发现于排查 BFF 时，早于本次操作）。级联链：**etcd 拒绝 patroni 客户端证书（`ssl/tls alert bad certificate`）→ patroni 死等 `waiting on etcd` 从不拉起 PG**。根因是 **X.509 的 EKU 语义陷阱**：8/24 的证书**没有 EKU 扩展**（= 不限用途，client/server 两用，工作正常），8/29 与 8/30 两次重签**加上了 `serverAuth`**——EKU 一旦存在即为白名单，等于把 `clientAuth` 排除，patroni 再也无法以客户端身份连 etcd。⚠️ 两份历史证书**各坏一半**（新的 SAN 含 `pg.apikv.com` 但 EKU 错；旧的 EKU 对但 SAN 缺该域名，客户端 `verify-ca` 过不了），故最终用 Pigsty CA **重签一张两全的**（全 SAN + `serverAuth,clientAuth`，沿用原私钥不换 key，有效期 20 年）。旧证书均已备份在 `/pg/cert/server.crt.bak-*`，可回滚。**教训**：给证书「补一个 EKU」是**收窄**而非放宽，无 EKU 的证书反而最宽松；改动前必须核对该证书是否同时承担客户端角色 |
| GitOps（ArgoCD） | 🔴 | 零 Application / 零 ApplicationSet，AppProject 仅 `default`（ArgoCD 自身 6 Deployment 已全 1/1）；chart 与实况在资源名/标签/tag 三处不符，**禁止直接开 selfHeal**。断因链与重接前置见 [GitOps 演变全景](docs/reports/2026-08-31-gitops-evolution-overview.md) |
| 镜像 tag 口径 | 🔴 | 集群实跑 **6 种风格**（`0.2.1`/`sha-*`×2种/`health-*`/`dev-*`/两个 `@sha256`），**无一个 `:dev`**；`helm/values.yaml` 已回写 `1.5.5` 但与实跑无一相符 |
| VPA | 🟡 | 只装 recommender（无 updater/webhook）；15 个 ecommerce VPA 全 `Off`/`RequestsOnly` 且 `RecommendationProvided=True`；推荐地板已调至 `10m/32Mi`。**config-center 的 2 个是 `InPlace`——死配置** |
| PDB | 🟡 | 5 个 PDB：consumer-next/gateway/cilium-operator/nats `ALLOWED=1`，仅 consul-server 锁死为 0；**13 个单副本 Deployment 仍无 PDB、无法无损驱逐** |
| Tetragon | 🟡 | chart 1.7.1，DaemonSet **3/3 Ready**；唯一策略 `ecommerce-service-account-token-access` 为 **audit-only 不阻断**；enforcement 待评估 |
| 装而未激活组件 | 🟡 | 审计已裁决〔2026-08-31〕**全保留**：KEDA（0 ScaledObject，绑定阶段 3 激活）、Rollouts（0 Rollout，绑定灰度前置）、Kyverno（2 条 Audit 在产出报告，绑定 `verifyImages`）；未按期激活则下轮审计降级卸载 |
| 未安装 | — | Descheduler、OpenCost、Chaos Mesh（均为条件触发，见 TECH.md B 表） |

### 2. 事件与搜索（运行时 2026-08-29 实测、2026-08-30 复验 TCP；代码态 2026-09 订正）

| 组件 | 位置 | 状态 |
|---|---|---|
| **Kafka 4.3.1 (KRaft)** | node3，经 node1 隧道 `:30004` | **运行中**，已建 SCRAM 用户与 `ecommerce.events` topic；本仓 `used_by: []` |
| **Elasticsearch 9.4.5 + IK** | node3 容器（回环 :9200，已开鉴权） | **运行中**；search 与 `tools/search-indexer` 代码已接入，但 Pod 无网络通路，未运行时切流 |
| Kafka Connect 4.3.0 | node3 | 2 connector RUNNING（Debezium 3.6.1 + ES sink），属独立 CDC 演示链，不拥有策展搜索投影 |
| NATS JetStream | 集群 `nats` ns | 4/4 Running；存量运行链和新 indexer 代码仍使用，目标 Kafka 尚未接线 |
| Meilisearch v1.53.1 | 集群 `search` ns | 1/1 Running；仓库 search/indexer 代码已不再引用，仍承载旧运行部署 |

> Kafka 仍是「已搭建、待业务接线」。Elasticsearch 已完成仓库代码接线，但 Pod→node3 回环监听的网络通路、配置与部署切换尚未完成；**代码接线不等于运行时切流**。

### 3. 后端服务

| 服务 | 状态 | 主要缺口 |
|---|---|---|
| user | 🟡 | BFF 登录/session 已迁 control-tower；本服务收敛为 profile，清理存量 auth SDK/配置债 |
| product | 🟡 | `ListProducts`、上下架、类目/品牌；事务内 outbox 生产者未接 |
| cart | 🟡 | `RemoveCartItem`/`UpdateCartItemQuantity` **前端未接线** |
| order | 🔴 | `CreateOrder` 假成功、`CompleteOrder` 不落库 |
| payment | 🟡 | 5 个 RPC 均为显式 `Unimplemented` 桩（**本仓正确示范**）；repo 主体待恢复。⚠️ 新增迁移 `00002_rename_consumer_to_customer`（买家列改名），**存量库需跑 `make migrate-up MIGRATE_SVC=payment`** |
| inventory | 🔴 | `Reserve` 静默无操作、`ReleaseReserve` panic |
| search | 🟡 | 代码已通过单 provider `SearchCatalog` 接入 Elasticsearch，`tools/search-indexer` 已改为唯一策展投影写入者；Pod 网络通路与运行时切流未完成，商品事务生产者、聚合筛选、热门词待补 |
| address | 🔴 | 功能齐全**但全线越权** |
| merchant | 🔴 | 仅 `Submit`/`Get` 可用；两段式入驻已设计未实现 |
| behavior | 🟡 | `Track`/`Recommend`/`SimilarItems` 已编译通过 |
| 履约 | ⬜ | 不单独建服务，并入 order 域 |

> **基础设施去重（2026-09-01 代码态）**：`env`/`meta`/`config`/`log`/`otel`/`registry` 六个模块的 10 份服务副本已上提到 `backend/pkg/`，各服务只留薄适配层（仅做 `confv1` → provider-neutral Options 映射与泛型实例化）。`services/*/internal/pkg` 生产 Go 由 15,106 行降至 4,012 行（−11,094，73.4%）；`homogeneity_baseline.txt` 棘轮由 10 条收敛到 3 条。order 的 3 处 `config.GetConfig()` 全局读取改为 Fx 注入，并补启动期顺序测试。
>
> **续：dbutil 收敛与影子包清理（2026-09-01）**：棘轮再降至 2 条，余 `config/config_test.go`、`money/numeric.go`（均待随共享库迁移一并处理）。`dbutil/handler.go` 的两个阵营统一为 `pqerror` 具名常量版——裸错误码版含永不匹配的死分支（`code := pgErr.Code` 取 SQLSTATE，却写了 `case "23000", "IntegrityConstraintViolation"` 这类名字分支），且 `github.com/lib/pq` 本就是直接依赖；同批删掉 10 份副本里生产错误路径上的 `fmt.Println("code:", code)` 调试打印。另删除 `address`/`cart`/`merchant`/`inventory` 四个影子 `constants` 包（共 8 文件，删前实测零引用；其常量是 `backend/constants` 的严格子集，同名同值、零冲突、零独有），并给 behavior 的 `conf.proto` 补回 `reserved 3; reserved "elasticsearch"`——它删字段未保留字段号，与 `buf.yaml` 已启用的 `FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED` 冲突。迁移方案见 `.scratch/shared-infra-kit/spec.md`。
>
> 同批修掉一处长期静默失效：10 份 Dockerfile 注入 `-X main.Version`，而 10 个 `main` 包从未声明该符号，Go linker 静默忽略，构建版本注入从未生效。现改为共享 `backend/pkg/meta.Version`，`/healthz` 分别暴露 API 契约 `version` 与制品 `build`，并由 `structcheck/shared_infra_test.go` 守护符号、ldflags、`COPY pkg/` 与 10 份 Dockerfile 字节一致。理由见 `context/harness-framework/evolution-log.md`。

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
| consumer | 🟡 | 商品详情/购物车/个人中心/地址/登录回调已接真实 API；首页、分类、订单、支付结果待接。**匿名被强制拉去登录已修**〔2026-08-31 实测复现并修复〕：链路是顶栏 `GetCart` 匿名发出 → 网关 401 → `errorInterceptor` `emitAuthError` → AuthProvider **无条件** `startBffLogin`。根因是「401 = 会话失效」这个前提只在用户**曾经登录过**时成立；匿名用户的 401 只意味着「该接口需要登录」。已给跳转加登录态门（双向回归测试：匿名不跳 / 已登录仍跳）。**残留待办**：`useCart` 的 `getCart` 无 `enabled` 门，匿名仍会发一次注定 401 的请求——现在只是不再劫持导航，但仍是无谓请求与告警噪音 |
| merchant / admin | ⬜ | 仅路由骨架，无 `api/` 目录、未接后端 |
| 匿名购物访客轨 | 🟡 | **第 1–3 步代码已落地，未部署**〔2026-09-01〕。设计见 [anonymous-shopping.md](docs/design/platform/anonymous-shopping.md)。**已完成**：①control-tower 网关 `RouteConfig` 加 `guest` 清单 + `guest` 包（UUID v4 访客 ID、HttpOnly cookie）+ 中间件签发/识别 + `InjectGuest` 注入 `x-md-global-anonymous=true`，gateway 全量测试 12 包绿（`v0.1.2`）②`.service-matrix.yaml` 加 `guest_paths` 分级 + structcheck 双向核对（红测过）③本仓新增 `backend/pkg/identity`：`RequireUser` 拒绝访客、`RequireAny` 允许访客，红测过。**关键设计修正**：访客 ID 改用 **UUID v4** 而非随机串——`cart_item.user_id` 是 UUID 列，因此**数据库与 cart 服务零改动**，访客 ID 天然落得进去；代价是该列混存两类身份，只能靠匿名头区分。**未完成**：④main.go 装配 `GuestCookie`（当前 nil = 整轨关闭，行为与上线前一致）⑤routes.yaml 推 Config Center ⑥C 级服务接入 `RequireUser`（order 的身份提取目前还是注释掉的，无现实越权，但实现时必须用它）⑦`MergeGuestCart` 与前端改造 |
| 网关 BFF 端点 | ✅ | **2026-09-01 已启用并验证**：`/auth/me` **200**、`/auth/login` **302**（正确跳 Casdoor），Pod 日志 `"BFF 会话轨已启用" session_store=dragonfly.dragonfly.svc:6379 cookie=ct_session`。修法是 `kubectl apply -f control-tower/deploy/dev/gateway/deployment.yaml`——**仓库清单本来就写全了那 10 个 BFF 环境变量与 session-TLS 挂载，两个 Secret（`casdoor-bff`/`dragonfly-session`）也早已存在，是集群实跑清单漂移**（实跑 13 个 env vs 清单 23 个）。⚠️ dev 的 `BFF_PUBLIC_BASE_URL=http://localhost:3000` 是刻意设计（靠 vite proxy 凑同源，否则 state cookie 丢失），故 Web 登录仅在本机开着 dev server 时成立。〔以下为修复前的诊断记录〕**曾表现为 `/auth/me` 与 `/auth/login` 均 404 —— 根因是配置缺失，不是部署滞后**〔实测 2026-08-31，逐层证据〕：①直连 Pod（`port-forward`，绕过 Cilium Gateway）同样 404 而 `/healthz` 200 → 排除路由层；②实跑镜像 `ghcr.io/lens077/control-tower-gateway:0.2.5`，而 `git show 0.2.5:services/gateway/internal/app/app.go` **包含** `mux.Handle("/auth/", …)` → **排除镜像滞后**（前一版本记录的「推断部署滞后」据此推翻）；③该注册被 `if d.BFF != nil` 守着，而 `bffHandler` 仅在 `SESSION_REDIS_ADDR`/`CASDOOR_CLIENT_ID`/`CASDOOR_CLIENT_SECRET`/`BFF_PUBLIC_BASE_URL` **四者齐全**时才构造；④deployment 只有 `JWT_ISSUER`+`CASDOOR_URL`，无 envFrom；⑤Pod 启动日志坐实：`"BFF 会话轨未配置，仅 legacy bearer" has_session_store=false has_casdoor_client=false has_public_base_url=false`（`main.go:150`）。**影响**：Web 端 BFF 会话轨从未启用，冷启动 `/auth/me` 恒 404，现行登录仅 legacy bearer 轨。**修法**：给 deployment 补那四个环境变量（Casdoor client secret 走 Secret，按硬规则 4 不入库）——**推镜像解决不了**。补齐前需确认 dev 环境该用哪个 Casdoor 应用凭据与会话存储地址 |
| 状态管理 | ✅ | 2026-08-28 完成 valtio→**Zustand** 全量迁移，valtio 依赖已移除 |
| 错误监控 | 🟡 | Bugsink 服务端已运行（node3，2.5.0）；**前端 SDK + Source Map 未接** |
| 无障碍性 | 🟡 | 自动化三层已落地〔实测 2026-08-31〕：①jsx-a11y lint 全 workspace 生效（随 `vp check --fix` 进 pre-commit，红测过）②consumer 四个关键页 axe 断言（jsdom + 真路由 + 服务桩，13/13 绿）③Lighthouse 首页基线**桌面/移动双 100**、已同意态 color-contrast 0 违规。落地中修掉 3 处真实缺陷（隐私弹窗关闭按钮无可及名称、标题层级跳跃、`exhaustive-deps` 漏依赖）。**待办**：键盘/VoiceOver 手动走查（需人工）、购物车/结算页需登录态的 snapshot 审计、66 个渐变背景对比度节点手动抽查；merchant/admin 未纳入 axe 断言。手册 [`docs/frontend/accessibility.md`](docs/frontend/accessibility.md) |
| 语义化 HTML | 🟡 | 标题语义已修〔实测 2026-09-01〕：`div onClick` **0 处**，consumer-next 手写标记合格。**本轮修掉 19 处** `Typography`——根因是 MUI 不写 `component` 时**语义由 `variant` 决定**（`h1`–`h6` 映射同名标签、`subtitle1/2` 也映射 `h6`），按字号挑 variant 等于瞎定大纲：购物车/结算/订单/支付/404 **整页无 `h1`**、商品价格 `<h3>` 紧跟 `<h1>` 跳级、页脚每页多 4 个噪音 `h6`，**且这些 axe 全绿**（`page-has-heading-one` 不在 WCAG A/AA runOnly 内）。已补「唯一 h1 + 不跳级」断言并真红测（回退修复→`1→3→2…` 变红）。`pnpm ready` 全绿。**待办**：①consumer-next 商品详情页输出 `schema.org/Product` ②merchant/admin 未纳入该断言。**`speculationrules` 已评估：不引入**——consumer 是 SPA 无文档导航（等价物是 Router `preload`），consumer-next 仅一个业务页且站内链接零命中；触发重估＝`ListProducts` 落地后扩出「列表→详情」链路。手册 [`docs/frontend/semantic-html.md`](docs/frontend/semantic-html.md) |

### 6. 可观测性（2026-08-30 实测，2026-08-31 增补）

| 项目 | 状态 | 说明 |
|---|---|---|
| 采集层 | 🟡 | Vector **3/3**、集群内 OTel Collector **1/1**、**新增 otel-node hostmetrics DaemonSet 3/3**（节点级 CPU/内存直推 VictoriaMetrics）；**VMAgent 仍缺位**——与 otel-node 路线需二选一收敛（见分类文件）；Pod 级实际用量仍缺 kubeletstats |
| 黑盒探活 | ✅ | node3 `ecommerce-gatus`（4 探针带响应体校验）+ `ces-audit`/采集器 Ready 三个新 vmalert 规则文件（均 Pigsty source+产物双写）〔实测 2026-08-31〕 |
| 主机侧巡检 | 🟡 | **node1 已部署 `host-watchdog`**：14 容器 + `docker.service` + 2 个本机 HTTP 端点 + Pangolin 隧道站点 + 磁盘，每 5m，出口复用既有 ntfy；正常/故障双路径与推送到达均已验〔实测 2026-09-01〕。触发它的标本：`gorse-gorse-1` 崩溃循环 **18238 次、持续两个月零告警**（当日已删除该冗余容器，公网 gorse 由 node2 承载不受影响）。判据见 `context/team/host-watchdog.md`，脚本 `infrastructure/host-watchdog/`。**node2/node3 尚未部署** |
| 告警卫生 | 🟡 | **`ecommerce-k8s.yml` 点号→下划线迁移已完成并双向验收**〔实测 2026-08-31：6 条规则先在 VM 查到 series 再改写，双写 + dry-run + reload；兜底 `K8sClusterMetricsMissing` 由慢性 firing 回 inactive，条件规则复明后数分钟内当场捕获真实故障；另修 `K8sContainerNotReady` 的 Completed-Pod 误报类〕；**口径滞后已于 2026-09-01 全仓清理**〔根因是 VM 启动带 `-opentelemetry.usePrometheusNaming=true`（VM 2.24.0，实测 2026-09-01）；vmalert 规则与 **67 个 Grafana 仪表盘逐个拉取确认无点号残留**，但**跨 3 个仓共 9 处**仍在教人用点号，含**一个可执行脚本** `helper.sh`（本地文件，`.gitignore` 排除、未入库）——它「集群指标条数（应 >0）」那条自检查询实际恒返回 `seriesFetched: 0`，会把健康链路误报成断流——以及 TECH.md §9.3 指向的口径手册 `docs/observability/alerting-notification.md`。已统一改为「写查询前先查当前口径」，并记录三个存储口径不同：VM 下划线、VictoriaLogs 点号、VictoriaTraces `resource_attr:` 前缀+点号（均实测）〕；**剩余噪音**：`PostgresReplicationLag`/`NodeMemSwapped`/`EcommerceNetworkPolicyDeniedBurst` 与若干 `AlertFiringTooLong` 慢性告警每小时推 ntfy 待清——已交接独立会话（见分类文件 P1） |
| 存储层 | ✅ | node3：VictoriaMetrics v1.149.0 / VictoriaLogs v1.52.0 / VictoriaTraces v0.10.0 |
| 存量链 | ✅ | Loki / fluent-bit / Jaeger / 集群内 Grafana **均已退役且确认不存在** |
| 告警 | 🟡 | node3 Alertmanager 0.33.1；**ntfy 手机推送链路现役且端到端验收通过**〔实测 2026-08-31：`local-audit` 背后是 audit+ntfy 双职桥，canary P5 实测到达 topic〕；企业微信降为可选第二通道（规则信号质量与噪音清理见上「告警卫生」行，不在两行重复维护） |
| 链路追踪 | 🟡 | 10 个服务 + 网关 OTel 已统一至 v1.45.0；网关采样口径与后端相反待修 |
| Go 运行时指标 | 🔴 | 10 个电商服务 **全缺**（goroutine/堆/进程 CPU 内存） |

---

## 三、阶段推进（2026-08-30 按优先级重排）

> 只写「做什么 + 完成判据」，不写预估时间。阶段是**依赖顺序**不是日历；
> 条目勾选状态一律在分类文件里维护，此处只做安排。P0 全部落在阶段 0 与阶段 1。

### 阶段 0 · 集群止血（先于业务开发；全部 P0 基础设施/可观测项）

1. ~~受控 rollout 重平衡 14/2/1 倾斜~~ **已完成〔实测 2026-08-30：终态 6/6/5，15/15 Ready〕**
2. ~~修 KCM 阈值~~ **已完成〔实测 2026-08-31〕**：阈值 20 三处一致（live manifest / bootstrap 仓 /
   kubeadm-config），25 个真实 Failed Pod 注入实测 GC 25→20，`K8sFailedPodsAccumulating`
   走完 pending→firing→Alertmanager→清理后 inactive 闭环
3. ~~CES/CiliumEndpoint IP 一致性巡检告警~~ **已完成〔实测 2026-08-31〕**：`ces-audit` CronJob
   每 2m（最小只读 RBAC），`ces_stale_entries` 入 VM，假样本实测 firing 闭环；
   资产 `infrastructure/ces-audit/`
4. ~~可观测栈黑盒探活~~ **已完成〔实测 2026-08-31〕**：node3 `ecommerce-gatus` 4 探针全绿
   （均带响应体校验）+ 采集器 Ready 两条 vmalert 规则，canary 实测告警闭环；
   资产 `infrastructure/gatus/`
5. ~~N+1 单节点故障容量验证~~ **已完成〔实测 2026-08-31〕**：drain node103 演练——
   交易面零级联 Pending、黑盒 6/6 全程绿；搜索域不成立（meilisearch 本地 PV，新 P1）、
   consul PDB 阻断合规排空实证。报告
   [`2026-08-31-n-plus-1-drill.md`](docs/reports/2026-08-31-n-plus-1-drill.md)
6. ~~平台组件必要性审计~~ **已完成〔裁决 2026-08-31〕**：用户拍板全保留——
   KEDA/Rollouts 保留待各自触发阶段激活（未激活则下轮审计降级卸载），
   Kyverno 保留绑定供应链 `verifyImages`；容量压力已因内存扩容缓解

**阶段 0 六项全部完成（2026-08-31）**，集群止血收官；下一站阶段 1。

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
10. 事件正确性底座：Product/Order 事务内 producer、NACK/DLQ、领域事件落地（P0#15/#16）
11. 前端闭环：consumer 首页/分类/订单/支付结果接线；`ListProducts` 实现后 consumer-next 扩页

**完成判据**：固定集成测试 + 浏览器用例可重复验证
商品→购物车→结算→库存预占→支付→订单状态→取消/退款的成功与失败路径，不再出现假成功。

### 阶段 2 · 商家、管理与履约能力

1. merchant/admin 前端：商品、订单、审核、售后、对账与审计页面及 API（当前仅路由骨架）
2. 商家两段式入驻（已设计未实现）；商家子账号与 `merchant_id` 数据隔离
3. 对象级授权按 TECH.md §8 落 OpenFGA（集群 2/2 Running〔实测 2026-08-30〕已就绪，缺业务接线）
4. 履约并入 order 域（发货、物流单、轨迹、第三方 adapter）；
   没有独立伸缩/故障域证据不新建 fulfillment 服务

### 阶段 3 · 事件、交付与可靠性闭环

1. Kafka 业务接线（node3 已运行、topic 已建，本仓零客户端）：topic/partition 规划、
   consumer Inbox、retry/DLQ、保留、重放、积压 SLO 与恢复验收
2. Elasticsearch 运行时切流：建立 Pod 可达的受控网络入口，更新 `search.catalog` 与部署产物，
   发布 search/indexer、全量重建并做查询差异与增量恢复验收；回滚窗口结束后再退役 Meilisearch
3. GitOps 接回：chart 对齐实况（资源名/标签/tag 三处）→ `helm template` 与集群 diff 为空
   → 重建 Application（**未对齐前禁止 selfHeal**）；统一镜像 tag 口径是前置
4. PostgreSQL/对象存储备份、PITR、RTO/RPO 与恢复演练（node3 已成唯一数据面，无集群内回滚路径）
5. Victoria 三件套 SLO 看板 + Alertmanager 企业微信实测（含 CRIT 进/WARN 不进的路由验证）
6. Cilium default-deny 补全与工作负载身份，使「只信任网关」可被强制执行
7. 采集层收敛：VMAgent vs otel-node 二选一、kubeletstats 启用、Go 运行时指标铺 10 服务

### 阶段 4 · 容量与弹性验收

1. 容量模型：用户、SPU/SKU、订单、库存流水、行为事件的总量、日增量与保留期
2. k6 基线：固定数据集、读写比、热点 SKU、峰值并发，记录 P50/P95/P99、错误率、饱和度
3. VPA 推荐值（≥7 天观测 + k6 窗口）交叉验证后人工写回 requests
4. 依据证据决定 PG 分区/归档、Elasticsearch 拓扑、Kafka partition/保留、缓存容量与 Silo 策略
5. 在 Consul 退役、Service 路由与观测指标可信后，验收 KEDA、Argo Rollouts、限流、熔断与灰度
   （或按阶段 0 审计结论卸载）

### 阶段外并行线（与阶段 1 无文件冲突，可随时插队；2026-08-31 评估）

| 并行线 | 与阶段 1 的冲突面 | 备注 |
|---|---|---|
| 慢性告警清理 | 零（PG 侧动手需窗口） | **已交接独立会话**：[`.scratch/chronic-alerts-cleanup/HANDOFF.md`](.scratch/chronic-alerts-cleanup/HANDOFF.md) |
| [供应链](docs/todo/供应链与交付流水线.md)：Kyverno `verifyImages` 等 | 零（纯 CI/签名域） | 组件审计裁决的绑定条件，优先级最高的并行项 |
| [前端](docs/todo/前端技术栈与工程化.md)：Bugsink SDK + Source Map | 零（`frontend/`） | 服务端早就绪 |
| [可观测](docs/todo/统一可观测性体系.md) P1 散件：dead-man、VM import 认证等 | 低（网关 5xx/采样归 control-tower 线） | |
| [文档协作](docs/todo/文档与协作机制.md) / [服务发现](docs/todo/服务发现与配置中心.md) / TLS P2 | 零 | 无 P0，见缝插针 |
| [事件](docs/todo/数据一致性与事件驱动.md)：DuckDB 试点 D0–D3 | 零（跑批工具链，不动交易路径与 outbox） | **补排未开工**：TECH.md B 表 2026-08-28 采纳「试点待执行」，至今零执行、零待办登记。**门槛在 D0**——分析消费者为 0，触发条款未成立就不开工。**v2.0 预览版（quack 转正 + 稳定 C ABI）不改当前选型**，正式版（2026 秋）发布后按 D2 复核 |
| QQ 机器人接入（新增服务 `qqbot`） | 零（新服务，不动存量） | **仅立项，未排期**。评估与取舍见 [`docs/reports/2026-09-01-qq-bot-evaluation.md`](docs/reports/2026-09-01-qq-bot-evaluation.md)，方案与 8 张实施单见 [`.scratch/qqbot-integration/`](.scratch/qqbot-integration/spec.md)（全部 `needs-triage`/待人工）。**建议只做内部运维通知**——沙箱即可验收；C 端查询与通知硬依赖全局 P0 #3/#4 修复。第一步是集群内实测出口 IP + 跑通沙箱，两步都不需要决策 |

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
| **控制面单点拖垮全集群** | 「节点 Ready 就等于健康」 | 控制面节点需内存余量与 iowait 告警；僵尸 Pod 回收阈值需可触发；CES/ipcache 一致性需巡检（2026-08-29 事故） |

---

## 四、归档

- **验收证据长文与会话记录** → [`docs/progress-archive/`](docs/progress-archive/)（不可变历史）
- **调研与评估报告** → [`docs/reports/`](docs/reports/)
- **harness 演进理由** → [`context/harness-framework/evolution-log.md`](context/harness-framework/evolution-log.md)
