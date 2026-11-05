# 服务目录(service-catalog)

> 对应课程第 02 章「服务职责和依赖」交付物。服务职责与依赖以 `.service-matrix.yaml` 为真相源(2026-10-31 读),这是本仓结构性事实的第一证据层;代码接线状态后续章节逐服务复核时按 1.1 证据优先级再验证。
> 服务顺序说明:下表按课程 06 章顺序排列,并补上课程清单外的两个真实服务。

## 1. 服务职责与依赖表

| # | 服务 | discovery 注册名 | 网关前缀 | 额外配置块 | 外部依赖 | depends_on(已接线) | depends_on_planned(未接线) | 自有库迁移 |
|---|---|---|---|---|---|---|---|---|
| 1 | user | user-identity | /user* | auth | postgres, redis, casdoor, config_center | — | — | 1(00001_users) |
| 2 | product | product-service | /product* | recommend(required=false) | postgres, redis, gorse, config_center | — | — | 6(最新 00006_drop_outbox) |
| 3 | cart | cart-service | /cart* | store(S3/Silo) | postgres, redis, minio, config_center | — | — | 2(00002_price_cents_constraint) |
| 4 | search | search-product | /search* | auth, search | elasticsearch, config_center | — | — | 无自有库 |
| 5 | address | address-service | /address* | auth | postgres, redis, config_center | — | — | 1 |
| 6 | inventory | inventory-service | /inventory* | — | postgres, redis, config_center | — | — | 1 |
| 7 | order | order-service | /order* | — | postgres, redis, config_center | — | inventory, product, address | 1 |
| 8 | payment | payment-service | /payment* | pay(alipay,现为空占位) | postgres, alipay, config_center | — | order | 2(00002_rename_consumer_to_customer) |
| 9 | inventory 之外补充:merchant | merchant-service | /merchant* | auth | postgres, redis, config_center | — | — | 1 |
| 10 | behavior | behavior-service | /behavior*(+ /telemetry*) | auth, recommend(required=true) | postgres, redis, gorse, config_center | — | — | 1 |

**课程对照(Facts)**:
- 课程 06 章的 06.9「Recommendation 推荐能力」:仓库**没有**独立推荐服务。推荐引擎是外部 `gorse`,消费方是 behavior 与 product(`backend/pkg/gorse/`)。按课程规则标记为「外部依赖 + 规划项」,不虚构实现。
- 课程 06 章未列 `merchant`、`behavior`:两者是真实服务(有目录、proto、迁移、helm chart、deploy manifest)。后续开课需把这两个并入复习路线。
- 网关前缀特殊项:behavior 进程同时承载 `telemetry.v1.TelemetryService`(/telemetry*),域分开、进程共用。
- 顺序说明(课程 06 自己的要求):课程顺序 ≠ 运行时依赖顺序。真实依赖图是「10 个孤岛」——所有 `depends_on` 为空,唯一跨服务设计依赖是 order/payment 的 `depends_on_planned`。

## 2. 匿名/访客/可选认证边界(Facts,真相源:matrix `gateway` 段)

| 级别 | 路径 |
|---|---|
| A 完全匿名 | search.Search、product.GetProductDetail、user.SignIn、payment.HandlePaymentNotify/Callback、telemetry.CollectWebVitals、address.RegionService.ListRegions |
| B 访客身份(签发访客 cookie) | cart 全部四个方法(GetCart/AddProductToCart/RemoveCartItem/UpdateCartItemQuantity) |
| O 可选认证 | behavior.Track/Recommend/SimilarItems |
| C 必须登录 | 其余全部(下单/支付/地址簿等) |

A、B、O 两两互斥,同路径重复出现网关 Build 直接报错。

## 3. Config Center 约定(Facts)

- 键:`{service}/{env}/bootstrap.yaml`;Secret:`ecommerce-config-source-{env}`,按 selector 投射 `{service}.yaml`。
- 必需性唯一真相源:各服务 `internal/conf/v1/conf.proto` 的 `Bootstrap` message;由 `go-connect-kit/config`(ErrorUnused + protovalidate)在启动时强制。
- 已知坑(matrix 记录):配置中心副本含未定义键或缺 required 段会让服务重启后起不来;behavior 副本曾有未定义的 `log.elasticsearch` 块(本地已删,配置中心那份未核实——沿用 matrix 标注,本轮未验证)。

## 4. 前端(Facts)

- Workspace:`frontend/`,pnpm + vite-plus(`vp`)。
- Apps:`consumer`(3000)、`merchant`(3002)、`admin`(3003)、`desktop`(Tauri 壳,无独立端口);另有 `consumer-next`(有独立 Dockerfile 与 Edgeone Pages workflow)。
- Packages:api, configs, constants, copilot, i18n, perf, tauri, tracker, ui, utils。
- 传输:Connect-RPC → `VITE_GATEWAY_URL`(默认 http://localhost:8080)。

## 5. 部署覆盖(Facts,matrix `deployment_coverage` 段,structcheck 强制)

四条入口(makefile / compose / helm / kustomize deploy)当前 **10/10 全覆盖,例外清空**。两份集群清单(helm 与裸 manifest)逐字段等价,由 `scripts/verify-deploy-parity.sh` 保证;本轮 verify-quick 的 deploy-manifests 检查绿,佐证等价成立(采集时点见 runtime-evidence.md)。

## 6. 对第 06 章开课的影响(Proposals,待用户确认)

- PRO-1 服务复习顺序改为:cart → user → address → merchant → product → search → behavior → inventory → order → payment(先无状态/弱依赖,再资金与编排)。理由:order 的 planned 依赖(inventory/product/address)应先学被依赖方;payment 依赖 order。
- PRO-2 新增 merchant、behavior 两张复习卡;06.9 推荐改为「gorse 外部依赖 + behavior/product 接线」专题。
