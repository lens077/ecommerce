# TECH.md 及其链接文档漂移审计报告（2026-09-06）

> 范围：`docs/TECH.md` 全文 + 其链接/引用的 32 份本仓文档 + 拓扑真相源 `.service-matrix.yaml` + 同级仓（control-tower / kubernetes / go-connect-kit / postgres-kafka-es-streaming-pipeline / pigsty-deploy / docker-deploy / mcm）+ 集群只读快照。
> 口径：以**工作树**为当前状态（53 个未提交改动 + untracked 一并计入）；「未提交改动已修」单独标注。集群快照采于 2026-09-06 03:00 CST，**采样时集群处于异常态**（node103 零业务 Pod、cilium-operator 残留、之后 node101 API 直接 host down），凡 Pod 分布/计数只判「过期需健康态复测」，不写现状。
> 只读审计，未修改任何仓库文件（本目录 `.scratch/tech-drift-audit-2026-09-06/` 为审计产物）。
> 方法：主代理采基线 + 8 组子代理分段核对 + 主代理对高严重度项逐条复核（复核过的项在「复核」列标 ✔）。

严重度定义：**高** = 会误导架构/安全/运维决策的「目标写成现状」或与真相源直接相反；**中** = 状态/数字/位置错述，读者按文档行动会踩空；**低** = 计数、命名、锚点、外链、体例。

---

## 0. 总览

