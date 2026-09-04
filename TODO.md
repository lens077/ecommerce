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

**未完成合计 158 项，其中 P0 共 18 项**（计数口径：各分类文件顶层 `- [ ]` 复选框实数；
2026-09-01 新增 1 条可观测 P2「容器级 CFS 限流指标完全缺采」——`nr_throttled`/`throttled_usec`
是「CPU 利用率低但尾延迟高」的唯一判据，当前无任何组件在采（VMAgent 未部署，otel-node 只有
`hostmetrics`、无 `kubeletstats`/cAdvisor）；且现有采集恰好只覆盖会骗人的节点级 CPU——
实测容器 100% 周期被限流时节点仅 9%，同期沉淀 `context/team/cfs-quota-throttling.md`；
2026-09-02 新增 1 条基础设施 P2「Harbor 爆破封禁挪到 node1」——node2 的 `harbor-auth` jail 检测与封禁动作均正确，但到达 node2 的连接源是 newt 隧道的 `127.0.0.1`，nft 规则永远匹配不到，当前只有审计价值；同日订正 SECURITY-HARDENING.md 里「Harbor 拿不到真实 IP」的错误结论（真实 IP 一直在 `core.log`，只是 nginx `proxy.log` 不记）；
2026-09-02 新增 1 条鉴权 P0「轮换 public 仓 git 历史泄露的全部凭据」——commit 直接带口令推到了 public 的 GitHub，历史已 filter-repo 重写并强推两远端，同日补 gitleaks 门禁（pre-commit / verify-quick / 两远端 CI），见 evolution-log；
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
| 18 | 轮换 public 仓 git 历史泄露的全部凭据（Casdoor secret ×3 / 支付私钥 / Consul EC 私钥…；历史已重写强推、凭据 09-02 已轮换；剩 GitHub Support 清理悬空对象） | [鉴权](docs/todo/零信任鉴权与Session.md) |

〔2026-08-31 关闭四条 P0，证据见分类文件勾选记录：KCM 阈值（三处改 20 + 真实 GC/告警闭环验证）、
CES 巡检告警（CronJob 2m + vmalert firing 闭环）、可观测黑盒探活（node3 ecommerce-gatus + canary 闭环）、
平台组件审计（用户裁决全保留 + 条件绑定）。**基础设施分类 P0 清零。**〕

### 分类索引

| 分类 | 对应 TECH.md | 未完成 | P0 |
|---|---|---:|---:|
| [统一可观测性体系](docs/todo/统一可观测性体系.md) | §9 | 25 | 2 |
| [微服务与交易闭环](docs/todo/微服务与交易闭环.md) | §5 / §4.3 | 23 | 10 |
| [基础设施与部署模型](docs/todo/基础设施与部署模型.md) | §7 | 20 | 0 |
| [文档与协作机制](docs/todo/文档与协作机制.md) | —（harness） | 17 | 0 |
| [前端技术栈与工程化](docs/todo/前端技术栈与工程化.md) | §11 | 16 | 0 |
| [零信任鉴权与 Session](docs/todo/零信任鉴权与Session.md) | §8 | 16 | 4 |
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
- **两远端 CI 职责定稿（2026-09-02）**：GitLab（origin）= 每次 push/MR 的代码门禁
  （`context-gate` + 新增 `backend-gate` / `frontend-gate`，即本地锚点搬进 CI），
  GitHub = 仅发布 tag 的构建/签名/发布链；tag 在 GitLab 侧不建流水线。
  见 [`context/team/git-commit.md`](context/team/git-commit.md)「两个远端的 CI 职责切分」，
  推理与证据见 [CI 复盘报告](docs/reports/2026-09-02-ci-two-remotes-dsh-reference.md)。
  门禁首跑（pipeline #77）即抓到 `AuthProvider` 登录态快照落后 DOM 一个 tick 的缝隙，
  已修（`19a7a93`，`useEffect` → `useLayoutEffect`）。
  **待办**（本轮未动 GitHub 侧）：①`backend.yml` 的 `update-manifests` 在 GitOps 断开期间是
  假回写，且持有能推 main 的 admin PAT；②发布 tag 的四条纪律（指向 main / 递增 /
  不可变）在 CI 里零校验；③镜像只扫签不启动，缺一次从 digest 拉起的冒烟；
  ④pnpm 版本三处不一致（`packageManager` 11.22.0 / consumer Dockerfile 11.6.0 /
  `frontend.yml` latest）；⑤前端镜像构建发布路径仍待重建（`frontend.yml` 头注四项前提未确认）。

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
| PDB | 🟡 | 4 个 PDB：consumer-next/gateway/cilium-operator `ALLOWED=1`（nats 的 PDB 随 `nats` ns 于 2026-09-03 卸载），仅 consul-server 锁死为 0；**13 个单副本 Deployment 仍无 PDB、无法无损驱逐** |
| Tetragon | 🟡 | chart 1.7.1，DaemonSet **3/3 Ready**；唯一策略 `ecommerce-service-account-token-access` 为 **audit-only 不阻断**；enforcement 待评估 |
| 装而未激活组件 | 🟡 | 审计已裁决〔2026-08-31〕**全保留**：KEDA（0 ScaledObject，绑定阶段 3 激活）、Rollouts（0 Rollout，绑定灰度前置）、Kyverno（2 条 Audit 在产出报告，绑定 `verifyImages`）；未按期激活则下轮审计降级卸载 |
| 未安装 | — | Descheduler、OpenCost、Chaos Mesh（均为条件触发，见 TECH.md B 表） |

