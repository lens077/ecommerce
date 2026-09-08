# 主代理自查发现（2026-09-06）

## docs/TECH.md 正文（自查，子代理另有补充）

| 行 | 声称 | 实际 | 类型 | 严重度 |
|---|---|---|---|---|
| 671–673 | §8.4「购物车五个 RPC，当前缺失」「设计草案，未落地——匿名加购路径仍不存在」 | control-tower 访客轨已实现（`services/gateway/internal/guest/`、`identity.go` `x-md-global-anonymous`，提交 fdf0e82→dae4d86，集群镜像 0.2.10）；`.service-matrix.yaml:157–161` 与 `../control-tower/routes/dev.yaml:79–` 各 **4** 条 guest；`docs/design/platform/anonymous-shopping.md`（未提交）状态行已改「步骤 1–3 完成」；`context/project/ecommerce/cart/experience/guest-add-to-cart-blocked-by-shop-name.md`（untracked）记录端到端已跑、`AddProductToCart` 500 于 `cart_item.shop_name NOT NULL`；`MergeGuestCart` 两仓零命中 | 过期事实 + 数字漂移（五→四） | 高 |
| 181, 205, 23 | 「Outbox 表 (Protobuf Payload + Trace Header)」「使用 Protobuf 定义事件…envelope 包含 event_id、aggregate_id、tenant_id、trace_id、schema_version、occurred_at」 | `products.outbox`（`00004_outbox.sql`）列为 CloudEvents 对齐：event_id/source/type/subject/partition_key/payload **JSONB**/occurred_at；无 aggregate_id/tenant_id/trace_id/schema_version/traceparent 列；`pkg/outbox.Message.Payload []byte // CloudEvents data（JSON）` | 目标写成现状 / 与代码契约相反 | 中 |
| 201 | 「outbox 表不维护 published_at / attempts 簿记」 | 表仍有 `published_at`、`attempts`、`last_error` 三列及两个簿记索引（迁移注释标「遗留，待后续 goose 迁移删除」） | 措辞与结构不符（低） | 低 |
| 722–728 | §9.2「traceparent 列映射为 Kafka Header」 | outbox 表无 `traceparent` 列；pipeline 仓零 Outbox Router/EventRouter 配置 | 目标写成现状 | 中 |
| 585–588 | 「其余 13 个单副本 Deployment」 | ecommerce ns 单副本 Deployment 现为 12（10 服务 + ecommerce-frontend + qqbot；relay/indexer 已退役，qqbot 09-02 新增）；加 config-center ns 2 个则 14 | 数字漂移 | 低 |
| 604 | 「三节点、17 个 Pod 的规模」「健康态分布 5/6/6 / 6/6/5」 | ecommerce ns 现 16 Pod（14 Deployment）；采样时分布 8/8/0（异常态，仅提示需健康态复测） | 数字漂移 | 低 |
| 684–703 | §9.1 采集层「VMAgent (DaemonSet) 指标」「外置 OTel Collector」 | 集群无 vmagent；`opentelemetry` ns 有 `otel-opentelemetry-collector` Deployment + `otel-node-opentelemetry-collector-agent` DaemonSet（contrib 0.158.0）；§9.3 自己说「K8s 指标由集群内 OTel Collector 的 k8s_cluster receiver 产出」——§9.1 与 §9.3 互相矛盾 | 自相矛盾 / 过期事实 | 中 |
| 552, 543 | Dragonfly「严禁混用实例：Session/Cache/限流分实例」写作部署策略 | 集群仅 `dragonfly/dragonfly` 单 Deployment；P0 路线图（819）自己列「Dragonfly 分实例拆分」为待办 | 目标写成现状（未标注） | 低 |
| 560, 579 | 「所有 Namespace 默认开启 default-deny」 | 全集群仅 1 条 CNP `ecommerce/ecommerce-api-default-deny`，CCNP 0；矩阵 known_gaps 承认「没有完整的默认拒绝」 | 目标写成现状 | 中 |
| 600 | 「业务 VPA 必须使用 updateMode: Off …未经证据不启用 InPlaceOrRecreate」 | 集群 15 个 VPA 中 config-center ns 的 2 个为 `InPlace`（config-center-vpa、config-center-web-vpa）；STACK.md「15 个 ecommerce VPA 全部 Off/RequestsOnly」亦不符 | 过期事实 | 中 |
| 762–770 | §10.2「`ServiceRegistry` 接口 / `cfg.GetServiceAddr("inventory-service")`」 | ecommerce 与 go-connect-kit 代码零命中 `GetServiceAddr`/`ServiceRegistry`；实际是 go-connect-kit/registry（Consul，已 `CONSUL_ENABLED=false`）+ 网关 `direct://` | 目标写成现状（示例代码不存在） | 低 |
| 758 | 「生产（K8s）：Kubernetes Service + CoreDNS」 | 2026-09-03 已实际切到网关 `direct://ecommerce-<svc>-service.ecommerce.svc:<port>`（即 K8s Service DNS），与定稿一致；但 Consul StatefulSet 仍在跑、注册代码保留——TECH 未提 Consul 迁移期状态（STACK/矩阵有） | 低（信息缺失） | 低 |
| 90, 109, 621–628 | 「control-tower 网关 ← Session 校验 / OpenFGA 鉴权」 | control-tower 网关鉴权为 Casbin（`services/gateway/internal/authz/authz.go`，go.mod casbin/v2），零 OpenFGA 引用；OpenFGA 在集群 `openfga` ns 2/2 运行（v1.18.3）但**零接线**；矿阵 externals 无 openfga | 目标写成现状 | 高 |
| 5.5 / 387 | Order「通过 Outbox 发布 OrderCreated、OrderPaid…」 | order 现用进程内 GoEventBus（`internal/eventbus/eventbus.go`），仅 `OrderCompleted` 一个事件、双写；`backend/services/order/eventbus.md` 横幅承认「过渡态」 | 目标写成现状（TECH 未标注） | 中 |