| 范围 | 高 | 中 | 低 | 备注 |
|---|---|---|---|---|
| docs/TECH.md 本体 | 16 | 23 | 32 | 见 §1 |
| .service-matrix.yaml（TECH 引用为真相源） | 0 | 5 | 3 | 见 §2 |
| 链接文档（context/、docs/design、docs/frontend、docs/observability、docs/todo、TODO.md、SECURITY-HARDENING） | 6 | 25 | 30+ | 见 §3 |
| docs/reports/*（18 份，供应链两份的高项已计入 §3） | 1 | 13 | 25+ | 见 §4 |
| 同级仓 | 2 | 6 | 6 | 见 §5 |
| 集群 vs 仓库（live 漂移） | 2 | 3 | 1 | 见 §6 |
| 外链失效 | — | 1 | 2 | 见 §7 |
| **合计（去重后约）** | **27** | **76** | **100+** | |
| 复核新增（§8，健康态 + SSH 三台主机后落定） | 0 | 5 | 3 | 中：Silo 无 Versioning/Lifecycle、PgBouncer 被绕过、`lsn.flush.mode` 线上丢失、三链路 ntfy topic 不共用（Gatus 变量疑似误灌）、第三次 placement drift 触发重评条件；低：Temporal 版本、InfoQ 外链疑似不存在、consumer-next RSS |

**贯穿全篇的 6 条根因**（多数条目都是它们的投影）：

1. **TECH §2/§4/§5/§7/§8/§9 大量用现在时写目标态**，而 `STACK.md`、`.service-matrix.yaml`、`TODO.md`、`docs/design/platform/architecture.md` 都诚实标了「目标/待接线」——TECH 是唯一把目标写成现状的一份，且自身 §12 又把同一件事列为待办（OpenFGA、Dragonfly 分实例、default-deny、KEDA、Bugsink SDK）。
2. **2026-09-01～09-05 的五天变化没有回写 TECH**：访客轨落地（09-01/03）、Consul 关闭 + `direct://`（09-03）、relay/indexer/NATS 退役（09-03）、Meilisearch 退役（09-04）、`postgres_gorse` 收窄+TLS+口令轮换（09-01）、go-connect-kit 迁移（09-05）、pnpm/Vite+/Oxlint 升级（09-05）、qqbot 新增（09-02）。
3. **Pod/Deployment/VPA 计数全部沿用 08-29/08-30 的 15/17/13**，relay/indexer 退役与 qqbot 新增后应为 14/16/12，且 09-04 又发生一次全量重建（重评 Descheduler 的信号）。
4. **两次 `git filter-repo`（09-02 凭据、09-05 公网 IP）后，文档里 09-05 前的本仓短 SHA 全部不可解析**（`ad1bb33`、`19a7a93`、`0b9b9ad`、`89758a2`、`151c941`、`0ce0b8948cda`、`cb2977d`、`c364128`…），镜像 tag 仍有效但 `git show` 会报 unknown revision。
5. **CI 触发面**：TECH「GitHub 只由 tag 触发」「PR 三件套」与实际（`context-gate.yml` 每 push/PR 跑；`supply-chain-pr.yml` 08-29 起仅 tag；GitLab 另有 `gitleaks` job）不符，且 TECH 引用的两份出处自己都写了例外。
6. **同级仓 `../kubernetes` 于 2026-09-04 定了与 TECH 相反的方向**（node3 重装入集群、PostgreSQL 回 CNPG、观测/告警 7 组件进集群），ecommerce 仓零处提及。

---

## 1. docs/TECH.md 本体

### 1.1 高

| 行 | 声称 | 实际（证据） | 类型 | 复核 |
|---|---|---|---|---|
| 42 | 「维持 **franz-go 自写消费者**（Inbox 幂等 + 状态写 PG）」 | `backend/go.mod` 无 franz-go/任何 Kafka 客户端；`.service-matrix.yaml:72` kafka `used_by: []`；无 Inbox 表；`pkg/outbox.Insert` 零调用方。STACK.md:126/209/566 写「未来消费者使用 franz-go」 | 目标写成现状 | ✔ |
| 82/84/107 | Pangolin「端口转发/安全反向代理（**不叠加 WireGuard/IPsec 隧道**）」「内网明文转发」 | 集群无公网 IP，Pangolin(node1 VPS)→集群这一跳**就是 WireGuard 隧道**（`../kubernetes/components/newt/README.md:5-11`「WireGuard(隧道由集群侧发起)」；`pangolin/newt` 1/1；`../docker-deploy/pangolin/docker-compose.yml:40` 51820/udp），目标是 Cilium Gateway VIP:443（HTTPS），既非内网也非明文。`production-scale-goal.md:193`、`architecture.md:15` 同源同错 | 目标写成现状 | ✔ |
| 90/109/621–628 | 「control-tower ← Session 校验 / **OpenFGA 鉴权**」「全面采用 …OpenFGA 关系授权」图「Check API → OpenFGA（鉴权真相源）」 | control-tower 网关授权是 **Casbin**（`services/gateway/internal/authz/authz.go`；`go.mod casbin/v2 v2.103.0`），代码零 openfga；OpenFGA 在集群 `openfga` ns 2/2（v1.18.3）**零接线**；矩阵 externals 无 openfga；TECH §12 L822 自列「OpenFGA 落地」为 P0 待办 | 目标写成现状 + 自相矛盾 | ✔ |
| 633–658 | §8.2 OpenFGA 模型 `schema 1.1` | 四仓无任何 `.fga`/`schema 1.1` 文件，模型只存在于 TECH 正文 | 目标写成现状 | ✔ |
| 543/552/95/624 | Dragonfly「分实例部署：Session `noeviction`+持久化 / Cache `allkeys-lru` / 限流独立」「持久化 Session Store」 | 集群仅 `dragonfly/dragonfly` 1 个 Deployment（`--maxmemory=256mb --cache_mode=true`，ns 内 0 PVC，无持久化）；10 服务 + 网关 BFF session 全用同一 `dragonfly.dragonfly.svc:6379`；TECH L819 自列「分实例拆分」为 P0 待办 | 目标写成现状 + 自相矛盾 | ✔ |
| 551 | 「**UUIDv7 为默认主键**」 | 全部迁移主键为 `BIGSERIAL`/`BIGINT`/`SERIAL`（address 用 UUID 但非 v7 默认）；`grep -ri uuidv7 backend --include=*.sql` = 0 | 目标写成现状 | ✔ |
| 560/579 | 「**所有 Namespace** 默认开启 default-deny」 | 全集群仅 1 条 CNP `ecommerce/ecommerce-api-default-deny`（13 个按 SA 选择的 spec：10 服务+gateway+consumer-next+frontend），CCNP 0；`qqbot` 及 config-center/dragonfly/consul/openfga/opentelemetry/logging 等 ns 无 CNP；TECH L820 自列「default-deny」为 P0 待办 | 目标写成现状 + 自相矛盾 | ✔ |
| 671 | §8.4「B 访客身份（购物车**五个** RPC，**当前缺失**）」 | CartService 共 4 个 RPC；`.service-matrix.yaml:157-161` 与 `../control-tower/routes/dev.yaml:79-83` 各 4 条 guest；网关访客轨已实现并装配（`internal/guest/`、`cmd/server/main.go` `GUEST_ENABLED` 默认开；提交 fdf0e82→dae4d86，集群镜像 0.2.10），09-03 dev 实测 GetCart 200 + `Set-Cookie: ct_guest` | 过期事实 + 数字漂移 | ✔ |
| 673 | 「**设计草案，未落地**——匿名加购路径仍不存在」 | `docs/design/platform/anonymous-shopping.md:3-4`（未提交）已改「代码侧步骤 1–3 已完成」；`context/project/ecommerce/cart/experience/guest-add-to-cart-blocked-by-shop-name.md`（untracked）：端到端已跑到 `AddProductToCart` 500（`cart_item.shop_name NOT NULL`——与访客无关，登录用户加购也从未成功过）；`TODO.md:223` | 过期事实 | ✔ |
| 678–703 | §9.1「计算集群仅部署轻量级采集器…统一经**外置** OTel Collector 中继」+ 图「VMAgent (DaemonSet) 指标」 | 集群无 vmagent；`opentelemetry` ns 有 `otel-opentelemetry-collector` Deployment（receivers otlp/k8s_cluster/k8sobjects/prometheus{self,cilium,hubble,vector}，exporters **直发** node3 三个 Victoria 后端，不经 node3 otelcol）+ `otel-node…agent` DaemonSet（hostmetrics）；业务 Pod 经 CNP FQDN `node3-otlp.apikv.com:443` 直发 node3 otelcol；§9.3 L738 自己写「集群内 OTel Collector 的 k8s_cluster receiver」 | 过期事实 + 自相矛盾 | ✔（S3 采于集群可达时） |
| 687–712 | 「PII 脱敏 / 噪声过滤 / Tail-based 采样 / 指标重打标」为管道核心逻辑 | 集群内 collector 与 node3 otelcol（`../kubernetes/archive/pigsty-node3-2026-09-03/raw/etc/otelcol/config.yaml`）processors 仅 memory_limiter/batch/delta_to_cumulative，无 tail_sampling/redaction/filter/transform；仅有的脱敏是 Vector VRL 手机/邮箱正则（`../kubernetes/components/vector/values.yaml:50-58`）；网关是头采样 `OTEL_TRACES_SAMPLER_RATIO=0.2`；`docs/todo/统一可观测性体系.md:58,112` 把二者列为目标 | 目标写成现状 | — |
| 24 | 「GitHub **只由**发布 tag 触发构建、签名、发布链」 | `.github/workflows/context-gate.yml` `on: pull_request + push.branches '**'`（verify-context + gitleaks 每 push/PR 跑）；`frontend.yml` 仅 `schedule` 每周一；TECH 自引的 `context/team/git-commit.md:277`「context-gate.yml 是唯一 per-push 例外」与 CI 复盘报告 :34 都承认例外；GitLab 门禁清单漏 `gitleaks` job（`.gitlab-ci.yml:58`） | 自相矛盾（与自引规范） | ✔ |
| 39/952 | 「**PR** 三件套（Gitleaks/zizmor/Trivy fs）已红测并全绿」「PR 阶段已经落地…棘轮门禁」 | `supply-chain-pr.yml:3-4`「触发(2026-08-29 起)：**仅发布 tag**…原为 pull_request，已停」；GitLab MR/push 只跑 `gitleaks`（全历史）；zizmor/Trivy fs 不在任何 PR/push 上跑。TECH-RADAR:274 同措辞 | 过期事实（门禁位置错述） | ✔ |
| 47 | 替代动作「`.service-matrix.yaml` 标记的 `postgres_gorse` **明文弱口令 + `0.0.0.0/0` 收敛**」（写作待做） | `.service-matrix.yaml:79`「**2026-09-01 收窄已落地**…TLS 与口令轮换已落地…root 口令 28 位强随机…hostssl」；矩阵 `0.0.0.0`/`弱口令` 命中 0 | 过期事实 | ✔ |
| 999 | 「记录了 `postgres_gorse` 与 `redis_gorse` 两个**仍对 `0.0.0.0/0` 开放的 P0 项**」 | `SECURITY-HARDENING.md:435`「两个端口都已收窄，**不再对 `0.0.0.0/0` 开放**」、:307「✅ 已关闭（2026-09-01）」；矩阵 :78-79 同 | 过期事实（与被引文档直接相反） | ✔ |
| 600 | 「业务 VPA 必须 `Off` + `RequestsOnly`…不启用 InPlaceOrRecreate」 | 集群 15 个 VPA：config-center ns 2 个 **`InPlace`**（源 `../control-tower/deploy/{dev,pre}/config/vpa.yml`）；live `ecommerce/control-tower-gateway-vpa` **无 `controlledValues`**（默认 RequestsAndLimits）+ min/maxAllowed（源 `../control-tower/deploy/dev/gateway/vpa.yml`），与本仓 `application-vpa.yml:266-282` + `structcheck/vpa_test.go:48`（`containerName: gateway` + RequestsOnly）构成**同一 live 对象两仓两份定义**，`kubectl diff -f application-vpa.yml` rc=1 | 过期事实 + 跨仓双真相源 | ✔（InPlace）/ S7（gateway） |

### 1.2 中

| 行 | 声称 | 实际（证据） | 类型 |
|---|---|---|---|
| 20 | 测试「k6、property-based testing（如 gopter）、状态机测试」列为已定选型 | 零 k6 脚本（`**/*.k6.js`、`k6/` 0 命中；STACK.md:284「目标工具」）；go.mod 无 gopter/rapid；`*_test.go` 零状态机测试。Playwright 属实（1 个冒烟脚本） | 目标写成现状 |
| 21 | 「OpenFGA…Bugsink（前端异常监控）」列为已确定 | OpenFGA 零接线（见高）；前端零 `@sentry/*`/bugsink 依赖，Bugsink 服务端在跑但没有一个前端在上报（TODO.md:226） | 目标写成现状 |
| 23/181/205 | 「Protobuf：RPC 与**领域事件**的统一序列化」「Outbox 表 (Protobuf Payload + Trace Header)」「envelope 含 event_id、aggregate_id、tenant_id、trace_id、schema_version、occurred_at」「Buf Schema Registry 管理兼容性」 | `products.outbox`（`00004_outbox.sql`）实际列为 CloudEvents 1.0 对齐：event_id/source/type/subject/partition_key/**payload JSONB**/occurred_at；无 aggregate_id/tenant_id/trace_id/schema_version/traceparent；`pkg/outbox.Message.Payload []byte // CloudEvents data（JSON）`；proto 中四字段 0 命中；`buf.yaml` 无 BSR 模块、deps 全注释 | 与代码契约相反 / 目标写成现状 |
| 24/964 | 「Renovate」列为已确定选型与出处 | 仓库无 `renovate.json*`/`.renovaterc*`/`dependabot.yml`；唯一引用 `supply-chain-pr.yml:33` 注释「Renovate **后续**负责」 | 目标写成现状 |
| 47 | 「只有那里（control-tower）拿得到 Casdoor session 与 **OpenFGA 身份**」 | control-tower 零 OpenFGA | 目标写成现状 |
| 93–96/172/186–194 | §2.1/§4.1 图与文字用现在时：Outbox → Debezium Outbox Event Router → Kafka → Inbox 消费 | pipeline 仓 `grep -ri 'outbox\|EventRouter'` 0 命中；唯一 source connector `postgres-source.json` 7 张 CDC 表不含 outbox；只有 §4.5 L251 一句「零生产者零消费者」，§2.1/§4.1/§4.2 未回指 | 目标写成现状 |
| 110/628 | 「服务间仅信任网关注入的 **X-User-ID / X-Merchant-ID**」 | 实际头为 `x-md-global-user-id/-name/-role/-owner/-anonymous`（`control-tower/.../identity/identity.go:18-27`；后端 6 处；矩阵 :141）；`X-Merchant-ID` 两仓 0 命中 | 命名不一致 |
| 455/470/475 | §5.8「`CreateFulfillmentOrder`（由 Order Service 在**支付成功后**同步触发）」 | `docs/design/order/checkout.md:17/218/342`、`architecture.md:70`、`GLOSSARY.md:91`：只有 **`OrderReadyForFulfillment`**（库存确认后）可触发履约，「OrderPaid 不再直接触发」；TECH L244 自己列它为领域事件，§5.5 L387 却缺 | 自相矛盾 + 与设计文档相反 |
| 541/551 | 「PostgreSQL (Pigsty / **Patroni HA**)」「Patroni 自动 Failover，**PgBouncer** 连接池」 | node3 单实例（`../pigsty-deploy/pigsty-node3-deployment.md:163-165`「etcd 单成员、PostgreSQL 单实例」）；业务直连 5432（经 node1:30001），矩阵与各服务配置零 `pgbouncer`/`6432` | 目标写成现状 |
| 542/553 | 「Apache Kafka **集群** + **Schema Registry**」 | KRaft 单 broker、RF=1（`PIGSTY-HARVEST:31,65`；pipeline `kafka-connect.yml:17-19`）；Schema Registry 三仓 0 命中 | 目标写成现状 |
| 543/554 | 「Elasticsearch **集群**」 | `pipeline/deploy/docker-node3/compose.yml:18` `discovery.type: single-node` | 目标写成现状 |
| 544/685/700/823 | 「Vector / **VMAgent**（仅采集器）」 | 集群无 vmagent（见高）；`TODO.md:234`「VMAgent 仍缺位——与 otel-node 路线二选一未定」 | 过期事实 |
| 604 | 「健康态分布 5/6/6〔08-29〕…6/6/5〔08-30〕」「13 个单副本服务」「17 个 Pod」 | Pod 集合已变（relay/indexer 退役、qqbot 新增）：ecommerce ns 14 Deployment / 16 Pod / 12 单副本；09-04T20:51Z 全部 Pod 再次重建到 node101/102（采样 8/8/0 异常态）——第二次 placement drift 是本段「重评 Descheduler」条件的信号，TECH/TODO 均未记录 | 数字漂移 + 需健康态复测 |
| 667 | 「网关校验 **HMAC 签名与 API Key** → 映射 Merchant 身份」 | control-tower 与 backend 零 HMAC/API-Key 实现（唯一命中 `guest.go:5` 注释「不做 HMAC 签名」） | 目标写成现状 |
| 671 | 「网关签发**签名** cookie」 | `guest.go:5-8`「128 位以上随机不透明 ID，**不做 HMAC 签名**」，实为 UUID v4 HttpOnly cookie | 过期事实 |
| 716–728 | §9.2「order-service 写 Outbox 存储 traceparent…Debezium 把 `traceparent` 列映射为 Kafka Header…notification-service」 | outbox 表无 `traceparent` 列；order 无 outbox 表；pipeline 仓 grep 0；无 notification 服务 | 目标写成现状 |
| 742 | 「每条规则都必须设 `for:`」 | 本仓 `infrastructure/observability/ecommerce-security-alerts.yml` 4 条 alert 仅 1 条有 `for:`；`../kubernetes/components/vmalert/rules/ecommerce-security.yml` 09-03 已补——本仓副本落后 | 自相矛盾（规则 vs 本仓工件） |
| 762–770 | §10.2「`ServiceRegistry` 接口 / `cfg.GetServiceAddr("inventory-service")` / `INVENTORY_SERVICE_ADDR`」 | backend、go-connect-kit、control-tower 三仓全部零命中；实际是 go-connect-kit/registry（Consul，已 `CONSUL_ENABLED=false`）+ 网关 `direct://` | 目标写成现状（示例代码不存在） |
| 815–839 | §12 P0/P1/P2「阶段」 | `docs/todo/README.md:36-40`：P0/P1/P2 是**优先级**口径，推进顺序是「阶段 0–4」；条目归属冲突：TECH P0「OpenFGA 落地」→ TODO 阶段 2；TECH P1「HPA/KEDA + Rollouts」→ TODO 阶段 4；TECH P0「Dragonfly 分实例」不在 TODO P0 表 | 自相矛盾（跨文档） |
| 5.5/387 | Order「通过 Outbox 发布 OrderCreated、OrderPaid…」 | order 现用进程内 GoEventBus（`internal/eventbus/eventbus.go`），仅 `OrderCompleted` 一个事件、处理器只 `log.Printf`、双写；`backend/services/order/eventbus.md` 横幅承认「过渡态」；TECH 未标注 | 目标写成现状 |
| 959 | Cosign 出处 `docs.sigstore.dev/cosign/overview/` | 301 → `/signing/quickstart` → **404** | 外链失效 |
| 1015/980/981 | gopter「Go 属性测试库」、k6「负载测试」、Lighthouse CI「性能指标 LCP/INP/CLS」无状态注记 | 三者零落地（LHCI 无配置，唯一实跑是 08-31 一次 CLI **无障碍**审计）；同表 SPIFFE/mTLS/Chaos Mesh/Next.js 行却有注记 | 目标写成现状 / 体例不一致 |
| 738/§9.3 vs §9.1 | §9.3 说「K8s 指标由集群内 OTel Collector 的 k8s_cluster receiver 产出」 | 与 §9.1「集群仅采集器、外置 Collector」互斥（§9.3 才是现状） | 自相矛盾 |