### 2. 事件与搜索（运行时 2026-09-03 实测；架构同日重新平衡）

| 组件 | 位置 | 状态 |
|---|---|---|
| **Kafka 4.3.1 (KRaft)** | node3，经 node1 隧道 `:30004` | **运行中**；CDC 线在用（六张业务表 topic），领域事件线零业务接线 |
| **Elasticsearch 9.4.5 + IK** | node3 容器，经 Pangolin `https://es.apikv.com` | **运行中，已切流**〔实测 2026-09-03〕；alias `ecommerce_catalog_products` → `_v1` 索引 7 文档，由 Sink 写入，lag 0 |
| **Kafka Connect 4.3.0** | node3 `cdc-connect` | Debezium 3.6.1 source + ES Sink 两 connector RUNNING；**定稿为两条线共用的生产搬运层**（不再称「演示链」），`EventRouter`/`CloudEventsConverter` 已在类路径 |
| NATS JetStream | — | **已退役**（2026-09-03）：`nats` ns、indexer/relay Deployment 与代码同日删除 |
| Meilisearch v1.53.1 | 集群 `search` ns | 1/1 Running，无写入者；回滚窗口后退役 |
| search Pod | 集群 `ecommerce` ns | **1/1 Ready**〔2026-09-03〕：新镜像 `search:sha-c364128`，`/healthz` 深检 ES 绿，经网关搜索命中正确 |

> **2026-09-03 重新平衡**：搜索投影是 PG 行的派生物，按「没有这个事件业务语义是否丢失」判据归**行投影线（CDC）**，不再是领域事件平台的首个租户。落地为 `products.search_catalog` 表（trigger 维护，迁移 `00005_search_catalog.sql` 已写）→ Debezium → Kafka → Elasticsearch Sink；领域事件线（订单 Saga 副作用）改用 Debezium Outbox Event Router，自写 relay 不再重写成 Kafka 版。同日删除 `tools/search-indexer`、`tools/outbox-relay`、`tools/cdc-demo`、`pkg/outbox/{relay,stream}.go`，`go.mod` 去 `nats-io`。**恢复搜索的全部步骤已于 2026-09-03 完成**：dev 库执行迁移（回填 7 行与旧 reindex SQL 逐行一致，trigger 改价/删除演练通过）→ publication + Debezium `table.include.list` 加表 → Kafka topic + ES 模板/索引/alias + Sink 映射（pipeline 仓 9 文件 + 合约测试）→ 重置 Debezium offset 重快照（顺手修掉 09-01 起 task FAILED 的复制槽丢失，connector 级 RUNNING 掩盖了它）→ 发新 search 镜像 → 增量实测 6s（改价/删除/还原）→ 经网关搜索命中。教训与判据：`context/project/ecommerce/events/experience/row-projection-vs-domain-event.md`；两条线施工清单：`docs/todo/数据一致性与事件驱动.md`。**真相源回写（2026-09-03 晚）**：`docs/TECH.md` §2.1 架构图、§3 协同模型、§4.1/§4.2 搬运层（Relay → Debezium Outbox Event Router）、§4.4 KEDA 示例、§5.3 Catalog 边界、§9.2 链路示例、§12 P0 路线与新增 §4.5「两条数据线」已对齐本决议；`docs/design/platform/architecture.md` 的 Catalog/搜索投影行、事件通信规则与 `ProductChangedEvent` 行同步（该事件取消）。此前 TECH.md 仍写「Catalog 发布领域事件供搜索投影消费」，与本决议冲突。