## .service-matrix.yaml（TECH 多处引用为真相源）

| 行 | 声称 | 实际 | 类型 | 严重度 |
|---|---|---|---|---|
| 69, 100 | 「集群内 CloudNativePG pg-main 处于 hibernate，不是当前主库」「集群内 CNPG 已 hibernate（数据保留，pod 归零）」 | 集群已无 `postgresql`/`cnpg-system` namespace（STACK.md 未提交改动：「namespace 与 CNPG CRD 已清理」） | 过期事实 | 中 |
| 103–107 | 「集群内可观测已整体删除…只剩 vector DaemonSet 送容器日志」 | `opentelemetry` ns 存在 collector Deployment + node agent DaemonSet（TECH §9.3 依赖其 k8s_cluster receiver） | 过期事实 | 中 |
| 273–278 | `frontend.apps` 仅 consumer/merchant/admin/desktop | `frontend/apps/consumer-next` 存在且集群 2/2 运行；structcheck 不校验该段 | 遗漏 | 中 |
| externals | 无 openfga / bugsink / gatus / openbao 条目 | OpenFGA 集群 2/2；Bugsink/Gatus 在 node3（TECH §9.3/§11.3 当现役） | 遗漏 | 低 |
| 125 | gateway.external 含 consul（「Config/发现」） | 网关路由已全 `direct://`，Consul 目录为空是预期 | 低 | 低 |

## 同级仓

| 仓/文件 | 声称 | 实际 | 类型 | 严重度 |
|---|---|---|---|---|
| `../kubernetes/README.md:77`、`components/openfga/install.sh:3,12`、`values.yaml:4` | OpenFGA「store=CNPG pg-main 独立库」 | CNPG 已删除；集群 Secret `openfga-datastore` 现指 `postgresql://openfga:***@<node1-public-ip>:30001/openfga?sslmode=require`（node1 公网 IP → node3 Pigsty）；组件脚本仍声明/依赖 `postgresql/pg-main` | 过期事实（重建脚本会失败） | 中 |
| `../kubernetes/TODO.md:21` | 「Kafka 全家桶定稿退役，NATS JetStream 替代」「定稿迁 SeaweedFS」 | 已被 TECH 推翻（Kafka 定稿、NATS 退役、Silo 定稿、SeaweedFS 撤销）——历史记录未加过期横幅 | 过期决策 | 低 |
| `../kubernetes/components/` 仍含 `meilisearch nats kafka clickhouse jaeger loki grafana tempo fluent-bit victoria* vmalert alertmanager bugsink minio postgres redis seata kruise` | 集群与 TECH 现状：这些多数已退役/外置到 node3 | 组件目录与现网不同步（README 是否标注需另核） | 低 |
| `../control-tower` 工作树 | `deploy/dev/gateway/deployment.yaml` 0.2.5→0.2.10、`JWT_AUDIENCES` 变更等 14 个文件未提交 | 集群已跑 0.2.10；仓库已提交版本仍写 0.2.5 | 未提交漂移 | 低 |
| `../postgres-kafka-es-streaming-pipeline` 工作树 | 28 个文件未提交（connector 配置、告警、reindex、alias 脚本） | 矩阵/TECH 引用的「12 条告警 + exporter」「永久槽」等已在最新提交，但 connector json/yml 的未提交改动与 node3 实跑配置是否一致未核 | 未提交漂移 | 低 |
| `../control-tower` `go.mod` | 依赖 casbin/v2 | TECH §8 定稿 OpenFGA；control-tower 无迁移代码 | 目标 vs 现状 | （已计入上表） |

