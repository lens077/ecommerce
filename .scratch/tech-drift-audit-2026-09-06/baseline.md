# 审计事实基线（2026-09-06 03:00 CST 采集，供各核对组共用）

> 只读参考。子代理不得修改任何仓库文件；只产出发现清单。

## 仓库与真相源

- 工作区：`/Users/sumery/lens077/ecommerce`。**工作树有 53 个未提交改动 + 若干 untracked**（含 `docs/TECH.md`、`STACK.md`、`README.md`、`PRODUCT.md`、`argocd-app.yml`、多份 `docs/design/*`、`context/*`）。核对时以**工作树**为当前状态；若某处漂移只在未提交 diff 里修掉了，要注明「已在未提交改动中修正」。
- 真相源：拓扑 `.service-matrix.yaml`；进度 `TODO.md`；架构 `docs/design/`（入口 `docs/design/README.md`）；规范 `context/`。
- 同级仓（路径相对本仓）：
  - `../control-tower`：HEAD == tag `v0.1.4`（无后续提交，14 个未提交改动）。`services/{config,gateway}`；`routes/{dev,pre}.yaml` 全部 `target: direct://ecommerce-<svc>-service.ecommerce.svc:<port>`（2026-09-03 起关 Consul）；`routes/*.yaml` 有 `guest:` 段（4 条 cart RPC）；网关访客 cookie 轨已实现（`services/gateway/internal/guest/`、`identity.go` 的 `x-md-global-anonymous`）。**网关鉴权仍是 Casbin**（`go.mod` 有 casbin/v2，代码零 OpenFGA 引用）。
  - `../kubernetes`：集群组件仓（`components/tetragon/` 存在；最近提交涉及 meilisearch 退役守卫、node3 复原手册）。
  - `../go-connect-kit`：tag `v0.3.0`，本仓与 control-tower 均依赖 v0.3.0。
  - `../postgres-kafka-es-streaming-pipeline`：CDC 链（Debezium→Kafka→ES Sink）仓，最近提交「node3 CDC 链告警与 Patroni 永久槽手顺」「接入 products.search_catalog → alias ecommerce_catalog_products」。
  - `../pigsty-deploy`：node3 Pigsty 部署。
  - `../deepseek-harness`：DSH 本身（TECH 表 A 引用其流水线做对照）。

## 后端事实

- `backend/services/`：address behavior cart inventory merchant order payment product search user（10 个）。**没有** identity/catalog/fulfillment/notification 目录。
- `backend/tools/`：仅 `config-seed`、`dbmigrate`。**`outbox-relay`、`search-indexer` 已删除**。
- `backend/pkg/`：configsource gorse healthcheck identity outbox product searchindex types。
- `backend/api/`：address behavior cart casdoor check inventory merchant order payment product search telemetry user。
- `backend/go.mod`（go 1.27.0）直接依赖里：**没有** franz-go / sarama / nats.go / kafka 客户端；有 `github.com/Protocol-Lattice/GoEventBus v0.2.5`（进程内事件总线）；`go-elasticsearch/v9 v9.4.3`；`lens077/control-tower v0.1.4`；`lens077/go-connect-kit v0.3.0`；`pgx/v5 v5.10.0`；`goose v3.27.3`；`go-redis/v9 v9.22.0`；`otel v1.46.0`；`fx v1.24.0`；`connect v1.20.0`；`casdoor-go-sdk v1.46.0`；`alipay/v3 v3.2.29`。

## 前端事实

- `frontend/apps/`：admin consumer consumer-next desktop merchant；`frontend/packages/`：api configs constants i18n perf tauri tracker ui utils。
- zustand 在 `apps/consumer` 与 `packages/utils`；**无 valtio**。`next` 锁 `16.4.0-canary.18`。React Compiler 由 `REACT_COMPILER=1` 环境变量开关（`apps/consumer/vite.config.ts:19,53`），默认关。
- **前端无任何 `@sentry/*` 或 bugsink 依赖**（Bugsink SDK 未接入）。
- a11y 测试：`apps/{admin,consumer,merchant}/src/a11y/pages.a11y.test.tsx` 存在。
- consumer-next：只有 `app/[lang]/product/[spuCode]/page.tsx` 一个业务页，`export const revalidate = 60`；JSON-LD 在 `src/lib/product-jsonld.ts`；`verify:runtime` 脚本存在；`deploy/dev.yaml` replicas 2 + PDB minAvailable 1。无 speculationrules。
- `frontend/package.json`：pnpm 12.3.4，vite-plus（`vp`），commitlint 在 frontend workspace。

## CI 事实

- `.github/workflows/`：
  - `backend.yml`：`on: push.tags [0-9]+.[0-9]+.[0-9]+` + workflow_dispatch。
  - `context-gate.yml`：**`on: pull_request` + `push.branches '**'` + tags** —— 即 GitHub 上每次 push/PR 也跑 context-gate。
  - `deploy-consistency.yml`：tags + dispatch。
  - `frontend.yml`：**仅 `schedule`（每周一）+ workflow_dispatch**（不是 push/PR/tag）。
  - `service-ci.yml`：workflow_call（被 backend.yml 调用），REGISTRY=ccr.ccs.tencentyun.com/sumery，同时推 GHCR。
  - `supply-chain-pr.yml`：**`on: push.tags` + dispatch（名字叫 pr，但不在 PR 上触发）**。