### 3. 后端服务

| 服务 | 状态 | 主要缺口 |
|---|---|---|
| user | 🟡 | BFF 登录/session 已迁 control-tower；本服务收敛为 profile，清理存量 auth SDK/配置债 |
| product | 🟡 | `ListProducts`、上下架、类目/品牌；事务内 outbox 生产者未接 |
| cart | 🟡 | `RemoveCartItem`/`UpdateCartItemQuantity` **前端未接线** |
| order | 🔴 | `CreateOrder` 假成功、`CompleteOrder` 不落库 |
| payment | 🟡 | 5 个 RPC 均为显式 `Unimplemented` 桩（**本仓正确示范**）；repo 主体待恢复。⚠️ 新增迁移 `00002_rename_consumer_to_customer`（买家列改名），**存量库需跑 `make migrate-up MIGRATE_SVC=payment`** |
| inventory | 🔴 | `Reserve` 静默无操作、`ReleaseReserve` panic |
| search | 🟢 | **ES 运行时已切流**〔2026-09-03〕：Pod Ready、`/healthz` 深检绿、经网关命中。代码经单 provider `SearchCatalog` 只读 ES alias；投影由 `products.search_catalog`（trigger 维护）经 Debezium → Kafka → ES Sink 写入，增量约 6s；不依赖商品事务生产者。待办：Meilisearch 回滚窗口后退役；CDC 链告警（slot 位点差 / task 状态 / sink lag）；聚合筛选、热门词 |
| address | 🔴 | 功能齐全**但全线越权** |
| merchant | 🔴 | 仅 `Submit`/`Get` 可用；两段式入驻已设计未实现 |
| behavior | 🟡 | `Track`/`Recommend`/`SimilarItems` 已编译通过 |
| 履约 | ⬜ | 不单独建服务，并入 order 域 |

