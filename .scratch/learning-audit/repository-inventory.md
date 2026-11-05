# 仓库清单(repository-inventory)

> 对应课程《微服务工程复习与代码审计路线》第 02 章「仓库基线审计」交付物。
> 证据采集时刻:2026-10-31 08:47–09:05(+08:00)。证据环境:本机工作树 + 只读 kubectl 探测,context `kubernetes-admin@kubernetes`。
> 证据分支:`main` @ `7fe3294c000fe852e5f4c1f643e1ba09acde947e`(2026-10-31T05:10:27+08:00,`feat(consumer): :sparkles: 标签页过期检测——发现服务器新构建时提示刷新`)。
> 工作区状态:34 项改动(18 个已跟踪文件修改 + 16 个未跟踪路径),无 staged 内容。改动集中在 `docs/learning/`(15 文件)、`frontend/Makefile`、`scripts/context-progress-baseline.txt`;未跟踪含 `JEV-AND-AUDIT-RESULT.md`、`docs/{diagnostics,gitops,ideas,ops}/`、本目录(`.scratch/learning-audit/`)。**本清单描述的是「main + 未提交工作树」的混合状态**;引用行号与内容以该工作树为准,不等于已发布状态。

## 1. 仓库定位

- 本仓 `lens077/ecommerce`:10 个 Go 微服务 + pnpm 前端 monorepo + 部署清单。B2B2C 多租户电商。
- 网关与配置中心**不在本仓**:同级仓 `control-tower`(`services/gateway` + `services/config`)。本仓 `backend/structcheck` import `github.com/lens077/control-tower/routes` 双向核对路由。
- 基础设施清单仓:`kubernetes`(CDC connector 清单在 `components/kafka/cdc/`)。README 另列 `cloud-native-deploy`、`go-connect-template-cli`、`go-connect-template` 三个关联仓。

## 2. 根目录文档(Facts)

| 文件 | 角色 |
|---|---|
| `AGENTS.md` | AI 协作入口,硬规则 + 锚点命令 |
| `README.md` / `README.zh-CN.md` | 技术栈、目录、启动入口(运行态叙述需现查裁决) |
| `STACK.md`、`DESIGN.md`、`PRODUCT.md` | 技术栈与设计说明 |
| `TODO.md` | **进度唯一真相源**;本轮自述「未连接集群复核」,本审计已补连接(见 runtime-evidence.md) |
| `SECURITY-AUDIT-2026-10-14.md` | 代码审计报告(TODO 中 F-*/C-*/H-*/M-*/L-* 编号的出处之一) |
| `THIRD_PARTY_NOTICES.md` | 第三方声明(verify-quick 有新鲜度检查) |
| `.service-matrix.yaml` | **服务拓扑真相源**:注册名、网关前缀、依赖、外部依赖、Config Center 键 |
| `argocd-proj.yml` / `argocd-app.yml` / `argocd-repo.yml` | ArgoCD AppProject / ApplicationSet / repository 定义 |
| `JEV-AND-AUDIT-RESULT.md`、`env.md` | 未跟踪文件,未纳入版本控制(内容未审计) |

规范层:`context/`(入口 `context/INDEX.md`,四层结构);设计层:`docs/design/`(按微服务分目录,入口 `docs/design/README.md`)。

## 3. 微服务(Facts)

`backend/services/` 下 10 个服务目录(与 `.service-matrix.yaml` services 段 10/10 一致,`backend/structcheck` 的 `TestDeploymentListsMatchMatrix` 强制对齐):

`address` `behavior` `cart` `inventory` `merchant` `order` `payment` `product` `search` `user`

每个服务持有:`Dockerfile` ×10 已确认;`deploy/{base,overlays/prod}` kustomize 裸 manifest(user 已抽样确认含 deployment/service/kustomization);`internal/conf/v1/conf.proto` 配置契约;`internal/data/migrations/`(search 除外,search 无自有库)。

## 4. Proto 与 API 契约(Facts)

- `backend/api/` 13 个包:`address`(含 `region.proto`)`behavior` `cart` `casdoor` `check` `inventory` `merchant` `order` `payment` `product` `search` `telemetry` `user`,外加 `validation_test.go`。
- 注意:`casdoor`(身份)、`check`、`telemetry`(前端性能上报,由 behavior 进程承载)不是 10 个服务目录一一对应的包——服务数(10)≠ proto 包数(13)。
- 每服务 `internal/conf/v1/conf.proto` 是配置必需性的唯一真相源(buf.validate required)。
- 生成物:buf 五份生成配置(`buf.gen.yaml` / `openapi` / `jsonschema` / `ts`),`sqlc.yaml`,`backend/openapi/`。

## 5. 数据库迁移(Facts,goose)

共 16 个 SQL 文件,9 个服务:

| 服务 | 文件数 | 最新迁移 |
|---|---|---|
| address | 1 | 00001_addresses.sql |
| behavior | 1 | 00001_behavior_events.sql |
| cart | 2 | 00002_price_cents_constraint.sql |
| inventory | 1 | 00001_inventory.sql |
| merchant | 1 | 00001_merchant.sql |
| order | 1 | 00001_order.sql |
| payment | 2 | 00002_rename_consumer_to_customer.sql |
| product | 6 | 00006_drop_outbox.sql |
| search | 0 | 无自有库(只读 ES alias) |

## 6. 共享包(Facts)

`backend/pkg/`:`configsource` `gorse` `guardconf` `healthcheck` `identity` `registryconfig` `searchindex`。
另有:`backend/constants/`、`backend/infrastructure/`、`backend/tools/`(含 `config-seed`、`dbmigrate`)、`backend/structcheck/`(部署清单与路由门禁)、`backend/third_party/`、`backend/config-seed/`。

## 7. 部署与 CI(Facts)

- Helm:`helm/` 父 chart + 10 服务子 chart + `consumer-next` + `frontend`;`values.yaml`(pre 基线)+ `values-prod.yaml`;`files/zero-trust.yaml`(KYAML 豁免件);cart 子 chart 另有 `certificate.yaml`。与 `deploy/{base,overlays/prod}` 裸 manifest 由 `scripts/verify-deploy-parity.sh` 强制逐字段等价。
- Compose:`backend/compose.yaml`,10 个 `ecommerce-<svc>` 服务 + `ecommerce` 聚合。
- Makefile:`backend/Makefile` `SERVICES ?= user search product order inventory cart merchant address behavior payment`(10/10)。
- ArgoCD:`argocd-app.yml`(ApplicationSet)、`argocd-proj.yml`、`argocd-repo.yml`、`infrastructure/argocd/`、`infrastructure/kyverno/argocd-application.yml`;`scripts/argocd-devwindow.sh`。
- GitHub Actions(10 个 workflow):`backend.yml` `context-gate.yml` `deploy-consistency.yml` `edgeone-pages.yml` `edgeone-pages-consumer-next.yml` `frontend-release.yml` `frontend.yml` `registry-bench.yml` `service-ci.yml` `supply-chain-pr.yml`。
- 关键脚本:`scripts/verify-quick.sh`(默认门禁)、`verify-kyaml.sh`、`verify-deploy-parity.sh`、`verify-context.sh`、`verify-secrets.py`、`generate-sbom.sh`、`install-cosign.sh`、`promote-release.py`、`deploy-db-migrations.sh`、`deploy-k8s.sh`。

## 8. 同级仓可达性(Facts,本机 2026-10-31)

| 仓库 | 路径 | 分支 / HEAD | 说明 |
|---|---|---|---|
| control-tower | `/Users/lens/lens077/control-tower` | main @ `514aaf1`(2026-10-25) | 网关 + 配置中心,存在且可读 |
| kubernetes | `/Users/lens/lens077/kubernetes` | main @ `7d72643b`(2026-10-31 07:46) | CDC 清单 `components/kafka/cdc/`:source/sink/connect/metrics/rbac/reconcile 齐全 |
| cloud-native-deploy | `/Users/lens/lens077/cloud-native-deploy` | main @ `1884d49`(2026-08-17) | README 列为基础设施部署仓;**CDC 清单不在此仓**,与 kubernetes 仓的分工未见统一说明(见 gaps-and-risks.md) |
| docker-postgres-kafka-es-streaming-pipeline | `/Users/lens/lens077/docker-postgres-kafka-es-streaming-pipeline` | 未采证 | matrix 称 connector 配置与其「逐字段对齐」,本轮未比对(未验证) |

## 9. 依赖关系图(结构事实,依据 `.service-matrix.yaml`)

```
                    ┌──────────── control-tower(gateway + config)────────────┐
 前端 consumer ────▶│  网关(Casdoor BFF session, anonymous/guest/optional/登录)│
                    └───────────────────────┬────────────────────────────────┘
                                            │ direct://ecommerce-<svc>-service.ecommerce.svc
        ┌───────────────────────────────────┼──────────────────────────────────┐
        ▼ (10 个服务,depends_on 全为空——服务间调用未接线)
 user  search  behavior(+telemetry)  product  cart  address  order  inventory  merchant  payment
        │                 │                 │            │
        ▼                 ▼                 ▼            ▼ (depends_on_planned,未接线)
      ES alias          gorse            gorse      order→[inventory, product, address]
                                                        payment→[order]
 旁路:CDC(在 kubernetes 仓,非本仓代码)
   CNPG pg-main(products.search_catalog trigger)→ Debezium source → Kafka(Strimzi)→ ES sink
   → alias ecommerce_catalog_products → search 只读
```

## 10. 未覆盖项(TODOs)

- TODO-1 `backend/api/check`、`backend/api/casdoor` 两个 proto 包的消费方与用途未读(第 04 章契约审计时补)。
- TODO-2 `docker-postgres-kafka-es-streaming-pipeline` 与集群 connector 的逐字段对齐未验证。
- TODO-3 `docs/design/`、`context/` 全量清单未逐篇读,只取了入口与索引(第 03 章起按需)。