### 1.3 低

| 行 | 声称 | 实际（证据） | 类型 |
|---|---|---|---|
| 22 | 「Protobuf-ES 内置追踪」 | 前端零 `@opentelemetry/*`、零 `traceparent`；`packages/tracker` 是 gorse 行为埋点 | 目标写成现状 |
| 32/780 | 「**3 个 store** 重写为 vanilla store」 | 现存 2 个（`apps/consumer/src/store/users.ts:49`、`packages/utils/src/notifications.ts:17`）；第 3 个 Loading store 当天被 `df673fc` 删除 | 数字漂移 |
| 43 | 「承接其（ClickHouse）**触发条款①②**」 | TECH 无 ClickHouse 章节，条款在 `docs/TECH-RADAR.md:126` §3.2，未给指向 | 路径失效 |
| 43 | 「试点**已排期**未开工」 | `docs/todo/数据一致性与事件驱动.md:158`「采纳的是能力不是排期」/:164「保持未排期」；todo 引用的 TECH 原文「采纳（试点待执行）」已不存在 | 自相矛盾（跨文档） |
| 47 | 两处裸「§5.7」 | TECH 内 `### 5.7` = Inventory Service（:421）；所指在 `production-scale-goal.md` §5.7（:191-198） | 锚点歧义 |
| 48 | 「（§9）」 | TECH 有两个 `## 9.`（:676 可观测性、:984 安全）；`## 5.`/`## 11.` 亦重号 | 锚点歧义 |
| 63 | 「例如 `PaymentPort`、`ObjectStore`、`SearchCatalog`」 | 仅 `SearchCatalog` 存在；payment 为 `PaymentRepo`；cart 直用 minio；`FulfillmentProvider`/`NotificationPort` 0 命中 | 目标写成现状 |
| 74–78/106 | 「CDN / WAF / Cloud 边缘」 | `dig shop.apikv.com`/`gateway.apikv.com` → <node1-public-ip>（node1 VPS 直连），无 CDN；h3 在 Pangolin Traefik 终止（实测 `alt-svc: h3`），QUIC 本身无漂移，归属层画错 | 目标写成现状 |
| 86/108 | 「KPR **严格模式**」 | `kube-proxy-replacement=true`；Cilium ≥1.16 无 `strict` 取值 | 命名过期 |
| 88 | 「CNP 仅放行 Gateway → control-tower」 | live CNP gateway spec 还放行 `ecommerce-consumer-next` SA（SSR 直连）与 host/remote-node | 过期事实 |
| 123/158/518 | 「Order Saga Process Manager」 | order 目录 `saga|orchestrat|compensat` 0 命中；仅 `CreateOrder`/`CompleteOrder` 两个 RPC；`consistency.md:8` 已声明为目标 | 目标写成现状 |
| 131/148/§5 各节标题 | Identity/Catalog/Fulfillment/Notification/Reconciliation/Analytics Service | 实际 10 个目录 user/merchant/product/cart/order/payment/inventory/address/behavior/search；映射仅在 `docs/design/platform/architecture.md:4`，TECH §5 无「目标」标注 | 目标写成现状 |
| §5 各节「对外接口」 | 约 30 个 RPC 名 | 实名仅 `CreateMerchant`/`GetCart`/`CreateOrder`/`HandlePaymentCallback`/`GetPaymentStatus` 5 个存在；`AddItemToCart`/`RemoveItemFromCart`/`UpdateItemQuantity`/`ReserveStock`/`ReleaseStock`/`CreatePaymentIntent` 是对现有 `AddProductToCart`/`RemoveCartItem`/`UpdateCartItemQuantity`/`Reserve`/`ReleaseReserve`/`CreatePayment` 的改名；`GetListingForCheckout`/`CreateCheckoutSession`/`ConfirmStock`/`Refund`/`GetMemberRoles`/`CheckMerchantOwnership`/`MergeGuestCart` 0 命中 | 命名不一致 |
| §5 各节「领域模型」 | OrderGroup/MerchantOrder/StockLedger/Reservation/PaymentIntent/Listing/Store/MerchantMember… | 实际表：`orders.order_group/order_main/order_item/order_log`（可对应）；`inventory.stock(on_hand,locked,available)`+`change_log`（无 Reservation，`locked`≠`reserved`）；`payments.payments` 单表；product 无 Listing/Category；merchant 无 Store/MerchantMember；状态枚举无 `FULFILLING` | 目标写成现状 |
| 163/387–388/419/448/476/498 | 事件名 | Order 订阅 `InventoryReserved` 但 Inventory 发布 `StockReserved`；Notification 订阅 `OrderShipped`/`PaymentFailed`，无人发布 | 自相矛盾 |
| 201 | 「outbox 表不维护 `published_at`/`attempts`」 | 三列 + 两个簿记索引仍在（`00004_outbox.sql:27-34`），未提交 diff 只改注释为「遗留待删」 | 措辞与结构不符 |
| 202/530 | 「消费端统一维护 `inbox_events`」「Inbox/Outbox 全服务」 | backend `inbox` 0 命中；outbox 仅 product 一张 | 目标写成现状 |
| 215–236 | KEDA ScaledObject YAML、「KEDA 只管 franz-go 消费者」 | HPA/ScaledObject 均 0；`scaleTargetRef: notification` 无此 Deployment；`kafka-cluster:9092` vs 矩阵 `node1:30004`；预建 topic 是 `ecommerce.events` 非 `order.events`；YAML 未标「示例」 | 目标写成现状 + 示例地址错 |
| 344 | 「上限（如 100 件）」 | `cart.proto:42-44` `lte: 999` | 数字漂移 |
| 506–511 | §6 缺 `Customer` 词条 | §5.2 L279 有；`GLOSSARY.md:31` 专条 | 不完整 |
| 556 | 「GHCR（可选）…是否推送由 CI 决定」 | `service-ci.yml:169-175` TCR/GHCR 无条件同推；SBOM/Trivy/Cosign 锚定 GHCR digest | 过期事实 |
| 586 | 「所有业务 Pod 以 `part-of` 进入 suite-wide spread」 | 13/14 有 TSC；`qqbot`（ecommerce ns）无 part-of、无 TSC、无 VPA、无 PDB | 过期事实 |
| 587 | 「其余 13 个单副本 Deployment」 | 现 12（10 服务 + frontend + qqbot） | 数字漂移 |
| 758 | 「生产：K8s Service + CoreDNS」 | 09-03 已实际切 `direct://`（与定稿一致），但 Consul StatefulSet 仍跑、注册代码保留、`routes/pre.yaml` 仍 11 条 `discovery:///`——迁移期状态 TECH 未提 | 信息缺失 |
| 759 | 「pre 半生产测试 = Docker Compose」 | control-tower 的 pre 是 K8s 清单 `deploy/pre/`；`backend/compose.yaml` 自述「与 make dev 一致」 | 口径疑似过期 |
| 805 | 「`telemetry_pb.ts` 已含 `prerender` 导航类型」 | 仅 `nav_type` 字符串字段注释（`telemetry.proto:72`），非枚举值 | 措辞夸大 |
| 821/837/838 | 「已切流」「当前判定暂不引入」「audit-only 已落地」 | 与 L810「本节不承载完成状态」自我约束冲突 | 自相矛盾 |
| 869 | CloudEvents「可选采用」 | `TECH-RADAR.md:76`「✅ 采纳维持」；outbox 列已按 CE 1.0 对齐 | 注记与真相源相反 |
| 881 | KEDA 出处 `docs/2.16/` | 集群 `keda:2.20.2`，latest 文档 2.20 | 版本落后 |
| 886/887/928/1008/1017 | ArgoCD / Argo Rollouts / VMAgent / Toxiproxy / pgbench 无状态注记 | 零 Application、零 Rollout、无 vmagent、Toxiproxy/pgbench 仅文档提及 | 未落地无注记 |
| 963 | zizmor 出处 `woodruffw.github.io/zizmor/` | canonical 已迁 `docs.zizmor.sh` | 域名过期 |
| 994/997 | fail2ban「集群外**两台**边缘主机」 | 矩阵 :88 node3「自身公网只开 SSH」，第三台公网 SSH 主机无 fail2ban 记录 | 遗漏 |
| 996–997 | 「承载 **postgres/kafka**/gorse/MinIO/Harbor 的两台边缘主机 node1/node2」 | postgres/kafka 在 node3 Pigsty，node1 只是 TCP 入口（矩阵 :84-89） | 表述不准 |

### 1.4 疑似 / 未能核实（TECH 本体）