> **基础设施去重（2026-09-01 代码态）**：`env`/`meta`/`config`/`log`/`otel`/`registry` 六个模块的 10 份服务副本已上提到 `backend/pkg/`，各服务只留薄适配层（仅做 `confv1` → provider-neutral Options 映射与泛型实例化）。`services/*/internal/pkg` 生产 Go 由 15,106 行降至 4,012 行（−11,094，73.4%）；`homogeneity_baseline.txt` 棘轮由 10 条收敛到 3 条。order 的 3 处 `config.GetConfig()` 全局读取改为 Fx 注入，并补启动期顺序测试。
>
> **续：dbutil 收敛与影子包清理（2026-09-01）**：棘轮再降至 2 条，余 `config/config_test.go`、`money/numeric.go`（均待随共享库迁移一并处理）。`dbutil/handler.go` 的两个阵营统一为 `pqerror` 具名常量版——裸错误码版含永不匹配的死分支（`code := pgErr.Code` 取 SQLSTATE，却写了 `case "23000", "IntegrityConstraintViolation"` 这类名字分支），且 `github.com/lib/pq` 本就是直接依赖；同批删掉 10 份副本里生产错误路径上的 `fmt.Println("code:", code)` 调试打印。另删除 `address`/`cart`/`merchant`/`inventory` 四个影子 `constants` 包（共 8 文件，删前实测零引用；其常量是 `backend/constants` 的严格子集，同名同值、零冲突、零独有），并给 behavior 的 `conf.proto` 补回 `reserved 3; reserved "elasticsearch"`——它删字段未保留字段号，与 `buf.yaml` 已启用的 `FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED` 冲突。迁移方案见 `.scratch/shared-infra-kit/spec.md`。
>
> 同批修掉一处长期静默失效：10 份 Dockerfile 注入 `-X main.Version`，而 10 个 `main` 包从未声明该符号，Go linker 静默忽略，构建版本注入从未生效。现改为共享 `meta.Version`，`/healthz` 分别暴露 API 契约 `version` 与制品 `build`，并由 `structcheck/shared_infra_test.go` 守护符号、ldflags、`COPY pkg/` 与 10 份 Dockerfile 字节一致。理由见 `context/harness-framework/evolution-log.md`。
>
> **续：根因闭环（2026-09-04 已发布、独立验证）**：`go-connect-kit` 已补齐 `config`/`log`/`otel`/`registry`/`dbutil`，接口只使用 provider-neutral Go Options 与泛型 `Live[T]`，不导入消费方 proto。ecommerce 删除 `backend/pkg/{config,log,otel,registry}` 与 10 份 `dbutil` 实现，10 个服务仅保留 protobuf-to-options adapter；control-tower 同步消费 kit，并由 `sdk/configsource` 适配 Config Center；模板删除七类实现副本并改为 kit 依赖，CLI 断言同步。**没有使用 BSR**：BSR 分发 proto，不分发 Go 实现。已按顺序发布 kit `v0.3.0`（`409bd9d`）与带 source adapter 的 control-tower `v0.1.4`（`c438851`）；消费方已用 `GOWORK=off` 解析公开版本并更新 `go.sum`，仓内无 `replace`。
>
> **续：Consul 注册改守护循环（2026-09-03 代码态，未部署）**：共享实现现位于 `go-connect-kit/registry`，其「一次注册 + 独立心跳」换成 `Maintain`（失败指数退避 1s→30s 无限重试；心跳失败即重注册；配置错误 `ErrInvalidOptions` 不重试；未注册过则退出时跳过注销）。触发事故：2026-08-29 `payment` 单服务（已记 experience 标「遗留未改」）→ 2026-09-02 整机重启后 10 个服务全部一次注册超时、Consul 目录只剩自己、dev 网关 `readyz` 503 持续 ≥97min（探针失败 x1177）。cart 真实适配层打真实 Consul 实测：起得慢→第 6 次重试成功；外部注销→6s 内重注册；隧道断→恢复后 11s 重注册。模板仓 `go-connect-template` 同步。**2026-09-03 已部署并全关**：10 个服务镜像先以工作树 `dev-20260903-aa25aee` 止血、随后按提交 SHA 重打为 `sha-c364128`（digest 固定进各 deploy/dev/deployment.yaml，消除了仓库 `:dev`/`meili-dev-*` 与集群 `sha-0b9b9ad`/`health-*` 的长期漂移；含守护循环）已发布，deployment 全部 `CONSUL_ENABLED=false`（当前不需要服务发现），日志均「Consul disabled by environment variable」。网关侧：Config Center `gateway/dev/routes.yaml` 11 条 target 改 `direct://ecommerce-<svc>-service.ecommerce.svc:<port>`（control-tower `routes/dev.yaml` 同步），`rollout restart` 后新 Pod `discovery_services=[]` 走 `noResolver`，`readyz` 200 且不再依赖 Consul 目录——「全关则永久红」的前提已消除。同日还修了一个独立故障：Cilium ipcache 丢失 `consul-server-0` 条目（全集群 71 CEP 仅此一个，node101/102 无条目、node103 标 `reserved:unmanaged`），`cilium monitor` 抓到 `Policy denied ->unmanaged`，给 Pod 打 label 触发 CEP 更新即恢复。**仍未做**：「注册数 < 预期」告警（当前不注册，暂无意义）；Consul 重开时需同时翻开关 + 路由改回 `discovery:///`。复盘 [docs/reports/2026-09-03-consul-register-once-recurrence.md](docs/reports/2026-09-03-consul-register-once-recurrence.md)。

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
| 无障碍性 | 🟡 | 自动化三层已落地〔实测 2026-08-31〕：①jsx-a11y lint 全 workspace 生效（随 `vp check --fix` 进 pre-commit，红测过）②consumer 四个关键页 axe 断言（jsdom + 真路由 + 服务桩，13/13 绿）③Lighthouse 首页基线**桌面/移动双 100**、已同意态 color-contrast 0 违规。落地中修掉 3 处真实缺陷（隐私弹窗关闭按钮无可及名称、标题层级跳跃、`exhaustive-deps` 漏依赖）。**待办**：键盘/VoiceOver 手动走查（需人工）、购物车/结算页需登录态的 snapshot 审计、66 个渐变背景对比度节点手动抽查。merchant/admin 已于 2026-09-01 纳入 axe + 大纲断言（见下一行）。手册 [`docs/frontend/accessibility.md`](docs/frontend/accessibility.md) |
| 语义化 HTML | 🟡 | 标题语义已修〔实测 2026-09-01〕：`div onClick` **0 处**，consumer-next 手写标记合格。**已清零 23 处** `Typography`（第二批 4 处是 `subtitle1/2` 盲区，全在登录态页，地址簿曾把收件人姓名电话渲染成 h6；断言已扩到个人中心/地址簿）——根因是 MUI 不写 `component` 时**语义由 `variant` 决定**（`h1`–`h6` 映射同名标签、`subtitle1/2` 也映射 `h6`），按字号挑 variant 等于瞎定大纲：购物车/结算/订单/支付/404 **整页无 `h1`**、商品价格 `<h3>` 紧跟 `<h1>` 跳级、页脚每页多 4 个噪音 `h6`，**且这些 axe 全绿**（`page-has-heading-one` 不在 WCAG A/AA runOnly 内）。已补「唯一 h1 + 不跳级」断言并真红测（回退修复→`1→3→2…` 变红）。`pnpm ready` 全绿。**merchant/admin 同类 35 处已清零并建 a11y 脚手架**〔2026-09-01〕：admin 此前**没有 `test` script**、`vp run -r test` 静默跳过，脚手架一上线抓出 axe 真违规——merchant 18 个表格图标按钮/通知铃/头像相机无可及名称、`Select` 无 label、设置页 4 个 `TextField` 标签未关联，admin `Select` 缺 `labelId`，全部已修（`aria-label` 走 i18n `a11y.*`）；merchant `/reports` 挂 ECharts 未纳入 jsdom。**consumer-next `schema.org/Product` JSON-LD 已落地**：服务端从同一份 query 生成，`formatMoney`/`moneyToDecimalString` 同源于 `lib/money.ts`，`verify:runtime` 从真 SSR HTML 断言并红测（price 丢 nanos → `'99' !== '99.5'`）。**待办**：Google Rich Results Test 需公网，上线后补；merchant `/reports` 手动走查。**`speculationrules` 已评估：不引入**——consumer 是 SPA 无文档导航（等价物是 Router `preload`），consumer-next 仅一个业务页且站内链接零命中；触发重估＝`ListProducts` 落地后扩出「列表→详情」链路。手册 [`docs/frontend/semantic-html.md`](docs/frontend/semantic-html.md) |

