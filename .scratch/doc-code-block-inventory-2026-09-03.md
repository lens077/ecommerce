# 文档代码片段清单（2026-09-03）

对象：git 跟踪的全部 Markdown（排除 node_modules、backend/third_party），共 **523 个围栏代码块 / 111 个文件**。

类别：**源码摘录**（go/proto/ts/sql/yaml/json… 可能与源码漂移，需逐个核对）、**命令示例**（bash，核对命令是否仍可执行）、**文本/示意**（text/无语言/markdown/promql，一般不漂移）。
「核对提示」对源码摘录做了一次机械探测：提取块内 `func/type/message/rpc/export/CREATE TABLE` 标识，在非文档源码里 grep 整词——✅ 找到、❌ 未找到（很可能已漂移或本就是示意）；"无可核对标识"表示块里没有可 grep 的声明，只能人工看。✅ 只说明名字还在，不保证签名/字段一致。

目录（按文件，块数）：

- [.scratch/bun-runtime-quic/research.md](#scratch-bun-runtime-quic-research-md) (6)
- [.scratch/chronic-alerts-cleanup/HANDOFF.md](#scratch-chronic-alerts-cleanup-handoff-md) (1)
- [.scratch/env-resync/ground-truth.md](#scratch-env-resync-ground-truth-md) (2)
- [.scratch/env-resync/review-plan.md](#scratch-env-resync-review-plan-md) (1)
- [.scratch/qqbot-integration/issues/07-p2-领域事件消费与主动通知.md](#scratch-qqbot-integration-issues-07-p2-md) (1)
- [.scratch/qqbot-integration/spec.md](#scratch-qqbot-integration-spec-md) (1)
- [.scratch/qqbot-integration/wiring.md](#scratch-qqbot-integration-wiring-md) (7)
- [.scratch/rewrite-v2/request-path.md](#scratch-rewrite-v2-request-path-md) (4)
- [.scratch/rewrite-v2/rewrite-baseline.md](#scratch-rewrite-v2-rewrite-baseline-md) (2)
- [.scratch/shared-infra-kit/spec.md](#scratch-shared-infra-kit-spec-md) (2)
- [AGENTS.md](#agents-md) (1)
- [README.md](#readme-md) (5)
- [STACK.md](#stack-md) (13)
- [backend/services/address/README.md](#backend-services-address-readme-md) (1)
- [backend/services/inventory/internal/pkg/dbutil/README.md](#backend-services-inventory-internal-pkg-dbutil-readme-md) (23)
- [backend/services/order/README.md](#backend-services-order-readme-md) (2)
- [backend/services/order/eventbus.md](#backend-services-order-eventbus-md) (1)
- [backend/tools/dbmigrate/README.md](#backend-tools-dbmigrate-readme-md) (5)
- [context/INDEX.md](#context-index-md) (1)
- [context/harness-framework/delivery-efficiency.md](#context-harness-framework-delivery-efficiency-md) (2)
- [context/harness-framework/e3-execution.md](#context-harness-framework-e3-execution-md) (1)
- [context/harness-framework/evolution-log.md](#context-harness-framework-evolution-log-md) (1)
- [context/harness-framework/knowledge-layering.md](#context-harness-framework-knowledge-layering-md) (3)
- [context/harness-framework/self-refinement.md](#context-harness-framework-self-refinement-md) (2)
- [context/harness-framework/sgh-implementation-plan.md](#context-harness-framework-sgh-implementation-plan-md) (37)
- [context/project/ecommerce/INDEX.md](#context-project-ecommerce-index-md) (1)
- [context/project/ecommerce/config/experience/config-hot-reload-boundaries.md](#context-project-ecommerce-config-experience-config-hot-reload-boundaries-md) (4)
- [context/project/ecommerce/config/experience/config-preview-allowlist.md](#context-project-ecommerce-config-experience-config-preview-allowlist-md) (1)
- [context/project/ecommerce/config/experience/kubernetes-secret-trailing-newline.md](#context-project-ecommerce-config-experience-kubernetes-secret-trailing-newline-md) (1)
- [context/project/ecommerce/consumer/experience/duplicate-cart-queries.md](#context-project-ecommerce-consumer-experience-duplicate-cart-queries-md) (1)
- [context/project/ecommerce/consumer/experience/mui-spacing-tokens-8x.md](#context-project-ecommerce-consumer-experience-mui-spacing-tokens-8x-md) (1)
- [context/project/ecommerce/consumer/experience/mui-typography-variant-decides-heading.md](#context-project-ecommerce-consumer-experience-mui-typography-variant-decides-heading-md) (1)
- [context/project/ecommerce/events/INDEX.md](#context-project-ecommerce-events-index-md) (1)
- [context/project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md](#context-project-ecommerce-events-experience-debezium-idle-slot-wal-retention-md) (10)
- [context/project/ecommerce/frontend-api/sop/connect-query.md](#context-project-ecommerce-frontend-api-sop-connect-query-md) (17)
- [context/project/ecommerce/frontend-api/sop/web-vitals-reporting.md](#context-project-ecommerce-frontend-api-sop-web-vitals-reporting-md) (1)
- [context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md](#context-project-ecommerce-gateway-experience-jwt-nbf-clock-skew-loop-md) (2)
- [context/project/ecommerce/registry/consul-dual-check-runbook.md](#context-project-ecommerce-registry-consul-dual-check-runbook-md) (13)
- [context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md](#context-project-ecommerce-registry-experience-consul-register-once-then-give-up-md) (7)
- [context/project/ecommerce/registry/experience/consul-ttl-first-ping-blind-window.md](#context-project-ecommerce-registry-experience-consul-ttl-first-ping-blind-window-md) (1)
- [context/team/alerting-signal-hygiene.md](#context-team-alerting-signal-hygiene-md) (4)
- [context/team/capability-seams.md](#context-team-capability-seams-md) (1)
- [context/team/cfs-quota-throttling.md](#context-team-cfs-quota-throttling-md) (3)
- [context/team/cilium-datapath-ops.md](#context-team-cilium-datapath-ops-md) (10)
- [context/team/cron-jobs.md](#context-team-cron-jobs-md) (5)
- [context/team/git-commit.md](#context-team-git-commit-md) (10)
- [context/team/go-redis.md](#context-team-go-redis-md) (4)
- [context/team/go-testing.md](#context-team-go-testing-md) (1)
- [context/team/host-watchdog.md](#context-team-host-watchdog-md) (2)
- [context/team/live-facts.md](#context-team-live-facts-md) (3)
- [context/team/local-env.md](#context-team-local-env-md) (4)
- [context/team/node-graceful-shutdown.md](#context-team-node-graceful-shutdown-md) (14)
- [context/team/okteto-inner-loop.md](#context-team-okteto-inner-loop-md) (1)
- [context/team/pangolin-tunnel.md](#context-team-pangolin-tunnel-md) (10)
- [context/team/proto-design.md](#context-team-proto-design-md) (11)
- [context/team/runbook.md](#context-team-runbook-md) (5)
- [context/team/shell-scripting.md](#context-team-shell-scripting-md) (2)
- [context/team/tls-enablement.md](#context-team-tls-enablement-md) (3)
- [docs/INFRASTRUCTURE-OPERATIONS.md](#docs-infrastructure-operations-md) (6)
- [docs/OKTETO.md](#docs-okteto-md) (7)
- [docs/SCAFFOLD.md](#docs-scaffold-md) (22)
- [docs/SECURITY-HARDENING.md](#docs-security-hardening-md) (19)
- [docs/TECH-RADAR.md](#docs-tech-radar-md) (1)
- [docs/TECH.md](#docs-tech-md) (11)
- [docs/TESTING.md](#docs-testing-md) (17)
- [docs/agents/triage-labels.md](#docs-agents-triage-labels-md) (1)
- [docs/design/cart/api-decisions.md](#docs-design-cart-api-decisions-md) (3)
- [docs/design/inventory/inventory.md](#docs-design-inventory-inventory-md) (1)
- [docs/design/merchant/store-settings.md](#docs-design-merchant-store-settings-md) (1)
- [docs/design/order/checkout.md](#docs-design-order-checkout-md) (6)
- [docs/design/order/schema.md](#docs-design-order-schema-md) (2)
- [docs/design/payment/payment.md](#docs-design-payment-payment-md) (3)
- [docs/design/platform/anonymous-shopping.md](#docs-design-platform-anonymous-shopping-md) (1)
- [docs/design/platform/error-handling.md](#docs-design-platform-error-handling-md) (4)
- [docs/design/platform/i18n-lessons.md](#docs-design-platform-i18n-lessons-md) (4)
- [docs/design/platform/i18n-routing.md](#docs-design-platform-i18n-routing-md) (1)
- [docs/design/platform/production-scale-goal.md](#docs-design-platform-production-scale-goal-md) (2)
- [docs/design/platform/rbac.md](#docs-design-platform-rbac-md) (1)
- [docs/design/product/listing.md](#docs-design-product-listing-md) (2)
- [docs/design/product/sales.md](#docs-design-product-sales-md) (12)
- [docs/design/product/schema.md](#docs-design-product-schema-md) (2)
- [docs/design/search/search.md](#docs-design-search-search-md) (2)
- [docs/observability/OBSERVABILITY.md](#docs-observability-observability-md) (1)
- [docs/observability/alerting-notification.md](#docs-observability-alerting-notification-md) (11)
- [docs/observability/grafana/README.md](#docs-observability-grafana-readme-md) (3)
- [docs/observability/面板设计.md](#docs-observability-md) (4)
- [docs/progress-archive/ssh-port-migration-20260811.md](#docs-progress-archive-ssh-port-migration-20260811-md) (1)
- [docs/reports/2026-08-27-infrastructure-audit.md](#docs-reports-2026-08-27-infrastructure-audit-md) (1)
- [docs/reports/2026-08-28-bugsink-integration-research.md](#docs-reports-2026-08-28-bugsink-integration-research-md) (1)
- [docs/reports/2026-08-28-duckdb-evaluation.md](#docs-reports-2026-08-28-duckdb-evaluation-md) (1)
- [docs/reports/2026-08-28-nextjs-poc.md](#docs-reports-2026-08-28-nextjs-poc-md) (19)
- [docs/reports/2026-08-28-react-compiler-pilot.md](#docs-reports-2026-08-28-react-compiler-pilot-md) (6)
- [docs/reports/2026-08-28-supply-chain-evolution-overview.md](#docs-reports-2026-08-28-supply-chain-evolution-overview-md) (3)
- [docs/reports/2026-08-28-supply-chain-pr-validation.md](#docs-reports-2026-08-28-supply-chain-pr-validation-md) (3)
- [docs/reports/2026-08-28-tech-research.md](#docs-reports-2026-08-28-tech-research-md) (1)
- [docs/reports/2026-08-28-tetragon-follow-ups.md](#docs-reports-2026-08-28-tetragon-follow-ups-md) (1)
- [docs/reports/2026-08-28-zero-trust-runtime-security.md](#docs-reports-2026-08-28-zero-trust-runtime-security-md) (3)
- [docs/reports/2026-08-29-descheduler-decision.md](#docs-reports-2026-08-29-descheduler-decision-md) (1)
- [docs/reports/2026-08-29-vpa-recommendation-only.md](#docs-reports-2026-08-29-vpa-recommendation-only-md) (6)
- [docs/reports/2026-08-31-github-pages-with-gh.md](#docs-reports-2026-08-31-github-pages-with-gh-md) (11)
- [docs/todo/基础设施与部署模型.md](#docs-todo-md) (1)
- [docs/todo/统一可观测性体系.md](#docs-todo-md) (1)
- [docs/todo/零信任鉴权与Session.md](#docs-todo-session-md) (1)
- [frontend/README.md](#frontend-readme-md) (2)
- [frontend/apps/desktop/README.md](#frontend-apps-desktop-readme-md) (3)
- [frontend/packages/tracker/README.md](#frontend-packages-tracker-readme-md) (6)
- [infrastructure/ces-audit/README.md](#infrastructure-ces-audit-readme-md) (6)
- [infrastructure/gatus/README.md](#infrastructure-gatus-readme-md) (5)
- [infrastructure/host-watchdog/README.md](#infrastructure-host-watchdog-readme-md) (5)
- [infrastructure/observability/README.md](#infrastructure-observability-readme-md) (4)
- [infrastructure/tetragon/README.md](#infrastructure-tetragon-readme-md) (1)

## .scratch/bun-runtime-quic/research.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 1 | 97–103 | js | 5 | 源码摘录 | `Bun.serve({` | 无可核对标识 |
| 2 | 127–130 | js | 2 | 源码摘录 | `await fetch("https://api.example.com/a", { protocol: "http2" });` | 无可核对标识 |
| 3 | 185–189 | yaml | 3 | 源码摘录 | `- 443:443` | 无可核对标识 |
| 4 | 193–197 | yaml | 3 | 源码摘录 | `# Uncomment to enable HTTP/3. You must also expose 443/udp in docker-compose.yml.` | 无可核对标识 |
| 5 | 230–233 | yaml | 2 | 源码摘录 | `udp-1704:` | 无可核对标识 |
| 6 | 264–267 | bash | 2 | 命令示例 | `rm -rf node_modules pnpm-lock.yaml` |  |

## .scratch/chronic-alerts-cleanup/HANDOFF.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 7 | 29–34 | (none) | 4 | 文本/示意 | `EcommerceNetworkPolicyDeniedBurst \| warning \| network-security \| since 08-31 12:57  ← 今天重新` |  |

## .scratch/env-resync/ground-truth.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 8 | 40–45 | (none) | 4 | 文本/示意 | `deployment/control-tower-gateway        2/2   11h   ← 新网关已切流上线` |  |
| 9 | 57–61 | (none) | 3 | 文本/示意 | `config-center       ccr.ccs.tencentyun.com/sumery/control-tower-config:sha-a27f90a` |  |

## .scratch/env-resync/review-plan.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 10 | 82–86 | (none) | 3 | 文本/示意 | `config-center      ns=config-center  → control-tower-config:sha-a27f90a      （6 个 Pod 全部核对` |  |

## .scratch/qqbot-integration/issues/07-p2-领域事件消费与主动通知.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 11 | 66–72 | sql | 5 | 源码摘录 | `INSERT INTO qqbot.daily_quota (scope, openid, quota_date, n)` | 无可核对标识 |

## .scratch/qqbot-integration/spec.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 12 | 624–630 | sql | 5 | 源码摘录 | `INSERT INTO qqbot.daily_quota (scope, openid, quota_date, n)` | 无可核对标识 |

## .scratch/qqbot-integration/wiring.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 13 | 150–160 | yaml | 9 | 源码摘录 | `qqbot:` | 无可核对标识 |
| 14 | 278–282 | yaml | 3 | 源码摘录 | `- package: qqbot` | 无可核对标识 |
| 15 | 306–313 | (none) | 6 | 文本/示意 | `腾讯 QQ 平台` |  |
| 16 | 459–461 | (none) | 1 | 文本/示意 | `namespace=qqbot  environment=dev  key=bootstrap.yaml     is_secret=true` |  |
| 17 | 466–486 | proto | 19 | 源码摘录 | `// backend/services/qqbot/internal/conf/v1/conf.proto` | `Bootstrap`→✅ `QQBot`→❌未在源码找到 |
| 18 | 662–692 | sql | 29 | 源码摘录 | `CREATE SCHEMA IF NOT EXISTS qqbot;` | `qqbot.inbound_dedup`→❌未在源码找到 `qqbot.inbox`→❌未在源码找到 `qqbot.identity_binding`→❌未在源码找到 |
| 19 | 963–1008 | yaml | 44 | 源码摘录 | `metadata:` | 无可核对标识 |

## .scratch/rewrite-v2/request-path.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 20 | 14–31 | text | 16 | 文本/示意 | `Hop0 客户端(Browser/Tauri, connect-web + Protobuf-ES)` |  |
| 21 | 121–136 | yaml | 14 | 源码摘录 | `# ① namespace 级 default-deny（ecommerce ns，ingress+egress 全拒）` | 无可核对标识 |
| 22 | 182–190 | text | 7 | 文本/示意 | `cmd/server/main.go   fx.App + fx.ValidateApp 静态验依赖图 + 优雅关闭（OTel flush 收尾）` |  |
| 23 | 218–229 | text | 10 | 文本/示意 | `业务事务 [ 领域写 + outbox insert ]  ←—— 原子边界` |  |

## .scratch/rewrite-v2/rewrite-baseline.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 24 | 106–130 | text | 23 | 文本/示意 | `用户` |  |
| 25 | 203–205 | text | 1 | 文本/示意 | `SearchCatalog: SearchProducts / UpsertProjection / DeleteProjection / RebuildIndex / SwapI` |  |

## .scratch/shared-infra-kit/spec.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 26 | 62–68 | (none) | 5 | 文本/示意 | `log/log.go   主流(behavior)  = f445a4a9` |  |
| 27 | 222–230 | yaml | 7 | 源码摘录 | `managed:` | 无可核对标识 |

## AGENTS.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 28 | 57–65 | bash | 7 | 命令示例 | `scripts/verify-quick.sh                              # 默认入口:后端链+前端并行,绿只打一行、红只打失败段` |  |

## README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 29 | 92–96 | bash | 3 | 命令示例 | `docker compose -f backend/infrastructure/postgres/compose.yaml up -d` |  |
| 30 | 102–105 | bash | 2 | 命令示例 | `cd backend/services/<service>` |  |
| 31 | 118–122 | bash | 3 | 命令示例 | `cd ../control-tower` |  |
| 32 | 130–133 | bash | 2 | 命令示例 | `cd ../control-tower` |  |
| 33 | 152–157 | bash | 4 | 命令示例 | `cd frontend` |  |

## STACK.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 34 | 66–85 | text | 18 | 文本/示意 | `ecommerce/` |  |
| 35 | 150–164 | text | 13 | 文本/示意 | `Client` |  |
| 36 | 249–257 | text | 7 | 文本/示意 | `Go OTel SDK --OTLP/HTTP + Bearer--> Pangolin --> node3 OTel Collector` |  |
| 37 | 293–306 | (none) | 12 | 文本/示意 | `cmd/server/main.go          fx.App 组装 + 生命周期 + 优雅关闭` |  |
| 38 | 310–312 | (none) | 1 | 文本/示意 | `server → service → biz ← data` |  |
| 39 | 321–324 | go | 2 | 源码摘录 | `// internal/biz/biz.go` | 无可核对标识 |
| 40 | 328–333 | (none) | 4 | 文本/示意 | `logger.Module → config.Module → logger.FxLogger() → registry.Module` |  |
| 41 | 413–415 | (none) | 1 | 文本/示意 | `server · data · observability · discovery · log` |  |
| 42 | 425–429 | (none) | 3 | 文本/示意 | `CONFIG_SOURCE_FILE=/path/to/source.yaml` |  |
| 43 | 439–452 | (none) | 12 | 文本/示意 | `PutKey / DeleteKey / Rollback ── 在写入事务内 ──> pg_notify('config_changed', ns/env/key/version` |  |
| 44 | 478–486 | text | 7 | 文本/示意 | `Web 浏览器 ── httpOnly cookie ─┐` |  |
| 45 | 519–524 | ts | 4 | 源码摘录 | `const transport = createConnectTransport({` | 无可核对标识 |
| 46 | 535–539 | bash | 3 | 命令示例 | `pnpm dev            # vp run consumer#dev` |  |

## backend/services/address/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 47 | 39–45 | (none) | 5 | 文本/示意 | `Order Service 支付成功 -> 发送 Order_Paid_Event。` |  |

## backend/services/inventory/internal/pkg/dbutil/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 48 | 15–45 | go | 29 | 源码摘录 | `// internal/data/data.go` | `Data`→✅ `NewData`→✅ |
| 49 | 51–83 | go | 31 | 源码摘录 | `func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.Reserve` | `Reserve`→✅ |
| 50 | 87–103 | go | 15 | 源码摘录 | `func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.Reserve` | `Reserve`→✅ |
| 51 | 109–136 | go | 26 | 源码摘录 | `handler := dbutil.NewHandler(` | 无可核对标识 |
| 52 | 142–147 | go | 4 | 源码摘录 | `err = db.QueryRow(ctx, "SELECT ...").Scan(&result)` | 无可核对标识 |
| 53 | 165–174 | go | 8 | 源码摘录 | `err = db.Exec(ctx, "INSERT INTO ...")` | 无可核对标识 |
| 54 | 180–185 | go | 4 | 源码摘录 | `err = db.Exec(ctx, "INSERT INTO orders ...")` | 无可核对标识 |
| 55 | 201–213 | go | 11 | 源码摘录 | `func NewData(pool *pgxpool.Pool, logger *zap.Logger) *Data {` | `NewData`→✅ |
| 56 | 217–231 | go | 13 | 源码摘录 | `func NewData(pool *pgxpool.Pool, logger *zap.Logger) *Data {` | `NewData`→✅ |
| 57 | 237–255 | go | 17 | 源码摘录 | `func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.Reserve` | `Reserve`→✅ |
| 58 | 262–264 | go | 1 | 源码摘录 | `handler.MustHandleError(err, biz.ErrOrderNotFound)` | 无可核对标识 |
| 59 | 267–271 | go | 3 | 源码摘录 | `dbutil.WithNoRowsHandler(func(err error) error {` | 无可核对标识 |
| 60 | 274–276 | go | 1 | 源码摘录 | `dbutil.WithNoRowsError(biz.ErrDefaultNotFound)` | 无可核对标识 |
| 61 | 282–316 | go | 33 | 源码摘录 | `type inventoryRepo struct {` | `inventoryRepo`→✅ `GetStock`→❌未在源码找到 `GetOrder`→✅ |
| 62 | 322–329 | go | 6 | 源码摘录 | `pqerror.UniqueViolation         // 23505 - 唯一约束冲突` | 无可核对标识 |
| 63 | 333–339 | go | 5 | 源码摘录 | `pqerror.SerializationFailure   // 40001 - 序列化失败（并发冲突）` | 无可核对标识 |
| 64 | 343–349 | go | 5 | 源码摘录 | `pqerror.TooManyConnections    // 53300 - 连接数过多` | 无可核对标识 |
| 65 | 353–358 | go | 4 | 源码摘录 | `pqerror.UndefinedTable        // 42P01 - 表不存在` | 无可核对标识 |
| 66 | 362–367 | go | 4 | 源码摘录 | `pqerror.DuplicateTable        // 42P07 - 表已存在` | 无可核对标识 |
| 67 | 373–394 | go | 20 | 源码摘录 | `// internal/data/data.go` | `Data`→✅ `NewData`→✅ |
| 68 | 398–410 | go | 11 | 源码摘录 | `type inventoryRepo struct {` | `inventoryRepo`→✅ `NewInventoryRepo`→✅ |
| 69 | 414–427 | go | 12 | 源码摘录 | `// internal/biz/errors.go` | 无可核对标识 |
| 70 | 431–446 | go | 14 | 源码摘录 | `// internal/data/data.go` | `NewData`→✅ |

## backend/services/order/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 71 | 3–5 | shell | 1 | 命令示例 | `make dev CONSUL_ADDR=localhost:8500` |  |
| 72 | 22–25 | (none) | 2 | 文本/示意 | `uc.repo.SaveOrder()      持久化  ─┐` |  |

## backend/services/order/eventbus.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 73 | 36–46 | (none) | 9 | 文本/示意 | `Application Layer  OrderCommandUseCase.CompleteOrder()` |  |

## backend/tools/dbmigrate/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 74 | 8–14 | (none) | 5 | 文本/示意 | `services/<svc>/internal/data/` |  |
| 75 | 37–45 | bash | 7 | 命令示例 | `make migrate-up                     # 全部服务迁到最新` |  |
| 76 | 52–55 | bash | 2 | 命令示例 | `docker run -d --name ecommerce-pg -e POSTGRES_PASSWORD=postgres \` |  |
| 77 | 62–67 | bash | 4 | 命令示例 | `kubectl -n postgresql port-forward svc/pg-main-rw 15432:5432 &` |  |
| 78 | 82–84 | bash | 1 | 命令示例 | `cd backend && make migrate-cnpg-up SEED=1     # 空库: 9 服务全量 up + 幂等种子` |  |

## context/INDEX.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 79 | 6–11 | (none) | 4 | 文本/示意 | `context/` |  |

## context/harness-framework/delivery-efficiency.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 80 | 22–24 | text | 1 | 文本/示意 | `交付效率 = 价值创造时间 /（价值创造时间 + 组织摩擦时间）` |  |
| 81 | 101–113 | markdown | 11 | 文本/示意 | `# 日报：YYYY-MM-DD` |  |

## context/harness-framework/e3-execution.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 82 | 73–81 | bash | 7 | 命令示例 | `SID="test-$$"` |  |

## context/harness-framework/evolution-log.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 83 | 32–38 | (none) | 5 | 文本/示意 | `### YYYY-MM-DD 一句话标题` |  |

## context/harness-framework/knowledge-layering.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 84 | 19–34 | (none) | 14 | 文本/示意 | `新知识` |  |
| 85 | 38–45 | (none) | 6 | 文本/示意 | `context/project/ecommerce/{module}/` |  |
| 86 | 65–70 | markdown | 4 | 文本/示意 | `**症状**：能观察到的现象，越具体越好（日志原文、报错文本、界面表现）` |  |

## context/harness-framework/self-refinement.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 87 | 20–31 | (none) | 10 | 文本/示意 | `① 用户纠正了 AI 的某个做法` |  |
| 88 | 91–93 | (none) | 1 | 文本/示意 | `echo "pnpm exec --no – commitlint --edit $1" > .husky/commit-msg` |  |

## context/harness-framework/sgh-implementation-plan.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 89 | 24–26 | text | 1 | 文本/示意 | `SGH-compatible with arXiv:2604.11378v1, ecommerce-solo-v1 profile` |  |
| 90 | 30–32 | text | 1 | 文本/示意 | `SGH core subset based on arXiv:2604.11378v1` |  |
| 91 | 40–42 | text | 1 | 文本/示意 | `/Users/sumery/lens077/deepseek-harness` |  |
| 92 | 46–48 | text | 1 | 文本/示意 | `/Users/sumery/lens077/ecommerce` |  |
| 93 | 52–62 | text | 9 | 文本/示意 | `ecommerce` |  |
| 94 | 82–86 | text | 3 | 文本/示意 | `packages/workflow/workflow` |  |
| 95 | 98–104 | text | 5 | 文本/示意 | `ctx.workflowEngine` |  |
| 96 | 110–115 | text | 4 | 文本/示意 | `/Users/sumery/lens077/deepseek-harness/packages/workflow/` |  |
| 97 | 119–123 | text | 3 | 文本/示意 | `/Users/sumery/lens077/deepseek-harness/packages/bundle/sgh/` |  |
| 98 | 131–144 | text | 12 | 文本/示意 | `packages/workflow/structured-graph/` |  |
| 99 | 148–150 | text | 1 | 文本/示意 | `packages/workflow/structured-graph/src/types.ts` |  |
| 100 | 158–177 | text | 18 | 文本/示意 | `packages/workflow/structured-graph-local/` |  |
| 101 | 193–204 | text | 10 | 文本/示意 | `packages/workflow/tool-structured-graph/` |  |
| 102 | 208–214 | text | 5 | 文本/示意 | `graph_validate` |  |
| 103 | 222–239 | text | 16 | 文本/示意 | `Plan` |  |
| 104 | 260–262 | text | 1 | 文本/示意 | `Pi = (id, version, V, E, sigma, kappa)` |  |
| 105 | 281–330 | ts | 48 | 源码摘录 | `import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'` | `PlanId`→❌未在源码找到 `NodeId`→❌未在源码找到 `JoinMode`→❌未在源码找到 |
| 106 | 334–336 | text | 1 | 文本/示意 | `/Users/sumery/lens077/deepseek-harness/packages/core/tools/src/json-schema.ts` |  |
| 107 | 348–351 | ts | 2 | 源码摘录 | `plan.nodes[0].status = 'running'` | 无可核对标识 |
| 108 | 355–384 | ts | 28 | 源码摘录 | `export type NodeStatus =` | `NodeStatus`→❌未在源码找到 `NodeRunState`→❌未在源码找到 `GraphRunState`→❌未在源码找到 |
| 109 | 388–397 | text | 8 | 文本/示意 | `Plan` |  |
| 110 | 401–406 | text | 4 | 文本/示意 | `executed` |  |
| 111 | 414–419 | text | 4 | 文本/示意 | `/Users/sumery/lens077/ecommerce/.dsh/graphs/` |  |
| 112 | 427–480 | yaml | 52 | 源码摘录 | `name: research-review` | 无可核对标识 |
| 113 | 484–492 | text | 7 | 文本/示意 | `GraphTemplate` |  |
| 114 | 500–507 | text | 6 | 文本/示意 | `structured-graph/plan-created` |  |
| 115 | 511–521 | text | 9 | 文本/示意 | `runId` |  |
| 116 | 604–615 | text | 10 | 文本/示意 | `Planner` |  |
| 117 | 636–642 | text | 5 | 文本/示意 | `local_retry` |  |
| 118 | 646–649 | text | 2 | 文本/示意 | `recoveryState:` |  |
| 119 | 673–679 | text | 5 | 文本/示意 | `pure` |  |
| 120 | 696–708 | text | 11 | 文本/示意 | `runId` |  |
| 121 | 738–740 | text | 1 | 文本/示意 | `sgh conformance` |  |
| 122 | 744–747 | text | 2 | 文本/示意 | `conformance.json` |  |
| 123 | 848–850 | text | 1 | 文本/示意 | `research → evidence_check → adversarial_review → report` |  |
| 124 | 856–858 | text | 1 | 文本/示意 | `inspect → plan → edit → verify → review → report` |  |
| 125 | 866–868 | text | 1 | 文本/示意 | `论文要求 ↔ 实现位置 ↔ 自动测试` |  |

## context/project/ecommerce/INDEX.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 126 | 29–35 | (none) | 5 | 文本/示意 | `{module}/` |  |

## context/project/ecommerce/config/experience/config-hot-reload-boundaries.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 127 | 17–23 | (none) | 5 | 文本/示意 | `配置中心 PutKey` |  |
| 128 | 44–46 | (none) | 1 | 文本/示意 | `WARN  该配置段已变更,但需要重启服务才会生效  section=server` |  |
| 129 | 69–71 | (none) | 1 | 文本/示意 | `ERROR  rebuild database pool failed, keeping the current one  error=...no such host` |  |
| 130 | 86–90 | bash | 3 | 命令示例 | `cd ../control-tower && scripts/dev-local.sh config   # 配置中心（control-tower 的 config 服务）得先起来` |  |

## context/project/ecommerce/config/experience/config-preview-allowlist.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 131 | 31–41 | yaml | 9 | 源码摘录 | `recommend:` | 无可核对标识 |

## context/project/ecommerce/config/experience/kubernetes-secret-trailing-newline.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 132 | 14–16 | text | 1 | 文本/示意 | `net/http: invalid header field value for "Authorization"` |  |

## context/project/ecommerce/consumer/experience/duplicate-cart-queries.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 133 | 34–44 | ts | 9 | 源码摘录 | `const CART_ITEMS_QUERY_KEY = ["cart", "items"] as const;` | 无可核对标识 |

## context/project/ecommerce/consumer/experience/mui-spacing-tokens-8x.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 134 | 33–35 | tsx | 1 | 源码摘录 | `sx={{ p: sp[4], gap: sp[2] }}   // → 字面量 "16px" / "8px"` | 无可核对标识 |

## context/project/ecommerce/consumer/experience/mui-typography-variant-decides-heading.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 135 | 49–52 | tsx | 2 | 源码摘录 | `<Typography variant="h6" component="h1">{t("cart.title")}</Typography>  // 视觉小、结构是页面标题` | 无可核对标识 |

## context/project/ecommerce/events/INDEX.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 136 | 49–53 | bash | 3 | 命令示例 | `cd backend` |  |

## context/project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 137 | 13–18 | (none) | 4 | 文本/示意 | `容器      cdc-connect            Up 22 hours (healthy)` |  |
| 138 | 22–26 | sql | 3 | 源码摘录 | `slot_name=ecommerce_cdc  type=logical  active=true  plugin=pgoutput` | 无可核对标识 |
| 139 | 51–54 | (none) | 2 | 文本/示意 | `table.include.list = orders.*, products.*` |  |
| 140 | 64–68 | (none) | 3 | 文本/示意 | `max_slot_wal_keep_size = 12288 MB` |  |
| 141 | 74–76 | (none) | 1 | 文本/示意 | `lsn.flush.mode = connector_and_driver` |  |
| 142 | 86–90 | (none) | 3 | 文本/示意 | `confirmed_flush_lsn  0/61001028 → 0/71000000` |  |
| 143 | 97–99 | (none) | 1 | 文本/示意 | `Using LSN flush mode 'connector': Debezium will flush LSN on event processing.` |  |
| 144 | 106–110 | (none) | 3 | 文本/示意 | `TopicAuthorizationException: Not authorized to access topics: [__debezium-heartbeat.ecomme` |  |
| 145 | 120–127 | bash | 6 | 命令示例 | `B=10.10.21.172:9092; CC=/etc/kafka/admin.properties   # pigsty-admin，SASL_SSL` |  |
| 146 | 157–162 | sql | 4 | 源码摘录 | `select slot_name, active,` | 无可核对标识 |

## context/project/ecommerce/frontend-api/sop/connect-query.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 147 | 41–48 | ts | 6 | 源码摘录 | `// node_modules/@connectrpc/connect-query/dist/esm/use-query.d.ts` | 无可核对标识 |
| 148 | 73–89 | ts | 15 | 源码摘录 | `// src/api/cart/index.ts —— 手工包一层 client` | `CartApiClient`→❌未在源码找到 `cartApi`→✅ |
| 149 | 96–110 | ts | 13 | 源码摘录 | `// src/hooks/useCart.ts` | `useCartItemsQuery`→✅ `useCartBadge`→✅ |
| 150 | 114–117 | (none) | 2 | 文本/示意 | `["connect-query", { transport: "t1", serviceName: "cart.v1.CartService",` |  |
| 151 | 123–131 | ts | 7 | 源码摘录 | `import { useMutation } from "@connectrpc/connect-query";` | 无可核对标识 |
| 152 | 138–142 | ts | 3 | 源码摘录 | `import { skipToken } from "@connectrpc/connect-query";` | 无可核对标识 |
| 153 | 155–164 | ts | 8 | 源码摘录 | `// ✅ 模块级：身份稳定,data 不变就不重算` | 无可核对标识 |
| 154 | 189–194 | ts | 4 | 源码摘录 | `import { callUnaryMethod, useTransport } from "@connectrpc/connect-query";` | 无可核对标识 |
| 155 | 213–217 | ts | 3 | 源码摘录 | `export function getSharedTransport(): Transport;  // 带 auth，给 TransportProvider` | `getSharedTransport`→✅ `getPublicTransport`→✅ `resetTransports`→✅ |
| 156 | 219–227 | tsx | 7 | 源码摘录 | `// apps/consumer/src/bootstrap.tsx —— TransportProvider 包在 QueryClientProvider 外层` | 无可核对标识 |
| 157 | 239–257 | ts | 17 | 源码摘录 | `import { useQueryClient } from "@tanstack/react-query";` | 无可核对标识 |
| 158 | 264–266 | ts | 1 | 源码摘录 | `createConnectQueryKey({ schema: CartService, cardinality: undefined })` | 无可核对标识 |
| 159 | 273–287 | ts | 13 | 源码摘录 | `const update = useMutation(CartService.method.updateCartItemQuantity, {` | 无可核对标识 |
| 160 | 301–312 | tsx | 10 | 源码摘录 | `import { toAppError, isUnauthenticated } from "@ecommerce/api";` | 无可核对标识 |
| 161 | 316–320 | ts | 3 | 源码摘录 | `const create = useMutation(AddressService.method.createAddress, {` | 无可核对标识 |
| 162 | 352–358 | ts | 5 | 源码摘录 | `// ✅ src/store/cart.ts` | `CartItem`→✅ |
| 163 | 374–380 | ts | 5 | 源码摘录 | `import { getPublicTransport } from "@ecommerce/api";` | 无可核对标识 |

## context/project/ecommerce/frontend-api/sop/web-vitals-reporting.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 164 | 11–15 | (none) | 3 | 文本/示意 | `@ecommerce/perf(采集) → 网关 /telemetry*(免 JWT) → behavior 进程的 telemetry.v1` |  |

## context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 165 | 17–19 | (none) | 1 | 文本/示意 | `token has invalid claims: token is not valid yet` |  |
| 166 | 40–43 | go | 2 | 源码摘录 | `const Leeway = 60 * time.Second` | 无可核对标识 |

## context/project/ecommerce/registry/consul-dual-check-runbook.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 167 | 57–60 | bash | 2 | 命令示例 | `token=$(kubectl -n consul get secret consul-bootstrap-acl-token \` |  |
| 168 | 64–67 | bash | 2 | 命令示例 | `curl -fsS -H "X-Consul-Token: $token" \` |  |
| 169 | 73–77 | bash | 3 | 命令示例 | `kubectl -n ecommerce get deploy \` |  |
| 170 | 85–87 | text | 1 | 文本/示意 | `missing or empty authorization header: Authorization` |  |
| 171 | 93–99 | bash | 5 | 命令示例 | `kubectl -n ecommerce get externalsecret,secret otel-auth` |  |
| 172 | 107–121 | bash | 13 | 命令示例 | `name=inventory-service` |  |
| 173 | 140–147 | bash | 6 | 命令示例 | `kubectl -n ecommerce scale deploy/ecommerce-inventory-deploy --replicas=2` |  |
| 174 | 153–164 | bash | 10 | 命令示例 | `target_pod=$(kubectl -n ecommerce get pod -l app=ecommerce-inventory -o json \` |  |
| 175 | 170–215 | yaml | 44 | 源码摘录 | `apiVersion: networking.k8s.io/v1` | 无可核对标识 |
| 176 | 219–223 | bash | 3 | 命令示例 | `kubectl apply -f /tmp/inventory-dependency-fault.yaml` |  |
| 177 | 229–241 | bash | 11 | 命令示例 | `all=$(curl -fsS -H "X-Consul-Token: $token" \` |  |
| 178 | 256–264 | bash | 7 | 命令示例 | `kubectl -n ecommerce delete networkpolicy inventory-dependency-fault` |  |
| 179 | 276–285 | bash | 8 | 命令示例 | `kubectl -n ecommerce delete networkpolicy inventory-dependency-fault --ignore-not-found` |  |

## context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 180 | 18–21 | json | 2 | 源码摘录 | `{"level":"error","msg":"consul returned empty instance list; check ACL token and registrat` | 无可核对标识 |
| 181 | 34–37 | (none) | 2 | 文本/示意 | `05:44:33.272 DEBUG registry/consul.go:196  service registration completed  ← 假的` |  |
| 182 | 49–52 | (none) | 2 | 文本/示意 | `Put "http://consul-server.consul.svc:8500/v1/agent/service/register?wait=10000ms":` |  |
| 183 | 68–70 | bash | 1 | 命令示例 | `kubectl rollout restart deploy/ecommerce-<svc>-deploy -n ecommerce` |  |
| 184 | 75–80 | bash | 4 | 命令示例 | `TOK=$(kubectl get secret -n ecommerce consul-ecommerce-token -o jsonpath='{.data}' \` |  |
| 185 | 91–94 | (none) | 2 | 文本/示意 | `Put "http://consul-server.consul.svc:8500/v1/agent/service/register?wait=10000ms":` |  |
| 186 | 115–123 | (none) | 7 | 文本/示意 | `注册 ──失败──▶ 指数退避（1s 起、×2、封顶 30s、不限次数）──▶ 再注册` |  |

## context/project/ecommerce/registry/experience/consul-ttl-first-ping-blind-window.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 187 | 44–47 | (none) | 2 | 文本/示意 | `00:50:37.264  INFO  registry/consul.go:228  starting ttl pinger  {"interval": "25s", ...}` |  |

## context/team/alerting-signal-hygiene.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 188 | 22–29 | (none) | 6 | 文本/示意 | `08-28 10:23Z   1644   ← 慢性基线（另一个服务的配置指向已退役地址）` |  |
| 189 | 48–51 | (none) | 2 | 文本/示意 | `修掉根因  >  调 repeat_interval  >  改阈值 / 加 for` |  |
| 190 | 105–108 | promql | 2 | 文本/示意 | `# 任何告警持续 firing 超过 N 小时 → 它已经失去信号价值，要么修要么删` |  |
| 191 | 115–117 | promql | 1 | 文本/示意 | `absent({__name__="<关键指标>"}) == 1   for: 10m` |  |

## context/team/capability-seams.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 192 | 54–60 | go | 5 | 源码摘录 | `// SearchEngine isolates the repository from the concrete Meilisearch client.` | `SearchEngine`→❌未在源码找到 |

## context/team/cfs-quota-throttling.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 193 | 50–53 | bash | 2 | 命令示例 | `kubectl exec -n <ns> <pod> -- cat /sys/fs/cgroup/cpu.stat` |  |
| 194 | 72–77 | bash | 4 | 命令示例 | `for p in $(kubectl get pods -n ecommerce -o jsonpath='{.items[*].metadata.name}'); do` |  |
| 195 | 128–131 | bash | 2 | 命令示例 | `GOOS=linux GOARCH=arm64 go build -o /tmp/gmp /tmp/gmp.go` |  |

## context/team/cilium-datapath-ops.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 196 | 43–51 | (none) | 7 | 文本/示意 | `# CiliumEndpoint（控制面）——正常` |  |
| 197 | 60–74 | bash | 13 | 命令示例 | `# 1. 判决书：DROPPED + policy-verdict:none + 目的地显示 (unmanaged) 就是这个坑` |  |
| 198 | 83–85 | bash | 1 | 命令示例 | `kubectl rollout restart deployment/<target> -n <ns>` |  |
| 199 | 92–95 | bash | 2 | 命令示例 | `kubectl get pods -n <ns> --no-headers \| awk '$3=="CrashLoopBackOff"{print $1}' \` |  |
| 200 | 123–133 | bash | 9 | 命令示例 | `python3 - <<'EOF'` |  |
| 201 | 137–139 | bash | 1 | 命令示例 | `kubectl delete ciliumendpointslice <stale-ces-name>` |  |
| 202 | 170–174 | (none) | 3 | 文本/示意 | `cilium_ct4_global  1881248 条目 / 247.3 MiB  →  470312 条目 / 61.8 MiB` |  |
| 203 | 178–181 | bash | 2 | 命令示例 | `helm upgrade cilium cilium/cilium --version <ver> -n kube-system \` |  |
| 204 | 197–199 | bash | 1 | 命令示例 | `kubectl delete pod -n kube-system <cilium-envoy-pod-on-that-node>` |  |
| 205 | 203–207 | bash | 3 | 命令示例 | `kubectl exec -n kube-system <cilium-pod> -c cilium-agent -- bpftool map show -j \` |  |

## context/team/cron-jobs.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 206 | 68–76 | go | 7 | 源码摘录 | `c := cron.New(` | 无可核对标识 |
| 207 | 95–103 | go | 7 | 源码摘录 | `func (j *ReconcileJob) Run() {` | `Run`→✅ |
| 208 | 111–114 | go | 2 | 源码摘录 | `loc, err := time.LoadLocation("Asia/Shanghai")   // 或按表达式：CRON_TZ=Asia/Shanghai 0 2 * * *` | 无可核对标识 |
| 209 | 123–129 | go | 5 | 源码摘录 | `stopCtx := c.Stop()` | 无可核对标识 |
| 210 | 151–159 | (none) | 7 | 文本/示意 | `Cron/CronJob 只发「该执行了」的信号` |  |

## context/team/git-commit.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 211 | 28–34 | (none) | 5 | 文本/示意 | `<type>(<scope>): [:emoji:] <subject>` |  |
| 212 | 44–51 | (none) | 6 | 文本/示意 | `perf(cart): 优化购物车页面展示` |  |
| 213 | 110–118 | (none) | 7 | 文本/示意 | `feat(api): 将用户接口从 REST 迁移至 GraphQL` |  |
| 214 | 122–128 | (none) | 5 | 文本/示意 | `frontend/commitlint.config.mjs   规则 + EMOJI_TYPES 白名单（唯一真相源）` |  |
| 215 | 138–142 | js | 3 | 源码摘录 | `if (existingHooksPath && existingHooksPath !== target` | 无可核对标识 |
| 216 | 148–152 | bash | 3 | 命令示例 | `cd frontend` |  |
| 217 | 196–198 | bash | 1 | 命令示例 | `git add STACK.md docs/todo/xxx.md backend/services/*/Dockerfile` |  |
| 218 | 213–218 | bash | 4 | 命令示例 | `git tag backup/mixed-commit-<date> <混合提交>          # 先留退路` |  |
| 219 | 232–235 | (none) | 2 | 文本/示意 | `origin   GitLab  (sumery/ecommerce)     ← 日常 push 的去处，无 Actions` |  |
| 220 | 262–266 | bash | 3 | 命令示例 | `git tag --list '[0-9]*' \| grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \| sort -V \| tail -1   # 看最新` |  |

## context/team/go-redis.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 221 | 28–35 | go | 6 | 源码摘录 | `// ✅ 每次用的时候取,拿到的永远是当前那个` | `repo`→✅ |
| 222 | 54–64 | go | 9 | 源码摘录 | `v, err := rdb.Get(ctx, key).Result()` | 无可核对标识 |
| 223 | 171–186 | go | 14 | 源码摘录 | `for i := 0; i < maxRetries; i++ {` | 无可核对标识 |
| 224 | 199–203 | go | 3 | 源码摘录 | `rdb := redis.NewClusterClient(&redis.ClusterOptions{` | 无可核对标识 |

## context/team/go-testing.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 225 | 65–70 | bash | 4 | 命令示例 | `cd backend` |  |

## context/team/host-watchdog.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 226 | 38–41 | (none) | 2 | 文本/示意 | `Gatus          从外部走公网 DNS/TLS 探「入口通不通」      —— 外部视角` |  |
| 227 | 84–88 | bash | 3 | 命令示例 | `cd infrastructure/host-watchdog` |  |

## context/team/live-facts.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 228 | 44–46 | markdown | 1 | 文本/示意 | `ecommerce Pod 分布 node101:5 / node102:6 / node103:6` |  |
| 229 | 50–54 | markdown | 3 | 文本/示意 | `Pod 分布须满足 suite-wide hostname spread，`maxSkew=1`（docs/TECH.md §7.2）。` |  |
| 230 | 85–100 | bash | 14 | 命令示例 | `# Pod 分布（应满足 maxSkew=1）` |  |

## context/team/local-env.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 231 | 73–76 | bash | 2 | 命令示例 | `export CONSUL_HTTP_TOKEN=$(kubectl -n consul get secret consul-ecommerce-token \` |  |
| 232 | 104–107 | bash | 2 | 命令示例 | `kubectl get secret global-root-ca-secret -n cert-manager -o jsonpath='{.data.ca\.crt}' \| b` |  |
| 233 | 114–118 | bash | 3 | 命令示例 | `sudo sh -c 'echo "192.168.3.121  <name>.dev.test" >> /etc/hosts'   # 或编辑已有行` |  |
| 234 | 233–249 | bash | 15 | 命令示例 | `# 域名与路由（/etc/hosts 应与此一致）` |  |

## context/team/node-graceful-shutdown.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 235 | 46–49 | text | 2 | 文本/示意 | `InhibitDelayMaxSec = shutdownGracePeriod` |  |
| 236 | 66–82 | text | 15 | 文本/示意 | `操作员或 kured 执行 shutdown/reboot` |  |
| 237 | 103–106 | yaml | 2 | 源码摘录 | `shutdownGracePeriod: 90s` | 无可核对标识 |
| 238 | 113–116 | text | 2 | 文本/示意 | `Creating node shutdown manager shutdownGracePeriodRequested="1m30s"` |  |
| 239 | 156–161 | bash | 4 | 命令示例 | `for node in node101 node102 node103; do` |  |
| 240 | 165–168 | bash | 2 | 命令示例 | `sed -n '/^shutdownGracePeriod:/p; /^shutdownGracePeriodCriticalPods:/p' \` |  |
| 241 | 174–177 | bash | 2 | 命令示例 | `systemd-analyze cat-config systemd/logind.conf \` |  |
| 242 | 187–190 | bash | 2 | 命令示例 | `journalctl -b -1 -u systemd-logind -u kubelet --no-pager \` |  |
| 243 | 201–204 | bash | 2 | 命令示例 | `kubectl get pods -A \` |  |
| 244 | 208–217 | bash | 8 | 命令示例 | `kubectl get pods -A -o json \| jq -r '` |  |
| 245 | 226–230 | bash | 3 | 命令示例 | `kubectl -n kube-system get pods -l component=kube-controller-manager -o json \` |  |
| 246 | 234–236 | text | 1 | 文本/示意 | `--terminated-pod-gc-threshold=100` |  |
| 247 | 240–243 | bash | 2 | 命令示例 | `kubectl get pods -A -o json \` |  |
| 248 | 256–269 | bash | 12 | 命令示例 | `kubectl get pods -A -o json \` |  |

## context/team/okteto-inner-loop.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 249 | 36–38 | bash | 1 | 命令示例 | `kubectl get applications -A     # No resources found ⇒ 无 selfHeal，本条不适用` |  |

## context/team/pangolin-tunnel.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 250 | 25–34 | (none) | 8 | 文本/示意 | `公网用户 ──HTTPS/TCP/UDP──> node1 VPS(ssh 别名 node1,与 hostname 一致,node1,腾讯云)` |  |
| 251 | 39–42 | bash | 2 | 命令示例 | `tccli lighthouse CreateFirewallRules --InstanceId lhins-1of5dkfj --FirewallRules \` |  |
| 252 | 81–83 | bash | 1 | 命令示例 | `kubectl -n default get svc -l io.cilium.gateway/owning-gateway=cilium-gateway -o wide` |  |
| 253 | 131–135 | bash | 3 | 命令示例 | `$ kubectl -n default get svc cilium-gateway-cilium-gateway \` |  |
| 254 | 150–153 | bash | 2 | 命令示例 | `kubectl -n default get svc -l io.cilium.gateway/owning-gateway=cilium-gateway \` |  |
| 255 | 196–201 | bash | 4 | 命令示例 | `U=https://pangolin.apikv.com/api/v1` |  |
| 256 | 246–252 | js | 5 | 源码摘录 | `if (!target.enabled) return false;                        // ① 手动禁用` | 无可核对标识 |
| 257 | 264–276 | bash | 11 | 命令示例 | `# ① servers 非空(最关键,漏掉这条就会误报)` |  |
| 258 | 299–308 | bash | 8 | 命令示例 | `# ① 宿主内网 IP —— 写 local site target 就用它。原理:问内核「发往公网时用哪个源地址」` |  |
| 259 | 316–319 | (none) | 2 | 文本/示意 | `webhook-webhook-1    0.0.0.0:8082->8082/tcp     ← 0.0.0.0 是【宿主的监听地址】` |  |

## context/team/proto-design.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 260 | 28–30 | protobuf | 1 | 源码摘录 | `CartStatus status = 11 [(buf.validate.field).enum.defined_only = true];` | 无可核对标识 |
| 261 | 51–54 | protobuf | 2 | 源码摘录 | `CartStatus status = 11 [(buf.validate.field).enum.defined_only = true];` | 无可核对标识 |
| 262 | 60–65 | protobuf | 4 | 源码摘录 | `EventType type = 1 [(buf.validate.field).enum = {` | 无可核对标识 |
| 263 | 69–71 | protobuf | 1 | 源码摘录 | `string merchant_id = 3 [(buf.validate.field).string.uuid = true];` | 无可核对标识 |
| 264 | 77–80 | protobuf | 2 | 源码摘录 | `string source = 5 [(buf.validate.field).string.max_len = 128];` | 无可核对标识 |
| 265 | 86–88 | protobuf | 1 | 源码摘录 | `uint32 n = 3 [(buf.validate.field).uint32.lte = 100];` | 无可核对标识 |
| 266 | 94–96 | protobuf | 1 | 源码摘录 | `repeated Event session_events = 5 [(buf.validate.field).repeated.max_items = 50];` | 无可核对标识 |
| 267 | 102–105 | protobuf | 2 | 源码摘录 | `double value = 3 [(buf.validate.field).double.gte = 0];` | 无可核对标识 |
| 268 | 124–130 | protobuf | 5 | 源码摘录 | `message CartItem {` | `CartItem`→✅ |
| 269 | 146–153 | protobuf | 6 | 源码摘录 | `// ❌ 全裸：状态可以是任意 int、备注可以是 10MB、页大小可以是 int32 最大值` | `ListOrdersRequest`→❌未在源码找到 |
| 270 | 155–165 | protobuf | 9 | 源码摘录 | `// ✅ 每个字段都有推断依据` | `ListOrdersRequest`→❌未在源码找到 |

## context/team/runbook.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 271 | 68–71 | bash | 2 | 命令示例 | `scripts/verify-quick.sh             # 后端(§1+§3)与前端(§4)并行跑;每侧绿了只打一行,红了只打日志尾部` |  |
| 272 | 82–86 | bash | 3 | 命令示例 | `cd backend` |  |
| 273 | 93–96 | bash | 2 | 命令示例 | `cd backend` |  |
| 274 | 105–108 | bash | 2 | 命令示例 | `cd backend` |  |
| 275 | 112–116 | bash | 3 | 命令示例 | `cd frontend` |  |

## context/team/shell-scripting.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 276 | 17–23 | bash | 5 | 命令示例 | `kubectl_delete_cmd=(delete)` |  |
| 277 | 36–44 | bash | 7 | 命令示例 | `kubectl_apply_cmd=(apply)` |  |

## context/team/tls-enablement.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 278 | 38–40 | yaml | 1 | 源码摘录 | `test: [ "CMD", "curl", "-fsk", "https://localhost:9000/minio/health/live" ]` | 无可核对标识 |
| 279 | 94–104 | bash | 9 | 命令示例 | `# ① 该关的真的关了(期望 000,不是 200/403)` |  |
| 280 | 153–156 | bash | 2 | 命令示例 | `echo \| openssl s_client -connect <域名>:<port> -servername <域名> \` |  |

## docs/INFRASTRUCTURE-OPERATIONS.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 281 | 23–27 | bash | 3 | 命令示例 | `# 端到端测试命令见 helper.sh 第二节「告警链路测试」（有副作用：会真实发送 ntfy）` |  |
| 282 | 35–38 | bash | 2 | 命令示例 | `ssh -L 8000:127.0.0.1:8000 node3` |  |
| 283 | 48–51 | bash | 2 | 命令示例 | `# 状态检查见 helper.sh 第一节「node3：Healthchecks 与 Gatus」（只读）` |  |
| 284 | 70–73 | bash | 2 | 命令示例 | `# 摄入链路检查见 helper.sh 第一节「node3：K8s 状态/Event 摄入链路」（只读）` |  |
| 285 | 85–89 | bash | 3 | 命令示例 | `# 状态检查见 helper.sh 第一节「node3：Bugsink」（只读）` |  |
| 286 | 121–125 | bash | 3 | 命令示例 | `# 指纹/到期日检查见 helper.sh 第一节「证书」（只读）` |  |

## docs/OKTETO.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 287 | 22–25 | (none) | 2 | 文本/示意 | `现在：改代码 → buildx 双架构 → 推 TCR（主镜像仓库，集群直连拉取）→ CI 回写 helm tag → ArgoCD 同步 → Pod 重启   （分钟~十几分钟）` |  |
| 288 | 43–46 | bash | 2 | 命令示例 | `brew install okteto                                     # CLI 3.22.0 起验证过` |  |
| 289 | 58–62 | bash | 3 | 命令示例 | `scripts/argocd-devwindow.sh off      # 开发前` |  |
| 290 | 75–92 | bash | 16 | 命令示例 | `# 0. 关自动同步` |  |
| 291 | 113–120 | (none) | 6 | 文本/示意 | `ENV     DEPLOYMENT_MODE=pre / CONFIG_SOURCE_FILE=/etc/ecommerce/config-source/cart.yaml` |  |
| 292 | 130–143 | (none) | 12 | 文本/示意 | `id                    → uid=1000 gid=1000              # 代码确实以非 root 跑` |  |
| 293 | 193–198 | bash | 4 | 命令示例 | `# 拿一个已在集群里跑着的镜像，钉到另一个节点起个 Pod` |  |

## docs/SCAFFOLD.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 294 | 45–79 | (none) | 33 | 文本/示意 | `{{PROJECT}}/` |  |
| 295 | 108–113 | (none) | 4 | 文本/示意 | `conf.proto → api/{svc}/v1/*.proto → buf generate` |  |
| 296 | 131–133 | (none) | 1 | 文本/示意 | `buf.gen.yaml → src/gen → env.ts(zod) → api/{domain} → routes → components` |  |
| 297 | 156–194 | markdown | 37 | 文本/示意 | `# AGENTS.md — AI 协作入口` |  |
| 298 | 203–301 | yaml | 97 | 源码摘录 | `# .service-matrix.yaml — 服务拓扑真相源` | 无可核对标识 |
| 299 | 309–315 | markdown | 5 | 文本/示意 | `# context/ — 知识库索引` |  |
| 300 | 320–353 | (none) | 32 | 文本/示意 | `## 团队级 · context/team/` |  |
| 301 | 357–374 | markdown | 16 | 文本/示意 | `---` |  |
| 302 | 389–402 | (none) | 12 | 文本/示意 | `## experience 文件的写法` |  |
| 303 | 413–430 | (none) | 16 | 文本/示意 | `### `context/harness-framework/self-refinement.md`（闭环，原样复用）` |  |
| 304 | 440–462 | (none) | 21 | 文本/示意 | `第 ④ 步的**「主动提议」**很关键。AI 不应该等用户说"记一下"才记。` |  |
| 305 | 474–529 | markdown | 54 | 文本/示意 | `# 项目实现进度与待办` |  |
| 306 | 537–547 | yaml | 9 | 源码摘录 | `version: v2` | 无可核对标识 |
| 307 | 551–561 | yaml | 9 | 源码摘录 | `version: v2` | 无可核对标识 |
| 308 | 565–581 | yaml | 15 | 源码摘录 | `version: v2` | 无可核对标识 |
| 309 | 585–608 | yaml | 22 | 源码摘录 | `version: "2"` | 无可核对标识 |
| 310 | 612–645 | dockerfile | 32 | 源码摘录 | `# ⚠️ 快照值——生成新项目时改为源仓 backend/go.mod 当前的 Go 版本，勿照抄` | 无可核对标识 |
| 311 | 649–678 | makefile | 28 | 源码摘录 | `VERSION ?= dev` | 无可核对标识 |
| 312 | 682–700 | makefile | 17 | 源码摘录 | `VERSION ?= dev` | 无可核对标识 |
| 313 | 704–734 | yaml | 29 | 源码摘录 | `packages:` | 无可核对标识 |
| 314 | 738–755 | fga | 16 | 源码摘录 | `model` | 无可核对标识 |
| 315 | 763–830 | (none) | 66 | 文本/示意 | `按 SCAFFOLD.md 生成 {{PROJECT}}（{{DOMAIN}}）的项目骨架，技术选型严格对齐 docs/TECH.md；STACK.md 仅用于核实现行工程事实。` |  |

## docs/SECURITY-HARDENING.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 316 | 45–49 | bash | 3 | 命令示例 | `journalctl -u ssh.service --no-pager \| grep -c "Failed password"` |  |
| 317 | 79–99 | ini | 19 | 源码摘录 | `[DEFAULT]` | 无可核对标识 |
| 318 | 119–126 | ini | 6 | 源码摘录 | `[sshd]` | 无可核对标识 |
| 319 | 136–140 | bash | 3 | 命令示例 | `journalctl -u ssh.service --no-pager -o short \` |  |
| 320 | 155–161 | bash | 5 | 命令示例 | `fail2ban-client set sshd banip 203.0.113.99` |  |
| 321 | 168–174 | bash | 5 | 命令示例 | `python3 -c "` |  |
| 322 | 200–204 | (none) | 3 | 文本/示意 | `Pangolin 设 X-Forwarded-For` |  |
| 323 | 208–211 | (none) | 2 | 文本/示意 | `client IP="<direct-client-ip>"                 直连/单跳` |  |
| 324 | 233–238 | ini | 4 | 源码摘录 | `[Definition]` | 无可核对标识 |
| 325 | 244–254 | ini | 9 | 源码摘录 | `[harbor-auth]` | 无可核对标识 |
| 326 | 265–269 | bash | 3 | 命令示例 | `fail2ban-client get harbor-auth logpath` |  |
| 327 | 277–279 | (none) | 1 | 文本/示意 | `127.0.0.1:49600  ←  127.0.0.1:51954     newt 隧道` |  |
| 328 | 351–363 | bash | 11 | 命令示例 | `# 续期后手工同步，两个服务都要做` |  |
| 329 | 373–376 | (none) | 2 | 文本/示意 | `postgres: root gorse   node2(...)   ← gorse，来自 node2` |  |
| 330 | 387–389 | bash | 1 | 命令示例 | `ps -eo args --no-headers \| grep "^postgres: root"` |  |
| 331 | 398–401 | diff | 2 | 文本/示意 | `- dataSourceName = "user=root password=*** host=apikv.com    port=52288 sslmode=disable   ` |  |
| 332 | 454–456 | (none) | 1 | 文本/示意 | `61246 -> 172.22.0.2:6379      52288 -> 172.19.0.2:5432` |  |
| 333 | 491–497 | (none) | 5 | 文本/示意 | `/api/health/ready  200      ← 仅健康检查开放` |  |
| 334 | 527–540 | bash | 12 | 命令示例 | `# 状态` |  |

## docs/TECH-RADAR.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 335 | 90–96 | (none) | 5 | 文本/示意 | `【①原子性】                【②搬运】                【③传输/存储 = MQ 本体】      【④信封】` |  |

## docs/TECH.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 336 | 73–97 | text | 23 | 文本/示意 | `客户端 (Web / Next.js / Tauri / Mobile)` |  |
| 337 | 118–147 | text | 28 | 文本/示意 | `┌─────────────────────────────────────────┐` |  |
| 338 | 168–189 | text | 20 | 文本/示意 | `[ 业务操作请求 ]` |  |
| 339 | 211–228 | yaml | 16 | 源码摘录 | `apiVersion: keda.sh/v1alpha1` | 无可核对标识 |
| 340 | 517–525 | text | 7 | 文本/示意 | `[ K8s 业务计算集群 ]                    [ 非 K8s 专用基础设施/数据集群 ]` |  |
| 341 | 540–546 | text | 5 | 文本/示意 | `Cilium Gateway API ──► control-tower 网关 ──► 业务服务 Pod Cells` |  |
| 342 | 601–607 | text | 5 | 文本/示意 | `客户端 ──(Session Token)──► control-tower ──(验证)──► Dragonfly Session Store` |  |
| 343 | 611–636 | python | 24 | 源码摘录 | `model` | 无可核对标识 |
| 344 | 660–673 | text | 12 | 文本/示意 | `[ K8s 业务集群 Pods ]` |  |
| 345 | 696–707 | text | 10 | 文本/示意 | `[ Gateway / HTTP Request ]` |  |
| 346 | 740–746 | go | 5 | 源码摘录 | `// 开发环境` | 无可核对标识 |

## docs/TESTING.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 347 | 56–62 | bash | 5 | 命令示例 | `cd backend` |  |
| 348 | 68–70 | bash | 1 | 命令示例 | `brew install mockery      # 只在本机生成 mock 代码；生成物入库，CI 不需要它` |  |
| 349 | 86–88 | bash | 1 | 命令示例 | `psql "$DB_URI" -tAc 'show server_version'` |  |
| 350 | 101–106 | go | 4 | 源码摘录 | `postgres := testutil.StartPostgres(t)` | 无可核对标识 |
| 351 | 116–119 | bash | 2 | 命令示例 | `TEST_DB_URI='postgres://user:pw@pg-dev.dev.test:5432/cart_test?sslmode=verify-ca' \` |  |
| 352 | 139–143 | go | 3 | 源码摘录 | `// StartRedis 返回一个连到进程内 miniredis 的 go-redis 客户端。` | `StartRedis`→❌未在源码找到 |
| 353 | 162–166 | go | 3 | 源码摘录 | `// services/cart/internal/data/cart.go` | `cartRepo`→✅ `NewCartRepo`→✅ |
| 354 | 175–180 | go | 4 | 源码摘录 | `postgres := testutil.StartPostgres(t)` | 无可核对标识 |
| 355 | 188–191 | go | 2 | 源码摘录 | `d := NewData(NewPgPool(postgres.Pool), NewLiveRedis(testutil.StartRedis(t)), zap.NewNop())` | 无可核对标识 |
| 356 | 199–204 | (none) | 4 | 文本/示意 | `services/cart/internal/data/` |  |
| 357 | 225–259 | go | 33 | 源码摘录 | `package data` | `TestCartUpsert_HitsUniqueConstraint`→❌未在源码找到 |
| 358 | 274–283 | yaml | 8 | 源码摘录 | `with-expecter: true          # 生成 EXPECT() 链式 API,比字符串方法名安全` | 无可核对标识 |
| 359 | 287–291 | make | 3 | 源码摘录 | `.PHONY: mocks` | 无可核对标识 |
| 360 | 297–307 | go | 9 | 源码摘录 | `repo := mocks.NewCartRepo(t)                       // 自带 AssertExpectations 的 cleanup` | 无可核对标识 |
| 361 | 343–347 | make | 3 | 源码摘录 | `.PHONY: test` | 无可核对标识 |
| 362 | 351–357 | make | 5 | 源码摘录 | `# 集成测试:需要 Docker。不带 -short,testutil 里的守卫因此放行。` | 无可核对标识 |
| 363 | 366–369 | yaml | 2 | 源码摘录 | `- name: Integration tests` | 无可核对标识 |

## docs/agents/triage-labels.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 364 | 21–25 | markdown | 3 | 文本/示意 | `# 修复网关 JWT nbf 时钟偏移` |  |

## docs/design/cart/api-decisions.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 365 | 23–31 | protobuf | 7 | 源码摘录 | `message AddProductToCartRequest {` | `AddProductToCartRequest`→✅ |
| 366 | 54–59 | protobuf | 4 | 源码摘录 | `message AddProductToCartResponse {` | `AddProductToCartResponse`→✅ |
| 367 | 84–93 | protobuf | 8 | 源码摘录 | `message RemoveFromCartRequest {` | `RemoveFromCartRequest`→❌未在源码找到 `RemoveFromCartResponse`→❌未在源码找到 |

## docs/design/inventory/inventory.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 368 | 63–75 | sql | 11 | 源码摘录 | `CREATE TABLE IF NOT EXISTS products.inventory` | `products.inventory`→❌未在源码找到 |

## docs/design/merchant/store-settings.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 369 | 474–480 | text | 5 | 文本/示意 | `草稿 -> 待付款 -> 已激活 -> 部分核销 -> 已用尽` |  |

## docs/design/order/checkout.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 370 | 34–55 | text | 20 | 文本/示意 | `[商品页] ──直接购买(sku+qty)──┐` |  |
| 371 | 83–89 | text | 5 | 文本/示意 | `不变量：available = on_hand - reserved - locked` |  |
| 372 | 124–139 | text | 14 | 文本/示意 | `1. INSERT order_request ON CONFLICT(client_token) DO NOTHING` |  |
| 373 | 145–157 | text | 11 | 文本/示意 | `认领 → 报价复验（product BatchGetSkuForTrade + merchant 状态；在售/归属/单价/数量逐项比对）` |  |
| 374 | 181–186 | text | 4 | 文本/示意 | `reservation 状态机：(absent) → reserved → confirmed / released / aborted（三终态）` |  |
| 375 | 210–225 | text | 14 | 文本/示意 | `PaymentCaptured` |  |

## docs/design/order/schema.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 376 | 13–34 | sql | 20 | 源码摘录 | `CREATE TYPE orders.order_status_enum AS ENUM ('pending_payment','paid','shipped','complete` | `orders.main`→❌未在源码找到 |
| 377 | 38–54 | sql | 15 | 源码摘录 | `CREATE TABLE IF NOT EXISTS orders.item` | `orders.item`→❌未在源码找到 |

## docs/design/payment/payment.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 378 | 22–34 | go | 11 | 源码摘录 | `// 统一支付接口定义` | `Payer`→❌未在源码找到 |
| 379 | 55–74 | sql | 18 | 源码摘录 | `CREATE TYPE payment.pay_status_enum AS ENUM ('pending','success','failed','closed','refund` | `payment.main`→❌未在源码找到 |
| 380 | 78–94 | sql | 15 | 源码摘录 | `CREATE TABLE IF NOT EXISTS payment.refund` | `payment.refund`→❌未在源码找到 |

## docs/design/platform/anonymous-shopping.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 381 | 78–82 | (none) | 3 | 文本/示意 | `访客加购 3 件  ──┐` |  |

## docs/design/platform/error-handling.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 382 | 10–16 | go | 5 | 源码摘录 | `var (` | 无可核对标识 |
| 383 | 18–33 | go | 14 | 源码摘录 | `func (u userRepo) SignIn(_ context.Context, req biz.SignInRequest) (*biz.SignInResponse, e` | `SignIn`→✅ |
| 384 | 35–65 | go | 29 | 源码摘录 | `func (s *UserService) SignIn(ctx context.Context, c *connect.Request[v1.SignInRequest]) (*` | `SignIn`→✅ |
| 385 | 68–70 | (none) | 1 | 文本/示意 | `2026-05-07T07:58:52.175+0800	ERROR	LoggingInterceptor	server/logging.go:37	rpc system erro` |  |

## docs/design/platform/i18n-lessons.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 386 | 43–46 | (none) | 2 | 文本/示意 | `1 items in cart     ← 错，应为 "1 item"` |  |
| 387 | 57–65 | json | 7 | 源码摘录 | `// en/common.json` | 无可核对标识 |
| 388 | 67–74 | json | 6 | 源码摘录 | `// zh-CN/common.json —— 中文只需 _other` | 无可核对标识 |
| 389 | 112–114 | json | 1 | 源码摘录 | `"JWT_AUTHN_REQUIRED": "未登录或登录已失效，请重新登录"` | 无可核对标识 |

## docs/design/platform/i18n-routing.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 390 | 79–81 | (none) | 1 | 文本/示意 | `URL 路径段(/en)  >  ?lang=  >  localStorage  >  navigator.language  >  zh-CN` |  |

## docs/design/platform/production-scale-goal.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 391 | 93–118 | text | 24 | 文本/示意 | `用户` |  |
| 392 | 173–180 | text | 6 | 文本/示意 | `SearchCatalog` |  |

## docs/design/platform/rbac.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 393 | 37–44 | text | 6 | 文本/示意 | `Client Session（迁移期可能仍有 legacy JWT）` |  |

## docs/design/product/listing.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 394 | 13–38 | proto | 24 | 源码摘录 | `rpc ListProducts(ListProductsRequest) returns (ListProductsResponse){}` | `ListProducts`→❌未在源码找到 `ListProductsRequest`→❌未在源码找到 `ListProductsResponse`→❌未在源码找到 |
| 395 | 42–56 | sql | 13 | 源码摘录 | `-- name: ListProducts :many` | 无可核对标识 |

## docs/design/product/sales.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 396 | 21–33 | plaintext | 11 | 文本/示意 | `订单支付成功 → Kafka 发布「销量变更事件」（经 Outbox；当前 NATS 迁移中）→ Catalog 域统计消费者以 Inbox 幂等消费` |  |
| 397 | 37–42 | go | 4 | 源码摘录 | `// SKU 实时销量：key = "sales:sku:{sku_id}"，value = 销量（int64）` | 无可核对标识 |
| 398 | 45–54 | go | 8 | 源码摘录 | `func (p *ProductService) GetSpuSales(ctx context.Context, spuID int64) (int64, error) {` | `GetSpuSales`→❌未在源码找到 |
| 399 | 59–88 | sql | 28 | 源码摘录 | `CREATE TABLE IF NOT EXISTS products.sales_detail` | `products.sales_detail`→❌未在源码找到 |
| 400 | 92–117 | sql | 24 | 源码摘录 | `CREATE TABLE IF NOT EXISTS products.sales_daily_agg` | `products.sales_daily_agg`→❌未在源码找到 |
| 401 | 120–130 | go | 9 | 源码摘录 | `func (s *StatisticsService) writeSalesDetail(ctx context.Context, item *OrderItem, orderNo` | `writeSalesDetail`→❌未在源码找到 |
| 402 | 132–157 | sql | 24 | 源码摘录 | `-- 聚合前一天数据（幂等操作，使用 INSERT ON CONFLICT）` | 无可核对标识 |
| 403 | 161–173 | sql | 11 | 源码摘录 | `-- 商家查看某SPU最近30天销量趋势` | 无可核对标识 |
| 404 | 175–186 | sql | 10 | 源码摘录 | `-- 商家查看旗下各品牌本月销量对比` | 无可核对标识 |
| 405 | 188–200 | sql | 11 | 源码摘录 | `-- 商家查看本月销量TOP10的SPU` | 无可核对标识 |
| 406 | 209–218 | sql | 8 | 源码摘录 | `-- 分区表示例（PostgreSQL 11+）` | `products.sales_detail`→❌未在源码找到 `products.sales_detail_202401`→❌未在源码找到 |
| 407 | 221–250 | go | 28 | 源码摘录 | `func (s *StatisticsService) HandleOrderPaid(ctx context.Context, event *OrderPaidEvent) er` | `HandleOrderPaid`→❌未在源码找到 `HandleOrderRefund`→❌未在源码找到 |

## docs/design/product/schema.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 408 | 13–30 | sql | 16 | 源码摘录 | `CREATE TABLE IF NOT EXISTS products.spu` | `products.spu`→❌未在源码找到 |
| 409 | 34–53 | sql | 18 | 源码摘录 | `CREATE TYPE products.skus_status_enum AS ENUM ('active','inactive','deleted');` | `products.skus`→✅ |

## docs/design/search/search.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 410 | 34–46 | text | 11 | 文本/示意 | `任何写入 PostgreSQL 的路径（seed / 后台 SQL / 未来 RPC）` |  |
| 411 | 82–95 | json | 12 | 源码摘录 | `{` | 无可核对标识 |

## docs/observability/OBSERVABILITY.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 412 | 85–99 | text | 13 | 文本/示意 | `10 × Go Service + control-tower gateway` |  |

## docs/observability/alerting-notification.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 413 | 34–41 | yaml | 6 | 源码摘录 | `route:` | 无可核对标识 |
| 414 | 70–73 | bash | 2 | 命令示例 | `ssh node3 "curl -s http://127.0.0.1:8880/api/v1/rules" \` |  |
| 415 | 80–82 | bash | 1 | 命令示例 | `ssh node3 "sudo -u postgres psql -tAc \"select slot_name, slot_type, plugin, active from p` |  |
| 416 | 112–137 | yaml | 24 | 源码摘录 | `alerting:` | 无可核对标识 |
| 417 | 172–175 | bash | 2 | 命令示例 | `kubectl get cm -n opentelemetry -o yaml \| grep -A2 'k8s_cluster'   # receiver 是否启用` |  |
| 418 | 181–185 | promql | 3 | 文本/示意 | `sum by (k8s_namespace_name, k8s_pod_name) (` |  |
| 419 | 199–204 | bash | 4 | 命令示例 | `ssh node3 "curl -s http://127.0.0.1:8428/api/v1/label/__name__/values" \` |  |
| 420 | 220–222 | promql | 1 | 文本/示意 | `absent(k8s_container_restarts) == 1` |  |
| 421 | 267–270 | bash | 2 | 命令示例 | `ssh node3 "curl -s http://127.0.0.1:8880/api/v1/alerts"        # 当前 firing 的告警` |  |
| 422 | 276–288 | yaml | 11 | 源码摘录 | `- name: alert-i18n-canary` | 无可核对标识 |
| 423 | 304–307 | bash | 2 | 命令示例 | `ssh node3 "ls -t /data/gatus/config.yaml.bak-*"` |  |

## docs/observability/grafana/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 424 | 23–42 | bash | 18 | 命令示例 | `cd docs/observability/grafana` |  |
| 425 | 52–54 | bash | 1 | 命令示例 | `GRAFANA_DS_PROM=xxx GRAFANA_DS_PG=yyy GRAFANA_DS_LOKI=zzz python3 build_infrastructure.py` |  |
| 426 | 76–79 | promql | 2 | 文本/示意 | `(sum by (service_name) (rate(错误[$i])) or sum by (service_name) (rate(总量[$i])) * 0)` |  |

## docs/observability/面板设计.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 427 | 36–39 | (none) | 2 | 文本/示意 | `SERVER_FAULT_CODES = "unknown\|internal\|unavailable\|deadline_exceeded\|resource_exhausted\|da` |  |
| 428 | 69–73 | promql | 3 | 文本/示意 | `( sum by (service_name) (rate(错误[$i]))` |  |
| 429 | 108–113 | (none) | 4 | 文本/示意 | `告警响 / ① 红绿灯变色` |  |
| 430 | 243–255 | bash | 11 | 命令示例 | `# 1. 生成（JSON 是产物，禁止手改；详见 grafana/README.md）` |  |

## docs/progress-archive/ssh-port-migration-20260811.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 431 | 31–61 | bash | 29 | 命令示例 | `NEW_PORT=34123` |  |

## docs/reports/2026-08-27-infrastructure-audit.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 432 | 184–187 | text | 2 | 文本/示意 | `CRON_TZ=Asia/Shanghai` |  |

## docs/reports/2026-08-28-bugsink-integration-research.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 433 | 46–53 | text | 6 | 文本/示意 | `consumer / merchant / admin (Vite SPA + Tauri 壳)` |  |

## docs/reports/2026-08-28-duckdb-evaluation.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 434 | 61–65 | sql | 3 | 源码摘录 | `SET memory_limit = '3GB'; SET threads = 2;` | 无可核对标识 |

## docs/reports/2026-08-28-nextjs-poc.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 435 | 54–56 | bash | 1 | 命令示例 | `curl -sS -m 5 http://192.168.3.131:8080/healthz` |  |
| 436 | 62–65 | bash | 2 | 命令示例 | `cd frontend/apps/consumer-next` |  |
| 437 | 69–79 | json | 9 | 源码摘录 | `{` | 无可核对标识 |
| 438 | 85–88 | bash | 2 | 命令示例 | `cd frontend/apps/consumer-next` |  |
| 439 | 92–104 | json | 11 | 源码摘录 | `{` | 无可核对标识 |
| 440 | 116–123 | bash | 6 | 命令示例 | `curl -sS -X POST http://127.0.0.1:4010/__reset` |  |
| 441 | 127–130 | text | 2 | 文本/示意 | `request 1: Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` |  |
| 442 | 132–139 | json | 6 | 源码摘录 | `{` | 无可核对标识 |
| 443 | 145–152 | bash | 6 | 命令示例 | `curl -sS -X POST http://127.0.0.1:4010/__reset` |  |
| 444 | 156–161 | text | 4 | 文本/示意 | `request 1: x-nextjs-cache: MISS` |  |
| 445 | 163–169 | json | 5 | 源码摘录 | `{` | 无可核对标识 |
| 446 | 179–185 | bash | 5 | 命令示例 | `cd frontend/apps/consumer-next` |  |
| 447 | 189–202 | bash | 12 | 命令示例 | `cd frontend` |  |
| 448 | 206–209 | text | 2 | 文本/示意 | `failed to connect to the docker API at unix:///Users/sumery/.docker/run/docker.sock:` |  |
| 449 | 213–217 | bash | 3 | 命令示例 | `cd frontend` |  |
| 450 | 252–259 | text | 6 | 文本/示意 | `镜像：consumer-next:poc（linux/arm64，standalone，raw 402MB）` |  |
| 451 | 265–269 | text | 3 | 文本/示意 | `Pod A #1: MISS   → A #2: HIT          （A 本地缓存建立）` |  |
| 452 | 281–287 | text | 5 | 文本/示意 | `GET https://shop.dev.test/zh/product/iphone-15-pro   → 200，首次 MISS（双 Pod 各自冷启动），` |  |
| 453 | 291–295 | text | 3 | 文本/示意 | `GET https://shop.apikv.com/zh/product/iphone-15-pro  → HTTP/2 200，真实数据「Apple iPhone 15 Pro` |  |

## docs/reports/2026-08-28-react-compiler-pilot.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 454 | 44–51 | ts | 6 | 源码摘录 | `const reactCompilerEnabled = process.env.REACT_COMPILER === "1";` | 无可核对标识 |
| 455 | 76–79 | bash | 2 | 命令示例 | `cd frontend` |  |
| 456 | 137–141 | bash | 3 | 命令示例 | `cd frontend` |  |
| 457 | 195–198 | bash | 2 | 命令示例 | `env -u REACT_COMPILER pnpm exec vp run consumer#test` |  |
| 458 | 224–229 | bash | 4 | 命令示例 | `cd frontend` |  |
| 459 | 256–261 | bash | 4 | 命令示例 | `cd frontend` |  |

## docs/reports/2026-08-28-supply-chain-evolution-overview.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 460 | 9–21 | text | 11 | 文本/示意 | `PR` |  |
| 461 | 160–165 | text | 4 | 文本/示意 | `Buildx push` |  |
| 462 | 198–225 | text | 26 | 文本/示意 | `PR` |  |

## docs/reports/2026-08-28-supply-chain-pr-validation.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 463 | 15–17 | bash | 1 | 命令示例 | `./scripts/supply-chain-pr.sh` |  |
| 464 | 39–41 | bash | 1 | 命令示例 | `gitleaks git . --log-opts="<base>..HEAD" --redact` |  |
| 465 | 78–82 | bash | 3 | 命令示例 | `./scripts/generate-sbom.sh \` |  |

## docs/reports/2026-08-28-tech-research.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 466 | 131–138 | text | 6 | 文本/示意 | `Cilium Gateway API` |  |

## docs/reports/2026-08-28-tetragon-follow-ups.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 467 | 48–56 | bash | 7 | 命令示例 | `# Kubernetes 仓：三节点、BTF、策略边界与资源快照` |  |

## docs/reports/2026-08-28-zero-trust-runtime-security.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 468 | 53–57 | yaml | 3 | 源码摘录 | `serviceAccountName: control-tower-gateway` | 无可核对标识 |
| 469 | 142–146 | text | 3 | 文本/示意 | `policy_name=ecommerce-service-account-token-access` |  |
| 470 | 187–211 | text | 23 | 文本/示意 | `backend build/vet/test -short                  PASS` |  |

## docs/reports/2026-08-29-descheduler-decision.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 471 | 26–31 | text | 4 | 文本/示意 | `Descheduler 识别落点过时的 Pod` |  |

## docs/reports/2026-08-29-vpa-recommendation-only.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 472 | 47–58 | yaml | 10 | 源码摘录 | `admissionController:` | 无可核对标识 |
| 473 | 62–65 | bash | 2 | 命令示例 | `cd ../kubernetes` |  |
| 474 | 84–91 | yaml | 6 | 源码摘录 | `updatePolicy:` | 无可核对标识 |
| 475 | 200–212 | bash | 11 | 命令示例 | `kubectl get vpa -n ecommerce` |  |
| 476 | 266–268 | bash | 1 | 命令示例 | `kubectl delete -f application-vpa.yml` |  |
| 477 | 272–274 | bash | 1 | 命令示例 | `helm rollback vpa 1 -n kube-system` |  |

## docs/reports/2026-08-31-github-pages-with-gh.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 478 | 15–24 | bash | 8 | 命令示例 | `# 1. 启用 Pages，把发布源设为 GitHub Actions` |  |
| 479 | 56–59 | html | 2 | 源码摘录 | `<img src="/shots/wbs.png">` | 无可核对标识 |
| 480 | 72–81 | js | 8 | 源码摘录 | `// astro.config.mjs` | 无可核对标识 |
| 481 | 85–94 | astro | 8 | 源码摘录 | `---` | 无可核对标识 |
| 482 | 115–117 | bash | 1 | 命令示例 | `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow` |  |
| 483 | 128–130 | bash | 1 | 命令示例 | `gh api -X PUT repos/OWNER/REPO/pages -f build_type=workflow` |  |
| 484 | 136–196 | yaml | 59 | 源码摘录 | `name: pages` | 无可核对标识 |
| 485 | 210–213 | bash | 2 | 命令示例 | `gh api repos/OWNER/REPO/contents/action.yml?ref=TAG -q '.content' \` |  |
| 486 | 231–234 | bash | 2 | 命令示例 | `curl -sL https://OWNER.github.io/REPO/ \| grep -oE 'src="[^"]*"' \| head -3` |  |
| 487 | 255–271 | bash | 15 | 命令示例 | `# 查看 Pages 配置` |  |
| 488 | 279–281 | bash | 1 | 命令示例 | `gh api -X PUT repos/OWNER/REPO/pages -f cname=www.example.com` |  |

## docs/todo/基础设施与部署模型.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 489 | 50–55 | bash | 4 | 命令示例 | `curl -sSk https://gateway.dev.test/healthz -o /dev/null -w '%{http_code}\n'` |  |

## docs/todo/统一可观测性体系.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 490 | 11–23 | text | 11 | 文本/示意 | `[ K8s 业务集群 ]` |  |

## docs/todo/零信任鉴权与Session.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 491 | 11–16 | text | 4 | 文本/示意 | `客户端 ──(Session Token)──► control-tower ──(验证)──► Dragonfly Session Store` |  |

## frontend/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 492 | 8–15 | (none) | 6 | 文本/示意 | `frontend/` |  |
| 493 | 66–70 | bash | 3 | 命令示例 | `pnpm i           # 安装；prepare 会跑 vp config 装 git 钩子` |  |

## frontend/apps/desktop/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 494 | 20–22 | bash | 1 | 命令示例 | `source "$HOME/.cargo/env"` |  |
| 495 | 26–35 | bash | 8 | 命令示例 | `# 起桌面端（会自动拉起对应 app 的 vite dev server）` |  |
| 496 | 79–81 | bash | 1 | 命令示例 | `pnpm exec tauri dev --no-dev-server --no-watch --config src-tauri/<临时配置>.json` |  |

## frontend/packages/tracker/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 497 | 10–14 | toml | 3 | 源码摘录 | `[recommend.data_source]` | 无可核对标识 |
| 498 | 36–40 | ts | 3 | 源码摘录 | `import { initTracker } from "@ecommerce/tracker";` | 无可核对标识 |
| 499 | 44–51 | tsx | 6 | 源码摘录 | `import { useImpression } from "@ecommerce/tracker/react";` | 无可核对标识 |
| 500 | 55–59 | tsx | 3 | 源码摘录 | `import { useProductView } from "@ecommerce/tracker/react";` | 无可核对标识 |
| 501 | 63–70 | ts | 6 | 源码摘录 | `import { tracker } from "@ecommerce/tracker";` | 无可核对标识 |
| 502 | 74–79 | ts | 4 | 源码摘录 | `import { recommend, similarItems } from "@ecommerce/tracker/react";` | 无可核对标识 |

## infrastructure/ces-audit/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 503 | 17–21 | bash | 3 | 命令示例 | `kubectl apply -k infrastructure/ces-audit` |  |
| 504 | 29–31 | bash | 1 | 命令示例 | `python3 infrastructure/ces-audit/ces_audit.py` |  |
| 505 | 35–39 | bash | 3 | 命令示例 | `python3 infrastructure/ces-audit/ces_audit.py \` |  |
| 506 | 52–65 | bash | 12 | 命令示例 | `scp infrastructure/ces-audit/vmalert-rule.yml node3:/tmp/ecommerce-ces-audit.yml` |  |
| 507 | 73–75 | bash | 1 | 命令示例 | `kubectl delete -k infrastructure/ces-audit` |  |
| 508 | 79–84 | bash | 4 | 命令示例 | `ssh node3 'rm -f \` |  |

## infrastructure/gatus/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 509 | 42–46 | bash | 3 | 命令示例 | `scp infrastructure/gatus/config.yaml node3:/tmp/ecommerce-gatus-config.yaml` |  |
| 510 | 50–60 | bash | 9 | 命令示例 | `ssh node3 'docker run -d \` |  |
| 511 | 64–68 | bash | 3 | 命令示例 | `ssh node3 'cp /opt/ecommerce-gatus/config.yaml \` |  |
| 512 | 74–77 | bash | 2 | 命令示例 | `ssh node3 'curl -fsS http://127.0.0.1:8081/api/v1/endpoints/statuses' \` |  |
| 513 | 85–87 | bash | 1 | 命令示例 | `ssh node3 'docker rm -f ecommerce-gatus'` |  |

## infrastructure/host-watchdog/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 514 | 11–14 | bash | 2 | 命令示例 | `./install.sh <ssh-host> --dry-run    # 先看会做什么,不改远端` |  |
| 515 | 28–31 | bash | 2 | 命令示例 | `ssh <ntfy-creds-host> 'grep -E "^NTFY_" /path/to/ntfy.env' \` |  |
| 516 | 55–59 | (none) | 3 | 文本/示意 | `名字=URL                        普通探测，期望 2xx/3xx` |  |
| 517 | 76–80 | ini | 3 | 源码摘录 | `HTTP_CHECKS="gorse=http://127.0.0.1:8088/api/health/ready \` | 无可核对标识 |
| 518 | 84–92 | bash | 7 | 命令示例 | `# 1. 正常路径 → rc=0` |  |

## infrastructure/observability/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 519 | 7–23 | text | 15 | 文本/示意 | `Tetragon PROCESS_EXEC / PROCESS_KPROBE` |  |
| 520 | 45–54 | bash | 8 | 命令示例 | `scp infrastructure/observability/ecommerce-security-alerts.yml node3:/tmp/ecommerce-securi` |  |
| 521 | 60–66 | bash | 5 | 命令示例 | `ssh node3 'curl -fsSG \` |  |
| 522 | 70–74 | bash | 3 | 命令示例 | `ssh node3 'curl -fsSG \` |  |

## infrastructure/tetragon/README.md

| # | 行 | 语言 | 行数 | 类别 | 首行 | 核对提示 |
|---|---|---|---|---|---|---|
| 523 | 28–38 | bash | 9 | 命令示例 | `kubectl apply --dry-run=server \` |  |