- L37 Tetragon `3/3` Ready：chart 1.7.1 有文件佐证（`install.sh:14`），健康态未复测。
- L46 Bugsink「2.5.x」：TODO.md:226 说 2.5.0；node3 容器无版本 tag，未核。
- L47 Pangolin Traefik v3.7：仓库无 Pangolin compose，需 node1 核。
- L555 Silo「Versioning 与 Lifecycle」、L736 ntfy 单 topic、L795 Bugsink→ntfy 已通：node2/node3 侧，未核。
- L109 Casdoor Stateful Session：网关 session 与 JWT（legacy bearer 轨）并存，未逐行核。
- 各外部版本号（Chaos Mesh/OpenCost/Temporal/Pyroscope/csi-driver-spiffe/DuckDB 2.0）：离线不可核。

---

## 2. `.service-matrix.yaml`（TECH 多处引用为拓扑真相源）

| 行 | 声称 | 实际 | 类型 | 严重度 |
|---|---|---|---|---|
| 69/100 | 「集群内 CloudNativePG pg-main 处于 hibernate（pod 归零）」 | 集群已无 `postgresql`/`cnpg-system` ns、0 个 CNPG CRD（TODO.md:150、STACK 未提交改动均已写「已清理」） | 过期事实 | 中 |
| 103–107 | 「集群内可观测已整体删除…otel-collector 全删，只剩 vector DaemonSet」 | `opentelemetry` ns 有 collector Deployment（08-27 建）+ node agent DaemonSet（08-29 建）；TECH §9.3 依赖它 | 过期事实 | 中 |
| 273–278 | `frontend.apps` 仅 consumer/merchant/admin/desktop | `frontend/apps/consumer-next` 存在且集群 2/2；structcheck 不校验该段 | 遗漏 | 中 |
| 72 vs 109 | kafka `used_by: []`「本仓无客户端…业务接线」 vs pigsty_node3 note「Kafka 已承载搜索 CDC 行投影」 | 同文件两处口径不一（前者指业务客户端，后者指 Connect 链） | 口径不一 | 中 |
| 77 | gorse「依赖 node1 的 rediss://redis.apikv.com:**6379** 与 pg:**5432**」 | 同文件 :78-79 端口已随机化为 61246/52288 | 自相矛盾 | 中 |
| externals | 无 openfga / bugsink / gatus / openbao 条目 | OpenFGA 集群 2/2；Bugsink/Gatus 在 node3（TECH 当现役）；openbao + vault 两条 ClusterSecretStore 均 Valid | 遗漏 | 低 |
| 125 | gateway.external 含 consul（「Config/发现」） | 网关 dev 路由已全 `direct://` | 迁移期未注 | 低 |
| 71 | 「网关 routes.yaml 的 target 全部改为 direct://」 | 仅 dev；`routes/pre.yaml` 11 条仍 `discovery:///` | 以偏概全 | 低 |

---

## 3. 链接文档（context/、docs/design、docs/frontend、docs/observability、docs/todo、TODO.md、SECURITY-HARDENING）

### 3.1 高

| 文件:行 | 声称 | 实际（证据） | 类型 |
|---|---|---|---|
| `docs/design/platform/anonymous-shopping.md:3,7-10,106`（未提交版本） | 状态「运行时刚部署、**尚未验通**…端到端还没跑过」；第 3 步「✅ 零改动即满足…端到端未验」 | 同日 untracked `context/project/ecommerce/cart/experience/guest-add-to-cart-blocked-by-shop-name.md:15-29`：`guest:` 段已贴进 Config Center，端到端已跑：GetCart 200 + `ct_guest` cookie、新访客隔离、CreateOrder 401、**AddProductToCart 500**（`shop_name NOT NULL`）；TODO.md:58 P0#8 同。第 3 步验收「匿名 AddProductToCart 成功落库」不成立 | 工作树两份同日文档自相矛盾 |
| `docs/observability/alerting-notification.md:108-139` §3.3 | 「**现行配置** `/data/gatus/config.yaml`…`alerting: custom:` POST ntfy JSON 中文化…端点 `type: custom`」；TECH:744、`OBSERVABILITY.md:112` 复述 | node3 实机（收割件 `../kubernetes/archive/pigsty-node3-2026-09-03/raw/data/gatus/config.yaml`，mtime 09-01）：`alerting: ntfy:`（**内置 provider**），10 端点全 `type: ntfy`，`custom`=0；`docs/INFRASTRUCTURE-OPERATIONS.md:97` 亦写「原生 ntfy provider」 | 目标写成现状 / 与 INFRA-OPS 矛盾 |
| `docs/observability/alerting-notification.md:313-318` §8 | 「K8s 维度规则**尚未编写**…规则文件**不在版本控制里**」 | node3 `/infra/rules/ecommerce-k8s.yml` 自 2026-08-31 存在（7 条、每条有 `for:`、下划线口径，含 `AlertFiringTooLong`、`K8sClusterMetricsMissing`）；版本化副本 `../kubernetes/components/vmalert/rules/`（09-03）、本仓 `infrastructure/observability/`（08-29）；TODO.md:237、`alerting-signal-hygiene.md:124` 均记录。手册最后修改 `bf8e083` 09-01 晚于规则落地 | 过期事实 |
| `TODO.md:64` 全局 P0 #14 | 「免鉴权入口身份可伪造（`x-md-global-user-id` 未剥离）」 | control-tower `httpmw/auth.go:85-86` 路由解析前无条件 `identity.Strip`（删全部 `x-md-*` 入站头），自 `742f85a` 2026-08-23，含于已部署 0.2.10；分类文件描述的是 08-24 已删的旧网关 | 僵尸 P0（已修未销） |
| `TODO.md:223` §5 | 访客轨「第 1–3 步代码已落地，**未部署**〔09-01〕；未完成 ④装配 GuestCookie（当前 nil）⑤routes 推 Config Center」 | ④ `dae4d86`（09-01）已装配，`GUEST_ENABLED` 默认 true，含于 0.2.10；⑤ 09-03 已推 Config Center 并验通；真实阻塞是 `shop_name NOT NULL`（P0#8）；⑥⑦（MergeGuestCart/清理）仍未做 | 过期事实（状态与清单错位） |
| `docs/reports/2026-08-28-supply-chain-evolution-overview.md:118-124,144,208,227`、`…-pr-validation.md:130-132` | 「尚未接入 Trivy image…当前最大缺口」「**没有安装 Kyverno**」 | `service-ci.yml:234-268` 签名前 Trivy image 门禁已接线（CRITICAL,HIGH + ignore-unfixed + SARIF，tag 1.6.2/1.6.3 验证）；Kyverno 4 控制器 AGE 15d（早于报告日期）+ 2 条 Audit ClusterPolicy。TECH:39/952 自己写了正确事实，却仍把两份过期报告当「剩余路线」出处 | 过期事实（报告落后于 TECH） |

### 3.2 中