## 同级仓 ../kubernetes 的方向性冲突（高）

| 文件 | 声称 | 与 TECH/本仓冲突点 | 严重度 |
|---|---|---|---|
| `HOSTING-READINESS-2026-09-03.md` 顶部「最终修订（2026-09-04）」 | 「node3 重装后作为第三个节点加入（机房三节点 node3/node4/node5），**PostgreSQL 回集群内 CNPG**；`ADDON_CNPG=true`、`ADDON_OPENFGA=true`」 | TECH §7.1「PostgreSQL (Pigsty) 外部物理机/VM 部署」「计算集群与数据集群物理/集群级解耦」；`.service-matrix.yaml:69`「CNPG 不是当前主库」；STACK（未提交）「CNPG namespace 与 CRD 已清理」。ecommerce 仓零处提及「机房/node4/node5/CNPG 回集群」。截至 2026-09-06 node3 仍是 Pigsty（重启演练 Patroni active），计划未执行但两仓方向相反 | 高 |
| `PIGSTY-HARVEST-2026-09-03.md` | 「背景：node3 将重装并加入三节点 k8s，PostgreSQL 改用 CNPG」「vmalert+Alertmanager+ntfy 桥/blackbox/gatus/healthchecks/bugsink 在重装后会消失…可作为新组件容器化」 | TECH §9.3「告警栈整体位于 node3…集群侧没有任何告警组件」；§11.3 Bugsink 在 node3——kubernetes 仓已把这 7 个组件入库准备进集群（`e87ef776`） | 高 |
| `README.md` 组件表 :53–90 | victoriametrics/loki/jaeger/grafana/victoria-logs/victoria-traces/vmalert/alertmanager/alert-bridge/gatus/bugsink 列为集群内组件（`*.dev.test` 域名）；`postgres` = CNPG 算子；`kafka` = Strimzi 算子；`nats` =「NATS JetStream 事件底座（ecommerce 选型定稿 §1）」 | 集群现无这些 namespace（观测栈在 node3，`node3-*.apikv.com`）；CNPG/Strimzi/NATS 均已退役（TECH 定稿 Kafka 外置、NATS 退役 09-03）；`nats` 行引用的「选型定稿 §1」已被推翻 | 中 |
| `README.md:77`、`components/openfga/install.sh:3,12`、`values.yaml:4` | OpenFGA「store=CNPG pg-main 独立库」 | 集群 Secret `openfga-datastore` 实指 `<node1-public-ip>:30001`（node1→node3 Pigsty）；pg-main 不存在 | 中 |
| `TODO.md:21` | 「Kafka 全家桶定稿退役，NATS JetStream 替代」「定稿迁 SeaweedFS」 | 均已被 TECH 推翻（Kafka 定稿、NATS 退役、Silo 定稿），无过期横幅 | 低 |

## 集群实测异常（不写进文档，只提示）

- 2026-09-06 03:00 CST：ecommerce Pod 全部在 node101/102（8/8/0），全部于 2026-09-04T20:51Z 重建；node103 残留 17 个 cilium-operator `ContainerStatusUnknown`；node103 的 cilium/kured/vector/tetragon/otel-agent 约 112 min 前重启。这正是 TECH §7.3「原节点恢复不会让 Pod 自动搬回，需告警发现持续 skew 再受控 rollout」描述的情形；分布类数字须在健康态复测后再更新。
- `kured` DaemonSet 在跑（`../kubernetes/components/kured` 「维护窗口内自动重启」）：TECH §7.3 讨论节点重启与重平衡时未提 kured 这个会主动重启节点的组件。