### 6. 可观测性（2026-08-30 实测，2026-08-31 增补）

| 项目 | 状态 | 说明 |
|---|---|---|
| 采集层 | 🟡 | Vector **3/3**、集群内 OTel Collector **1/1**、**新增 otel-node hostmetrics DaemonSet 3/3**（节点级 CPU/内存直推 VictoriaMetrics）；**VMAgent 仍缺位**——与 otel-node 路线需二选一收敛（见分类文件）；Pod 级实际用量仍缺 kubeletstats |
| 黑盒探活 | ✅ | node3 `ecommerce-gatus`（4 探针带响应体校验）+ `ces-audit`/采集器 Ready 三个新 vmalert 规则文件（均 Pigsty source+产物双写）〔实测 2026-08-31〕 |
| 主机侧巡检 | ✅ | **三台机器全部部署 `host-watchdog`**〔node1 2026-09-01、node2/node3 2026-09-02 实测〕：node1 14 容器 + Pangolin 隧道站点、node2 11 容器（Harbor 全家桶 + gorse + MinIO）、node3 7 容器（gatus/otelcol/CDC 等可观测面）；均含 `docker.service` + 本机 HTTP 端点 + 磁盘，每 5m，出口复用既有 ntfy。**三台的正常路径与故障路径都验过**，且推送到达以 ntfy 服务端 `messages_published` 计数增长为证（单次 node2 告警 2374→2375），不靠「没报错」推断。触发它的标本：`gorse-gorse-1` 崩溃循环 **18238 次、持续两个月零告警**。判据见 `context/team/host-watchdog.md`，脚本 `infrastructure/host-watchdog/` |
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
   consumer Inbox、retry/DLQ、保留、重放、积压 SLO 与恢复验收。
   **2026-09-03 定为「线 B」，刻意不预建**：触发条件（第一个跨服务副作用的业务写）、
   已查清事实（node3 Debezium 3.6.1 自带 Outbox `EventRouter`）、四步施工清单与未决选择
   固定在 [`docs/todo/数据一致性与事件驱动.md`](docs/todo/数据一致性与事件驱动.md)「线 B」节；
   搬运层用 Debezium Outbox Router，不再自写 relay