| 文件:行 | 声称 | 实际（证据） | 类型 |
|---|---|---|---|
| `context/team/git-commit.md:276` | GitLab 跑「context-gate + backend-gate + frontend-gate」 | `.gitlab-ci.yml` 4 个 job：另有 **gitleaks**（v8.30.1，09-02）；backend/frontend-gate 带 `rules: changes:` 只在相关路径变更时跑；backend-gate 多跑 `lint-baseline.sh check`，frontend-gate 多跑 knip | 过期事实 |
| `context/project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md:141-147` | 「遗留（已知，**未改**）…另加一条『逻辑槽滞留 > 2 GB』告警」 | 2 GB 告警已落地：pipeline `deploy/docker-node3/monitoring/rules-ecommerce-cdc.yml:71-85` `CdcSlotWalRetentionHigh/Critical`；矩阵 :74「09-06 已落地 12 条」。另一半「把逻辑槽排除出 PostgresReplicationLag/Break」仍未做（TODO.md:237） | 半条过期 |
| `docs/design/platform/anonymous-shopping.md:39` | B 级 RPC 列 5 个（含 `GetCartSummary`），现状「❌ 当前要求登录」 | `cart.proto:12-22` 只有 4 个 rpc，**无 `GetCartSummary`**；4 条已全部进 guest_paths；同文 :105 又写「各 4 条一致」 | 数字漂移 + 自相矛盾 |
| `docs/design/platform/anonymous-shopping.md:105,113` | 「线上键是否含 `guest:` 未核」「BFF 会话轨当前在集群里未配置」 | experience :15 已贴入并验证；TODO.md:224「BFF 端点 ✅ 2026-09-01 已启用并验证」 | 过期事实 |
| `docs/design/platform/capacity-balancing.md:9,70,80,94,152,195` | 「15 个 Deployment 都使用 suite-wide spread」「`application-vpa.yml` 是 15 个 Deployment 的完整清单」「15 个 VPA 均 Off」「13 个单副本」 | 14 Deployment、13 有 spread（qqbot 无 part-of/TSC/VPA/PDB）；`application-vpa.yml` 13 个 VPA；ecommerce ns 13 Off + config-center 2 InPlace；单副本 12 | 数字漂移 |
| `docs/design/platform/capacity-balancing.md:28,45,132` | 「relay 和 indexer 有独立 requests」；rollout 分组「2. relay/indexer」 | 09-03 退役 | 过期事实（未标 RETIRED） |
| `docs/design/platform/capacity-balancing.md:175` | 「- [ ] 节点宕机演练：drain/reboot node101/102/103」复选框空 | TODO.md:263-266「~~N+1~~ 已完成〔实测 2026-08-31〕」+ `docs/reports/2026-08-31-n-plus-1-drill.md`（交易面成立、搜索域不成立）；该文 12 个复选框被 `scripts/context-progress-baseline.txt` 冻结——正是 TECH:812 所说「第二套勾选视图必然漂移」。TECH:588「N+1 验证尚未完成」与 TODO 亦不一致 | 并行进度源 |
| `docs/design/platform/production-scale-goal.md:69` | 「集群内 CNPG **已 hibernate，仅是回切候选**」 | 集群 0 个 `*.cnpg.io` CRD；TODO.md:150「已清理…回滚路径不再存在」 | 过期事实 |
| `docs/design/platform/production-scale-goal.md:193`、`architecture.md:15` | 「Pangolin…**不叠加 WireGuard/IPsec 隧道**，家庭出口和临时跨公网隧道不得成为依赖」 | 实况：集群在家庭 LAN（192.168.3.x）无公网 IP，唯一入口是 newt 发起的 WireGuard 隧道；矩阵 :108「集群外依赖已成硬依赖：node3 或 Pangolin 隧道故障 = 数据面连不上库」 | 规范被现网违反（TECH L82 同源） |
| `docs/todo/数据一致性与事件驱动.md:197-200` | 「node3 CDC 链**属演示性质**，不构成『业务已采用 CDC』的证据」 | 同文 :28/:70/:76、矩阵 :74,109、search.md:3：该链是搜索投影的**生产搬运层**（09-03 切流） | 自相矛盾 |
| `docs/observability/alerting-notification.md:10-20` | 链路 B「Gatus…中间件无…custom provider 直接 POST ntfy」 | 第二套 `ecommerce-gatus`（本仓 `infrastructure/gatus/config.yaml:20-40`）用 `custom` **投 Alertmanager**（`GatusBlackboxEndpointDown`），TODO.md:151 实证链路 Gatus→Alertmanager→桥→ntfy；手册未载 | 过期事实 |
| `docs/observability/alerting-notification.md:63-64` | 「除 `ecommerce-security.yml` 外全部是 Pigsty 自带规则」 | node3 另有自写 `ecommerce-k8s.yml`、`ecommerce-observability-readiness.yml`、`ecommerce-ces-audit.yml`（08-31）、`ecommerce-cdc.yml`（09-06） | 过期事实 |
| `docs/observability/alerting-notification.md:253-255`；TECH:742 | 「链路 A 只有两条规则 `for` 缺省」 | 本仓 `infrastructure/observability/ecommerce-security-alerts.yml` 4 条中 **3 条无 `for:`**；`../kubernetes/components/vmalert/rules/ecommerce-security.yml` 09-03 已补——本仓副本落后 | 数字漂移 / 本仓工件违反自定规矩 |
| `docs/SECURITY-HARDENING.md:12,21,23` | 「Harbor \| node2 \| **全部镜像拉取**」「Harbor 被攻破等于往镜像投毒」 | 矩阵 0 处 harbor；集群全 ns 镜像 harbor 0、TCR 14、ghcr 17、quay 44；TECH:556「TCR 为主镜像仓库，Harbor 存 Helm」 | 依赖角色错述 |
| `docs/SECURITY-HARDENING.md:349-352,362` | 「PG 与 **Redis** 证书是从 Traefik 目录 cp 的副本，自动续期不会传导，不做钩子」 | `INFRASTRUCTURE-OPERATIONS.md:185,191-195`、`tls-enablement.md:86`、`helper.sh:73`：node1 Redis 在 `apikv-cert-renew.timer` 分发表内（PG 不在，一致）；`pangolin-tunnel.md:9-13` 横幅仍写「自动续期链路缺位」 | 文档间矛盾 |
| `context/team/host-watchdog.md:116` | 「本项目的证书恰恰是手工拷贝、不会自动续期的」（语境 node2 Harbor/MinIO） | `tls-enablement.md:86`、`INFRA-OPS:196-197`：node2 Silo/Harbor 是自动分发目标 | 以偏概全 |
| `TODO.md:102-104` §0 | 「最近一次部署到 dev〔08-29〕：control-tower 0.2.0、ecommerce 1.5.5、sha-0b9b9ad，15/15」 | 集群：10 服务 `sha-c364128@sha256`（09-03）、gateway/config `0.2.10`、14/14、qqbot 新增；同文 :202 已述 09-03 部署 | 过期 + 自相矛盾 |
| `TODO.md:115-116` 待办④ | 「pnpm 版本三处不一致（11.22.0/11.6.0/latest）」 | `f0d34f6`（09-05）已统一 `pnpm@12.3.4`（Dockerfile 读 packageManager、frontend.yml 用 package_json_file）；同文 :216 自述 | 已完成未销 |
| `TODO.md:142,144,154` §1 | 「15/15 Deployment（17 Pod）」「Pod 分布 ✅ 6/6/5」「6 种 tag 风格…helm 已回写 1.5.5」 | 14/14、16 Pod；分布已变且采样异常态（8/8/0）需健康态复测；实跑 4 种风格（无 `health-*`/`0.2.1`）；`helm/values.yaml` 全 **1.6.3**（同文 :100 自述）；:202 自称漂移已消除 | 过期 + 自相矛盾 |
| `TODO.md:204` §4 | 标题「2026-08-29 实测」 | 08-29 时 BFF 轨未启用（:224 自述 09-01 才启用）→ :209「BFF 会话 ✅」在该标签下不成立；未记 09-03 Consul 关闭/`direct://`、访客轨、网关 0.2.10 | 日期标注错误 |
| `TODO.md:242` §6 | 「Go 运行时指标 🔴 10 个电商服务全缺」 | 代码态已接（`28f0f24` 09-05：10 服务 `RuntimeMetrics: true`，kit `otelruntime.Start()`），集群镜像 09-03 构建早于该提交——应为「代码已接、待发布」 | 过期事实（代码态） |
| `TODO.md:61` P0 #11 | 「网关补 `redis-tls-ca` Secret」 | control-tower 清单/代码零引用；网关挂 `dragonfly-session`（含 ca.crt）BFF 已启用；分类文件手顺依赖已删的 `redis` ns | 僵尸 P0 |
| `TODO.md:63` P0 #13 | 「PII 脱敏形同虚设（Lua 不支持 `{n}`）」 | 针对已退役 fluent-bit；现役 vector `pii_redact` VRL 有手机/email 正则（分类文件的 `form_data`/`user_id`/bearer 遗漏未核） | P0 标题过期 |
| `docs/reports/2026-08-28-supply-chain-pr-validation.md:19,43` | 「仅在 `pull_request` 或手动触发时运行」「BASE_REF 用 PR base SHA」 | `supply-chain-pr.yml` 仅 tag 触发；BASE_REF 取上一个 semver tag（:69） | 过期事实 |
| `docs/reports/2026-08-28-tech-research.md` §4 ↔ TECH:42 | 「维持 franz-go 自写消费者」 | 报告写作时（08-28）go.mod 有 `twmb/franz-go v1.21.6`；`773c853` 09-01 随 ES 迁移移除。报告是快照无误；TECH 的「维持」为目标写成现状 | TECH 引用过期前提 |

### 3.3 低

| 文件:行 | 声称 | 实际 |
|---|---|---|
| `git-commit.md:277,241-244` | github「仅发布 tag」「dispatch 是唯一手动例外」 | `frontend.yml` `on: schedule` 每周一登录冒烟（`.gitlab-ci.yml:118` 自认） |
| `git-commit.md:105` | body「每行不超过 72 字符」 | `commitlint.config.mjs:203-204` 为 200，无 72 校验 |
| `git-commit.md:126` | pre-commit 三步 | `.vite-hooks/pre-commit` 第 1 步是 `verify-public-ips.py --staged`（09-05），未列 |
| `git-commit.md:22,176` | 「`b72eb7e7` 修正」「历史全部直接提交 main，不走分支」 | 哈希不可解析（实为 `5a84bd1`）；现有 `origin/chore/retire-meilisearch-20260904`（领先 1 未合）等分支、8 个 merge |
| `debezium-idle-slot-wal-retention.md:32` | 「第三个案例（另两个见文末）」 | 文末只链 1 个案例；真正第三例 `patroni-drops-unmanaged-logical-slot.md` 未链 |
| TECH:201 转述 | 「盯位点差、task 状态与 consumer lag（见 debezium-idle-slot…）」 | 该文只讲位点差；三信号定义在 pipeline rules 与 patroni 经验文 |
| `search.md:11` | 「`ecommerce_products_*` 六个镜像索引」 | 6 个中 3 个是 `ecommerce_orders_*` |
| `数据一致性与事件驱动.md:98,121` | 「当前事实表（2026-08-29）」；「override.policy 待确认」 | 表头是 09-03；仓库层面 Connect 未设 override policy（默认 None） |
| TECH:47 转述 production-scale-goal §5.7 | 「按用户/租户的限流归 control-tower」 | §5.7:194 无「按用户/租户」字样（外推） |
| STACK.md:578 转述 production-scale-goal | 「先完成 Kafka 学习沙箱」 | 该文无「学习沙箱」，:25 反对以学习为理由接线 |
| `accessibility.md:5,32,46` | 只列 consumer a11y 测试；「401 重定向待入 TODO」 | merchant/admin 亦有（`0e71883`）；TODO.md:221 08-31 已修 |
| `semantic-html.md:5` vs :17/:101 | 「两个应用均无结构化数据」 | 同文已写 consumer-next JSON-LD ✅ |
| `semantic-html.md:78-101`、TECH:803 | 四步「2026-09-01 完成」「同日」 | git：第二批 4 处 + merchant/admin 35 处 + JSON-LD = `b10d4d3`/`0e71883` **2026-09-03** |
| `alerting-notification.md:229,260-261,218-225,319-321` | node3「7.4 GB」；「建议加元规则 ALERTS firing 过久」；「必须配 absent()」；「Consul 注册数无告警」 | 7.25 GiB（矩阵）；`AlertFiringTooLong`/`K8sClusterMetricsMissing` 已实现；09-03 起不再注册 |
| `tetragon-follow-ups.md:42` | address BOLA「按用户决策保留（已接受风险）」 | TODO.md:55/189 全局 P0#5 必修 |
| `tech-research.md:152,156,163` | 「待拍板」 | 同文 :154「已采纳（08-28 拍板）」 |
| TECH:41 转述 tech-research §8 | 「单流程状态机迁移 >15 条边」 | 报告 :151 无此项 |
| `supply-chain-*.md:90-118` | tag 1.5.2/3/4 指向 `8b33eb4`/`8f4d223`/`7d9354b` | filter-repo 后现指 `4ee8b66`/`8c5e372`/`310f7c9`，旧哈希不可解析；`trivy.txt` 基线仍 40 条（文档说 34） |
| `mirrord-poc.md:14-16,40,47,56` | go1.26.5；「cart 无 netpol」；「去 Consul 四步①完成」 | go 1.27.0；CNP 已覆盖 cart（复测前提成立无记录）；09-03 Consul 整体关闭 |
| `nextjs-poc.md:20,24,225,277` | Next `16.3.3`；「2 副本落 node101/node103」 | workspace 钉 `16.4.0-canary.18`（09-05，镜像仍 16.3.3 构建）；分布需健康态复测 |
| `SECURITY-HARDENING.md:302,427,3,378,16,440-442` | 标题「仍未关闭」；引矩阵「测试期对 0.0.0.0/0 开放」；「node1（node1）」；kafka used_by 10 服务；「避免容器重建后规则失配」 | 同节已写 ✅ 关闭；该措辞已不存在；脱敏残留同义反复；矩阵 kafka `used_by: []`；`docker-port-guard.service` oneshot 无自动重跑 |
| `infrastructure/host-watchdog/README.md` | 只列 host-watchdog 四项 | 目录内 `docker-port-guard.{sh,service,env.example}` 零提及，`install.sh` 不装 |
| `TODO.md:99,111,68` | `ad1bb33`、`19a7a93`、`0b9b9ad`、`c364128` 等短 SHA | 两次 filter-repo 后均不可解析（现 `78f3dfe`/`e4e0a29`/`7527207`…） |
| `TODO.md:94,138,161` | 段标题日期「08-31 对齐」「08-30 实测」「09-04 复验」 | 段内含 09-02/09-03/09-04/09-06 事实 |
| `TODO.md:123,136,154` | 网关「0.2.1」「0.2.5」 | 集群 0.2.10；全文无当前版本 |
| `TODO.md:155,156,188,194,196,202,222,236,237,241` | 「15 个 VPA」「13 单副本」🟢图标；4,012 行/棘轮 2 条；「未部署」；merchant/admin「仅骨架」；node3 7 容器；「VM 2.24.0」；「OTel v1.45.0」 | 13/12；图例无 🟢；1,826 行/1 条；同段后文「已部署」；已接登录；10 容器；v1.149.0（:238 自述）；v1.46.0 |
| `TODO.md:25,78-86` | 分类计数 | `docs/todo/文档与协作机制.md` HEAD 17 条，**未提交改动已修**为 14 |
| `docs/todo/统一可观测性体系.md:42` | 「observability ns 残留 jaeger Service」 | TODO.md:129 已删；集群无该 ns |

