**English** | [简体中文](README.zh-CN.md)

# Ecommerce — Go Microservices E-commerce

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](LICENSE) ![Go](https://img.shields.io/badge/Go-1.27-00ADD8?logo=go&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white) ![Kubernetes](https://img.shields.io/badge/Kubernetes-Cilium%20Gateway%20API-326CE5?logo=kubernetes&logoColor=white) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

A B2B2C multi-vendor e-commerce project built with Go and React: 10 backend microservices, the control-tower platform control plane, and a pnpm monorepo frontend. The consumer app already carries part of the business flow; the merchant and admin apps are still mostly scaffolding. There is no standalone logistics or warehouse app yet, and no validated conclusion about million/ten-million-scale capacity.

This project uses (in whole or in part) my other repositories:

1. Gateway and config control plane: https://github.com/lens077/control-tower (sibling repo; gateway/config traffic already switched over)
2. Cloud-native infrastructure deployment: https://github.com/lens077/cloud-native-deploy
3. Microservice scaffolding CLI: https://github.com/lens077/go-connect-template-cli
4. Microservice project template: https://github.com/lens077/go-connect-template

## Tech stack

| Area | Choice |
|---|---|
| Backend | Go, ConnectRPC Go, Protobuf/Buf, Protovalidate, Fx, pgx, sqlc, goose, OpenTelemetry |
| Frontend | React, TypeScript, ConnectRPC/Protobuf-ES, pnpm workspace, vite-plus (`vp`), Tauri |
| Gateway / config | [control-tower](https://github.com/lens077/control-tower): Casdoor stateful session (BFF), Connect pass-through (H2C), Config Center; per [`docs/TECH.md`](docs/TECH.md) the target is OpenFGA relationship-based authorization replacing the legacy Casbin and removing the legacy JWT compatibility track; no retries, BBR/circuit breaking, or HTTP/3 by default |
| Data | node3 Pigsty PostgreSQL (Patroni HA + PgBouncer, UUIDv7 primary keys), Dragonfly (separate instances for session / cache / rate limiting; business-side lossy cache + BFF session), Silo (MinIO-based, finalized); search reads the stable Elasticsearch alias through `SearchCatalog`, with the curated projection moved from `products.search_catalog` via Debezium → Kafka → Elasticsearch Sink; Meilisearch runtime resources were fully retired on 2026-09-04 and CNPG has been cleaned up |
| Events | Backbone finalized as external, non-K8s Apache Kafka; the target domain-event chain is PostgreSQL Outbox → Debezium Outbox Event Router → Kafka → idempotent Inbox + DLQ, currently with zero business producers/consumers; NATS JetStream, the hand-written relay, and the search indexer have been retired |
| Registry / config | Service discovery finalized as K8s Service + CoreDNS; the pre (semi-production) environment uses Docker Compose service names, and the dev inner loop (mirrord/Okteto) is under evaluation; Consul is a legacy migration-period component; Config Center is the sole Bootstrap source for all 10 services |
| Edge / security | Cilium CNI/KPR/LB/Gateway API, cert-manager, ESO + Vault; default-deny NetworkPolicy and east-west identity for business services are still incomplete |
| Artifacts / delivery | Docker Buildx, GitHub Actions, Renovate; artifact split ([`docs/TECH.md`](docs/TECH.md) §7.1): TCR is the primary image registry (pulled directly by the cluster), Harbor stores Helm artifacts (OCI), GHCR is an optional mirror (images + Helm, pushed by CI depending on network); Kubernetes manifests, Helm; ArgoCD is currently disconnected |
| Observability | OpenTelemetry, Vector, VictoriaMetrics/Logs/Traces, Grafana, vmalert, Alertmanager; external alert notification is not yet closed-loop |
| Engineering tooling | vite-plus, oxlint/oxfmt, Vitest/Playwright, Buf breaking, structcheck, verify-context/canary, commitlint |

Architecture highlights (the source of truth for technical architecture / technology choices / infrastructure is [`docs/TECH.md`](docs/TECH.md); business design lives in [`docs/design/`](docs/design/README.md); engineering constraints are in [`STACK.md`](STACK.md)):

- **API contract first**: Google Protobuf defines the frontend/backend contract, `@bufbuild/buf` generates code, and every field carries `buf.validate` constraints
- **Backend layering** modeled on go-kratos: biz (domain structs) → data (DB/cache/search/event/object) → service (proto conversion) → server (fx wiring and registration/discovery)
- **Entry capabilities centralized**: Casdoor stateful session validation, authorization (target OpenFGA; legacy Casbin / legacy JWT pending removal), routing, timeouts, and trusted identity headers are handled by the control-tower gateway; services remain responsible for data ownership and domain permissions
- **Config source separated from business config**: each service first reads a tiny selector, then fetches the full `Bootstrap` from Config Center; there is no Consul KV fallback
- **Delivery status**: GitHub Actions builds on semver tags, pushes to both TCR and GHCR, then writes the Helm tag back; ArgoCD currently has no Application, so deployment still goes through `backend/services/*/deploy/`
- **Observability**: Vector collects container logs; applications emit the three pillars through the OTel SDK; VictoriaMetrics/Logs/Traces and Grafana on node3 aggregate the queries
- **Capacity boundary**: scale must be accepted with fixed datasets, k6 scripts, resource quotas, latency/error-rate results, and failure-recovery evidence; no million/ten-million-scale commitment has been established yet

## Repository layout

| Directory | Contents |
|---|---|
| `backend/` | 10 microservices (user / product / cart / order / payment / inventory / search / address / merchant / behavior); `api/` holds proto contracts, `structcheck/` is the structural CI gate |
| `frontend/` | pnpm monorepo: 4 apps (consumer / merchant / admin / desktop) + 9 shared packages, see [`frontend/README.md`](frontend/README.md) |
| `context/` | Three-layer AI/team knowledge base (team / framework / service level), entry point [`context/INDEX.md`](context/INDEX.md) |
| `helm/`, `argocd-*.yml` | Helm/GitOps descriptions pending repair; the actual deployment state is defined by each service's `deploy/` |
| `docs/` | Technical source of truth (`docs/TECH.md`), architecture and domain design (`docs/design/`, one directory per microservice), **TODO details** (`docs/todo/`, categorized by the TECH.md structure), observability methodology and dashboard scripts (`docs/observability/`), agent configuration (`docs/agents/`), immutable history archive (`docs/progress-archive/`), research reports (`docs/reports/`) |
| `scripts/` | Acceptance anchors and gate scripts (verify-quick / verify-context + canary / lint-baseline / harness-scars / gen-third-party-notices) |
| `.scratch/` | In-progress specs / issues (local markdown workflow) |

> The gateway and config center are both hosted by the sibling repo control-tower: this repo's old `gateway/` directory was deleted on 2026-08-24
> (history preserved at tag `backup/pre-control-tower-20260823`), and the former `backend/services/config/` directory has been removed.
> The `.freeze/` frozen acceptance-set mechanism was removed entirely on 2026-08-24 (an always-green fake gate, see evolution-log).

## Documentation map

| Document | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | AI collaboration entry point: hard rules + acceptance anchor commands (**read before changing code**) |
| [`docs/TECH.md`](docs/TECH.md) | **Source of truth for technical architecture, technology choices, and infrastructure** (finalized 2026-08-28): selection overview, traffic topology, collaboration model, microservice principles, auth and observability systems, implementation roadmap, and engineering red lines; where other documents conflict, this one wins |
| [`docs/design/`](docs/design/README.md) | Source of truth for business and domain design: one directory per microservice (platform/product/order/…), including split and chapter-removal records |
| [`production-scale-goal.md`](docs/design/platform/production-scale-goal.md) | Million/ten-million-scale production goals, current stack boundaries, evidence gates, phased roadmap, and definition of done |
| [`STACK.md`](STACK.md) | Engineering constraints and current boundaries: version pinning, layering rules, proto/sqlc rules; `docs/TECH.md` wins on technology-choice conflicts |
| [`.service-matrix.yaml`](.service-matrix.yaml) | Service topology fact table: registration names, gateway prefixes, dependencies, Config Center keys (enforced by CI) |
| [`TODO.md`](TODO.md) | **The single source of truth for progress and TODOs**: global priority view + categorized index; every TODO change must land here |
| [`docs/todo/`](docs/todo/README.md) | TODO details categorized by the `docs/TECH.md` structure (observability / event-driven / auth / infrastructure…); indexed by `TODO.md` |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | **Domain glossary**: 189 B2B2C e-commerce and platform terms (SPU/SKU/product snapshot/order splitting/fulfillment/OrderGroup/Saga Manager/PaymentIntent/StockLedger…). Look here first when you meet an unfamiliar business term while reading design docs or writing proto |
| [`docs/TECH-RADAR.md`](docs/TECH-RADAR.md) | CNCF Landscape evaluation; any new infrastructure must be triggered by quantified requirements, capacity, or failure evidence |
| [`PRODUCT.md`](PRODUCT.md) / [`DESIGN.md`](DESIGN.md) | Product definition and the "Lantern Market" visual design system (color/typography/spacing tokens), the source of truth for the frontend design workflow (impeccable) — same name as the old, since-split architecture DESIGN.md, but a different document |
| [`docs/DEVOPS.md`](docs/DEVOPS.md) / [`observability/OBSERVABILITY.md`](docs/observability/OBSERVABILITY.md) | **Target-state** design for DevOps and observability |
| [`docs/design/merchant/store-settings.md`](docs/design/merchant/store-settings.md) | Competitive research on Shopline store settings; trade-offs and the merchant MVP route are in [`roadmap.md`](docs/design/merchant/roadmap.md) in the same directory |
| Gateway and config-plane design | Moved with the code to the sibling repo control-tower (`../control-tower/docs/design/`); no copy is kept in this repo |
| [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md) | Spec for generating a new project that reuses this repo's engineering system in a different domain |
| [`context/harness-framework/graph-engineering.md`](context/harness-framework/graph-engineering.md) | Multi-loop AI workflow methodology (frozen nodes + anchor commands) |

## Prerequisites

1. Go: the version is defined by the `go` directive in `backend/go.mod` (not duplicated here to avoid drift; the gateway lives in the sibling repo control-tower)
2. Frontend: Node.js >= 22, pnpm 11
3. Database: PostgreSQL 18 (the primary is currently hosted by node3 Pigsty); Dragonfly serves lossy business cache and the control-tower BFF session. Domain locks, idempotency keys, and inventory truth must be anchored in PostgreSQL
4. Registry / discovery: Consul (**finalized for retirement → K8s Service + CoreDNS, Docker Compose service names in dev**, see [`docs/TECH.md`](docs/TECH.md) §10.2; the four-step migration is in TODO; still required at runtime until the migration completes)

Config Center (the config service of the sibling repo [control-tower](https://github.com/lens077/control-tower)) is a
**required startup dependency** for all 10 business services. Consul only handles service registration/discovery and no longer stores Bootstrap.

For the full environment you also need Docker, Kubernetes, Cilium Gateway API, cert-manager, ESO/Vault, plus external OpenTelemetry Collector, VictoriaMetrics, VictoriaLogs, VictoriaTraces, Vector, Grafana, vmalert, and Alertmanager. ArgoCD is installed but currently has no Application, so it cannot be treated as a deployment prerequisite.

## Running

### Backend

```bash
docker compose -f backend/infrastructure/postgres/compose.yaml up -d
docker compose -f backend/infrastructure/redis/compose.yaml up -d
docker compose -f backend/infrastructure/consul/compose.yaml up -d
```

Infrastructure addresses used by business services are configured in Config Center, not in repo YAML. The search service reads `search.catalog` and only touches the stable alias. The CDC connector, Elasticsearch mapping, full rebuild, and disaster-recovery procedures are maintained in the sibling repo `postgres-kafka-es-streaming-pipeline`; do not resurrect the retired relay or indexer worker in this repo.

Start the backend microservices (`backend/compose.yaml` brings all of them up at once):

```bash
cd backend/services/<service>
make dev        # reads the gitignored configs/source.dev.yaml, then pulls Bootstrap from Config Center
```

Every service is pointed at the SDK selector through `CONFIG_SOURCE_FILE`, and the selector's `type` must be
`config_center`. A missing selector, an invalid token, or a missing remote key fails startup immediately with no
fallback to Consul KV. Local unit tests may explicitly use `CONFIG_SOURCE=file`.
>
> The config SDK ships with the control-tower module. Upgrade with `go get github.com/lens077/control-tower@v0.x.y`;
> **`go mod tidy` only adds/removes dependencies and never upgrades a pinned version on its own.**

### Config Center (required infrastructure)

Config Center is now hosted by `services/config` in the sibling repo [control-tower](https://github.com/lens077/control-tower); the old standalone config-center repo is retired. The cluster namespace and Deployment keep the `config-center` name, but the images are already `control-tower-config` / `control-tower-config-web`.

```bash
cd ../control-tower
scripts/dev-local.sh config   # generates a 0600 temporary config from the cluster Secret, deleted on exit
make verify                   # build + buf lint + go vet + test -race
```

The config service must bootstrap from a local file or a Kubernetes Secret; it cannot store its own sole startup config inside itself. The historical Consul KV has been deleted; `backend/tools/config-seed` is kept only as a migration/audit tool.

### Gateway

The gateway code is also in `../control-tower`. The local gateway uses the file resolver and port forwarding to avoid Consul returning Pod IPs that a Mac cannot route to:

```bash
cd ../control-tower
scripts/dev-local.sh gateway
```

Web login establishes an httpOnly cookie session via `/auth/login → Casdoor → /auth/callback`; Tauri uses a session header; legacy clients may still use a bearer JWT during the migration period. Backend verification should go through the gateway first; direct connections are only for explicit internal debugging and cannot be used to prove the production security boundary.

### Frontend

`frontend/` is a pnpm workspace monorepo with 4 apps + 9 shared packages.
Structure, package-splitting principles, the four-layer directory responsibilities, and toolchain details are in [`frontend/README.md`](frontend/README.md).

| app        | Port | Notes                                     | Start                |
| ---------- | ---- | ----------------------------------------- | -------------------- |
| `consumer` | 3000 | Products / cart / address partially usable; the order / payment / inventory loop is not complete | `pnpm dev` |
| `merchant` | 3002 | Merchant routes and login shell; very little business API wiring | `pnpm dev:merchant` |
| `admin` | 3003 | Admin routes and login shell; very little business API wiring | `vp run admin#dev` |
| `desktop` | — | Tauri 2 shell that can wrap consumer or merchant | `pnpm desktop` / `pnpm desktop:merchant` |

Shared packages: `api` (Connect transport and interceptors), `configs`, `constants`, `i18n`,
`perf` (Web Vitals performance monitoring), `tauri` (desktop glue), `tracker` (behavior tracking), `ui`, `utils`.

```bash
cd frontend
pnpm i        # prepare runs vp config to install git hooks (core.hooksPath points to frontend/.vite-hooks/_)
pnpm dev      # consumer, port 3000
pnpm ready    # vp fmt && vp lint && vp run -r test && vp run -r build; run it before opening a PR
```

Toolchain note: vite-plus (`vp`) is a single package that provides the dev server, build, test (vitest), lint (oxlint),
formatting (oxfmt), task runner, and git hooks, so there is no husky / biome / eslint / prettier;
commit messages are validated by commitlint in the frontend workspace, configured in `frontend/commitlint.config.mjs`.

## Screenshots

- CI:
  ![img_3.png](images/img_3.png)
- CD:
  ![img_2.png](images/img_2.png)
- Register/discover:
  ![img.png](images/img.png)
- Trace:
  ![img_1.png](images/img_1.png)
- Log:
  ![img_4.png](images/img_4.png)
- Metrics:
  ![img_5.png](images/img_5.png)

## Development workflow

- **Commit convention**: Conventional Commits + optional gitmoji, enforced by commitlint + vite-plus hooks;
  before committing, update the source of truth that matches the change type (progress → `TODO.md`). See `context/team/git-commit.md`
- **Pre-commit acceptance anchors** (details in [`AGENTS.md`](AGENTS.md)): run `scripts/verify-quick.sh` first by default; if the service matrix changed, also run `cd backend && go test -count=1 ./structcheck/...`; if context, the design index, or STACK changed, also run `scripts/verify-context.sh`
- **Cross-repo changes**: gateway/config code is committed separately in `../control-tower`; route templates and this repo's structcheck contract must be upgraded in the same version

## Contributing

Issues and pull requests are welcome.

- **Read [`AGENTS.md`](AGENTS.md) before you start**: hard rules + acceptance anchors are the foundation of collaboration in this repo.
- **Change flow**: fork → branch → change → run the acceptance anchors from `AGENTS.md` that match your change type → open a PR; the default entry point is `scripts/verify-quick.sh`.
- **Check the source of truth before changing, don't rely on memory**: tech stack and layering constraints in [`STACK.md`](STACK.md), service topology in
  [`.service-matrix.yaml`](.service-matrix.yaml), architecture design in [`docs/design/`](docs/design/README.md);
  update the matching source of truth for your change type (progress → `TODO.md`, topology → matrix, design → `docs/design/`).
- **Commit messages**: follow Conventional Commits; gitmoji is optional but, when present, must match the type,
  enforced by commitlint (details in `context/team/git-commit.md`).
- **Docs and gate changes**: after modifying `context/`, `docs/design/README.md`, `STACK.md`, or the gate scripts, run `scripts/verify-context.sh`; if you changed the gate itself, also run the canary.

## License

This project is licensed under **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)**
(Attribution-NonCommercial-ShareAlike); see [`LICENSE`](LICENSE):

- Personal learning, technical exchange, and non-profit research are permitted; derivative works must be released under the same or a stricter license, with attribution.
- **Any commercial use** (direct sale, SaaS integration, platforms with paid content or advertising, etc.) requires prior written permission.
- For commercial licensing or closed-source exceptions, contact the copyright holder: <https://github.com/lens077>