- `.gitlab-ci.yml`：workflow rules = MR 或分支 push；jobs：`context-gate`、`gitleaks`、`backend-gate`、`frontend-gate`（均 stage test）。

## 集群只读快照（实测 2026-09-06 03:00 CST）

⚠️ **采样时集群处于异常态**：node103 无任何 ecommerce Pod（8/8/0，全部 Pod 于 2026-09-04T20:51Z 重建到 node101/102），node103 上残留 17 个 `cilium-operator` Pod `ContainerStatusUnknown`，node103 的 cilium/kured/vector/tetragon 均在 ~112 min 前重启。按 `context/team/live-facts.md` 纪律，**这组分布数字不得写进文档当「现状」**，只可作为「文档中的分布/计数已过期，需在健康态复测」的信号。

- 节点：node101(cp)/node102/node103，K8s v1.36.4，Ubuntu 26.04，内核 7.0.0-30 arm64，containerd 2.3.4；Cilium `v1.20.1`，`kube-proxy-replacement=true`，`enable-wireguard`/`enable-encryption` 均为空（未开加密）。
- namespaces：argo-rollouts argocd cert-manager **ces-audit** cilium-secrets config-center consul default dragonfly ecommerce external-secrets keda kyverno logging **openbao** **openfga** **opentelemetry** pangolin spegel tetragon trust-system。**没有** search / nats / postgresql / cnpg-system / monitoring / grafana namespace。
- ecommerce ns Deployment（14 个）：consumer-next 2/2（`consumer-next:dev-20260828-2`）、control-tower-gateway 2/2（`ghcr.io/lens077/control-tower-gateway:0.2.10`）、10 个业务服务各 1/1（`ccr.ccs.tencentyun.com/sumery/<svc>:sha-c364128@sha256:…`）、ecommerce-frontend-deploy 1/1（`ecommerce-frontend:sha-bf8dae2`）、qqbot 1/1（`qqbot:dev-20260902-171906`）。**无 outbox-relay、无 search-indexer**。
- config-center ns：`config-center`、`config-center-web` 各 1/1。
- 其他：`openfga/openfga` Deployment **2/2（openfga/openfga:v1.18.3，Service 8080/8081/2112）——已部署但 control-tower 网关零接线**；`openbao` StatefulSet 1/1（不是 HashiCorp Vault）；`opentelemetry` ns 有 `otel-opentelemetry-collector` Deployment + `otel-node-opentelemetry-collector-agent` DaemonSet（`otel/opentelemetry-collector-contrib:0.158.0`）；`logging/vector` DaemonSet；**集群内没有 vmagent**；`consul-server` StatefulSet 1/1（业务 `CONSUL_ENABLED=false`）；`dragonfly` 单 Deployment 1/1（**未分实例**）；`tetragon` DaemonSet + operator；`keda` 三件套在跑但 **ScaledObject = 0**；`argo-rollouts` 在跑但 **Rollout = 0**；`kyverno` 四控制器在跑，ClusterPolicy 仅 `disallow-latest-tag`、`require-requests-limits`（**无 verifyImages**）；ArgoCD：零 Application/ApplicationSet，AppProject 仅 `default`；`spegel` DaemonSet；`kured` DaemonSet（kube-system）；`ces-audit` CronJob 在跑。
- PDB：ecommerce/consumer-next（minAvailable 1）、ecommerce/control-tower-gateway（minAvailable 1）、consul/consul-server、kube-system/cilium-operator。
- VPA：15 个；13 个 `Off`，**config-center ns 的 2 个（config-center-vpa、config-center-web-vpa）是 `InPlace`**。
- CiliumNetworkPolicy：全集群仅 1 条 `ecommerce/ecommerce-api-default-deny`；CCNP 0。
- Tetragon：仅 `ecommerce/ecommerce-service-account-token-access`（TracingPolicyNamespaced）。

## 已知的高价值线索（各组按需深挖，不要重复彼此范围）

- TECH §8.4 说访客购物「设计草案，未落地」「购物车五个 RPC 当前缺失」；但 control-tower 网关访客轨已实现（2026-09-01 四个提交），`.service-matrix.yaml` 与 `routes/dev.yaml` 各有 4 条 `guest_paths`，`docs/design/platform/anonymous-shopping.md`（未提交改动）已改为「步骤 1–3 完成」；`context/project/ecommerce/cart/experience/guest-add-to-cart-blocked-by-shop-name.md`（untracked）记录端到端在 cart 落库处被 `shop_name NOT NULL` 挡住。`MergeGuestCart` 两仓零命中。
- TECH §9.1 说指标由 VMAgent DaemonSet 抓取、集群只有采集器；实际集群内是 OTel Collector Deployment + node agent DaemonSet，无 vmagent。`.service-matrix.yaml` 的 pigsty_node3 note 仍说「只剩 vector DaemonSet」。
- OpenFGA 已在集群跑 2 副本，但任何仓库都没接线；`.service-matrix.yaml` externals 无 openfga 条目。
- TECH §7.2/§7.3 的「13 个单副本 Deployment」「17 个 Pod」「5/6/6 / 6/6/5」为过期计数（relay/indexer 退役、qqbot 新增）。
- 事件线：`pkg/outbox` 只剩 Insert；无 Inbox 表；无 franz-go；Kafka 只承载搜索 CDC 行投影。