### 3.4 已在未提交改动中修正（不再计入）

`debezium-idle-slot-wal-retention.md:150`（search-indexer 唯一写入者→CDC）；`production-scale-goal.md` 多处 NATS/relay/indexer/Meilisearch 现行表述→已退役；`backend/services/search/configs/config.yml.example:38-41`（indexer→Sink、`node3-es`→`es.apikv.com`）；`argocd-app.yml:19-20`（三工作负载→gateway 属外仓、relay/indexer 退役）；`docs/todo/文档与协作机制.md` 3 条勾选；`STACK.md` 事件/搜索段；`PRODUCT.md`/`README.md` 搜索切流；`docs/GLOSSARY.md` Inbox/Outbox/Relay 词条；`00004_outbox.sql` 注释。

---

## 4. docs/reports/*（TECH 链接的 18 份，按报告）

| 报告 | 主要漂移（严重度） |
|---|---|
| `2026-08-29-vpa-recommendation-only.md` | **高**：live `control-tower-gateway-vpa`（08-30 由 `../control-tower/deploy/dev/gateway/vpa.yml` 重建）`containerName: '*'` + min/maxAllowed + **无 `controlledValues`**，`kubectl diff -f application-vpa.yml` rc=1——报告「15/15 RequestsOnly、零差异」与 TECH L600 硬规则在 live 被违反，且同一对象两仓两份定义。**中**：15→13 VPA（qqbot 无 VPA）；L124/138/164/194/242 仍以 relay/indexer 为对象；7 天观测期 09-05 到期无记录，且窗口内含 08-29 内存雪崩、09-01 PG 停摆 6h、09-04 全量重建，覆盖条件未满足 |
| `2026-08-29-descheduler-decision.md` | **中**：「15/15 suite-wide spread」（qqbot 无 TSC）；「13 单副本」→12；重评条件「placement drift 反复出现」疑似已被 09-04 第二次全量重建触发，TECH/TODO 未记录（需健康态复测判定）；requests 合计 1500m/2240Mi→1420m/2080Mi |
| `2026-08-31-github-pages-with-gh.md` | **低**：记录的是 `../mcm` 仓（`pages.yml` + `site/astro.config.mjs` 逐字一致），报告与 TECH §7.4 均未标明对象仓库 |
| `2026-08-31-gitops-evolution-overview.md` | **中**：「selfHeal 会经 Consul 抢走网关流量」对 dev 已过期（09-03 起 `direct://`；`pre.yaml` 仍 `discovery://`，`helm/values.yaml` 仍 3 处 `CONSUL_ENABLED: "true"`）；`argocd-app.yml:6-10` 对照表 tag「1.4.0 / :dev / meili-dev-*」过期（values 实为 1.6.3，集群 `sha-c364128`…）；未提 OpenBao（ClusterSecretStore `openbao` 与 `vault` 均 Valid） |
| `2026-08-31-signoz-evaluation.md` | **中**：L29 正确描述集群内 collector + node agent，却在 L25 声明以 `.service-matrix.yaml` 为准（矩阵说「只剩 vector」）——引用源与自述矛盾 |
| `2026-09-02-ci-two-remotes-dsh-reference.md` | **中**：`89758a2`/`19a7a93`/`151c941`/stash 均失效（09-05 第二次 filter-repo）；「两边没有重叠逻辑」vs `context-gate.yml` 每 push/PR 跑 verify-context+gitleaks（`.gitlab-ci.yml:8` 说「GitHub 没有任何代码门禁」、:38/55 又说等价）；pnpm 三处不一致已由 `f0d34f6` 收口（TODO 待办④未销）。**低**：GitLab job 漏 gitleaks；DSH `.gitlab-ci.yml` 现 191 行/6 wheel（报告 130/4，报告当日已是 170/5）；「手抄 5 份」实为 4 |
| `2026-08-28-react-compiler-pilot.md` | **中**：`f0d34f6` 已升 Oxlint 1.79.0 并清零 3 项 `set-state-in-effect` 诊断——复评条件 3 前置已满足，无复评记录，TECH L33 仍按旧状态转述。**低**：named catalog 已不隔离（plugin-react 全 6.1.1）；`0ce0b8948cda`/`cb2977d` 失效；测试文件 3→5 |
| `2026-08-28-bugsink-integration-research.md` | 无漂移（三阶段均未开工，与 TECH/TODO 一致）；版本 2.5.x 无法核 |
| `2026-08-28-duckdb-evaluation.md` | **低**：v2.0「Cyanoptera」补注只在 TECH/todo，报告未同步；TECH「已排期」vs todo「不是排期/保持未排期」；L85「Meilisearch 迁移中」、L15/30「CDC 推后」前提已失效；「6.5G」vs 6.4GB |
| `2026-08-28-tetragon-follow-ups.md` | **低**：L42 address BOLA「已接受风险」vs TODO P0#5 必修；其余缺口（CI 跑 verify.sh、Gorse 端点、搜索凭据轮换、检测规则 1 条）确仍未完成 |
| `2026-08-28-tech-research.md` | **低**：:152/156/163「待拍板」vs :154「已采纳」；TECH:41 多出「>15 条边」；§4 franz-go 前提 09-01 失效 |
| `2026-08-28-supply-chain-evolution-overview.md` / `-pr-validation.md` | **高**：Trivy image「未开始/最大缺口」、Kyverno「没有安装」已过期（见 §3.1）。**中**：「PR 三件套」触发面。**低**：tag 指向哈希失效；trivy 基线 40 vs 34 |
| `2026-08-28-mirrord-poc.md` | **低**：go1.26.5→1.27.0；「cart 无 netpol」已变（复测无记录）；「去 Consul 四步」叙事过时；推广门禁仍未满足（cart depends_on 空）——TECH:34 一致 |
| `2026-08-28-nextjs-poc.md` | **低**：Next 16.3.3→16.4.0-canary.18（镜像仍 16.3.3）；副本分布需复测；其余（1 页/ISR 60/匿名 transport/HTTPRoute 前缀在 `apps/consumer-next/deploy/dev.yaml:147-176`）属实 |
| `2026-09-06-node3-reboot-drill.md`、`2026-08-31-n-plus-1-drill.md`、`2026-09-03-consul-register-once-recurrence.md` | 未发现漂移（最新，TODO 引用一致） |

---

## 5. 同级仓

### 5.1 高

| 仓/文件 | 声称 | 冲突 |
|---|---|---|
| `../kubernetes/HOSTING-READINESS-2026-09-03.md` 顶部「最终修订（2026-09-04）」 | 「node3 重装后作为第三个节点加入（机房 node3/node4/node5），**PostgreSQL 回集群内 CNPG**；`ADDON_CNPG=true`、`ADDON_OPENFGA=true`」 | TECH §7.1「PostgreSQL (Pigsty) 外部物理机/VM」「计算集群与数据集群物理解耦」；矩阵 :69「CNPG 不是当前主库」；STACK（未提交）「CNPG 已清理」。ecommerce 仓零处提及机房/node4/node5/CNPG 回集群。09-06 node3 仍是 Pigsty（重启演练 Patroni active）——计划未执行，但两仓方向相反 |
| `../kubernetes/PIGSTY-HARVEST-2026-09-03.md` + `e87ef776` | 「node3 将重装并加入三节点 k8s，PostgreSQL 改用 CNPG」；vmalert/Alertmanager/ntfy 桥/blackbox/gatus/healthchecks/bugsink 7 组件已入库准备进集群 | TECH §9.3「告警栈整体位于 node3…集群侧没有任何告警组件」、§11.3 Bugsink 在 node3；`alerting-notification.md` 对该计划只字未提 |

