# Ecommerce — Go 微服务电商

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](LICENSE) ![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white) ![Kubernetes](https://img.shields.io/badge/Kubernetes-GitOps-326CE5?logo=kubernetes&logoColor=white) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

Golang + React 的中大型电商实践项目：10 个后端微服务 + 自建网关 + pnpm monorepo 前端，
RBAC 三角色（消费者 / 商家 / 管理员），全链路云原生部署与可观测性。

本项目的组成使用(或部分使用)了本人其他的仓库：

1. 网关: https://github.com/lens077/ecommerce-gateway （本仓 `gateway/` 经 git subtree 同步）
2. 云原生基础设施部署: https://github.com/lens077/cloud-native-deploy
3. 微服务开发脚手架: https://github.com/lens077/go-connect-template-cli
4. 微服务项目模板: https://github.com/lens077/go-connect-template
5. 配置中心: https://github.com/lens077/config-center —— **已从本仓拆出，作为基础设施而非业务微服务**

## 技术栈

| 领域 | 选型 |
|---|---|
| 后端 | Golang、connect-go（兼容 gRPC）、Protobuf/Buf、sqlc、uber/fx、casdoor |
| 前端 | React、TypeScript、Connect-Web、pnpm workspace、vite-plus（vp）、Tauri（桌面壳） |
| 网关 | 基于 go-kratos/gateway 二次开发：集中鉴权（Casdoor + Casbin RBAC）、路由守卫、服务发现 |
| 数据 | PostgreSQL、Redis、Elasticsearch（搜索）、MinIO（对象存储） |
| 消息 | Kafka（规划中，当前事件走进程内 EventBus） |
| 注册/配置 | Consul（服务注册发现 + KV 配置源）、[config-center](https://github.com/lens077/config-center)（独立配置控制面，可选） |
| 编排/交付 | Docker、Kubernetes、Helm、GitHub Actions、Argo CD（GitOps） |
| 可观测性 | OpenTelemetry、VictoriaMetrics、Loki、Jaeger、Grafana、fluent-bit |

架构要点（详见 [`docs/design/`](docs/design/README.md) 与 [`STACK.md`](STACK.md)）：

- **API 契约先行**：google protobuf 定义前后端交互，`@bufbuild/buf` 生成代码，每个字段带 `buf.validate` 约束
- **后端分层**参考 go-kratos：biz（领域结构体）→ data（DB/MQ/ES 等中间件）→ service（proto 转换）→ server（fx 装配与注册发现）
- **通用能力下沉网关**：身份验证、授权、路由守卫集中在网关层，微服务不重复集成
- **配置源与业务配置分离**：服务先读一份很小的本地选择器（`file`/`consul`/`config_center`），再据此取完整业务 `Bootstrap`——这层间接是为了避开「配置中心的配置存在配置中心里」的自举环
- **CI/CD**：GitHub Actions 构建推送镜像并更新清单仓库版本号，Argo CD 监听清单仓库变更完成部署
- **可观测性**：fluent-bit 采日志，应用经 OTel SDK 发指标与链路；前端由 `@ecommerce/perf` 采 Web Vitals/长任务/接口耗时，经网关 `telemetry.v1` 转成 OTel histogram，与后端汇入同一套 VictoriaMetrics / Loki

## 仓库结构

| 目录 | 内容 |
|---|---|
| `backend/` | 10 个微服务（user / product / cart / order / payment / inventory / search / address / merchant / behavior），`api/` 放 proto 契约，`structcheck/` 是结构性 CI 门禁 |
| `frontend/` | pnpm monorepo：4 app（consumer / merchant / admin / desktop）+ 9 共享包，见 [`frontend/README.md`](frontend/README.md) |
| `gateway/` | 自建 API 网关（subtree 同步到独立仓），文档导航见 [`gateway/README.md`](gateway/README.md) |
| `context/` | AI/团队三层知识库（团队级 / 框架级 / 服务级），入口 [`context/INDEX.md`](context/INDEX.md) |
| `observability/` | 可观测性方法论与 Grafana 看板生成脚本 |
| `helm/`、`argocd-*.yml` | 部署清单与 GitOps 配置 |
| `docs/` | 架构与领域设计（`docs/design/`，按微服务分目录）、agents 配置（`docs/agents/`）、历史评审归档（`docs/reviews/`） |
| `.freeze/`、`scripts/` | 冻结验收集机制（改验收测试必须走审批），见 [`.freeze/README.md`](.freeze/README.md) |
| `.scratch/` | 进行中的 spec / issue（本地 markdown 工作流） |

> `backend/services/config/` 只剩 `configs/` 空壳——配置中心代码已迁出至独立仓库。

## 文档导航

| 文档 | 定位 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | AI 协作入口：硬规则 + 验收锚点命令（**改代码前先读**） |
| [`docs/design/`](docs/design/README.md) | 架构与领域设计真相源：按微服务分目录（platform/product/order/…），含拆分与删章记录 |
| [`STACK.md`](STACK.md) | 技术栈与工程约束：版本锁定、分层铁律、proto/sqlc 规则（真相源） |
| [`.service-matrix.yaml`](.service-matrix.yaml) | 服务拓扑事实表：注册名、网关前缀、依赖、Config Center 键（CI 强制对齐） |
| [`TODO.md`](TODO.md) | 实现进度真相源（当前实况以它为准） |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | 进度百分比与更新日志（与 TODO 的分工见 `context/harness-framework/progress-and-todo.md`） |
| [`docs/DEVOPS.md`](docs/DEVOPS.md) / [`observability/OBSERVABILITY.md`](observability/OBSERVABILITY.md) | DevOps 与可观测性的**目标态**设计 |
| [`docs/design/merchant/store-settings.md`](docs/design/merchant/store-settings.md) | 商家端产品需求草稿 |
| [`docs/design/config-center/design.md`](docs/design/config-center/design.md) | 配置中心设计存档（代码已迁出） |
| [`docs/SCAFFOLD.md`](docs/SCAFFOLD.md) | 换领域复用本仓工程体系的新项目生成规范 |
| [`context/harness-framework/graph-engineering.md`](context/harness-framework/graph-engineering.md) | 多闭环 AI 工作流方法论（冻结节点 + 锚点命令） |

## 先决条件

1. 后端：Go >= 1.26（`backend/go.mod`）；网关：Go >= 1.25（`gateway/go.mod`）
2. 前端：Node.js >= 22、pnpm 11
3. 数据库：PostgreSQL >= 12；缓存：Redis >= 6
4. 注册/发现：Consul

配置中心（[config-center](https://github.com/lens077/config-center)）是 10 个业务服务的
**必需启动依赖**。Consul 只负责服务注册发现，不再存储 Bootstrap。

如果想体验完整项目（K8s 部署 + 可观测性），还需：Docker、Kubernetes、ArgoCD、cert-manager、
OpenTelemetry Collector、VictoriaMetrics、Grafana、Loki、Jaeger、fluent-bit。

## 运行

### 后端

```bash
docker compose -f backend/infrastructure/postgres up -d
docker compose -f backend/infrastructure/redis up -d
docker compose -f backend/infrastructure/consul up -d
```

修改 `configs/config.yaml` 为你的 host 地址：

```yaml
data:
  database:
    host: "192.168.3.105"
  redis:
    host: "192.168.3.114"
```

启动后端微服务：

```bash
cd backend/services/<service>
make dev        # 读取被 gitignore 的 configs/source.dev.yaml，再从 Config Center 拉 Bootstrap
```

所有服务都由 `CONFIG_SOURCE_FILE` 指向 SDK selector，且 selector 的 `type` 必须是
`config_center`。selector 缺失、token 无效或远端 key 不存在时直接启动失败，不回退到
Consul KV。本地单测可显式使用 `CONFIG_SOURCE=file`。
>
> 依赖升级用 `go get github.com/lens077/config-center@v0.x.y` —— **`go mod tidy` 只增删不升级**，
> 版本仍是 `go.mod` 里钉住的那个。

### 配置中心（必需基础设施）

[config-center](https://github.com/lens077/config-center) 已从本仓拆为独立仓库，
按基础设施而不是业务微服务对待 —— 它不属于电商领域，而是所有服务的配置控制面
（同时带自己的 Web 控制台，原 `frontend/apps/config` 已随之迁出本仓）。

```bash
cd ../config-center
cp configs/config.yaml.example configs/config.yaml   # 该文件已 gitignore，密码/证书走本地挂载
CONFIG_FILE=configs/config.yaml make dev             # 监听 :30010
```

它在 Consul 注册为 `config-service` 供网关发现，但**从不从 Consul 读自己的 bootstrap** ——
把自身配置放进它自己会形成启动死锁，所以只能从本地文件自举。

把 Consul KV 里的配置灌进配置中心用本仓的 `backend/tools/config-seed`
（源取 KV 而非仓库里的 `configs/*.yml` —— 后者含密码、按硬规则不入库，每台机器都不一样）。

### 网关

```shell
OWNER=OWNER \
CASDOOR_URL=https://CASDOOR_URL \
DISCOVERY_DSN=consul://<consul-addr> \
DISCOVERY_CONFIG_PATH=<consul-service-config-file> \
POLICIES_FILE_PATH=./dynamic-config/policies/policies.csv \
MODEL_FILE_PATH=./dynamic-config/policies/model.conf \
USE_TLS=false \
USE_HTTP3=false \
HTTP_PORT=8080 \
go run cmd/gateway/main.go
```

验证（直连后端 / 经网关，鉴权路由需带 `Authorization: Bearer <token>`）：

```bash
curl -v -X POST http://localhost:4000/greet.v1.GreetService/SubmitAuth \
  --header 'Content-Type: application/json' --data-raw '{}'

curl -v -X POST http://localhost:8080/user.v1.UserService/UserProfile \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer <access-token>' --data-raw '{}'
```

### 前端

`frontend/` 是一个 pnpm workspace monorepo，4 个 app + 9 个共享包。
结构、分包原则、四层目录职责和工具链细节见 [`frontend/README.md`](frontend/README.md)。

| app        | 端口 | 说明                                     | 启动                |
| ---------- | ---- | ---------------------------------------- | ------------------- |
| `consumer` | 3000 | 消费者端：商品、购物车、下单、地址、订单 | `pnpm dev`          |
| `merchant` | 3002 | 商家端：店铺、商品、订单、报表           | `pnpm dev:merchant` |
| `admin`    | 3003 | 管理端：用户、商家、品类、报表           | `vp run admin#dev`  |
| `desktop`  | —    | Tauri 壳，套在上面三个之一外面           | `pnpm desktop`      |

共享包：`api`（Connect 传输层与拦截器）、`configs`、`constants`、`i18n`、
`perf`（Web Vitals 性能监控）、`tauri`（桌面端胶水）、`tracker`（行为埋点）、`ui`、`utils`。

```bash
cd frontend
pnpm i        # prepare 会跑 vp config 装 git 钩子（core.hooksPath 指向 frontend/.vite-hooks/_）
pnpm dev      # consumer，端口 3000
pnpm ready    # vp fmt && vp lint && vp run -r test && vp run -r build，提 PR 前跑它
```

工具链说明：vite-plus（`vp`）一个包同时提供 dev server、构建、测试(vitest)、lint(oxlint)、
格式化(oxfmt)、任务运行器和 git 钩子，所以没有 husky / biome / eslint / prettier；
提交信息由仓库根的 commitlint 校验。

## 效果截图

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

## 开发工作流

- **提交规范**：Conventional Commits + 可选 gitmoji，commitlint + vite-plus 钩子强制；
  提交前按改动类型更新对应真相源（进度 → `TODO.md`）。见 `context/team/git-commit.md`
- **提交前验收锚点**（详见 [`AGENTS.md`](AGENTS.md)）：
  `go build/vet`、`go test ./structcheck/...`、`go test -short ./...`、`pnpm ready`、
  `scripts/verify-freeze.sh --all`
- **网关 subtree 推送**：`git subtree push --prefix=gateway gateway main`；
  同步到主仓库：`git push main main`

## 贡献

欢迎通过 issue 反馈问题、通过 Pull Request 参与改进。

- **动手前先读 [`AGENTS.md`](AGENTS.md)**：硬规则 + 验收锚点，是本仓协作的地基。
- **改动流程**：fork → 建分支 → 修改 → 本地跑通验收锚点 → 提 PR：
  `go build ./... && go vet ./...`、`go test ./structcheck/...`、`go test -short ./...`、
  `pnpm ready`、`scripts/verify-freeze.sh --all`。
- **改动前查真相源，别凭记忆**：技术栈与分层约束看 [`STACK.md`](STACK.md)、服务拓扑看
  [`.service-matrix.yaml`](.service-matrix.yaml)、架构设计看 [`docs/design/`](docs/design/README.md)；
  按改动类型更新对应真相源（进度 → `TODO.md`，拓扑 → matrix，设计 → `docs/design/`）。
- **提交信息**：遵循 Conventional Commits，gitmoji 可选但带了就必须与 type 相符，
  由 commitlint 强制（细则见 `context/team/git-commit.md`）。
- **改动测试验收集需走审批**：`.freeze/` 冻结机制会拦截未刷新清单的测试改动。

## 许可

本项目采用 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)**
（署名—非商业性使用—相同方式共享）授权，详见 [`LICENSE`](LICENSE)：

- 可用于个人学习、技术交流与非营利研究；衍生作品须以相同或更严格的协议开源，并注明出处。
- **任何商业使用**（直接售卖、SaaS 集成、含付费内容或广告的平台等）须事先获得书面授权。
- 商业授权或闭源例外请联系版权方：<https://github.com/lens077>