2. Elasticsearch 运行时切流：~~建立 Pod 可达的受控网络入口~~（✅ 2026-09-02：Pangolin 资源
   `es.apikv.com`（rid 47，原名 node3-es 同日改名，site node3/siteId 7，target `127.0.0.1:9200` http，SSO off），
   三条验收全过——traefik servers 非空、公网/Pod 内匿名得 ES 自身 401、正确凭据 200 且
   错误凭据 401；`ecommerce_catalog_products` alias 尚不存在（404），属全量重建步骤）；
   ~~ES API key~~（✅ 2026-09-02 已建并验权：`ecommerce-search-readonly` 只读 +
   `ecommerce-search-indexer` 可写，`_has_privileges` 正反验证过；真值在用户密码库，
   不入仓）。~~Config Center 写入~~（✅ 2026-09-02：曾被 Schema 快照落后实测挡住——
   control-tower 内嵌快照 `7922c88` 早于本仓 catalog 契约 `50f7917`；已按跨仓顺序解除：
   `make sync-ecommerce-schemas` 同步至 `151c941` + 修夹具（control-tower `01902ad`）→
   发 tag `0.2.10`（0.2.9 已被占用）→ CI 出镜像 → 集群滚动 config 0.2.10 →
   管理员 JWT PutKey `search/dev/bootstrap.yaml` **version 5**（search.catalog →
   `https://es.apikv.com` + 只读 key），machine token 回读确认，热更新防线实测：
   旧 search Pod 拒收新形态、保留旧配置、仍 Running）。
   ⚠️ **旧 search Pod 现在重启即起不来**（配置已切新形态，旧镜像解不了），
   尽快收敛窗口。~~发布 indexer~~（✅ 2026-09-03 改判：NATS 链整体退役——
   `tools/{search-indexer,outbox-relay,cdc-demo}` 与 `pkg/outbox/{relay,stream}.go` 删除，
   集群 `nats` ns、两个 Deployment、NetworkPolicy/SA/VPA 卸载；两个 K8s Secret
   `ecommerce-search-indexer`/`ecommerce-search-reindex` 保留，其 `ELASTICSEARCH_API_KEY`
   是可写 key，供切流前止血建 alias 用）。
   ~~`products.search_catalog` 迁移 → pipeline 仓接线 → 建 alias → 发布 search 镜像 → 增量验收~~
   （✅ 2026-09-03 全部完成，证据见上方「2026-09-03 重新平衡」段与 `.service-matrix.yaml`
   elasticsearch 行）。**剩余**：回滚窗口结束后退役 Meilisearch（`search` ns + 本地 PV）；
   CDC 链告警（slot 位点差 / connector task 状态 / sink lag，而非容器健康）；固定查询集
   作相关性基线
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
| QQ 机器人接入（**独立仓 `../qqbot`，不落本仓**） | 零（不动存量） | **2026-09-01 订正：已不是「仅立项」**。MVP（`/帮助` + `/搜商品`）**已实现并全门禁绿**（`go build`/`vet`/`gofmt`/`-race`/`-shuffle=on -count=25`），凭据已实测可用（Token 交换 200），集群到 QQ OpenAPI 出站实测可达。**当前唯一阻塞：公网 HTTPS 入站端点**——`gateway.apikv.com` 那条 HTTPRoute 是 `PathPrefix: /` 全量指向电商网关，**不能复用**，须新建 `qqbot.apikv.com` 独立 HTTPRoute。评估与最新状态见 [`docs/reports/2026-09-01-qq-bot-evaluation.md`](docs/reports/2026-09-01-qq-bot-evaluation.md)（含晚间订正表）。**范围裁剪的理由要记住**：`/查订单`/`/物流` 没做，因为 order 服务**没有任何查询 RPC**（只有 Create/Complete，`Order` 是空消息），不是偷懒。C 端查询仍硬依赖全局 P0 #3/#4 |

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