### 5.2 中

| 仓/文件 | 声称 | 实际 |
|---|---|---|
| `../kubernetes/README.md:53-90` 组件表 | victoriametrics/loki/jaeger/grafana/victoria-logs/victoria-traces/vmalert/alertmanager/alert-bridge/gatus/bugsink 为集群内组件（`*.dev.test`）；`postgres`=CNPG 算子；`kafka`=Strimzi；`nats`=「NATS JetStream 事件底座（ecommerce 选型定稿 §1）」 | 集群无这些 ns（观测栈在 node3 `node3-*.apikv.com`）；CNPG/Strimzi/NATS 均已退役；`nats` 行引用的定稿已被推翻 |
| `../kubernetes/README.md:77`、`components/openfga/{install.sh:3,12,values.yaml:4}` | OpenFGA「store=CNPG pg-main 独立库」 | 集群 Secret `openfga-datastore` 实指 `postgresql://openfga:***@<node1-public-ip>:30001/openfga?sslmode=require`（node1 公网 IP→node3 Pigsty）；pg-main 不存在；按脚本重建会失败 |
| `../control-tower/deploy/dev/gateway/vpa.yml`、`deploy/{dev,pre}/config/vpa.yml` | gateway VPA `containerName: '*'` + min/max、无 `controlledValues`；config VPA `InPlace` | 与本仓 `application-vpa.yml` + `structcheck/vpa_test.go` 双真相源（见 §1.1 L600） |
| `../control-tower/routes/pre.yaml` | 11 条 `discovery:///` | dev 已全 `direct://`、业务 `CONSUL_ENABLED=false`；pre 若照此部署将 504（矩阵 :71「target 全部改为 direct://」以偏概全） |
| `../control-tower` 工作树 | 14 个未提交改动（`deploy/dev/gateway/deployment.yaml` 0.2.5→0.2.10、`JWT_AUDIENCES` 变更、machine-token 设计等） | 集群已跑 0.2.10；已提交版本仍写 0.2.5 |
| `../postgres-kafka-es-streaming-pipeline` 工作树 | 28 个未提交改动（connector json/yml、告警、reindex、alias 脚本、`lsn.flush.mode` 键） | `lsn.flush.mode=connector_and_driver`（idle-slot 经验文的修复）**只在未提交 diff**；09-03/09-06 按 RUNBOOK `configure.sh put_connector` 整份覆盖时若用 HEAD 版会丢失该修复——线上值无法本机核 |

### 5.3 低

| 仓/文件 | 声称 | 实际 |
|---|---|---|
| `../kubernetes/TODO.md:21` | 「Kafka 全家桶定稿退役，NATS JetStream 替代」「定稿迁 SeaweedFS」 | 均被 TECH 推翻，无过期横幅 |
| `../kubernetes/components/` | 仍含 meilisearch/nats/kafka/clickhouse/jaeger/loki/grafana/tempo/fluent-bit/victoria*/vmalert/alertmanager/bugsink/minio/postgres/redis/seata/kruise 目录 | 多数已退役/外置（README 部分行有标注：meilisearch「已退役」、redis「scale 0」、kruise「已卸载」） |
| `../go-connect-kit` | v0.3.0，README 与本仓/控制塔依赖一致 | 无漂移；但 TECH 表 A / §10.2 / §13 未提及该库（`ServiceRegistry`/`GetServiceAddr` 抽象不存在，实际是 kit/registry + kit/config） |
| `../deepseek-harness/.gitlab-ci.yml` | CI 报告称 130 行/4 wheel | 现 191 行/6 wheel（报告当日已 170/5） |
| `../mcm` | Pages 报告对象仓 | 报告未标明 |
| `../pigsty-deploy/pigsty-node3-deployment.md:163-165` | 「单节点限制：etcd 单成员、PostgreSQL 单实例、Kafka 单 Broker RF=1」 | 与 TECH §7.1「Patroni HA / Kafka 集群」相反（TECH 侧漂移，已计 §1.2） |

---

## 6. 集群 vs 仓库（live 漂移）

| 项 | 实况（实测 2026-09-06） | 仓库 | 严重度 |
|---|---|---|---|
| CNP `ecommerce/ecommerce-api-default-deny` search 段 | generation 8（08-28 建）：description「**Meilisearch** projection query path」，egress 仍指向已删除的 `search/meilisearch:7700`，**无 `es.apikv.com` 规则**；search 能到 ES 只因 `es.apikv.com` 与已放行的 `node3-otlp.apikv.com` 同解析到 <node1-public-ip>（toFQDNs 按 IP 放行） | `helm/files/zero-trust.yaml:245,286` 已改为 Elasticsearch/`es.apikv.com`（未提交、未 apply） | 高 |
| CNP gateway 段 egress | `toServices` 含 `observability/jaeger`（不存在的 Service） | — | 低 |
| `control-tower-gateway-vpa` | `containerName: '*'`、min/max、无 controlledValues | 本仓 `application-vpa.yml` 定义不同（见 §1.1） | 高 |
| VPA `config-center-vpa`/`config-center-web-vpa` | `InPlace` | TECH §7.3 硬规则 Off | 中 |
| `qqbot` Deployment（ecommerce ns） | 无 part-of/TSC/VPA/PDB、default SA、不在 CNP 覆盖内（独立仓 `../qqbot`） | TECH §7.2「所有业务 Pod」、capacity-balancing「15 个都…」 | 中 |
| `frontend/apps/consumer/deploy/deployment.yaml:42` | 集群实跑 `ccr.ccs.tencentyun.com/sumery/ecommerce-frontend:sha-bf8dae2` | 清单仍 `harbor.apikv.com/ecommerce/frontend:dev` | 中 |
| Pod 分布 | 8/8/0（node103 零业务 Pod，全部 09-04T20:51Z 重建；node103 残留 17 个 cilium-operator `ContainerStatusUnknown`；11:43 起 node101 API `host is down`） | TECH/TODO/capacity-balancing 的 5/6/6、6/6/5 | 异常态，只提示需健康态复测；同时是 Descheduler 重评条件的第二次信号 |

---

## 7. 外链

| URL | 结果 |
|---|---|
| `https://docs.sigstore.dev/cosign/overview/`（TECH:959） | 301 → `/signing/quickstart` → **404**（确认失效；`/cosign/` 200） |
| `https://keda.sh/docs/2.16/scalers/apache-kafka/`（:881） | 200 但「not the latest」；集群 KEDA 2.20.2 |
| `https://woodruffw.github.io/zizmor/`（:963） | 200，canonical → `docs.zizmor.sh` |
| `infoq.com/articles/state-machine-testing/`（:1016）、`sre.google/...`（:931）、`research.google/pubs/pub48190/`（:911） | 405 WAF / 本机网络屏蔽 Google，未能核实 |
| 其余 85 个 | 200 |

---

## 8. 复核结果（2026-09-06 11:50–12:17 CST：集群自愈后健康态 + SSH node1/node2/node3 只读）

> 集群：3 节点 Ready，ecommerce 14/14 Deployment Ready；node1/2/3 分别经 SSH 别名只读核对（未改任何主机文件）。原 §8「未能核实」逐项落定如下；能定的都进了正文对应条目的严重度。

### 8.1 集群健康态复测

| 项 | 结果〔实测 2026-09-06 12:17〕 | 对文档的影响 |
|---|---|---|
| Pod 分布 | **8/0/8**（node101 8 / node102 0 / node103 8），14/14 Ready，node102 未 cordon、无 taint，稳定 30 min 不变 | TECH:604 / TODO:144 / capacity-balancing:17 的 5/6/6、6/6/5 全部过期；这是 08-30 回平后**第三次** placement drift（14/2/1 → 6/6/5 → 8/8/0 → 8/0/8），descheduler-decision 报告的重评条件「placement drift 反复出现」**已触发**；TECH §7.3「原节点恢复不会让 Pod 自动搬回」被再次印证 |
| Tetragon | DaemonSet 3/3、operator 1/1（chart 1.7.1） | TECH:37 ✓ 无漂移 |
| consumer-next / 网关 | 各 2 副本落 node101 + node103，HTTPRoute `consumer-next-public` Accepted=True | nextjs-poc:277「node101/node103」现巧合成立 |
| cilium-operator 残留 | node103 上 17 个 `ContainerStatusUnknown` 已清，仅 1 个（restart 1） | 异常态已恢复 |
| VPA | 仍 13 `Off` + 2 `InPlace`；recommender `--pod-recommendation-min-cpu-millicores=10 --pod-recommendation-min-memory-mb=32` | TECH:600 漂移维持；TODO:155「地板 10m/32Mi」✓ |
| OpenFGA | 2/2 Running（v1.18.3；上游 v1.19.0） | 零接线维持 |
| consumer-next RSS | `kubectl top` 113Mi/副本 | nextjs-poc「43–45Mi」过期（低） |

### 8.2 node3（Pigsty）

| 项 | 结果 | 对文档的影响 |
|---|---|---|
| Bugsink 版本 | `bugsink/bugsink` 容器内 2.5.0（上游最新 2.5.1） | TECH:46「2.5.x」✓、TODO:226「2.5.0」✓ |
| node3 内存 | `free -g` total 7 GiB（=7.25 GiB） | TECH:48/矩阵 ✓；alerting-notification:229「7.4 GB」单位口径不同 |
| Gatus（Pigsty `/data/gatus/config.yaml`）provider | `alerting: ntfy:`（**内置 provider**），全部端点 `type: ntfy`，`custom`=0 | **alerting-notification.md §3.3「现行 custom provider 中文化」确认为高漂移**；TECH:744、OBSERVABILITY.md:112 同 |
| Gatus topic | `topic: ${NTFY_TOPIC}` 占位；容器内 `NTFY_TOPIC` 是一段 120 字符、含空格/冒号/引号/`$` 的多行文本，与桥 `/etc/infra-alerts/ntfy.env` 的 45 字符 topic **不相等也不包含**（值未打印） | TECH:736「三条链路共用同一个 topic」**不成立**；且 Gatus 容器该变量疑似被误灌入 YAML 片段（现网配置错误，建议人工看 `docker inspect gatus` 的 Env） |
| 第二套 `ecommerce-gatus` | `custom` → `http://127.0.0.1:9059/api/v2/alerts`（Alertmanager）；API 返回 8 个端点（core-public 5 + auxiliary-public 3），7 UP / 1 DOWN（`auxiliary-public/cat-on-demand`） | 手册未载该实例（中）；TODO:147/235「4 探针 6/6 全绿」过期 |
| Alertmanager | route 唯一 receiver `local-audit` → `http://127.0.0.1:9099/alerts`（桥）；wechat/slack 全注释 | 「单 receiver」✓；「企业微信第二通道」**未配置** |
| vmalert 现火 | `PostgresReplicationLag` **firing 自 01:41（node3 重启演练起）持续 10.5 h**；`AlertFiringTooLong` ×4 firing；`NodeMemSwapped` ×2；`LyraPassContainerMemoryHigh`（09-05 起）；`EcommerceNetworkPolicyDeniedBurst`（12:05 集群重启起）；`K8sContainerNotReady`/`K8sPodRestartStorm` pending | `PostgresReplicationLag` **确为慢性 firing**（TODO:237 ✓，reboot-drill:62「正常触发并恢复」不完整）；TECH:742「慢性 firing 掩盖急性」正在发生（4 条 AlertFiringTooLong） |
| `/infra/rules/` | `ecommerce-k8s.yml`（08-31 14:21）、`ecommerce-cdc.yml`（09-06 01:33）、`ecommerce-security.yml`（08-28）、`ecommerce-ces-audit.yml`、`ecommerce-observability-readiness.yml`、`lyrapass.rules.yml` | **alerting-notification.md §8「K8s 规则尚未编写」确认为高漂移**；§63「除 security 外全是 Pigsty 自带」过期 |
| Connect source connector live config | keys：`slot.name=ecommerce_cdc`、`publication.name=ecommerce_cdc`、`publication.autocreate.mode=disabled`、`slot.drop.on.stop=false`、`snapshot.mode=initial`、7 张表；**无 `lsn.flush.mode`、无 heartbeat** | `debezium-idle-slot-wal-retention.md:70-76`「08-29 经 REST PUT 设 `lsn.flush.mode=connector_and_driver` 已生效」→ **线上已丢失**（被后续 `configure.sh put_connector` 整份覆盖；该键只在 pipeline 仓未提交 diff）——中 |
| Connect worker `connector.client.config.override.policy` | 容器 env 与 properties 均未设（默认 None） | `docs/todo/数据一致性与事件驱动.md:121`「待确认」→ **未开** |
| connectors | source / sink 均 RUNNING，task RUNNING | ✓ |
| PostgreSQL 连接路径 | 5432、6432（pgbouncer）、9092 均在监听；`ss` 已建立连接：**53 条落 5432**（源 10.10.21.163 = newt 隧道）+ 3 条 docker，**6432 零连接** | TECH:551「PgBouncer 连接池治理」**未生效**（pgbouncer 在跑但业务绕过）——中 |
| VM / vmalert | v1.149.0 | TODO:237「VM 2.24.0」错（:238 对） |

### 8.3 node1（Pangolin VPS）

| 项 | 结果 | 对文档的影响 |
|---|---|---|
| Traefik | `traefik:v3.7.12`（Pangolin 1.22.2、gerbil 1.5.0） | TECH:47「v3.7」✓ |
| fail2ban | 1.0.2；仅 `sshd` jail：failed 15 / banned 总 3 / 当前 0 | SECURITY-HARDENING 一致 |
| sshd / OS | port 34123，`passwordauthentication no`，ufw inactive，Ubuntu 24.04.4 | ✓ |
| `docker-port-guard` | active + enabled；DOCKER-USER 链 DROP 计数 28681 pkts（→172.22.0.2:6379）/ 32755 pkts（→172.19.0.2:5432），持续增长 | 矩阵 :78-79「收窄已落地」✓；TECH:47/999「仍对 0.0.0.0/0 开放」**确认过期** |
| 证书续期 | `apikv-cert-renew.timer` 每日 03:30/04:02 跑，acme.sh ARI 下次续期 2026-11-11；`apikv-cert-distribute` 脚本：拷 Redis 证书并 `docker restart redis`、restart traefik、`send_node2`（blog/Silo/Harbor）；**不碰** `/home/docker/postgres/tls` | `SECURITY-HARDENING.md:349-352`「PG 与 **Redis** 都不会自动传导」→ **Redis 一半错**（PG 一半对）；`pangolin-tunnel.md:9-13`「自动续期链路缺位」**过期** |
| 证书文件 | node1 redis.crt / postgres server.crt / acme fullchain 指纹一致 `2F:D1:52…`，到期 2026-11-25 | 五处文档 ✓。附带：`/home/docker/postgres/certs/tls.crt` 是 **2026-07-21 已过期**的旧文件（未被 09-01 的 `tls/server.crt` 路径使用，属残留） |
| 公网外链 | 从 VPS 访问 sre.google / research.google 同样 000（境内 VPS） | 改用云端抓取核实（见 8.5） |

### 8.4 node2（Harbor / Silo / gorse）

| 项 | 结果 | 对文档的影响 |
|---|---|---|
| 容器 | `pgsty/silo:RELEASE.2026-08-06T00-00-00Z`、Harbor v2.15.2 全套、gorse | 矩阵 :75 ✓ |
| fail2ban | 1.1.0；`harbor-auth` + `sshd` 两 jail（sshd banned 3；harbor-auth failed 17 / banned 1） | SECURITY-HARDENING ✓ |
| sshd / OS | 34124、`passwordauthentication no`、Ubuntu 26.04、ufw inactive | ✓ |
| 证书分发 | `/home/docker/minio/certs/public.crt`、`/home/docker/harbor/ssl/nginx.crt`、Harbor 实挂 `data/secret/cert/server.crt` 均 2026-08-27 22:12、指纹 `2F:D1:52…`、到期 11-25 | `tls-enablement.md:86` ✓；`host-watchdog.md:116`「node2 证书手工拷贝不自动续期」**确认以偏概全**。附带：`/home/docker/harbor/apikv.com/nginx.crt`（09-15 到期）为旧路径残留，Harbor 未挂载 |
| Harbor 镜像拉取 | `registry` 与 `harbor-core` 7 天日志 manifest GET = **0** | `SECURITY-HARDENING.md:21`「Harbor 全部镜像拉取」**确认错述** |
| Silo bucket `ecommerce`（唯一桶） | `.minio.sys/buckets/ecommerce/.metadata.bin/xl.meta` 中 **无任何 XML**（0 个 `<`），`VersioningConfigXML`/`LifecycleConfigXML` 字段为空；匿名 `?versioning` 403 | TECH:555「Silo 开启 Versioning 与 Lifecycle」**未生效**（目标写成现状，中） |

### 8.5 外部事实

| 项 | 结果 | 对文档的影响 |
|---|---|---|
| 上游版本（GitHub releases，2026-09-06） | Chaos Mesh v2.8.4 ✓、OpenCost v1.121.1 ✓、Pyroscope v2.3.0 ✓、csi-driver-spiffe v0.15.0 ✓、DuckDB v1.5.5 ✓、Cilium v1.20.1 ✓、KEDA v2.20.2（集群同）、**Temporal v1.31.2**（TECH:41 v1.31.0）、**OpenFGA v1.19.0**（集群 v1.18.3）、**Bugsink 2.5.1**（node3 2.5.0） | TECH:41 Temporal 落后两个 patch（低）；其余一致 |
| DuckDB 2.0「Cyanoptera」 | duckdb.org 08-17 预览、09-02 切 `v2.0-cyanoptera` alpha 分支，正式版「10 月下半」 | TECH:43「正式版计划 2026 秋」✓（可精确为 10 月下半）；评估报告未同步（低，已计） |
| Renovate | GitHub 无 renovate 作者 PR、无 `renovate.json` | TECH:24/964 **确认未接入** |
| `sre.google/sre-book/service-level-objectives/`、`research.google/pubs/pub48190/` | 云端抓取 200，内容正确 | 外链有效 |
| `infoq.com/articles/state-machine-testing/` | 直连 405（WAF）；云端抓取 CRAWL_NOT_FOUND；搜索引擎无该 URL 索引 | **疑似不存在**（TECH:1016，低） |

### 8.6 仍无法核实（需凭据或特定会话）

- Config Center `gateway/policies/policies.csv` 的 RBAC 粒度（TODO:211）——在 Config Center DB，无凭据不读。
- mirrord agent 特权 Pod 位置（mirrord-poc:24）——需实时 mirrord 会话。
- TODO:143 两节点稳态内存 67%/38%——瞬时值，无比较意义。

### 8.7 用户提供的 Config Center 线上值（2026-09-06 13:25）

| 键 | 结果 | 对文档的影响 |
|---|---|---|
| `gateway/dev/routes.yaml`（存档 `live-gateway-dev-routes.yaml`） | 含 `guest:` 4 条 cart RPC；`anonymous` 10 条；A/B 互斥；11 条 target 全 `direct://`；`online_check_procedures: []`；与 `../control-tower/routes/dev.yaml`（v0.1.4）仅 `guest:` 块位置不同（语义一致）；与 `.service-matrix.yaml` `anonymous_paths`/`guest_paths` 逐条相同 | `anonymous-shopping.md:105`「线上键是否含 guest 未核」→ 已核成立；`TODO.md:223` ⑤「routes 推 Config Center」→ 已完成 |
| `gateway/policies/policies.csv` | **未提供**，TODO.md:211「RBAC 已按 RPC 粒度」仍未核 | 待用户贴出 `policies.csv` + `model.conf` |

### 8.8 清单修订

- 删除两条不值得复核的项：`mirrord-poc.md:24` agent Pod 位置（核它需起 mirrord 会话往集群建特权 Pod，非只读；结论只影响一句 PSA 备注）；`TODO.md:143` 内存 67%/38%（带日期的瞬时值，复核无意义）。
