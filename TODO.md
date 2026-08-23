# 项目实现进度与待办

> 依据 `README.md` 的目标与 `docs/design/` 的架构设计，对照当前代码实现整理。
> 图例：✅ 已完成　🟡 部分完成（有核心能力，仍有缺口）　⬜ 未开始

---

## 一、实现进度对照

### 1. 基础设施与工程化

| 项目 | 状态 | 说明 |
|------|------|------|
| 容器化（Docker） | ✅ | 10 个服务的 Makefile/compose 已对齐（见下「构建与部署清单对齐」）；`make docker-deployx` 多架构构建+推送实跑通过 |
| Kubernetes 编排 | 🟡 | `deploy/{dev,prod}` 已重写并过 `kubectl apply --dry-run=client`；`helm/`、`application-vpa.yml` 已有，集群级压测/弹性未验证 |
| GitOps（ArgoCD） | 🟡 | `argocd-app.yml`、`argocd-proj.yml`、`argocd-repo.yml`（LAN 代理克隆 GitHub）已配置。**2026-08-07 从 cart 单服务扩到 10 服务全量**：补齐 behavior/product 两个缺失的 chart（matrix 的 helm 例外已清空，四条部署入口 10/10 全覆盖）；umbrella `helm/values.yaml` 按脚本重生成，口径统一为「SERVICE_NAME = matrix 的 discovery、端口 = 各服务 `configs/pre.yml` 的 `server.addr`」，并修掉 8 个服务 SERVICE_NAME 带 `-v1` 后缀的老写法（注册名与网关 `discovery:///<name>` 对不上，服务活着但永远路由不到，cart 已踩过）。2026-08-08 已把当时的 `CONSUL_PATH=pre.yml` 全部替换为 Config Center selector Secret。`imagePullSecrets` 进 library chart（**必须挂 `global`**：subchart 只看得见自己那层加 global，写成顶层渲染出来一个都没有，实测过），替代此前 `kubectl patch serviceaccount default` 那处不在 Git 的手工状态；因每个 chart 内嵌一份打包的 library tgz，改 library 后必须对 10 个 chart 全部重跑 `helm dependency update`，否则旧 tgz 的 define 会覆盖新的。各服务的 `*-db-secret` 已关闭（`secret.enabled: false`）：全仓无任何代码读 `DB_SOURCE`、deployment 模板也没有 `envFrom`/`secretKeyRef`，凭据实际来自 Config Center，开着只是把明文口令重复铺进集群——**但该口令已在 git 历史里，需轮换** |
| 2026-08-19 集群重建后 GitOps 重新接线 | ✅ | 集群 08-16 重建后 ArgoCD 里 0 个 Application、`ecommerce` ns 不存在，CI 回写的 `sha-b482be9` 没有落点。本轮从数据面一路接回，**8/10 服务 Running 且 healthz 全绿**。①**数据面换血**：Pigsty(192.168.3.210) 已关机，10 份 `configs/pre.yml` 与 config-center 的 `configs/pre.yaml` 全部切到集群内 —— Postgres → CNPG `pg-main-rw.postgresql.svc`（`verify-full`，库 `ecommerce` 用 CNPG `Database` CR 声明式创建、owner=app）、Redis → `redis.redis.svc:6379`（**Service 端口 6379 但后端是容器 6380 的 TLS 口，必须开 TLS**，明文会被 reset）。旧值整块注释保留可回滚，文件本身是 gitignored 的本地状态，备份在 `~/lens077/ecommerce-config-backup-20260819/`。②**Config Center 重建**：集群里原本没有它（`config-center` ns 不存在），服务却硬依赖它自举（selector 只认 `config_center`，无 file/KV 回退）→ 跑 `config-center/scripts/deploy-k8s.sh`（K8S_ENV=pre），机器令牌新生成存 `creds/config-center-service-token`；`config.entry`/`config.revision` 两张表用仓内 `internal/data/schema/schema.sql` 建到 `ecommerce` 库并给 app 授权。**10 份 pre bootstrap 用 SQL 直灌**（写接口只认 Casdoor 管理员 Bearer，机器令牌是只读的；重建恢复场景没有交互式登录，故直连 DB 并同时补 revision 保住 append-only 不变量），随后用机器令牌走 `config.v1.ConfigService/GetKey` 验证读回。③**三项前置**：`ecommerce-config-source-pre`（10 份 selector，指向 `config-center.config-center.svc:30010`）、`tcr-pull-secret`、`pg-ca-cert`（改用 CNPG 的 CA）。④**接回**：apply `argocd-{repo,proj,app}.yml` → Application `ecommerce` Synced。**验证**：cart 镜像确认为 `sha-b482be9`，healthz `{"postgres":"ok","redis":"ok"}`；config-center 自身 healthz 同样双 ok。**遗留**：address/search 两个服务 CrashLoop，根因是硬依赖已退役的 Elasticsearch（`elasticsearch-es-http.elastic-stack.svc` 不存在），代码里尚无 Meilisearch 适配 —— 属下方「搜索迁移」未开工项，非本轮引入；config-center 的 OTel 端点写的是 `otel-collector.observability` 而集群里在 `opentelemetry` ns，只影响遥测上报不影响功能 |
| 2026-08-19 鉴权链路改造：前端 PKCE 直连 + 网关身份头加固 | 🟡 | **起因**：前端每次启动都要先起 user 服务才有 JWT。查下来 user 服务在登录里**只是一层 40 行的 code→token 代理**（`backend/services/user/internal/data/user.go:35` 调 `GetOAuthToken` 后原样返回，不建本地用户、不加业务 claim），而网关验签用的是静态公钥（`JWT_PUBKEY`，忽略 `kid`）、**不关心令牌从哪来** —— 这一跳除了制造启动依赖没有任何收益。实测确认 Casdoor 支持 PKCE（discovery `code_challenge_methods_supported: ["S256"]`）。**已落地五项**：①**网关无条件剥离入站 `x-md-global-*` 再按验签重注入**（`middleware/jwt/jwt.go` 的 `stripInboundIdentity`，**在白名单判断之前**）—— 此前只 Set 不 Del，那 10 条免鉴权路径上客户端自带的 `x-md-global-user-id` 会原样到下游，而 `behavior.go:86-90` 明确把它当可信身份，等于任何人可自称任何人；补了回归测试 + 反证（去掉剥离即红）。②**RBAC 角色缓存接 Redis**（`middleware/rbac/rolecache.go`，L1 进程内 + L2 Redis，缓存故障一律降级回源、只缓存成功结果、独立 200ms 超时）—— 此前 `getUserRoles` 读缓存那三行是注释掉的，每个受保护请求都跨公网打一次 Casdoor。**缓存刻意放集群内而非 Casdoor 同机**：网关在局域网、Casdoor 在公网，放对面等于读缓存也跨公网。③**前端换 PKCE 直连**（`packages/configs/src/auth/pkce.ts`），删掉 `UserService.signIn` 调用；`client_secret` 从此不出现在浏览器。④**令牌移出 localStorage 改内存态**（`packages/utils/src/tokenStore.ts`）+ **`prompt=none` 隐藏 iframe 静默续期**（`auth/session.ts`：到期前 60s 定时续、冷启动恢复、401 先续再重放），access/refresh 双双不落盘。⑤**桌面端 state 改随机并统一校验** —— 原先写死 `appName`，等于没有 CSRF 防护；现与 Web 共用 `buildAuthorizeUrl`，state/PKCE/redirect_uri 三者一起存，回调侧 `exchangeCode` 统一比对。另修：前端 `serverUrl` 从 `http://node1:8000`（明文 HTTP + 裸 IP，且该端口实测已关闭 → 登录跳转整条是坏的）改为 `https://casdoor.apikv.com`；网关 CORS 补 `https://shop.apikv.com`。**验证**：gateway `go build` + `go test ./middleware/...` 全绿（含新增 5 个测试），前端 `tsc --noEmit` + `vp lint` 全绿。**遗留（需在 Casdoor 控制台点，见下方待办）**：`redirectUris` 未补正式来源、`enableSigninSession` 仍为 false（**静默续期的前提，不开则每次刷新页面都要整页跳转**）；`shop.apikv.com` 的 Pangolin 暴露依赖先重装 newt（新集群无 `pangolin` ns，k8s site 当前不通） |
| CI/CD（GitHub Actions） | 🟡 | **2026-08-07 后端 CI 重写为「一份模板 + 矩阵分发」**：`service-ci.yml`（workflow_call 可复用模板：build/vet/test(-race)+structcheck → buildx 多架构镜像推 TCR，tag=`sha-<7位>` 不可变 + `dev` 便利 tag，GHA 缓存按服务隔离）+ `backend.yml`（入口：push main 按路径触发；detect 从 `.service-matrix.yaml` 查服务清单、diff 算受影响服务，`api/pkg/constants/go.mod` 等共享路径→全量；矩阵 fan-out；构建后单个 update-manifests job 一次性回写 `helm/values.yaml` 各服务 `image.tag` 并以 `[skip ci]` 提交，形成 GitOps 闭环）。替换掉 2025-11 的 tag 触发全后端单镜像旧链路。secrets 已配：`TCR_USERNAME`/`TCR_PASSWORD`/`MANIFEST_PUSH_TOKEN`（admin PAT，因 main 分支保护 GITHUB_TOKEN 推不动；**待办：换成细粒度 PAT**）。`argocd-app.yml` repoURL 已从 GitLab 改指 GitHub（CI 回写与 ArgoCD 监听必须同仓才闭环，改动需 `kubectl apply` 后生效）。**frontend.yml 仍是旧的**；本地已实测：cart 镜像构建 + 推 TCR 成功。**同日 cart GitOps 端到端跑通**：workflow_dispatch(services=cart) → test/image/update-manifests 全绿（首跑 image 21m29s，冷缓存+双架构）→ ArgoCD ApplicationSet（首次 apply，`argocd-{proj,app,repo}.yml`）Synced/Healthy → cart pod Running（DB/Redis/Consul 注册 TTL passing，LB 192.168.3.115:30006 Connect 响应正常）。集群侧配套：CoreDNS 补 `pg-dev/dragonfly.dev.test` hosts 映射、ArgoCD repo 走 LAN 代理克隆 GitHub。**关键经验（已沉淀 `context/team/local-env.md`）：KV 的 dev.yml 只能开发机用（`*.dev.test` 域名），k8s 必须用 pre.yml（集群内 svc 域名）**。**2026-08-07 同日扩到全量并双注册表发布**：`service-ci.yml` 一次 buildx 同时推 TCR 与 GHCR（`ghcr.io/lens077/<svc>`，需 `packages: write`——被调用的 workflow 只能收窄不能放大调用方令牌，故 `backend.yml` 的 ci job 也要显式给）；**集群侧刻意仍指 TCR**（LAN 内拉 ghcr.io 要过代理，ArgoCD 克隆 GitHub 已吃过这个亏），GHCR 那份是给公网/外部消费的。便捷部署见下「部署入口一致性」行的 `scripts/deploy-k8s.sh`。**全量端到端已跑通（2026-08-07，run 31187091291 / `sha-1ec5466`）**：10 服务 test+image 全绿 → update-manifests 一次回写 10 个 tag → ArgoCD Synced/Healthy → **10/10 Pod Running、10/10 在 Consul 注册且健康检查 passing**。GHCR 的 10 个 package 匿名可拉（public 仓库经 Actions 推送自动继承可见性，无需手工改；`gh` 的 PATCH 可见性接口不存在，也不需要）；**TCR 仍是私有，由你在控制台改**。集群侧 `kubectl patch serviceaccount default` 那处手工 pull secret 已删除，重启 behavior Pod 验证仅靠 chart 声明即可拉到私有镜像。**首跑发现并修掉的真问题**：十份 Dockerfile 只 COPY 了 `services/`/`api/`/`constants/`，缺 `pkg/` —— `product`/`behavior` 直接 import `backend/pkg/gorse`，在容器里从来编译不过（behavior 因此镜像仓库里一个 tag 都没有）；另修正后的 `inventory` registry 把 Consul 自己的地址登记成了服务端点（代码已修，本轮换新镜像后注册地址恢复正常） |
| 注册发现（Consul） | 🟡 | Consul 仅保留注册发现；应用配置统一由独立 Config Center 下发。**2026-08-21 本地默认值翻转（工作区待提交）**：10 份服务 Makefile `dev` 目标与 9 份 compose.yaml（behavior 无 compose）的 `CONSUL_ENABLED` true→false，本地起服务默认不再注册 Consul，需要注册发现时显式开启；config-center 仓 Makefile 同步同一翻转。helm/裸清单等集群部署入口未动 |
| 提交规范（commitlint + vite-plus 钩子） | ✅ | 仓库根 `package.json` 只装 `@commitlint/cli` + `config-conventional`，规则在 `commitlint.config.mjs`：Angular 十一类 type + 可选 gitmoji（带了就必须与 type 相符）+ subject 末尾禁标点。钩子由 **vite-plus** 安装（`frontend/package.json` 的 `prepare: vp config` → `core.hooksPath = frontend/.vite-hooks/_`），husky 已删；`core.hooksPath` 是仓库级设置，后端 Go 的提交同样受管。**此前从 2025-11-04 到 2026-08-02 整整九个月一次都没生效**，层层叠了五处：①`.husky/commit-msg` 里放的是**创建钩子的那条安装命令本身**（`echo "..." > .husky/commit-msg`），每次提交只把自己重写一遍就退出 0 ②它写出的那行里 `–` 是全角连字符、`--no` 是 pnpm 11 已废弃的 exec 参数 ③`@commitlint/cli` 从未出现在任何 devDependencies ④`apps/consumer/.commitlintrc.cjs` 的 `rules: {}` 是空的且无 `extends` ⑤2026-03-19 迁移到 vite-plus 时 `vp config` 的接管守卫看到 `frontend/.husky/_` 选择 skipping，`core.hooksPath` 从此指着一个已删除的目录。2026-08-02 修复并用四条故意写错的消息验证过拦截；cz-git 从未真正引入，不再提 |
| 代码规范（oxlint + oxfmt，vite-plus 内置） | 🟡 | biome 在 2026-03 迁移时已被 vite-plus 自带的 oxlint + oxfmt 取代。`vp lint` / `vp fmt` 此前因四个成因全挂（tanstackRouter 相对路径、`typeAware` 写在 app 层、九个 tsconfig 的 `baseUrl` 被 TS7 判为 Invalid、`vite-plus-core` 装了 0.1.24/0.2.7 两份导致类型重复），2026-08-02 修好，`pnpm ready` 端到端可跑；全仓跑过一次 oxfmt。**2026-08-08 实测订正：那 48 条 warning 早已清干净**——注入 `debugger`/`eval`/类型错误确认 `vp lint` 真能拦（退出码 1），清理探针后全仓 0 告警；`go vet ./...` 同样干净。此前「48 条未清」的记录已过期，而正是这条过期记录让门禁一直不敢开。已接 `scripts/lint-baseline.sh` 基线棘轮（见下「静态检查基线棘轮」行）。**仍缺：前端 lint 未进 CI**——`frontend.yml` 是纯部署 workflow，没有 lint/test job（Playwright 还是注释掉的），需随该 workflow 重写一并补 |
| API Protobuf 输入约束（Protovalidate） | ✅ | 2026-08-07 完成 `backend/api/` 下 13 个 API 包、14 份源 proto 的 `buf.validate` 覆盖。按对应 SQL 类型/长度/精度补齐 UUID、正整数与 `int64` 上限、字符串长度、枚举、批量大小、金额小数、有限浮点数等规则；购物车平行数组与埋点批次总数用 message CEL 保证跨字段一致性。Casdoor 外部 DTO 无本地 SQL，采用兼容优先的宽上限，只阻断异常放大输入。未改字段号、名称和类型，`buf breaking` 对 main 通过；已重新生成 Go/TypeScript 代码并同步 consumer 副本，新增真实 Protovalidate 正反例测试。验收：`buf build`、`go test ./api/...`、`go build ./...`、`go vet ./...`、`go test -short ./...`、`pnpm ready`、`verify-freeze --all` 全绿；`buf lint` 只剩包目录、历史命名等存量兼容性问题 |
| 结构性门禁（`backend/structcheck`） | 🟡 | 2026-08-07 新增，随 `go test ./...` 进 CI。五项检查：`.service-matrix.yaml` ↔ `backend/services/` 目录双向对齐（`config` 撞名进程列为已知例外）、matrix 内部一致性（discovery/gateway_prefix 非空唯一、depends_on 指向已知服务）、matrix ↔ 网关实际接线（`gateway/configs/config.yaml` 的 endpoint path 与 `discovery:///` target 双向核对）、10 服务 `internal/pkg` 同构性（同名文件**原文或归一化服务名后**必须字节一致，两把尺子任一一致即算同构）、10 服务配置加载生产文件集与 cart 基线一致（补上通用检查会忽略单一持有者文件的盲区）。**实测存量漂移 11 个文件**已记入 `homogeneity_baseline.txt`（棘轮：新漂移即红，收敛后删行），最严重的是 `registry/consul.go` 8 个变体——address 的 Consul check 空指针防护没同步到其余服务、`log/log.go` 4 个变体。**同日修掉一个自身误报**：原先只按归一化比对，服务名恰好是普通单词时（`address` 既是服务名又是配置项键名 `address:`）替换只在该服务自己的副本里生效，逐字节相同的 3 个 config 测试文件被误判为漂移；本轮 `config/source_test.go` 已收敛并从基线删除。门禁已用「注入一处漂移」实测确认仍会报红。**待办：按基线逐个文件收敛（挑对的版本同步到全部服务），清空后删除基线文件** |
| 部署入口一致性 | 🟡 | 2026-08-07 将 `.service-matrix.yaml` 的 10 服务清单扩展为部署覆盖真相源，新增 `TestDeploymentListsMatchMatrix` 双向核对 `backend/Makefile`、`backend/compose.yaml`、`helm/values.yaml` 与各服务 `deploy/{dev,prod}`，缺口只能通过带原因的 matrix 例外放行；独立 workflow 覆盖 Helm、根 Makefile/compose 等原后端矩阵无法识别的变更。移除已拆仓的 config、补回 behavior 的 Make/Compose/裸清单入口，聚合目标改为收集全部失败后汇总，避免中途失败让后续服务静默漏部署；18 份既有裸清单显式固定 `ecommerce` namespace，cart 补齐 ClusterIP、命名端口、HTTPRoute/Certificate/VPA，behavior 补齐 dev/prod Deployment/Service/VPA。**2026-08-07 补齐**：behavior/product 的 chart 已建，matrix 的 helm 例外清空，四条入口 10/10 全覆盖；新增 `scripts/deploy-k8s.sh`（形状参照 config-center）把「集群里不在 Git 的前置状态」脚本化——namespace、`tcr-pull-secret`（凭据取自本机 docker 凭据助手，不落盘不进 Git）、`pg-ca-cert`，再按 `DEPLOY_MODE` 走 helm 渲染 apply 或只 apply ArgoCD 清单；`backend/Makefile` 新增 `deploy` / `deploy-argocd` / `deploy-status` 三个入口，`make deploy DRY_RUN=1` 对着真集群 server-side dry-run 验证过（10 服务全部 created）。**2026-08-08 补齐卸载入口**：`make un-deploy` 复用同一份 Helm 渲染结果删除 10 个 Deployment + 10 个 Service，保留 namespace 与前置 Secret，支持 `DRY_RUN` / `KUBE_CONTEXT`；首次实跑暴露 macOS Bash 3.2 在 `set -u` 下展开空数组会直接退出，已改成始终非空的 kubectl 子命令数组并沉淀兼容规则。**同日修复 Helm/迁移门禁**：umbrella `Chart.yaml` 显式声明 10 个已有 subchart dependency 与各自 `enabled` condition，`helm lint` 通过；新增 `TestDeploymentsUseConfigCenterSelector` 逐服务守住 Helm 与 20 份裸 Deployment 的 selector 路径、Secret、只读挂载，并禁止 `CONFIG_SOURCE`/`CONSUL_PATH` 回流；修复 `DRY_RUN=1` 仅约束最终 Helm apply、却仍真实写 namespace/TCR/PG CA 三类前置资源的问题，所有写路径统一复用 `apply [--dry-run=server]`。**待办：cart 的直连 HTTPRoute 绕过网关鉴权，prod 默认不得应用，启用前须接入 ext_authz 等鉴权** |
| 统一可执行 runbook（`context/team/runbook.md`） | ✅ | 2026-08-07 新增，把「规则与限制」命令化,供 Codex 等 CLI 直读直跑:动手前必读的限制(拓扑查 matrix、10 服务同构、proto 先读设计、凭据不入库、不可逆动作)+ 提交前验收锚点(`go build/vet`、`structcheck -count=1`、`go test -short`、`pnpm ready`、`verify-freeze`)+ 冻结/双审/提交流程。**不是新真相源,冲突以 `context/`/`.service-matrix.yaml`/`TODO.md` 为准**。Codex 只自动读 AGENTS.md,故两份 AGENTS.md(根+ecommerce,已同步)内联了 5 条锚点命令 + 指针,并挂进 `context/team/INDEX.md`。**2026-08-07 补：确立 runbook 为 Codex 的单一入口**——新增 §0.1「按改动类型的必读路由」9 行表（拓扑/proto/Redis/定时任务/指标告警/CI-CD/本地环境/提交/沉淀），每行给「先读哪份 + 不读会怎样」,**只给指针不复制内容**（同一约束只写一处，见 `knowledge-layering.md`）；并标注 `DEVOPS.md`/`OBSERVABILITY.md` 是目标态、不代表能力已存在。两份 AGENTS.md 的 runbook 指针同步改写为点明 §0.1 |
| harness 瘦身（AGENTS.md / context） | ✅ | 2026-08-07，参照 Anthropic/OpenAI 2026 的「减法」prompting 指引：AGENTS.md（根 + ecommerce 两份同步）「项目速览」改为「反直觉约定」，删掉读代码即可发现的技术栈/架构复述；硬规则 #1 从路径规定改写为「真相源冲突裁决」判据；新增硬规则 #6 不可逆动作（commit/push/合入/deploy/仓外写删）只能由用户明示触发、subagent 永不执行；PROGRESS/TODO 分工成文 `context/harness-framework/progress-and-todo.md` |
| AI 异构双审（Claude + Codex） | 🟡 | 2026-08-07 评估过 CI 方案(`.github/workflows/ai-review.yml` + 两家 App + secret),因单人流程过重**已取消**该文件。改为**本地按需**做异构双审:push 前对着 diff 跑 `/adversarial-review`(隔离 fresh Claude + Codex,已验证合并),核心改动走、小改动跳。无需 GitHub App / secret / CI |
| 冻结验收集门禁（Frozen Nodes） | 🟡 | 2026-08-07 新增，服务于 Graph Engineering 多闭环工作流的「改考题必须走审批」防线。`scripts/freeze.sh <feature> <测试路径...>` 把一组验收测试的内容哈希锁进 `.freeze/<feature>.sha256`（+`.meta` 记 commit/时间）；`scripts/verify-freeze.sh [--all\|<feature>]` 比对工作区与清单,内容变→DRIFT、删/移→MISSING,均退出码 1。新 CI `.github/workflows/freeze-check.yml` 在每个 PR/分支 push 跑 `--all`（与只在 tag 触发部署的 `backend.yml` 分开）。两层防线:CI 拦「偷改测试但没刷新清单」的静默漂移,`.github/CODEOWNERS`（`/.freeze/` + 三个脚本本身）+ `/adversarial-review`「diff 动测试即标红」拦「明改」。脚本兼容 bash 3.2(macOS)与 ubuntu(sha256sum/shasum 双回退),已自测 OK/DRIFT/MISSING/空目录四态。**已 PR #1 合入 github/main、CI 跑绿,并对 main 加分支保护(必需检查 `verify-freeze` strict、code-owner 审批已开、`enforce_admins=false` 不锁死);另补 GitLab 侧 `.gitlab-ci.yml` freeze-check job**。**待办:①本仓 origin 是 GitLab,`.gitlab-ci.yml` 要推到 GitLab 才在那侧生效;②单人仓下 code-owner 审批需第二身份(协作者/bot)才真正强制,现阶段你作为 admin 始终能兜底;③给某核心模块建第一份真实冻结集当范例(如 order/inventory 的验收测试)** |
| DevOps 体系设计（`docs/DEVOPS.md`） | ⬜ | 2026-08-07 新增设计文档 `docs/DEVOPS.md`：以 Three Ways/CALMS/DORA 为骨架、DevOps 边界对齐 DDD 限界上下文，含现状盘点（与本表对齐）与四个落地阶段——①可重复构建（CI 模板化、路径触发、buf breaking、镜像禁 latest+trivy）②可重复交付（GitOps 全链路接管、同 digest 晋级、migration 流水线、副本/PDB 按集群现实分型）③看得见（OTel 全链路、`service.namespace` 唯一标签、SLO+错误预算）④快而不破（契约测试常态化、DORA 四指标自动采集、gitleaks/NetworkPolicy）。每阶段附行为验收标准（实测行为而非配置表面状态）。**状态：设计定稿、实现未开始；实现时逐项回填本表**。文档在 `docs/`（2026-08-08 自仓库根收纳，见下「根目录文档收纳」行），`context/INDEX.md`「工程体系文档」段登记指向，不复制内容 |
| 内环开发 Okteto（`docs/OKTETO.md`） | ✅ | 2026-08-11 落地并**端到端实测通过**。价值定位：不替代 `make dev`（本地 `go run` 更快），替掉的是「改代码 → buildx → 推 TCR → CI 回写 tag → ArgoCD 同步 → Pod 重启」那条分钟级链路，只在**问题成因是集群身份**（pre 配置、Secret 0400 可读性、uid 1000、Pod IP、集群 DNS）时用。**`okteto up` 是开源侧能力，对普通 k8s 集群即可，不需要装平台/license**（要平台的是 `deploy` 和 `test`，后者已在 TESTING.md §8.1 否决）。**配套的 ArgoCD 开发窗口**：`scripts/argocd-devwindow.sh {off\|on\|status}` 往 AppProject 追加一条永远激活的 deny 窗口（`manualSync: true` 保留手工 sync），`on` 时只移除自己那条、保住手写窗口；选 AppProject 而非改 Application（由 ApplicationSet 生成会被改回）或改 ApplicationSet 模板（会与 `argocd-app.yml` 长期漂移）；**刻意不写进 Git**——「临时暂停」进 Git 就变成永久，GitOps 静默失效是最难排查的一类故障。脚本三态（off/on/status）+ 幂等 + 保留第三方窗口均已实测。**okteto 侧的四处关键决定**：①dev key 必须等于集群 Deployment 名（旧 11 份 okteto.yaml 的 key 全是 `connect-example-go` 旧身份，集群里没有该 Deployment，已全部删除）②用官方 `golang:1.26.5`（GOPATH 1777，uid 1000 可写）不自建镜像，Debian 变体因为 `command: bash`③`HOME=/go` + `GOCACHE=/go/.cache/go-build` 解决 uid 1000 写不了 `/root` ④`sync: .:/workspace` 同步整个 backend/（单一 go.mod 决定），排除规则见 `backend/.stignore`。**实测通过的链路**：`uid=1000` / `DEPLOYMENT_MODE=pre` / Secret 0400 可读 / `go build` OK(49M) / 启动后 `verify-ca` 连上 `postgres-postgresql.postgres.svc`、`dragonfly.dragonfly.svc`、Consul TTL 注册、`environment: "pre"`、配置热更新全部正常。**踩到并已修的四个坑**：①okteto 两个 init 容器硬编码 `runAsUser: 0`，与继承的 `runAsNonRoot: true` 冲突 → manifest 显式 `runAsUser: 1000` + `runAsNonRoot: false`（折中落在插件层，业务容器仍是 uid 1000）②**`db-ca-cert` 挂到 `/etc/ssl/certs` 会替换整个目录**，容器里只剩 `pg_ca.crt`、系统 CA 全部不可见 → `go mod download` 全线 x509 失败，用 `SSL_CERT_DIR=/usr/share/ca-certificates/mozilla` 绕过（**此坑对生产同样成立，见下条**）③openebs 是本地 LVM 卷，okteto 缓存 PVC 钉死首次调度的节点，换节点要 `kubectl delete pvc <svc>-okteto`④与 okteto 无关的节点故障（2026-08-11 的 node3 sandbox 卡死，当时已 cordon；该条已随 08-16 集群重建作废并于 2026-08-20 删除）。**订正一条既有认知**：集群三节点全是 **arm64**（Ubuntu 26.04），与开发机同架构——"本地 arm64 / 集群 amd64"的差异在本仓不存在 |
| **生产风险：系统 CA 被挂载遮蔽** | ⬜ | 2026-08-11 在 okteto 实测中发现。10 个服务的 Deployment 都把 `db-ca-cert` 挂到 `/etc/ssl/certs`，**这会替换整个目录**——容器内 `ls /etc/ssl/certs` 只剩 `pg_ca.crt`，发行版自带的 CA 包完全不可见。后果：容器内任何走公网 HTTPS 的出站调用都会 `x509: certificate signed by unknown authority`。**待核实哪些服务受影响**：`payment → 支付宝`、`user → Casdoor`（若走 HTTPS）最可疑；PG/Redis/Consul 走内网自签或明文所以一直没暴露。**正确修法不是加环境变量**，而是把 pg CA 追加进系统 CA 包（挂成 `/usr/local/share/ca-certificates/pg_ca.crt` + `update-ca-certificates`，或用 `subPath` 只挂单个文件而非整个目录） |
| 测试体系（`docs/TESTING.md`） | ⬜ | 2026-08-11 新增操作手册 `docs/TESTING.md` + 判定规则 `context/team/go-testing.md`（两处不重复：前者「怎么做」，后者「该怎么选」）。**分层策略**：biz 层 mock/fake（mockery，生成物入库）、data 层**真实 PG 容器**（testcontainers-go，因 sqlc 项目里 SQL 是生成物的输入，upsert 命中 UNIQUE / PG enum 与 `constants/` 字面量对齐 / `23505` 经 `dbutil.Handler` 的映射 / 游标分页 / `DECIMAL(10,2)` 往返 / schema 漂移这六类 mock 原理上测不到）、Redis 用 miniredis（进程内免 Docker）。**明确不引入** go-sqlmock（只拦 `database/sql`，接不上 pgx/v5 pgxpool）与 pgxmock（断言生成的 SQL 字符串，脆弱且不验证语义）。**开关是 `-short` 不是 build tag**（build tag 会让测试文件脱离 `go build`/IDE 静态检查），故现有 `make test` 与 CI **零改动**，集成测试纯增量。**六步落地**：①装依赖（testcontainers-go + modules/postgres + miniredis 进 go.mod；mockery 走 brew 不进 go.mod）②`backend/pkg/testutil` 共享基建（吸取第十节「配置逻辑 10 份复制」教训，不进任何服务 `internal/`）③cart data 层试点（schema 范例齐全：UNIQUE 三元组 + `cart.cart_type` enum + `ON CONFLICT` + `unnest(@statuses::cart.cart_type[])`）④mockery + cart biz 试点⑤`make test-integration` 与 CI 接线（GHA ubuntu runner 自带 Docker）⑥按数据风险铺开 order→inventory→payment→user。**状态：文档定稿、实现未开始**。**2026-08-11 同日补**：①生产 PG 版本确认为 **18.4.0**，测试镜像定为 `postgres:18-alpine`（已写入文档，不再是待核实项）②新增 `TEST_DB_URI` **逃生舱**——设了就直连内网真库、不起容器，用于验证容器复现不了的东西（真实 TLS `verify-ca`、生产扩展、locale）；三条实现要点：库名不以 `_test` 结尾直接 fatal（防清错库）、真库里 `CREATE TYPE` 无 `IF NOT EXISTS` 需包异常捕获、每用例自行 TRUNCATE 清场；默认路径永远是容器③**评估并否决 Okteto 作为测试环境**（记录在 `docs/TESTING.md` §8.1，避免重复讨论）：决定性理由是 CI 用 GitHub Actions 云 runner 够不到 192.168.3.x 内网、PG 还在集群外，测试要当门禁必须自包含；其次共享库无隔离、Okteto 的 `okteto test` 也不解决数据隔离；附带成本是自托管需 license + 域名/认证/存储，且仓库里 11 份 `okteto.yaml` 是过期残留（dev 目标名仍是 `connect-example-go`、build/deploy 段全注释）。重新评估的触发条件：集群内跑 self-hosted CI runner。**仍需核实一处**：testcontainers-go 的 `postgres.Run`/`RunContainer` API 在 v0.3x 有更名，装完先 `go doc` 对一遍。**顺带发现**：`cart/internal/data/data.go` 的 `NewData` 里 `dbutil.WithErrorMapping("23505"/"23503", ...)` 两行是注释掉的——B 层测试（走 `NewCartRepo`）会正当地暴露它 |
| 可观测性方法论与指标基线（`docs/observability/OBSERVABILITY.md`） | 🟡 | 2026-08-07 新增文档：三支柱分工（Metrics 发现 → Trace 定位 → Logs 看错误）、RED/USE 方法论、每个 Go 服务的最低指标配置（RED 四项、Goroutine/GC/Heap、pgx pool wait、Redis 命中率联动 DB QPS、Kafka Lag 预留）、第一批 7 条告警清单、6 条硬规则（唯一标签防 config 撞名、错误率画比率、控基数、凭据不入日志、告警按注入故障实测验收、监控随功能同一 PR 上线）。判据：**指标异常时答不出「该做什么」的不采**。🟡 依据：采集侧主体已存在（OTel→VM/Loki/Jaeger 端到端、11 服务同构基线），**文档列出的告警 0 条、网关无 meter、collector 自身无监控、无 k8s 对象指标均未落地**（与 `docs/reviews/OBSERVABILITY_REVIEW_20260806.md` 一致），落地走 `docs/DEVOPS.md` 阶段 3。文档在 `docs/observability/`（与看板脚本同目录），已在 `context/INDEX.md` 登记指向 |
| Redis 使用约定（`context/team/go-redis.md`） | ⬜ | 2026-08-07 新增团队级规范（go-redis v9.21.0）：①**客户端热重建下必须每次取 `Client()`**，不得把返回值存进结构体字段（`LiveRedis` 只暴露 `Client()` 就是为此）②`redis.Nil` 是未命中不是故障，缓存回填失败应记 warn 继续 ③Pipeline 结果只在 `Exec()` 后有效、错误从 `Exec()` 出、无原子性（要原子用 `TxPipeline`）④**默认 `MaxRetries:3` 会让非幂等命令执行多次**——与网关重试放大同源，需幂等键或调小重试 ⑤读-改-写用 `Watch`+`TxFailedErr` 重试循环，分布式锁必须带 owner+TTL 且 Lua 解锁 ⑥Cluster 迁移的两个坑（跨槽多键、无多 DB）⑦Redis 不顶替 Kafka。**待办：①`insecure_skip_verify` 生产化前换成 `ca_pem` 校验 ②inventory 的 Redis 分布式锁按第 5 节落地 ③Dragonfly 非原生 Redis，Cluster/Stream 能力用前需实测** |
| 定时任务约定（`context/team/cron-jobs.md`） | ⬜ | 2026-08-07 新增团队级规范。**本仓没有 `robfig/cron`，周期任务全是 `time.Ticker`**（Consul 心跳 ×11、product→gorse 增量同步、behavior flush/retry、网关健康检查与策略刷新），文档同时约束 Ticker 与将来引入的 cron。核心：①**多实例重复执行当前被单副本掩盖**——`docs/DEVOPS.md` 阶段 2 要求无状态服务 ≥2 副本，扩副本那天所有进程内定时任务立刻重复执行，是扩副本的前置条件；解法排序 K8s CronJob > 单副本 worker > 分布式锁，且**任务本身必须幂等** ②**Ticker 首次触发在一个完整周期之后**——Consul TTL 25s 盲窗就是这么来的，写周期任务要显式决定首次是否立即执行 ③重叠用 `SkipIfStillRunning`/`DelayIfStillRunning`（后者耗时长期超周期会无限累积），product 的串行续扫循环是正例 ④cron v3 默认不 recover，后台 goroutine 一 panic 带走进程 ⑤超时靠 Job 内 context 并一路传下去 ⑥时区必须显式设置并在启动日志打印下次执行时间 ⑦长生命周期任务用 `context.Background()` 派生 + `OnStop` 关，**不能挂 `OnStart` 的 ctx**（inventory 心跳被这条咬过）⑧**Cron 不持久化不补偿**，超时兜底 job/每日对账/库存对账这类不能只靠一次回调，应「发信号→任务表→幂等 worker→可重跑」；Kafka 为 0 时先落 Postgres 任务表。**待办：①扩副本前先定这批任务的归属 ②超时兜底 job 与对账按第八节形状落地** |
| 文档体系整理（2026-08-07） | ✅ | 全仓 105 个 md 盘点后一次性整理：①**`Design.md` → `DESIGN.md`**——git 索引里是小写、工作区显示大写（macOS 大小写不敏感掩盖），Linux 上 24 处大写引用会 404；两步 `git mv` 统一为大写并改写全仓 30 处 `Design.md` 引用 ②两份一次性评审报告归档到 `docs/reviews/`（原仓库根 `ADVERSARIAL_REVIEW_20260806.md` 与 `observability/OBSERVABILITY_REVIEW_20260806.md`），11 处引用同步改路径 ③删 4 份零信息量模板 README（address/merchant/payment 三份逐字节相同的 go-connect-template 自述 + `frontend/packages/utils` 的 vite-plus-starter 残留）；`backend/services/README.md`（内容全是 address 领域）归位为 `backend/services/address/README.md`，并把根 README 的地址页 IP 定位设计并入 ④gateway 文档整理：`note.md`/`请求流程.md` 移入 `gateway/docs/notes/`，修掉请求流程.md 24 处 `file:///…/sunmery/…` 机器专属死链（改相对路径），`gateway/README.md` 顶部加四份文档的分工导航，`README-Kafka.md` 加「代码零落地」横幅 ⑤索引漂移修复：`context/INDEX.md` 服务级表不再与 `project/ecommerce/INDEX.md` 重复维护（改为只列模块名）、工程体系文档段补登 `Graph-Engineering.md` 与 `gateway/docs/ARCHITECTURE_EVOLUTION.md`；服务数口径统一为 **10**（`config/` 空壳为已知例外；改了 context/DEVOPS/OBSERVABILITY/domain.md 共 12 处「11」）⑥小修：`PRIVACY.md` 更新 sunmery/connect-example 旧身份、`CONFIG_CENTER_DESIGN.md` 加已拆出说明、`Graph-Engineering.md` 加 H1 与落地现状（`scripts/anchor.sh` 不存在）、desktop README 去掉已迁出的 config app、本表修掉三个重复的 `### 6.` 编号 ⑦**根 README 重写**：删掉残留的 AI prompt 原文（原 48-50 行）与整段重复两次的技术栈章节，修正 `go1.13` 为实际版本（backend 1.26 / gateway 1.25），新增仓库结构表与文档导航表 |
| 前端 UI 设计系统「灯市」（2026-08-11） | 🟡 | Impeccable 流程落地：根 `PRODUCT.md`（产品真相）+ `DESIGN.md`（纸灯工坊视觉真相源，sidecar `.impeccable/design.json`）；consumer 首页按该世界重建（authored 墨线插画 + 自托管 Noto Serif SC + 入视点灯灯阵），AppBar/Footer 皮肤化（逻辑未动），独立终审 8/8 resolved 后 documenter 记录系统。**待办**：ListProduct 接通后删 `demoProducts.ts` 换真实货架；按 DESIGN.md 迁移清单换肤 PrivacyConsent 弹窗、其余 consumer routes、merchant/admin 端 |
| 设计文档按微服务拆分（2026-08-08） | ✅ | **`DESIGN.md`（985 行单文件）拆分为 `docs/design/` 按微服务分目录**（入口 `docs/design/README.md`，根留 7 行重定向桩兜住旧引用/外部链接）：platform/{architecture,error-handling,performance,rbac} + product/{listing,schema} + inventory + order/{checkout,consistency,schema} + payment + search，正文原样保留、每篇加「现状与真相源」横幅（表结构真相指向各服务 `internal/data/schema/`）。**三章直接删除**（README 记录去向）：技术栈集成→`STACK.md`、可观测性→`observability/OBSERVABILITY.md`、容器化编排→`DEVOPS.md`+实际清单（示例 YAML 与实际部署矛盾：namespace 划分、Deployment 结构均不同）。**散落文档收编**：`CONFIG_CENTER_DESIGN.md`→`docs/design/config-center/design.md`、`DESIGN-MERCHANT.md`→`docs/design/merchant/store-settings.md`、`Graph-Engineering.md`→`context/harness-framework/graph-engineering.md`（AI 协作机制归属该层，含 INDEX 两处登记）、未跟踪的 `docs/design/order.md` 下单终稿→`order/checkout.md`（加 H1 横幅）、TODO §二订单一致性方案本体→`order/consistency.md`（TODO 只留治理项勾选）。**全仓 29 处引用改写**（AGENTS/README/STACK/SCAFFOLD/TODO/PROGRESS/matrix 注释/context 三层），顺手修掉 `context/team/INDEX.md` 与根外同步副本 `../AGENTS.md` 里三处上次改名漏掉的 `Design.md` 旧引用；链接可达性用脚本全量验证。**教训**：perl 批量替换时 `s###` 分隔符撞上模式内的 `#` 会把替换文本前缀到每一行（`.service-matrix.yaml` 被损坏后按机械前缀剥离恢复，structcheck 验证完好）——含 `#` 的模式一律用 `\|` 做分隔符 |
| 文档体系整理（2026-08-13） | ✅ | 四路并行调查（根文档/docs 顶层/gateway/backend+frontend）后一次性整理：①**Consul KV 退役未同步的过时描述清零**——AGENTS.md 硬规则4（凭据归属改 Config Center+Secret）、README 技术栈表/selector 三选项/config-seed 段、STACK.md、DEVOPS.md ②**根 `observability/` 旧路径坏链接全修**（README/context 三层/PROGRESS/design 索引共 10+ 处指向 `docs/observability/`）③**order 设计文档纠错归位**：`docs/design/order.md`（v2 基线，权威）移入 `order/checkout.md`，同名 v1 旧稿删除（settlement 独立服务/TTL 5min 方案已被 v2 §17 推翻），11 处 `/DESIGN.md:行号` 失效引用改指拆分后文档，索引把 v1 误标「终稿」已纠 ④**删 25 份零价值/误导文档**：8 份逐字节相同 log/README、12 份 kratos third_party 模板残留（其中 6 份还把 protovalidate 说成 PGV）、docker-init 模板 README.Docker、被 checkout v2 推翻的 `api/order/README.md`（前端 uuid reqid 方案）、README-HealthCheck.md（示例编译不过 + 「智能节点过滤」结论被 experience 推翻 + 鼓励加大重试的有害建议） ⑤**误导性文档加真相横幅**：README-Kafka（直接 Publish 模型已被 consistency.md 的 Outbox 取代）、cart 接口论证迁 `docs/design/cart/api-decisions.md`（§3 cart_item_id 方案与 proto 并行数组实现相反）、product/README（7 个接口 proto 全无）、销量设计迁 `docs/design/product/sales.md`（表名 sale_detail 单数、预聚合未落地） ⑥**gateway 文档校正**：README 中间件清单从上游残留（10/10 错）改为实际 11 个、`configs/rbac/` 虚构路径改 `configs/policies/`、`PROXY_WRITE_TIMEOUTT` 三个 T 是代码 typo 已固化加注、README-CUSTOM 砍掉与 README/架构图重复且已漂移的三章（423→233 行）、`请求流程.md` 提升为 `docs/REQUEST_FLOW.md` 并修 NewSourceLoader/jwt.Init 签名/死锚点 ⑦**OBSERVABILITY.md 五处与实测矛盾订正**（告警 0→17 条指针、网关 meter 已补、架构图告警栈、service.namespace 实况注脚、GC pause 指标不存在）、面板设计.md §9 部署命令文件名（照抄必失败）、OKTETO §六删 6/7 重复表换指针（漏 SSL_CERT_DIR 的漂移副本）、go-testing 的 `make test-integration` 加待落地标注 ⑧**STACK.md 修+精简 625→454 行**：11→10 服务×3、前端清单补 desktop/i18n/perf/tauri 删 config、Go 1.26.5、镜像基底 alpine3.23、Consul KV 行、Kafka 措辞（CDC 基础设施已部署）、删「五条硬规则」过期抄录（缺不可逆授权规则，最危险的漂移副本）、Git 规范整段（husky/cz-git/5 类 type 全错）、错误处理/sqlc/建表/Casbin/前端目录树纯粘贴段全部改指针、§十删 CI 已修/consul-kv.json 已删两行、§十一导航副本 ⑨**索引回填**：design 索引登记 address/cart/product 服务内设计文档并修「尚无设计文档」句、补 sales/api-decisions 行、DESIGN.md 重名澄清（灯市视觉系统 ≠ 被拆分的架构文档）；README 导航补 PRODUCT/DESIGN、修 compose `-f` 指目录/`configs/config.yaml` 不存在/策略路径/PG 18/双 go.mod 1.26.5 ⑩ PROGRESS/SCAFFOLD 按实况订正（3 盘/17 条告警/10 服务/behavior 补入/packages 9 个/内嵌 AGENTS 模板加落后一代警示）。**未动待用户决策**（08-13 追加：PROGRESS.md 已按用户决定废止——归档 `docs/reviews/PROGRESS_ARCHIVE_20260813.md`、删 `progress-and-todo.md` 制度文件、TODO.md 成唯一进度真相源、七处引用同步改、evolution-log 已记触发事故）：`gateway/examples/benchmark/` 整目录删除（上游遗产+签入 mkcert 私钥）、`MERCHANT_AGREEMENT.md` 未入库但代码已引用版本号、EventBus README 702 行教程压缩 |
| 根目录文档收纳（2026-08-08） | ✅ | 根目录文档只留 `README` / `AGENTS` / `STACK` / `TODO`（+ `.service-matrix.yaml` 与配置文件）：**`DESIGN.md` 桩删除**——拆分桩使命完成，删前全仓核实已无 link 型引用（仅剩「来源 DESIGN.md §xxx」类纯文字出处说明，按历史记录保留），外部旧链接自此 404 为已接受代价，`docs/design/README.md` 头部已注明勿重建；`DEVOPS.md` / `PROGRESS.md` / `SCAFFOLD.md` / `PRIVACY.md` 以 `git mv` 收纳至 `docs/`（保留历史），全仓 link 型引用退链 10 处（README×3、STACK×3 含结构树、context/INDEX、cron-jobs×2、runbook、docs/design/README）+ `SCAFFOLD.md` 内部相对链接 4 处 + 本表路径提及 5 处。**`TODO.md` 刻意留根**：进度真相源被 STACK / matrix / context 三层全域引用，搬移的退链成本大于收益。DEVOPS 行原「留在仓库根（就近原则）」的决策由本行取代 |
| 基础设施 TLS 与网关接入（2026-08-08 实测盘点） | 🟡 | 用 kubectl + curl/openssl 对 ecommerce/config-center 之外的**全部基础设施**逐项实测，清单落在 [`docs/design/platform/pre-environment.md`](docs/design/platform/pre-environment.md)（各组件 IP/svc/route/gateway/TLS + 实测记录 + 幽灵配置警示）。证书链已就绪：`selfSigned` → `global-root-ca`(cert-manager ns) → `global-ca-issuer`(CA 型 ClusterIssuer) → 泛域名 `global-default-tls`(CN=dev.test, SAN=*.dev.test)，参考实现在 `cloud-native-deploy/cert-manager/public-web-gw/`。两个网关：`default/cilium-gateway`(192.168.3.110，http:80 + https:443 Terminate)、`dragonfly/dragonfly-gateway`(192.168.3.114，TLS:443 + TLSRoute)。**关键发现:cilium 确实无 TCPRoute CRD,但 TLSRoute 可用且 dragonfly 已在用**——所以 TCP 类基础设施不必都退化到 L4 LB,凡客户端支持 TLS+SNI 的都能走 Passthrough。**实测出的现状**:①**13 条基础设施 HTTPRoute 只有 1 条(otlp)挂 https listener**,其余 12 条全挂 `sectionName: http` 明文——实测 `http://grafana.dev.test` 302 通、同域名 https 返回 **404**(对照组 `https://otlp-http.dev.test` 200),即「cert-manager 接管流量」目前只对 otlp/ecommerce/config-center 成立 ②**Postgres 是全场唯一理想形态**:LB 192.168.3.109 + 原生 TLS(bitnami `POSTGRESQL_ENABLE_TLS`,cert-manager 签发,客户端 verify-ca) ③Kafka 的 9093 TLS listener 现成但无人使用,且两个 listener 都是 internal、无外部入口 ④**ES 的 HTTP 层 TLS 被主动关闭**(`tls-disabled=true`) ⑤Consul 全明文:8501/HTTPS 未启用、gossip `encrypted=false` ⑥集群外三个端点走**公网明文 http**:casdoor(apikv.com:8000=node1,承载 OAuth code/token)、minio 与 gorse(node2:9000/:8088,pre.yml 实际用的是这台而非集群内 minio)。**待办见「基础设施 TLS 收敛」段** |

| 静态检查基线棘轮 + 软门禁伤疤面板 | ✅ | 2026-08-08 参照《从 Vibe Coding 到 Harness》（腾讯 TAB）的「基线对比」与「软门禁留伤疤」两处设计落地。**①`scripts/lint-baseline.sh`**（check/snapshot/list）：把 `go vet` 与 `vp lint` 的输出归一化为「checker+文件+规则+摘要」（**刻意丢掉行号列号**，否则文件顶部加一行注释就会让下方全部告警变成「新增」），与 `.lint-baseline/*.txt` 做 B−A 差集，**只有新增才阻断**；反向棘轮：基线条目被修好后 check 会要求刷新并失败，防止基线只增不减变成永久免罪符。价值不在技术而在**剥夺「这是历史问题」这句万能解释**——是不是历史问题由基线文件说了算。已接 `service-ci.yml`（go-vet）与 `make lint-baseline`。**当前基线为空**（0 存量），所以实际等价于硬门禁；将来接 golangci-lint 时先 snapshot 冻结存量即可立刻开门禁，不必先清债。**②`scripts/harness-scars.sh`** 伤疤面板：把三处被放行的存量（lint 基线 / matrix 的 `deployment_coverage.exceptions` / `homogeneity_baseline.txt`）集中显形，接进 `deploy-consistency.yml`、`make deploy`（部署前）、`make deploy-status`、`make scars`；永远退出 0，是显形工具不是门禁。**当前显示 10 条**（全部是 internal/pkg 同构漂移）。**实测**：lint 棘轮四态（注入→阻断／冻结→放行留疤／修好不刷基线→反向棘轮报错／刷新→全绿）全部通过；伤疤面板另注入一条 matrix 例外验证能抓到，验证后已还原。**两个 shell 陷阱已写进脚本头**：干净时管道里 `grep` 空输入返回 1，在 `pipefail` 下会掐掉整个脚本（实测踩过）；`grep -c` 计数为 0 时同样返回 1，不能直接用在 `$(...)` 里。**教训复现**：本轮又一次用 perl 批量替换把脚本写坏（与拆分设计文档那轮同一个坑），已改为整文件重写；`fmt.Println` 在 `go test` 非 `-v` 下同样不可见（Go 缓冲包输出），所以伤疤必须走独立打印通道而不是写在测试里。**2026-08-18 第三个陷阱**：CI 冷模块缓存下 `go vet` 的 `2>&1` 合流会把 `go: downloading …` stderr 进度当成告警——Backend CI 自 08-13 起两轮 10 服务全红全是这个幻影（本机缓存热不复现），还连带堵死 update-manifests 回写、镜像发布停摆 5 天；采集管道已滤掉三类 `go:` 噪音行并实测（合成输入过管道 + 本地 check 绿）；CI 侧已用 dispatch(cart) 冷缓存复验全绿（run 32153791376：test 2m49s + 镜像 sha-b482be9 + 回写 cd45b81）。~~**GitOps 尾环卡在集群**~~ **2026-08-19 已闭环**：集群重建后重新接线完成，`sha-b482be9` 的 cart 已在集群运行（详见下方「2026-08-19 集群重建后 GitOps 重新接线」行） |
| context/ 知识库结构门禁（`scripts/verify-context.sh`） | ✅ | 2026-08-18 参照 `~/lens077/deepseek-harness`（DeepSeek 开源 agent harness：TS monorepo + Cordis 插件架构，doc-sync 门禁族 30+ 脚本）做最小移植：六项检查（AGENTS.md+context/ 链接可达性、INDEX 覆盖孤儿检测、frontmatter 与 name/layer/module 路径一致性、experience「症状/关键陷阱」硬要求、evolution-log 四要素、AGENTS.md ≤14000B 预算）+ `context-format-baseline.txt` 存量基线（反向棘轮）+ 双侧 CI `context-gate`（GH workflow + GitLab job，与 freeze-check 同款全量跑）+ AGENTS.md 锚点行。**首跑即抓到 2 处存量静默漂移**（graph-engineering.md 缺 frontmatter、config 两篇非坑体裁 experience 入基线），另把 duplicate-cart-queries 的 ⚠️ 段重标为规范「关键陷阱」标签。九类故障注入全部拦截（含基线反向棘轮与陈旧条目），Bash 3.2 兼容。**刻意不搬**：dsh 的字数预算全套/双语配对/归档冻结/生成式目录（后者本仓已有 matrix+structcheck 对等物）。详见 evolution-log 2026-08-18 条 |
| harness 演进日志（`context/harness-framework/evolution-log.md`） | ✅ | 2026-08-08 补上「四块拼图」里唯一缺失的**进化**那块。`context/` 记规则是什么、`TODO.md` 记做了什么、`PROGRESS.md` 记完成度，三者都不记**「这条规则为什么是现在这个样子」**——规则能从代码读出来，理由不能，半年后会被人凭直觉改回去。每条四要素且**不许省「触发事故」**（没有事故就别改规则）。已回填 5 条真实记录：本轮基线棘轮、硬规则 #6 的对称化改写、服务清单收敛、2026-08-07 新增硬规则 #6、structcheck 沉降为 CI 门禁。其中 #6 那两条形成了自我印证——**预防性规则缺少真实事故校准时容易只写单向**，第一版只写了「什么不算授权」而漏了「授权后就该执行」，直接导致过度阻拦。挂进 `AGENTS.md` 硬规则 #5（改 harness 必须追加一条）、`context/INDEX.md` 与 `harness-framework/INDEX.md`；根外 `~/github/lens077/AGENTS.md` 已同步。2026-08-12 新增项目级 `.codex/config.toml` 与 `AGENTS.md` 硬规则 #7：全自动会话自动处理权限请求，实质性互斥决策仍保留选择对话框；父级 `lens077/AGENTS.md` 已同步 |
| 节点优雅关机约定（`context/team/node-graceful-shutdown.md`） | ✅ | 2026-08-21 固化 `90s/30s` GracefulNodeShutdown；安装器新增 `KCM_TERMINATED_POD_GC_THRESHOLD=100`，已有控制面按次快照、原子更新运行清单并只定向修改 live ClusterConfiguration，中途失败双侧回滚。2026-08-23 已部署 node101：控制器 38 秒内恢复，三层配置均为 `100`，终态 Pod `112→100`，三节点保持 Ready。 |

### 2. 后端微服务（核心）

| 服务 | 状态 | 已实现 RPC | 主要缺口 |
|------|------|-----------|----------|
| 用户认证 user | 🟡 | `SignIn`、`UserProfile` | 令牌刷新、登出、多端会话、第三方登录适配 |
| 商品 product | 🟡 | `GetProductDetail`（SPU/SKU） | **`ListProducts`（首页无限滚动/游标分页）设计已定，见 `docs/design/product/listing.md`，待落地**；上下架、类目/品牌管理、`ProductChangedEvent` 同步 ES |
| 购物车 cart | 🟡 | `GetCart`、`AddProductToCart`、`RemoveCartItem`、`UpdateCartItemQuantity` + MinIO 缩略图 URL（`GetCartSummary` 已于 2026-08 删除，见下） | **`RemoveCartItem`/`UpdateCartItemQuantity` 前端未接线**（删除/改数量只动本地 store，刷新就回来）；`AddProductToCart` 的 `shop_name` 缺字段导致必然失败；选中态服务端持久化（如需） |
| 订单 order | 🔴 | `CreateOrder`(**假成功桩**)、`CompleteOrder`(**不落库**) | ❗**`CreateOrder` 不是普通的桩，它返回假成功**：service 层把 `req` 整个注释掉、硬编码 `CartItemIDs: nil, AddressID: 0`（`internal/service/order.go:31`），application 层直接 `return &domain.CreateOrderResponse{}, nil`（`application/order.go:61`）——而**结算页已真实接线**（`checkout/index.tsx:110` 调 `mutateAsync` 后跳支付页），用户会看到「下单成功」但系统里没有订单、购物车未清、库存未占。**先改成显式 `CodeUnimplemented` 止血**（学 payment 的做法），再实现主体；❗**`CompleteOrder` 的持久化是空的**：`SaveOrder` 只打一行 debug 日志就返回 nil（`internal/data/order.go:83`），`OrderCompleted` 事件却照发；`CompleteOrderResponse.Order` 还是零字段空 message（`api/order/v1/order.proto:28`）；service 层把 application 的 CodeNotFound 重包成 CodeInternal（`service/order.go:63`），违反本仓的错误分层规范。此外仍缺：`CreateOrder` 主体（幂等/核价/拆单/取地址快照/同步 Reserve/事务落库）；proto 待补 `CreateOrderRequest.requestId`(幂等键) 与 `CreateOrderResponse.orderNo/payAmount/payDeadline`；订单查询/列表、取消、状态机、`OrderCreated/Paid/Cancelled` 事件；`UpdateOrderStatus`/`SaveOrderLog` 仍是 panic |
| 支付 payment | 🟡 | 5 个 RPC 均为**桩**（显式返回 `Unimplemented`），服务可启动/注册/健康检查，网关 `/payment*` 已通 | **repo 主体待恢复**：原实现依赖已移除的 balance/consumerOrder client（保留在 `data/payment.go` 注释块）；支付宝凭据（`pay.alipay.*` 在 KV 里是空占位）；退款、幂等/验签加固、每日对账、`PaymentRefundedEvent` |
| 库存 inventory | 🔴 | **无可用 RPC**（`Reserve`、`ReleaseReserve` 均已挂载但不可用） | ❗**`Reserve` 静默无操作**（`internal/data/inventory.go:52`，四处叠加：①传 `Version: stock.Version+1` 而 SQL 是 `AND version = @version`，WHERE 比对未来版本号→**永远命中 0 行**；②`_, reserveErr :=` 丢弃 `:execrows` 行数，0 行不报错；③`Quantity: stock.Available-item.Quantity` 传给 `available = available - @quantity`，语义颠倒；④错误分支传恒为 nil 的 `err` 而非 `reserveErr`，真失败返回 `(nil,nil)`）——净效果是**返回成功、库存不变、change_log 写入伪造流水**，注释声称的事务/回滚并不存在（无 `ExecTx`，`FOR UPDATE` 在自动提交下失效）。接上下方「建单同步 Reserve（TCC-Try）」即必然超卖；❗**`ReleaseReserve` 是 `panic("implement me")`**（:88），接上取消/超时补偿即每单必炸。此外仍缺：扣减确认/回补、库存流水与对账、不足预警事件、Redis 分布式锁 |
| 搜索 search | 🟡 | `Search`（ES + OTel） | CQRS 读写分离、商品数据实时同步、聚合筛选/智能排序、热门词 |

### 3. 后端微服务（支撑）

| 服务 | 状态 | 已实现 | 主要缺口 |
|------|------|--------|----------|
| 地址 address | 🔴 | CRUD + `SetDefaultAddress` + `ListAddresses`（功能齐全，**但全线越权**） | ❗**安全 BLOCKER**：`Get/Update/Delete/SetDefault` 的 SQL 只按 `address_id` 过滤、无 user 归属校验，`CreateAddress` 的 `user_id` 直接取自请求体（`internal/service/address.go:26,71,84,95`）；网关又整段放行 `p, consumer, /address.v1.AddressService/*`（`gateway/configs/policies/policies.csv:3`）——任何登录用户拿到或遍历到他人地址 UUID 即可读改删其隐私地址。修法：user 一律取自网关注入的身份头，所有查询加 `AND user_id = ?`，网关策略收敛到 RPC 粒度 |
| 商家 merchant | 🔴 | 仅 `Submit`/`Get` 可用；2026-08-13 两段式入驻（成为商家/开设店铺）设计定稿（`docs/design/merchant/onboarding.md`，配《商家入驻协议》v1.0 `docs/MERCHANT_AGREEMENT.md`），`GetMerchantAgreement`/`CreateMerchant` 的 proto/biz/data 骨架与 `merchants.agreement` 表已建——**均为占位**：`CreateMerchant` 三层全是 panic 桩，协议查询 data 层返回零值未接 SQL | ❗**`ApproveApplication` 的 SQL 没有 WHERE 子句**（`internal/data/queries/merchant.sql:23`），repo 层还丢弃了 `ApplicationId`（`internal/data/merchant.go:23`）→ **批准一份申请 = 把所有待审申请一起改成 approved**，并覆盖上这一份的审核意见与时间戳；❗`RejectApplication`/`ActivateMerchant` 是 `panic("implement me")`（`internal/service/merchant_service.go:57,98`）——网关已把这两条按 RPC 粒度放行给 admin，调用即 panic。此外仍缺：店铺信息管理、商品运营权限、发货/售后、结算账单 |
| 履约 fulfillment | ⬜ | — | 发货/物流轨迹、第三方物流对接、售后履约 |
| 结算 settlement | ⬜ | — | 佣金计算、结算单、财务对账 |
| 营销 marketing | ⬜ | — | 优惠券、满减、秒杀、会员/积分 |
| 数据分析 analytics | ⬜ | — | 指标计算、行为分析、经营报表 |
| 行为/推荐 behavior | 🟡 | `Track`、`Recommend`、`SimilarItems`（编译通过；gorse 侧语义与 product 目录同步已实测，服务本身待起） | 上传带 `recommend:` 的 Consul KV `ecommerce/behavior/dev.yml` → 起服务端到端验证；用户画像（`/api/users` labels）暂未投喂 |

### 4. 网关与 RBAC

| 项目 | 状态 | 说明 |
|------|------|------|
| 网关（身份验证/授权/路由守卫） | 🟡 | `gateway/` 已实现，集中式 Casdoor 鉴权 + 策略文件；10 条 endpoint 全部落地（`/user* /search* /product* /cart* /address* /config* /order* /inventory* /merchant* /payment*`）。远端 `ecommerce-gateway:latest` 此前是旧镜像（仍去 KV 找 `rbac/policies.csv`，而代码常量早已改为 `policies/`），启动即 FATAL —— 已重新多架构构建推送并用 `docker compose up` 拉真实远端镜像验证：10 条路由全建起、7 条鉴权路由 401、支付宝回调 200+code 12、未定义前缀 404 |
| 网关服务发现恢复 | ✅ | Consul watcher 改为后台初始化，`Next()` 失效后按阶梯退避重建；生命周期与单个路由 applier 解耦，配置热重载关闭旧 client 不再误杀共享 watcher，最后一个 applier 清理后才停止。consumer 查询仅对 `Unavailable` / `DeadlineExceeded` 延迟 300ms 重试一次，避免瞬时 503 被放大为多次 POST。`make dev` 实测发现 `user-identity` 并在热重载后复用缓存；`go test -race ./client` 覆盖 watcher 断线恢复与旧 context 取消场景 |
| 「刷新几次才出数据」的真实根因 | ✅ | 上一条修好了 watcher，但**首屏仍要刷几次** —— 因为真凶不在网关而在服务注册侧：Consul TTL check 注册后的初始状态是 **critical**，而 `TtlCheckPinger` 进 `for` 循环前**先等一个完整的 `ping_interval`（KV 里是 25s）**才发第一次 `UpdateTTL(pass)`；kratos consul registry 用 `passingOnly=true` 查询，于是每次后端启动都有一段 **25 秒「已注册但对外不可见」的盲窗**，网关拿到空节点列表 → `ErrNoAvailable` → 503。用户日志正好坐实：ttl pinger 起于 `00:50:37.264`，首个 RPC 完成于 `00:51:02.526`（25.3s）。修复分四层：①**注册后立即补一次心跳**（11 个服务的 `internal/pkg/registry/consul.go`，pinger 块此前 11 份字节全同），盲窗压到 0，新增 `pinger_test.go` 3 例（先对旧代码跑红：「3s 内没有收到首次心跳」）；②**Consul KV 参数**：`ping_interval` 25s→10s（原值只比 `duration` 少 5s，网络抖一下就掉出 passing）、`deregister_critical_service_after` 6s→**1m**（Consul 对该字段有 1 分钟硬下限，写 6s 会被静默钳制，等于配置在骗人），11 份 `dev.yml` 与 8 份 `pre.yml` 全部更新并读回校验（改前已全量备份 25 个 key 到仓库外；两个环境的值和注释逐字一致）；③**网关内层重试 `defaultMaxRetries` 3→1**：它无延迟、无退避、无条件判断，与路由 `retry.attempts: 2` 相乘等于一个浏览器 POST 最多打上游 6 次，而 ConnectRPC 全是 POST、无幂等保证；④**删掉 15s 兜底轮询 `startRefreshLoop`**（watcher 修好后它只剩害处：刷屏 WARN、并发写 picker、其 Callback 把健康检查失败计数清零）并把 `healthChecker.updateNodes` 从「全删再全加」改为 **diff 语义** —— 原实现让服务发现每推送一次就赦免所有节点，`maxFailures` 永远攒不满，`HealthyNodeFilter` 形同虚设，新增 `health_checker_test.go` 3 例（旧代码 2 例红） |
| 成功调用被记成 `rpc.code: "unknown"` | ✅ | 11 个服务的 `internal/server/logging.go` 都在 `err != nil` 分支之前就算好了 `fields`，而 connect 的 Code 常量从 1 开始、**没有 `CodeOK`**，`connect.CodeOf(nil)` 返回的是 `CodeUnknown` —— 每一次成功调用在日志和 span 属性里都记成 `unknown`，按 `rpc.code` 做的看板与告警全部失真。成功路径改为显式记 `"ok"` |
| 前端购物车重复请求 | ✅ | `useCartBadge`（走 `GetCartSummary`）与 `useCart`（裸 `useEffect` + `isMounted`，只挡了 `setState` 没挡请求，StrictMode 下双发）各拉各的，购物车页一次挂载打 4 个 POST。合并到同一个 TanStack Query `["cart","items"]`（`staleTime` 10s，重试交给 QueryClient），一次挂载 1 个请求；加购后 `invalidateQueries` 让徽标即时刷新。徽标数值不变已核对：`GetCartSummary` 的 SQL 是 `COUNT(*)`（行数，非件数），两个 handler 都按 `CartStatusActive` 过滤，故 `items.length` 与原 `totalCount` 等价。**`GetCartSummary` 已于 2026-08 整条删除**（proto/service/biz/data/sqlc 全链），因为 `GetCartResponse.cart_item_quantity` 在 `data/cart.go` 里就是 `len(rows)`，与它返回的是同一条查询的同一个数——同一个数有两个来源迟早对不上 |
| RBAC 三角色（消费者/商家/管理员） | 🟡 | 策略模型（model.conf/policies.csv）已有；order/payment/merchant/inventory 已按 **RPC 粒度**授权（避免整段 `/svc.v1.*` 放行导致的越权），其余服务仍是整段放行待细化 |
| Casdoor 集成 | 🟡 | 登录/令牌解析打通，权限适配持续完善 |

### 5. 配置中心（Config Center）

> 设计文档见 `docs/design/config-center/design.md`。以 Postgres 为数据源、键值粒度、Casdoor 鉴权、玻璃态前端。

| 项目 | 状态 | 说明 |
|------|------|------|
| 设计文档 | ✅ | `docs/design/config-center/design.md`：架构/数据模型/RPC/鉴权/校验/玻璃态/路线图 |
| 后端 config 服务 | ✅ | 已迁往独立仓 `github.com/lens077/config-center` 并发布 `v0.1.0`：保留原 Postgres schema，服务自身改由本地 `CONFIG_FILE` 自举，Consul 仅服务发现；主仓旧服务及重复 Config API 已退役，所有服务和 `config-seed` 使用独立模块契约 |
| 网关接入 config | ✅ | `gateway/configs/config.yaml` 新增 `/config* → discovery:///config-service`;`policies.csv` 新增 `p, admin, /config.v1.ConfigService/*, POST, allow`；路由与策略模板已纳入 Gateway Config Center 四键配置 |
| Gateway Config Center 单源迁移（2026-08-13） | 🟡 | **仓库侧已完成，运行时尚未迁移/验收**：参考 Cart 的 `CONFIG_SOURCE_FILE` + `configsource` SDK 模式，正常启动只接受 `type: config_center`，`CONFIG_SOURCE=file` 仅供显式本地测试，无 Consul KV 回退；路由 `config.yaml`、JWT `secrets/public.pem`、RBAC `policies/{policies.csv,model.conf}` 共用一个 selector 的 namespace/environment，GetKey + WatchKeys 支持 1s→30s 退避重连，空值/删除/无效更新保留上一份可用配置，文件与运行态应用失败可回滚；四个条目必须 `is_secret=false`，selector token 与 TLS 私钥只进本地/Kubernetes Secret；Compose、dev/prod Deployment 已挂 `ecommerce-config-source-<env>` 的 `gateway.yaml`（`0400` + UID/GID/fsGroup 1000），删除旧 Consul KV loader、环境变量和两份种子快照。目标包测试、`go build ./...`、`go vet ./...`、四包 `-race` 已通过。**仍未完成**：未向 Config Center 写入四个条目，未创建/修改 selector Secret，未构建/推送镜像或部署 Gateway，也未做日志、readiness、重启次数和健康检查验收；完成这些运行时动作前保持 🟡 |
| 网关/前端错误层统一 | ✅ | 网关侧新增 `gateway/errors/{response,mapping,cors}.go`:404/405/无可用节点/超时等**非业务错误也按 Connect 规范**回 `{code,message,details[]}` + `X-Error-Reason` 头 + `Access-Control-Expose-Headers`(跨域下前端才读得到该头);`proxy.go` 的散装 `writeError` 收敛到统一实现。前端侧新增 `packages/api/src/errors.ts` 的 `toAppError(e) → {code,codeName,reason,message,metadata,raw}`:**message 保证非空**(空 message 会让 connect-web 整个错误体退化成「未知错误」),并区分 `AUTH_REASONS`(退登)与 `PERMISSION_REASONS`(仅提示,不退登)——原先无差别退登会把「无权限」误判成「未登录」。`ErrorHandler.tsx`/`interceptors/error.ts` 改用该层,config 前端删掉 `String((error as Error)?.message)` 的兜底 hack。测试:`gateway/errors/response_test.go` + `gateway/proxy/error_response_test.go`(不重启在跑的网关,用 `httptest` 直打 handler,断言 details 的 `type`/`value` 非空——为空会被 connect-web 的 `errorFromJson` 静默丢弃) |
| 网关 JWT 时钟容差 | ✅ | `gateway/middleware/jwt/jwt.go` 增加 `jwt.WithLeeway(60s)`:修复登录后毫秒级请求因 `nbf` 零容差+微小时钟偏移被判 "token is not valid yet" → 401 → 前端退登死循环 |
| Consul 配置 KV | ✅ | 新增 `ecommerce/config/dev.yml`(真实 DB/Redis/discovery),服务启动从此加载 |
| ListNamespaces RPC | ✅ | 新增 `ListNamespaces` 返回 `NamespaceInfo{namespace, environments, key_count}`,SQL 按 `(namespace, environment)` 分组走 `idx_entry_ns_env`;前端命名空间/环境改为 Autocomplete 下拉(freeSolo,仍可输新值),删除写死的默认 namespace `ecommerce`,首次加载自动落到真实存在的 namespace。直连与经网关(401 非 404,前缀路由已匹配)均验证 |
| 十服务 Config Center 单源迁移（2026-08-08） | 🟡 | **仓库侧已完成，pre 直发验收已通过，GitOps 尚未闭环**：10 份 `source_sdk.go` 限制 selector 只能是 `config_center`；删除 Consul Bootstrap reader 与测试、`ConfigSourceConsul`/`CONSUL_PATH` 常量、10 个 `dev-consul` target，未设置 `CONFIG_SOURCE_FILE` 时快速失败；Compose、20 份裸 Deployment 和 Helm 全部改挂 `ecommerce-config-source-<env>` Secret，Consul 环境变量仅保留注册发现；library chart 已重打 10 份依赖包，structcheck 守护 selector 路径、只读挂载、`0400` 与非 root 安全上下文。`ecommerce-config-source-pre` 已创建；首次 apply 暴露 `0400 root:root` 导致 UID 1000 无法读取 selector，且 ArgoCD self-heal 回滚到已退役的 Consul KV 后十服务全部 CrashLoop。现已为 Helm 和 20 份裸 Deployment 增加 `runAsUser/runAsGroup/fsGroup=1000` 与 `runAsNonRoot`，保留 Secret `0400`，再次 apply 后 10/10 Pod 连续观察 56 秒均 `1/1 Running`、0 重启，readiness 通过，证明十份 pre selector/Bootstrap 均可读取并完成启动。~~**仍未完成**：ArgoCD ApplicationSet 的自动同步当前临时暂停~~ **2026-08-19 GitOps 验收完成**：集群重建后重新接线，ApplicationSet 自动同步（prune+selfHeal）已恢复，10 份 selector 由 `ecommerce-config-source-pre` 挂载、Config Center 重新部署并灌入 10 份 pre bootstrap，8/10 服务 Running + healthz 全绿（address/search 的失败原因是 Elasticsearch 已退役，与本迁移无关）。详见上方「2026-08-19 集群重建后 GitOps 重新接线」行 |
| 配置加载单测 + 竞态修复 | ✅ | 删除 payment/inventory/address/merchant 4 个引用已删 API(`updateConfig`/`ValidateConfig`/`Server_HTTP.Addr`)的 stale 测试；重写 product 同类 stale 测试(还停在 `Init(configPath)` 文件配置时代)。新用例在 `-race` 下抓到**真实生产竞态**:9 个服务的 `Init` 写 `conf` 未持锁，而 `GetConfig` 用 `RLock` 读(cart 已在双源改造时修过)——已统一补 `confMu.Lock()` |
| 前端配置控制台 | 🟡 | 已迁至独立仓 `config-center/web`：保持 Monaco/玻璃态 CRUD、历史与回滚能力，改为浏览器专用（取消 Tauri 桌面端）并从 `public/config.json` 读取网关与公开 Casdoor 配置。待独立 pnpm 构建与浏览器 CRUD 验证 |
| 配置编辑器增强 | ✅ | 新增 `lib/validate.ts` 统一校验/格式化层:JSON 走 `jsonc-parser`(V8 的 `JSON.parse` 报错常常**不带位置**,拿不到准确行号)、YAML 走 `yaml` 的 `parseDocument`(`toString` 保注释与 anchor)、TOML 走 `smol-toml` + 自写的 `lib/toml-format.ts` 按行格式化(**注释全保留**,代价是不重排 key 顺序;放弃 `@taplo/lib` —— 实测是 34MB 内联 wasm)。编辑器:300ms 防抖实时校验、错误行红波浪线(marker owner `config-format` 与服务端错误的 `server` 分开,互不覆盖)、状态 Chip 显示「第 N 行 第 M 列: 原因」且可点击跳转、格式化按钮 + `Alt+Shift+F`、**校验不过禁用保存**(服务端校验仍是最后一道)、CSS 覆盖层全屏(非原生 Fullscreen API)。布局:`__root.tsx` 改 `height:100dvh` 把滚动容器下沉到 `<main>`,编辑器靠 `flex:1` 吃满剩余高度,不硬编 AppBar 高度。25 个单测(含「同一份 YAML 选 YAML 通过、选 JSON 报错」,锁住校验跟的是下拉选的格式而非文件名) |
| 旧仓 config 前端/桌面入口 | ✅ | 删除 `frontend/apps/config`、`dev:config`/`desktop:config`/`build:config` 及对应 Tauri profile；新控制台由独立仓发布 |
| 下发/Watch 热更新 | ✅ | **不经 Consul 桥接**，配置中心自成一路：`PutKey`/`DeleteKey`/`Rollback` **在写入事务内** `pg_notify('config_changed', 定位信息)`（回滚不会误发；payload 只带 ns/env/key/version，值由订阅方回查，顺带避开 8000 字节上限与密钥）→ `config/internal/data/watcher.go` 用独立 `pgx` 连接 `LISTEN`（不占池槽位）+ 进程内扇出（每订阅者 cap 16 的 channel，**满了丢事件不阻塞监听协程**；断线重连前先 `Fail()` 掉全部订阅者，宁可让客户端重连重取快照，也不留一条「还连着但永远收不到事件」的死流）→ 新增 `WatchKeys` server-stream RPC（先订阅再发快照，反过来会漏掉两步之间的变更；30s 心跳）。服务侧 `source_sdk.go` 实现可选的 `Watcher` 接口（类型断言发现，consul/file 源保持「启动读一次」），指数退避 1s→30s 重连。**读取路径同步改造**（只推不改等于没改：原先所有消费者都在构造期拿走 `*Bootstrap` 快照）：`config.Live`(`atomic.Pointer`+订阅) → `data.PgPool` 实现 `models.DBTX` 与 `otelpgx.PoolStats`（指标注册在壳上，换池后一直有效；`Queries` 与 5 处调用点零改动）、`data.LiveRedis`、`pkg/log` 改 `zap.AtomicLevel`。**改完即可生效**：Ping 通过才换池、旧池延迟 30s 关闭（立刻 Close 会掐断 in-flight 查询）、建池失败记 ERROR 保留旧池。顺带修掉一个致命 bug：`http.Server.WriteTimeout`(5s) 会把长连接流在第一个心跳上打断（客户端每 30s 重连重取快照，看着正常实则一直在抖），新增 `withoutWriteTimeout` 只对流式路由清写截止时间。已在本地集群端到端实跑 6 项：MinIO 域名/日志级别/DB 连接池热生效、`server.addr` 只出 WARN 且端口不变、Redis 改坏记 ERROR 保留旧客户端（`/healthz` 全程 healthy）改回即重建、kill config-service 触发退避重连并由 SNAPSHOT 自愈。**其余 9 个服务已照此全量迁移**，见下一行 |
| 不热生效的三段（有意为之） | ✅ | `server`(重新绑端口会切断 in-flight 连接)、`discovery`(需摘节点重注册，滚动重启更可控)、`observability`(重建 tracer provider 会丢未导出的 span)——变更时打 WARN「该配置段已变更，但需要重启服务才会生效」，绝不让人以为改了就生效 |
| 历史页面重做 + 密钥历史脱敏 | ✅ | **页面铺平**：删掉「卡片套卡片」的嵌套外壳，改成一块面板内左右分栏；去掉 `maxWidth:1200` 铺满宽度，diff 从固定 `58vh` 改为 `flex:1` 吃满剩余高度；diff 栏补 `minWidth:0`（缺了它 Monaco 的固有宽度会把这一栏顶成窄条，正是截图里配置文本被拦腰截断的样子），并开 `useInlineViewWhenSpaceIsLimited`+`renderSideBySideInlineBreakpoint:900`+`wordWrap`——窄容器自动切内联视图，长值折行而不是被裁掉。**真实历史列表**：每行给出 `vN` + 当前/初始标记 + 相对上一版的 `+增 −删` 行数（新增 `lib/linediff.ts`，掐公共前后缀后求 LCS，超 25 万格退化为整段替换；9 个单测）+ 备注 + 作者·相对时间（精确时间在 tooltip）；内容与上一版完全相同的标「无变更」。**「暂无历史」的真凶**：原页面把 `isError` 和「真的没有历史」画成同一个空态——一个 v22 的 key 在后端短暂不可用时看着像从没改过，错误被彻底吞掉；现在分成 加载中/加载失败(带真实 message + 重试)/空 三态，回滚错误也改走 `toAppError`。回滚移到 diff 工具条并加确认弹层（会产生新版本且立刻下发），新增「对比当前 / 对比上一版」切换，左右标签不再出现 `v—`。**后端**：`toPBRevision` 此前不脱敏，`GetKey` 里被打成 `****** ` 的密钥换 `ListRevisions`/`GetRevision` 就能原样读出来——`biz.ConfigRevision` 增 `IsSecret`（由 repo 从所属 entry 带过来），service 层与 `toPBEntry` 共用 `maskedValue` 常量；领域内部（`Rollback`）读到的仍是真值。3 个单测 + 实跑验证（密钥 key 三条读路径全部 `******`，非密钥 key 回滚仍取到真实值） |
| 其余 9 个服务全量迁移 | ✅ | address/behavior/inventory/merchant/order/payment/product/search/user 保持 cart 的 `Source`+`Live` 热更新链（`Live`、`PgPool`/`LiveRedis`、`zap.AtomicLevel`），并补齐 cart 已有的本地 file source、统一 SDK 文件命名。10 个 `cmd/server` 都拆出可被 `fx.ValidateApp` 静态检查的 `appOptions`，新增同构测试后发现并修复 payment 漏注入 `*confv1.Pay`、实际启动到 `data.Module` 才会失败的问题（`payment/cmd/server/main.go`）。10 份 Dockerfile/Makefile 的 Go 基础镜像对齐 `go.mod` 的 1.26.5；address 的 `make conf` 不再误生成 order 配置。2026-08-08 已在上一行继续收敛为 Config Center 单源并完成所有部署清单接线；独立 config-center 自身仍必须从本地 `CONFIG_FILE` 自举，不能从自己的 ConfigService 拉配置 |
| 三份配置对齐 + 灌入配置中心 | ✅ | 以 cart 为标准重排 10 个服务 × dev/pre 共 20 份配置（段序统一 `server → data → 服务专属段 → observability → discovery → search → log → auth`），逐份用各服务**真实的 `Bootstrap` 类型 + 与 `decodeConfig` 完全相同的解码链路**校验。修掉三处内容错误：**behavior 的 KV 一直是 cart 的复制品**（带着它 proto 里没有的 `store`/`search`，缺 `required=true` 的 `recommend`，这就是 `.service-matrix.yaml` 里那条 known_gap）、**product 的 KV 缺 `recommend`**、**payment 的仓库副本缺 `pay`**；补齐 4 份缺失文件（behavior/payment 的 pre 从无到有，product 的 pre 在仓库里缺，**cart 的 pre 缺 `store` 段**——`internal/data/cart.go` 拼 MinIO 缩略图 URL 要用它，pre 环境的图片链接一直是坏的）。**product 的 KV pre.yml 根本不是 pre**：连的是 `pg-dev.dev.test`/`consul.dev.test` 这些外部域名，是 dev 换了个端口，集群内跑必然解析不到。新增 `backend/tools/config-seed` 把 KV 灌进配置中心（源取 KV 而不是仓库文件，因为后者按硬规则 4 不入库、每台机器都不一样），默认 dry-run，写完逐份读回比对；20 个 key 全部写入校验通过 |
| 凭据不再入库 | ✅ | `configs/.gitignore` 里 **`per.yml` 是 `pre.yml` 的笔误**（`4a3eb70b` 引入），加上 address/behavior/merchant/payment 四个服务压根没有这个文件，结果 **11 份含明文凭据的配置文件（PG/Redis/ES 密码、Casdoor `client_secret`、证书）一直被 git 跟踪**，直接违反 AGENTS.md 硬规则 4。已 `git rm --cached` 停止跟踪（本地文件保留）并给 10 个服务统一 `.gitignore`，`git check-ignore` 逐份验过 20/20 拦得住。⚠️ 历史提交里仍有这批凭据，彻底清除需要单独做 history rewrite；这些密码已经泄露过，真要安全得轮换 |
| 配置中心 Go 客户端 SDK | ✅ | 独立仓已提供 `sdk/configsource`、生成契约与 `SourceConfig{file, consul, config_center}`；**`v0.1.0` 语义化 tag 已发布并被 `backend/go.mod:18` 钉住**（本行原写「Cart 已改用远程默认分支伪版本，后续再发布 v0.1.0」，与同表「后端 config 服务」行及 go.mod 自相矛盾，2026-08-06 回扫订正）。升级用 `go get github.com/lens077/config-center@v0.x.y`——`go mod tidy` 只增删不升级 |
| 审批/灰度/密钥加密/审计 | ⬜ | 后续阶段 |

### 6. 推荐链路（gorse）

> 目标：用户漫无目的地逛也能沉淀信号，喂给云上的 gorse，换回个性化/相似/兜底三路召回。

| 项目 | 状态 | 说明 |
|------|------|------|
| gorse 部署排障 | ✅ | `failed to init meta database: unable to open database file: out of memory (14)` 的真凶是 **SQLITE_CANTOPEN(14) 被 gorse 错标成 "out of memory"**：v0.5 的 `--cache-path` 是**目录**不是文件（沿用了 0.4 时代的文件名且没挂 volume）。另外三处同类问题：`GORSE_CACHE_STORE` 把 Redis 指到了 5432、`vector_store` 用相对路径、`[blob] uri` 没挂 volume；镜像 entrypoint 本身已带 `-c /etc/gorse/config.toml`，不必重复传。已按上述修复部署到 `node2:8088`，`/api/health/ready` 全绿 |
| `behavior.proto` + behavior 服务 | ✅ | `backend/api/behavior/v1/behavior.proto`：`Track`（批量埋点）/`Recommend`（个性化+会话+兜底三级降级）/`SimilarItems`。服务按 search 的模板竖切：conf(v1) → data(pg/redis/gorse) → biz → service → server，`go build`/`go vet` 全绿。**摄入侧**：内存队列 + 批量 flush（无消息队列可用，不为此引 Kafka），`behaviors.events` 表的 `synced_at IS NULL` 当 outbox 做补偿重投；Track 非阻塞，队列满即丢并计数，绝不拖慢前端。**时钟纠偏**：客户端时间戳偏移超阈值就用服务端时间，否则会污染 gorse 的 `positive_feedback_ttl` 淘汰 |
| POST vs PUT 语义 | ✅ | gorse 反馈的唯一键是 `(FeedbackType, UserId, ItemId)` 三元组，**POST 累加 `Value`、PUT 覆盖**。只有 `read`/`impression` 走 POST（要配合 `read>=3` 计次），`dwell`（绝对秒数）/`cart`/`favorite`/`purchase`（布尔事实）一律走 PUT —— 加过三次购物车不该拿到 3 倍权重。官方 SDK 还是 `v0.5.0-alpha` 且没有 PUT，故自写 `backend/pkg/gorse` 最小客户端 |
| `dislike` 的落法 | ✅ | 当前 gorse 版本的 `config.toml` **没有 `negative_feedback_types`**，负反馈无处安放。`dislike` 只落 `behaviors.events`，由 behavior 服务在返回推荐结果前自己过滤（`excludeDisliked`，召回时多取 20 条兜底）；`PendingSync` 也把它排除在外，否则补偿循环会对着一个永远同步不出去的事件空转 |
| 网关路由 | ✅ | `/behavior* → discovery:///behavior-service`；三个 RPC 在 `jwt`/`rbac` 的 `router_filter` 里放行 —— **匿名浏览正是最该采集的时段**，要求登录等于把冷启动数据全丢了；服务端仍以网关注入的 `x-md-global-user-id` 优先于请求体的 `anon_id`（后者客户端可伪造）。超时 2s、只重试 1 次：重放埋点会把曝光计数刷虚 |
| `frontend/packages/tracker` | ✅ | 曝光（IntersectionObserver，露出 ≥50% 且连续 ≥1s 才算，会话内去重）/ read / dwell（只计页面可见时间，心跳上报累计值配合 PUT 覆盖）/ cart / favorite / purchase / dislike。**手写 Connect unary JSON 线格式**而不用生成的 connect-web 客户端：`navigator.sendBeacon` 不允许设自定义头（`Connect-Protocol-Version`），而页面关闭时那一次上报带着最完整的停留时长，只有 beacon 送得出去。`anonId` 存 localStorage（跨会话画像的唯一线索）、`sessionId` 存 sessionStorage（曝光去重窗口），Safari 隐私模式降级为一次性 id。`tsc` 通过 |
| product → gorse item 同步 | ✅ | gorse 只认 item，**反馈引用的 ItemId 不存在会被直接丢弃**，所以目录同步是推荐链路的前置条件而非锦上添花。product 服务没有 SPU 写入 RPC，无处挂写钩子；且只靠写路径也补不回 gorse 重装/网络抖动的缺口 —— 改为按 `updated_at` 游标的**增量对账**（游标存 Redis，回拨 1s 防批次边界切开同 `updated_at` 的行；扫满一批立即续扫不等下一个 tick）。下架用 `IsHidden` 而非删除（删了连带作废该商品上已积累的全部反馈）；标签给 brand/category/price_band（价格带取在售 SKU 最低价，`LEFT JOIN` 保证暂无在售 SKU 的 SPU 也同步）。另导出 `SyncByCodes`，将来的写路径直接调 |
| 已实测 | ✅ | ① gorse 的 **POST 累加 / PUT 覆盖**在线上验证：两次 POST `read` → Value=2，两次 PUT `dwell`(30→45) → Value=45，与设计一致。② `behaviors.events` 已在 `ecommerce` 库建表（4 个索引齐全）。③ product 的目录同步走**真实 DB + 真实 gorse** 跑通：4 个 SPU 全量入库，`Categories`/`brand`/`price_band` 标签正确，`/api/latest/1001` 能按分类召回 |
| Config Center 配置 | 🟡 | 历史 KV 的缺段问题已在 Config Center 初次灌入时修复，Consul KV 已退役。当前待用只读 machine token 核对 `product/pre/bootstrap.yaml` 与 `behavior/pre/bootstrap.yaml` 的 `recommend` 段，并随十服务单源迁移实跑 |
| 待验证 | ⬜ | Config Center pre 配置部署后端到端实跑 Track/Recommend/SimilarItems；清理 gorse 里的 `smoke-a/b/c` 测试数据；consumer 前端接入 tracker（`tsconfig` paths + `package.json` 依赖 + 入口 `initTracker` + 商品卡/详情页埋点） |

### 7. 前端

**consumer（消费者端）**

| 页面 | 状态 | 说明 |
|------|------|------|
| 首页 `index` | 🟡 | 已去除 `→/categories` 重定向，改为商品网格首页（卡片+空态）；待接 `ListProducts` 无限滚动（设计见 `docs/design/product/listing.md`） |
| 分类 `categories` | 🟡 | 静态，未接类目 API |
| 商品详情 `product/$spuCode` | ✅ | 已接 `GetProductDetail`（SPU/SKU） |
| 购物车 `cart` | ✅ | 已接购物车 API；本次修复间距 8× 问题并重构紧凑布局 |
| 结算 `checkout` | 🟡 | 已重写：接选中项(useCart 真实 `cart_item_id`)、地址弹层选择+新增(AddressService)、防重 `requestId`、下单调用(`api/order`)；运费恒 0、去优惠券、统一 `sp[]`。待后端补 `CreateOrderRequest.requestId` 与 `CreateOrderResponse.orderNo` 后接通 |
| 订单列表/详情 `orders` | 🟡 | mock 数据，未接订单查询 API |
| 支付结果 `payment/result` | 🟡 | 未接支付状态查询 |
| 个人中心 `profile` | ✅ | 已接真实 API |
| 收货地址 `profile/addresses` | ✅ | 已接 AddressService |
| 登录回调 `callback` | ✅ | Casdoor 登录回调打通 |

**merchant（商家端）** — ⬜ 仅路由骨架（`index/orders/products/reports/settings`），无 `api/` 目录、未接后端

**admin（管理员端）** — ⬜ 仅路由骨架（`index/users/merchants/products/orders/categories/reports/settings`），无 `api/` 目录、未接后端

### 8. 可观测性与测试

| 项目 | 状态 | 说明 |
|------|------|------|
| 链路追踪（OpenTelemetry/Jaeger） | 🟡 | 后端 10 个服务、Gateway 的 OTel 核心 Trace/Metrics 已统一至 `v1.45.0`；Logs 为 `v0.21.0`，`otelhttp` 为 `v0.70.0`，`otelpgx` 为 `v0.11.1`。10 个 Connect 服务端拦截器均同时启用 `WithTrustRemote()` 与 `WithoutServerPeerAttributes()`：保留可信上游 trace context，避免由服务端写入不可靠或高基数的 peer 属性。Gateway 同步迁到 `semconv/v1.41.0` 的稳定 HTTP 属性键。服务端 `otelhttp` 中间件、ES OTel 传输已接入；Config Center 已对齐并通过 Go 测试。补记 `WithoutServerPeerAttributes()` 的实际影响：`net_peer_port` 是**按 TCP 连接**取值的，实测 cart 一个 `rpc_server_duration_milliseconds_count` 就有 39 条序列、`net_peer_port` 39 个不同值,每条只有一个样本且永不递增 —— 于是 **`rate()` 恒为 0**，不只错误率，「请求率 by 服务」「P95 时延 by 服务」在改之前都算不出真实值(不是空图,是错的值)。otelconnect 自己的文档也写明该默认行为 "produces very high-cardinality data"。这与 collector CR 里对 pod 名、lxc 网卡做的基数纪律是同一件事,只是发生在应用侧 |
| OTel SDK 装配基线（11 份收敛为一份） | ✅ | `internal/pkg/otel/otel.go` 原本是 11 份同构副本（语义完全一致，只差函数摆放顺序与注释），同样的问题各带一遍。2026-08 收敛成一份标准实现再分发，并修 7 处：①`AlwaysSample` → `ParentBased(TraceIDRatioBased(x))`，x 走配置 `observability.trace.sample_ratio`。**`ParentBased` 那层不是可选的**：只用 `TraceIDRatioBased` 时每个服务各自掷骰子，ratio=0.1 下一条 5 跳链完整留存的概率是 0.1⁵，拿到的是满屏残缺半截 trace，比不采样更难用；包上之后下游无条件跟随上游决策、只有链路入口才掷骰子 —— 与 `WithTrustRemote` 是配套的（前者让 trace 连得起来，后者让它不被采样采断）②补 `service.instance.id`（`AppInfo.ID` 一直在生成却没进 resource，多副本在指标上被聚成一条曲线，「哪个 pod 在抖」查不了）③自造 attribute `GolangVersion` → `semconv.ProcessRuntimeName/Version`（自造 key 后端无法按标准维度聚合）④装上 `otel.SetErrorHandler` —— SDK 内部错误（导出失败/队列溢出/endpoint 不通）默认是被丢弃的，此前 collector 挂掉应用侧一行日志都没有，表现成「服务一切正常但 Jaeger 里什么都没有」⑤三条管道开 gzip（trace/log 走 443 ingress 出网，原先明文全量上传）⑥metric 导出间隔硬编码 3s → 可配、缺省 30s（3s 是 SDK 默认值 60s 的 20 倍频率，乘服务数后 collector 侧不划算）⑦删掉 `TraceOption/MetricOption/LogOption` 三套 option 类型约 150 行 —— 它们只是为建个临时 struct 再取出 `.tls`，没有任何调用方用可变参数，收敛为一个 `tlsClientConfig`。**配置新增的两个字段刻意用 wrapper 类型**：proto3 裸 `double` 的零值就是 0.0，与「没配置」无法区分 —— 存量配置都还没有 `sample_ratio`，用裸 double 的话升级后会被解析成 0.0 = 一条 trace 都不采，且不报任何错；wrapper 让「没配」是 null 回落到 1.0（与升级前 `AlwaysSample` 一致），同时保留显式配 0.0 彻底关掉的能力，`TestSampleRatio_UnsetFallsBackToOne` 专门守这条 |
| semconv 必须与 sdk 内部版本对齐 | ✅ | `newResource` 用 `resource.Merge(resource.Default(), ...)` 才能拿到 SDK 自己填的 `telemetry.sdk.*`，但 Merge 在两边 schema URL 不一致时返回 `ErrSchemaURLConflict`，而该文件把 `newResource` 的错误当致命处理 —— 所以这**不是「resource 少几个属性」这种 degradation，是 11 个服务在 fx 启动阶段全部起不来**。2026-08-06 升 otel v1.44→v1.45 时真实发生：sdk 内部 semconv 从 v1.41.0 换成 v1.43.0，`otel.go` 没跟着改，`TestNewResource` 里的 `assert.NotEmpty(res.SchemaURL())` 按预期先红（11 个服务 otel 包全 FAIL），而不是等部署时才发现服务拉不起来。**以后升 otel sdk 先做这一步**：`grep -rhoE "otel/semconv/v[0-9.]+" "$(go env GOMODCACHE)/go.opentelemetry.io/otel/sdk@<新版本>/resource/"*.go` 取到内部版本，同步改 `otel.go` 的 semconv import |
| pgx span 名（DB 可观测性） | ✅ | otelpgx 默认把**整段带换行的 SQL** 塞进 span name，而 span name 在后端是个索引维度，SQL 文本进去会撑爆基数、Jaeger 的 operation 下拉框也没法用。踩了两个坑：①先按文档用 `WithTrimSQLInSpanName()`，它取「SQL 的第一个词」，而 sqlc 生成的语句第一个词是注释符 `--`，结果所有查询的 span 名都变成 `query --` —— 基数是降到 1 了，但也彻底分不出哪条是哪条，比不改更糟 ②改用 `WithSpanNameFunc` 后发现**两个选项必须一起给**：`tracer.go` 里是 `if t.trimQuerySpanName { spanName = t.spanNameCtxFunc(...) }`，`WithTrimSQLInSpanName` 才是「启用自定义 span 名」的开关，只给 `WithSpanNameFunc` 的话 span 名依旧是整段 SQL（第一版就白改了一次）。最终写法 `otelpgx.NewTracer(WithTrimSQLInSpanName(), WithSpanNameFunc(otelpkg.SQLSpanName))`，`SQLSpanName` 从 sqlc 的 `-- name: X :kind` 头取查询名 → span 名形如 `query GetCartItems`，完整 SQL 仍在 `db.query.text`。函数放 `internal/pkg/otel` 而不是各自的 `data.go`：它需要测试，写在 data.go 就得复制 11 份且没人测；`TestSQLSpanName_DistinctQueriesStayDistinct` 守「不同查询必须得到不同 span 名」这条。otelpgx v0.10.0→v0.11.1 已核该开关语义未变 |
| 前端性能监控（Web Vitals RUM） | ✅ | 新增 `frontend/packages/perf` + `backend/api/telemetry/v1` + behavior 进程顺带实现 `TelemetryService`。采集：五大指标走 **web-vitals/attribution**（LCP 定格/CLS 会话窗口/INP 高分位这三块手写极易错且错了不报错），LongTask 与 fetch/xhr 耗时拆解（DNS/TCP/TTFB/transferSize）手写 `PerformanceObserver`；**自身上报端点与 Track 埋点从采集中排除**（否则每次上报催生下一次上报）。上报：vitals 攒到 `pagehide`/`visibilitychange(hidden)` 一次 `sendBeacon`（Connect JSON 自包含体，与 tracker 同约定），API 批量走 keepalive fetch，失败不重试。落点：服务端转 OTel histogram（**显式桶**，CLS 用分数刻度；attr 只挂 page/rating —— `page` 是路由模式不是 URL，基数纪律）→ VictoriaMetrics；明细带 attribution 走 zap→otelzap→Loki（字段成结构化元数据可直接查）。网关 `/telemetry*` 路由 + jwt/rbac 白名单（sendBeacon 带不了 JWT 头）已同步 Consul KV。端到端实测：直连/经网关/CORS 预检/空请求 400/非法枚举 400 全过，VM 查得到 `web_vitals_lcp_milliseconds_bucket`（2100ms 落 le=2500 桶）、Loki 查得到带 attribution 的行。顺带删掉 consumer 里 CRA 残留的死代码 `reportWebVitals.ts`（`if (onPerfEntry)` 恒假，web-vitals chunk 从未加载过）。**浏览器真实点击流未跑**（等 consumer 日常使用即自然产生）；Grafana 看板未建（datasource 本就是手工配的） |
| 日志平面自我放大（已断开，但稳态收益远低于预估） | ✅ | 排查「Loki 吃性能」的结论是**前提不成立**:`kubectl top` 下 loki-0 只有 186Mi/13m,全集群内存排第 13、CPU 第 8;真正的大户是 elasticsearch 1679Mi(Jaeger 后端)、cilium ×3 各约 1Gi、apiserver 1035Mi、kibana 929Mi。**写入侧**用 Loki volume API 查得近 24h:`kube-logs`(fluent-bit 采的全部容器日志)438 MiB 占 **99.9%**,而 10 个业务服务经 OTLP 上报的日志合计 0.24 MiB 占 0.05%。把 `kube-logs` 按行内 `k8s.pod_name` 归类(标签坏了只能从正文解析)发现日志平面在自我记录:fluent-bit 33.8% + loki-0 17.7% + VPA 29.7%。**回路**:查一次 Loki → Loki 打一条 ~914B 的 `metrics.go` 统计日志 → fluent-bit 采走 → 推回 Loki → 再记一条 push 日志。**五项改动**:①fluent-bit throttle 的 `Print_Status true→false`(它每 5s 窗口都打一行,有没有真限流都打)②Loki `server.log_level info→warn`(它自己的日志里 `tables_manager.go` 占 44%、`table.go` 21%)③fluent-bit `[INPUT] tail` 加 `Exclude_Path` 排除 fluent-bit 与 loki 自己的容器日志 —— 这两个组件坏的时候本来也不能靠 Loki 查,该用 `kubectl logs` ④VPA `vpa-recommender` 加 `--v=1`(它原本**没有 args**、走镜像默认,每轮把 63 个 VPA 对象的 checkpoint 各打一行)、`vpa-updater` `--v=4→--v=1`(实测 `--v=2` 几乎没用:56 行/120s → 12 行/120s 才是 `--v=1` 的效果)⑤给 loki StatefulSet 建 `loki-vpa`(`updateMode: "Off"` 只出推荐)—— 原先 `loki` 命名空间只有盯 nginx 网关的 `loki-gateway-vpa`,真正会 OOM 的 StatefulSet 反而没被纳管。**实测效果与我的预估不符,如实记**:回路确实断了(fluent-bit 与 loki-0 已完全不再出现在 Loki 的 stream 里),VPA 两个组件按字节占比从 29.7% 降到 9.6%;但**稳态日志量只从 12.01 MiB/h 降到 11.29 MiB/h,约 6%**,而不是我预估的「1/5」。预估错在方法:我拿一个 5 分钟、被 `limit=1000` 截断、且恰好在自己密集查询 Loki 期间取的样本去外推 24h 字节量 —— 那个窗口高估了 fluent-bit / loki-0(两者都与我的查询活动正相关),又完全漏掉了 `elastic-operator`、`my-connect-cluster-connect-0` 这类周期性大写入方(它们在那 5 分钟里一行都没出现)。所以这五项的真实价值在**消除查询压力下的放大**(那正是 OOMKill 的机制),而非稳态降量。**改完后真正的大头**(按字节,最近 15min):elastic-operator 20.5%(单行 1508B)、openebs-lvm-controller 15.8%(1223B)、kafka-connect 14.4%(1335B)、argocd-repo-server 9.0%、kibana 7.7% —— 都不在本轮范围内,要继续降量得从它们下手 |
| fluent-bit 镜像未钉在 values（已修，且我触发过一次） | ✅ | fluent-bit 的 DaemonSet 镜像是**安装后手工 `kubectl patch`** 打成 `docker.io/fluent/fluent-bit:5.0.7-arm64` 的,从未写进 `otel-fluent-bit-values.yml`。于是任何一次 `helm upgrade` 都会把它冲回 chart 默认的 `cr.fluentbit.io/fluent/fluent-bit:5.0.7` —— 那个 registry 从本集群不通(`Head https://registry-1.docker.io/... i/o timeout`),而且默认 tag 不带架构后缀,本集群三个节点全是 arm64。2026-08-06 我做上面那轮改动时正好踩爆:`helm upgrade` 后 DaemonSet 滚到一半,新 pod `ErrImagePull`,node2 的日志采集中断约 4 分钟。已把 `image.repository` / `image.tag` 钉进 values 并重新 upgrade(revision 3),两个 pod 恢复 1/1。教训:`helm get values` 只显示**安装时供的值**,看不出后来手工 patch 过什么 —— 升级前应先 `kubectl get ds -o jsonpath={..image}` 和渲染结果对一遍 |
| 日志（Loki/fluent-bit） | 🟡 | 已部署并在收:collector `logs` 管道 → Loki,fluent-bit 另采容器日志(`job=kube-logs`)。**但 k8s 标签是坏的** —— `k8s__pod_name`/`k8s__namespace_name`/`k8s__container_name` 的值是字面量 `".pod_name"` 之类,所以日志按 pod/namespace 下钻不了,只能按 `detected_level` 聚合。根因在 `fluent-bit.conf:78` 的 `Label_keys $k8s.pod_name, ...`:上面第 61-62 行用 `Nested_under kubernetes` + `Add_prefix k8s.` 把字段拍平了,记录里是一个**名字里带点的扁平 key** `k8s.pod_name`,而 Fluent Bit 的 record accessor 把 `.` 当嵌套分隔符去找 `record["k8s"]["pod_name"]`,找不到就把剩余部分原样输出。正确写法是 `$['k8s.pod_name']`（待修） |
| 指标（VictoriaMetrics/Grafana） | 🟡 | 已部署并在收:collector `metrics` 管道 → VM(2026-08 实测 5 族 57 个指标名:`system_*`/`rpc_server_*`/`pgxpool_*`/`db_client_operation_*`/`process_*`)。看板见 `docs/observability/grafana/`（2026-08-12 起为三盘体系,见下「面板体系重构」行）。**采集缺口进展**:①**采集管道自身健康 `otelcol_*`** —— 2026-08-12 已在 cloud-native-deploy 的 collector CR 加 `prometheus/internal` receiver 自采 `127.0.0.1:8888`（static localhost,DaemonSet 每实例只抓自己,天然无重复;`service_instance_id` 是随重启换的 uuid,已 labeldrop 防基数增殖）,**待 apply 生效**②**无 k8s 对象/容器级指标** —— 没有 kube-state-metrics、没有 cAdvisor（`metrics-server` 只服务 HPA），「pod 重启几次/副本齐不齐/哪个容器吃内存」查不了；补法是 `kubelet_stats` + `k8s_cluster` receiver（distro 里都有，无需引入新组件），但两者都基数敏感，且 `k8s_cluster` 在 DaemonSet 下**必须配 `k8s_leader_elector`**，否则每个 pod 都采一遍变成 N 倍重复 —— 2026-08-06 决定单独一轮做，不与看板混做（仍为 P2）③~~node1(control-plane) 没有主机指标~~ —— **已过时**:2026-08-06 评审实测 DaemonSet 3/3、node1/2/3 各 32 条 system 序列（见「评审对既有证据的订正」）,新基础设施盘的节点数阈值已按 3 设 |
| Grafana 看板 | 🟡 | `docs/observability/grafana/`:`common.py`(数据源/面板构造器/共用 PromQL) + `build_business_overview.py` + `build_infrastructure.py`,JSON 是产物（**改看板改脚本，不要直接编辑 JSON 或只在 UI 里改**）。搬自 cloud-native-deploy 时逐条拿 VM 实测校对，修了五处指标名/口径错误（①`pgxpool_*_conns` 不存在，otelpgx 导出的是 `*_connections`，该面板从建盘起就是空图 ②CLS 的 unit 是 `"1"` 故后缀是 `_ratio` 不是 `_milliseconds` ③`http_server_*` 整族不存在 ④文件系统缺 mountpoint 过滤导致画出 8 条 kubelet PVC bind mount，且分母 `used+free` 漏了 `reserved` 这个 state ⑤**错误率零错误时是空图**），详见该目录 README 的「修正记录」。⑤ 单独说明：`rpc_connect_rpc_error_code` 这个标签**只挂在出错的序列上**，零错误时分子一条序列都没有，相除得空集而不是 0 —— 而空图看起来像看板坏了、不像「没有错误」（实测踩到:服务明明健康，错误率图一片空白，第一反应是查询写错了）。改成用分母乘 0 兜底：`(sum by (svc) (rate(m{code!=""})) or sum by (svc) (rate(m)) * 0) / sum by (svc) (rate(m))`。**刻意不用 `or on() vector(0)`**：实测它在 VictoriaMetrics 上能出结果（VM 把无标签单序列当标量广播到右侧每个分组），但 Prometheus 不做这个广播，无标签左操作数匹配不上带 `service_name` 的右操作数，结果仍是空 —— 换后端就又坏了；按分组乘 0 两边都对。该惯用法收在 `common.py` 的 `zero_filled()`（含原因 docstring），它有一个有意的性质:只给分母里存在的分组补 0，完全没流量的服务仍然不出现 —— 不该给一个没跑起来的服务画 0% 让人误以为健康。同类毛病还修了基础设施盘的「DB 错误率」（`db_client_operation_errors_total` 在从没出错过的服务上整条序列都不存在，实测 cart 做了 51 次 DB 操作零错误、面板里就没有 cart）。判断标准是「该指标是否覆盖分母里的每一个分组」而不是「它有没有序列」—— 按后者筛会漏掉 DB 那个；核过确实没问题的：`system_network_errors_total`/`dropped_total`（hostmetrics 恒发，2 节点×2 方向 4 条全在）、`pgxpool_empty_acquire_total`/`canceled_acquires_total`（RecordStats 恒发，覆盖全部上报服务）。56 条 PromQL 已全部在 VM 实跑验证语法（失败 0）。~~仍缺:网关 HTTP 指标未实现;11 个电商服务没有 Go 运行时指标~~ —— 两者均已于 2026-08-12 补齐埋点、待发版生效（见下「面板体系重构」行）。~~实测其 `process_*` 在 2026-08-06 12:52 后停止上报而同进程 `pgxpool_*` 仍正常，是 sysstat 侧问题~~ —— **这条诊断是错的，已核实并推翻**：那两族指标根本不来自同一个进程。`process_*` 停在 12:52 是因为带 sysstat 的那个本地测试实例在那一刻被关掉了；继续发 `pgxpool_*` 的是 **`backend/services/config`**（本仓的旧配置服务），它恰好也报同一个 `service_name`。核实方法：`lsof -ti :30010` 拿到当时在跑的 PID，其二进制里 `sysstat`/`gopsutil`/`promql`/`system.v1` 四个符号的出现次数**全是 0**，即它压根不含那份代码。根因见下一行的「service_name 撞名」，不是 sysstat 的 bug |
| 面板体系重构(三盘 + 全面型告警,对标 ARMS 裁剪为 Go 版) | 🟡 | 2026-08-12,起点是把阿里云 ARMS 应用监控文档摘抄进 `docs/observability/面板设计.md` 做对标,经 grilling 会话敲定后**原地重写**为本仓设计真相源(术语口径/三盘 row 级设计/优先级/ARMS 裁剪对照表 15 条/告警清单)。**面板**:业务盘(服务健康行迁出、红绿灯扩成 6 格)+ **新建 APM 盘** `ecommerce-apm`(全服务 RED → `$service` 详情:错误分析/Go runtime/DB/Redis/网关/出站依赖,每区块带 Jaeger 跳转)+ 基础设施盘(节点数阈值 2→3、删借 config-center 数据的 runtime 行、新增遥测管道健康 + Kafka 两行、**修掉「DB 错误率画成错误/秒」旧口径错并补 `db_system_name` 过滤**)。**告警**:`build_alerts.py` 生成 17 条规则(Grafana unified alerting,sidecar ConfigMap 通道,severity critical/warning 两级;**暂不接通知渠道**,将来接飞书只路由 critical;payment 从错误率告警排除 —— 它 5 个 RPC 全是 Unimplemented 桩,面板上恒红是暴露、告警里排除防淹没)。**口径要点**(全部实测 VM 后定,收在 `common.py` 常量):错误分服务侧/客户端侧两类(`SERVER_FAULT_CODES`/`CLIENT_FAULT_CODES`),只有服务侧进 SLO;成功请求**没有** `rpc_connect_rpc_error_code` 标签(OBSERVABILITY.md 说的「已修为 ok」只在日志侧,metrics 不是);「慢」只用 P50/95/99 分位数,**删掉 ARMS「慢调用次数」概念**(阈值计数不可行动);`db.client.operation.duration` 是 otelpgx 与 redisotel 共用的 semconv 名,**任何 `db_client_*` 查询必须带 `db_system_name` 过滤**否则 Redis 上线当天 DB 时延图被微秒样本拉出假优化。**埋点四项**(Q11 全做):①backend `otel.go` 基线加 runtime instrumentation(`go_goroutine_count`/`go_memory_*`/`go_schedule_duration` —— runtime v0.70 无 GC pause 指标,调度延迟直方图是替代信号,经 `metric.WithProducer` 挂 PeriodicReader)+ 10 服务分发(md5 校验同构)②9 个 `buildRedis` 装配 redisotel-native v9.21(**Init 必须先于 NewClient**,连接池 gauge 在 NewClient 时注册,晚了漏池级指标;经 `otel.EnsureRedisInstrumentation` sync.Once 幂等)③网关补 MeterProvider —— `otelhttp.NewHandler` 一直在记 `http.server.request.duration` 但挂在 noop 上,`middleware/tracing` 初始化 meter 后即出数;**顺手修掉 TLS bug**(`AppendCertsFromPEM` 成功/失败分支写反 + `WithTLSClientConfig` 返回值被丢弃,TLS 从未生效过)④collector 加 `prometheus/kafka` receiver(kubernetes_sd + `spec.nodeName=${env:K8S_NODE_NAME}` field selector 做 node-local,避免 DaemonSet N 倍抓取;RBAC 复用已有 pods list/watch)+ Kafka/Connect CR 补 `metricsConfig`(Strimzi 官方 jmx rules 原文,broker patch 会滚动重启 —— CDC 无真实消费者影响为零;javaagent 约 50-100Mi 堆外,broker limit 1Gi 余量 ~256Mi,**patch 后盯 RSS**)。**验证**:109 条 PromQL(三盘 + 17 告警)全部 VM 实跑,语法失败 0、40 条当场有数,空图逐条归因(P1 待部署/dev 无流量)。待办:①集群侧 apply(collector CR/Kafka patch/告警 ConfigMap/面板导入)②backend+gateway 发版后按 面板设计.md §7 清单逐族核对 P1 预写指标名③告警阈值按真实曲线校准 + 注入故障验证(杀 pod/断 Dragonfly/停 collector) |
| GMV 与客单价口径 | ✅ | 业务大盘的订单数、GMV(应付)、客单价、日订单趋势和日 GMV 已从按商家拆分的 `orders.order_main` 改为按用户一次结算的 `orders.order_group`。`order_main` 仍只用于商家子订单状态与支付完成率；金额卡固定两位小数，避免 Grafana 自动精度隐藏角分 |
| service_name 撞名（config-service） | ✅ | 旧 `backend/services/config` 及重复 Config API 已随 `config-center v0.1.0` 退役。独立服务保留 `service_name="config-service"` 以兼容 Consul/网关，并发布 `service_namespace="config-center"`；配置中心 System 查询同时要求两项标签，电商两张 Grafana 看板排除该基础设施服务，历史同名序列不会再混入 |
| 前端测试（playwright + vitest） | 🟡 | consumer 首个用例落地：`hooks/useCart.test.tsx` 用 `createRouterTransport` 桩 GetCart，锁住「后端数据 → store」这条同步路径在重渲染与 StrictMode 下都只跑一次（effect 写 store → 订阅回调 setState → 再渲染，本身是个反馈环，查询结果引用一不稳就闭合成死循环）。config app 另有 `linediff`/`validate` 两组。仍缺：e2e 与其余 app |
| 后端单元/集成测试 | 🟡 | `internal/pkg/config` **10 个服务全覆盖**(cart + address/payment/inventory/merchant/product/order/search/user/behavior，覆盖率 76%~85%，`-race` 全绿)：用 `httptest` 起 Consul KV / ConnectRPC 桩打**真实客户端**，覆盖选源、YAML 解析、duration 钩子、404/空值/不可达/context 取消等错误分支。cart 的 `internal/pkg/log`(100%)、`internal/pkg/registry`(90.1%) 已重写；address/merchant/payment 的 registry 及 gateway 的 config/cors/jwt/rbac/routerfilter 过时测试已收敛为本地可重复单测。6 个 stale `log` 测试包已随配置迁移一并重写（10 个服务的 `internal/pkg/log` 现已全绿，含日志级别热生效用例）。仍缺：各服务 biz/data/service 层 |
| cart log/registry 单测重写 | ✅ | 两个 stale 测试跟着实现改签名后一直编译不过。`log`:改打 `*confv1.Bootstrap`，并把断言从 `Core().Enabled`(被 otel core Tee 后不可信)换成**接管 `os.Stdout` 断言真实输出** —— 级别过滤/JSON 可解析/console 非 JSON/caller 行号；顺带纠正老用例的错误断言(非法级别回落的是 **Debug** 不是 Info)。`registry`:删掉已不存在的 `ParseToTCPAddr`/`TtlDuration` 用例，改用 **httptest 桩 Consul Agent**(注册/心跳/注销三端点)打真实 client，断言注册报文的端口取自 `Server.Addr`、地址取自 `AppInfo.Host`、CheckID 为 `service:<ID>`、`Deregister` 先掐心跳再摘节点；并覆盖 fx `Module` 的完整生命周期与三条降级分支 |
| 构建与部署清单对齐 | ✅ | **Makefile**：①`--build-arg GOIMAGE` 一直是空传 —— Dockerfile 声明的是 `ARG GO_IMAGE`（下划线），改名后 merchant 那份落后的 `golang:1.25.8` 才真正生效，同步升到 1.26.1（`go.mod` 要求 1.26.1，不升会直接编译失败）；②`docker-build` 传的 `GOOS/GOARCH` 无人消费（Dockerfile 用 buildx 注入的 `TARGETOS/TARGETARCH`），改为由 `--platform $(GOOS)/$(GOARCH)` 单一来源决定，顶部默认从 `arm64` 改回与命令一致的 `amd64`；③`docker-build` 硬编 `-t ...:dev` 而 `docker-push` 推 `:$(VERSION)`，`VERSION!=dev` 时 `docker-deploy` 必然推空 —— 统一走 `$(VERSION)`；④address 的 `dev`/`pre` 从 order 抄来（`CONSUL_PATH=ecommerce/order/*`，读的是别人的配置）、payment 的 `SERVICE_NAME="payment-service "` 带尾空格（注册进 Consul 的服务名就带空格，网关按 `payment-service` 永远找不到节点）；⑤`CONSUL_ADDR=consul.dev.test` 从宿主机不通，10 份统一改为 `CONSUL_KV_ADDR ?= 192.168.3.112:8500`。**deploy**：7 个服务是扁平布局，而 `make k8s-dev` 跑的是 `kubectl apply -f deploy/dev`（必然 no such file）；address/inventory/merchant/payment 四份还停在 `example/example:dev` 模板，config 是 cart 的整份复制，order/product 的 dev+prod 是 user 的整份复制。全部按 `deploy/{dev,prod}` 重生成：端口取自 Consul KV 真实 `server.addr`（user 30001…config 30010），`SERVICE_NAME` 对齐网关 `discovery:///<name>`（原先的 `cart-service-v1`/`user-identity-v1` 后缀会让路由找不到节点），删掉 `RUN_MODE`/`CONFIG_CENTER`/`CONFIG_PATH` 这套代码早已不读的 configMap；就绪探针打 `/healthz`、存活探针只探 TCP（`/healthz` 会连 DB/缓存，拿它做存活会让一次数据库抖动把所有 Pod 连环重启）。**compose**：10 份全是错的（address/merchant/payment 三份起的是 search，order 起的是 user，inventory/product 起的是 `connect-example-backend`），环境变量整体重写为与 `make dev` 逐项一致，并补 `backend/compose.yaml` 一把拉起全部服务。**.gitignore**：10 个服务里有 7 个的 `.gitignore` 写了 `Makefile`，构建入口从来没进过版本库（inventory/order/product 三个是跟踪的，说明是复制粘贴带进来的误伤）——修好的 Makefile 只存在于本机、CI 也拿不到，已移除该行并把 7 份 Makefile 一并纳入版本控制 |
| inventory 注册链路对齐 | ✅ | inventory 是 10 个服务里唯一没跟上 registry 重构的:①`Register()` 用 `SplitHostPort(r.Addr)` 拿的是 **Consul 自己的地址**,把 Consul 登记成了 inventory 的端点,网关按它路由会打回 Consul —— 改为与其余 9 个一致的 `info.Host` + 自身 `server.addr` 端口,tag 补 `info.Version`,TTL/注销时长改从 `discovery.consul.check` 读(并补上 Check.Ttl 的判空);②心跳挂在 `OnStart` 的 ctx 上,而那个 ctx 只管启动超时、`OnStart` 一返回就被取消,心跳立刻退出,服务 30s 后被 Consul 判死摘除 —— 改用 `context.Background()`;③删掉调试用的 `fmt.Printf("拆分失败")` 与无人调用的 `ParseToTCPAddr`(其 6 个用例还依赖真实 DNS 解析 example.com)。**线上 Consul KV** 的 `discovery.consul.addr` 被人手工改成 `consul.dev.test:8500`(→192.168.3.110:8500,connection refused)去迁就①的 `SplitHostPort`,已按 CAS 改回与仓库种子/其余 9 个服务一致的 `consul.dev.test`;`consul-kv.json` 因此无 diff。验证:`172.22.0.7:30005` tags `[v1 fx ttl]`、TTL check passing,与 cart 同形 |
| Consul 注册路径空指针修复 | ✅ | **10 个服务**的 `registry/consul.go` 同一类"判空写在解引用之后"的错,三处一并修掉:①`consulCfg.Tls.Enable && consulCfg.Tls != nil` —— 配置没写 `tls` 段(本地/内网集群的常态)直接 panic；②`Register` 裸解引用 `Discovery.Consul.Check.Ttl.Duration`，没写 `check` 段同样 panic，改为返回错误(而非裸注册：没有健康检查的实例会被 Consul 一直当健康的，流量照打进来，比注册失败更难发现)；③`TtlCheckPinger` 把 `ping_interval` 直接喂给 `time.NewTicker`，缺失或为 0 时 panic —— 且它跑在独立 goroutine 里，**panic 会带走整个进程**，改为回落 10s 默认值。原有 5 个服务的判空版本也只判了 nil 没判 `>0`，一并统一。cart 侧由 `TestModule_WithoutTLSConfig` / `TestRegister_MissingCheckConfig` / `TestTtlCheckPinger_MissingPingInterval` 覆盖 |
| payment 上线 + 网关补齐 4 条路由 | ✅ | payment 是 10 个服务里唯一起不来的:①`data.Module` 里 `NewPaymentRepo` 整个被注释掉,`fx.Provide` 却还引用着它,**编译就过不去**,所以它既不在 `SERVICES` 也不在 `compose.yaml` 里 —— 原实现依赖已被移除的 balance/consumerOrder 两个 client,恢复是另一件事,先把 repo 做成显式返回 `Unimplemented`(code 12) 的桩:服务能起、能注册,调用方拿到的是"未实现"而不是网关 503,分得清是链路不通还是功能没做;②`NewAlipay` 裸解引用 `c.Alipay.AppId`,而**没有任何一份 KV 写过 `pay:` 段**,fx 的 provider 一 panic 整个进程就没了 —— 支付宝私钥/证书是真实凭据不可能进仓库,改为缺配置时返回 nil + WARN;③payment 的 KV 是全场唯一的异类:Consul 指向已过期的 `consul.sumery.com:443`(其 CA 2026-07-27 到期)、缺 `check:` 段(注册会静默失败)、`store:` 段它的 proto 根本没有 —— 按 cart 的模板整份重生成并补空 `pay:` 占位。**网关**:`/order* /inventory* /merchant* /payment*` 四条 endpoint 此前完全没有(前端打过来是 404),补齐并配 policies —— 按 RPC 粒度而非整段放行:`CompleteOrder` 只给 merchant(给 consumer 等于允许自己把订单标记完成)、merchant 的审批/激活只给 admin(否则申请人能自己批自己)、`/inventory.v1.*` 只给 admin(服务间调用,放给 consumer 等于任何登录用户能预占/释放任意 SKU);支付宝的 `HandlePaymentNotify/Callback` 由支付宝服务端发起,不可能带 JWT,在 jwt+rbac 两个 `router_filter` 里放行,可信性靠报文验签。验证:10 个容器全 healthy 且注册 passing,四条新路由实发流量得 401(路由命中/JWT 拒绝)、回调得 200+code 12、未定义前缀得 404 作对照,accesslog 显示 `backend=172.22.0.6:30008` |

---

## 二、订单分布式一致性方案（已定）

> 方案本体已移至 **[`docs/design/order/consistency.md`](docs/design/order/consistency.md)**
> （Outbox + TCC-Try + 编舞 Saga 三段式；设计不住进度文件）。下面只留治理项的落地追踪。

编舞 Saga 的四项治理（必须随事件驱动一起落，否则流程失控）：

- [ ] **幂等消费**：consumer 以 `order_no`/事件 ID 去重（消息至少投递一次语义）
- [ ] **显式补偿事件**：`StockReserveFailed → 订单自动取消` 等补偿作为一等公民设计，不散落
- [ ] **状态即真相**：`order_status` 作为"这单走到哪"的唯一可见状态，弥补编舞流程不可见
- [ ] **超时兜底 job**：扫 `pay_deadline` / 卡在中间态的订单做补偿或告警（编舞无中心，必须有 backstop）
- [ ] **全链路 trace_id**：事件贯穿 `trace_id`，靠 Jaeger/OTel 追踪定位

---

## 三、近期待办（按优先级）

先打通「消费者核心交易闭环」，再向商家/管理端与非核心能力扩展。

### P0 · 鉴权改造的收尾（2026-08-19，代码已完成，剩下的都在 Casdoor 控制台/基础设施侧）

- [x] ~~**Casdoor 开 `enableSigninSession`**~~ **已完成**（连同 `enableAutoSignin`）。
      这是静默续期的前提：令牌只存内存，刷新页面靠 `prompt=none` 拿 Casdoor 会话 Cookie 换新令牌。
      ⚠️ **验证时别用匿名接口**：`GET /api/get-application` 对未登录请求把
      `enableSigninSession` 一律脱敏成 `false`（而 `enableAutoSignin` 不脱敏），
      照它判断会得出"没生效"的错误结论。必须带管理员登录态读。
- [x] ~~**补 `redirectUris`**~~ **已完成**：现为 `http://localhost:3000/callback`、
      `https://config.app.com/callback`、`https://shop.apikv.com/callback`。
- [x] ~~**newt 重装**~~ **已完成**（2026-08-19）：新站点 `k8s-cluster`(siteId 4) online；
      旧站点 `k8s`(siteId 3) 已删（secret 不回显、旧集群 helm values 已消失，救不回来）。
      现由 **kubernetes 仓 `components/newt/`** 管理（manifest 安装 —— 上游
      `fosrl.github.io/newt` 实测 404，无 chart 仓库）。**链路已实测打通**：
      `config.apikv.com` 200 / `config-api.apikv.com` 401，证明
      公网 → Pangolin → newt → cilium-gateway → 服务 整条可用。
      顺带修好两处旧账：资源 3/4 的 target 还指着旧集群已消失的 ClusterIP `10.97.94.118`；
      两条 HTTPRoute 的 hostname 是 `.app.com` 而非 `.apikv.com`。
- [x] ~~**Pangolin 资源**~~ `gateway.apikv.com`(resourceId 14) 与 `shop.apikv.com`(resourceId 15)
      已建，target `10.99.145.85:443` https，**SSO 已关**（应用自己走 Casdoor，再套一层会登录两次）。
- [x] ~~**部署网关本体到集群**~~ **2026-08-19 已完成并端到端验证通过**。新建 `gateway/deploy/pre/`
      （dev 那份用的是 `-dev` selector，且三份清单都没写 `namespace`，会随 context 漂）；
      网关的四个条目灌进 Config Center（`namespace=gateway env=pre`，`is_secret=false`）；
      镜像 `sha-03f9fa5`（含本次安全修复）。**三项验证**：
      ① 公网 `https://gateway.apikv.com` → product 免鉴权路由 **200**（业务层参数校验响应）；
      ② `cart.GetCart` 不带 token → **401**；
      ③ **伪造 `x-md-global-user-id` 被剥离并留痕**（日志 `丢弃客户端自带的身份头`）。
      RBAC 角色缓存已接入 Redis（`TLS=true, TTL 5m`）。

      **过程中修掉的四个真问题**（都不是本次改动引入的，是集群重建后的存量）：
      1. **10 个服务全都没有 `CONSUL_HTTP_TOKEN`** —— Consul 08-18 开了 ACL 后没人补。
         失败是**静默的**：注册看似成功、读返回 200 但被 ACL 过滤成空，
         `/v1/catalog/services` 只有 `{"consul":[]}`，表现为"服务活着、网关永远路由不到"。
         已在 `helm/values.yaml` 给 10 个服务统一补上。
      2. 网关配置里 Consul 地址写死成旧集群 LB IP `192.168.3.112`（现已漂到 `.102`），
         且 configMap 指向 **8501/https —— 那个端口根本不存在**（只有 8500/http）。
         症状是 `context deadline exceeded`，像网络抖动。已改走 Service DNS。
      3. **`optional: true` 的 Secret 卷，若 Pod 早于 Secret 创建会挂成空目录且不回填**，
         重启一次才有。`redis-tls-ca` 踩到，表现为"Secret 明明有内容、容器里却是空目录"。
      4. 集群内 Redis 有 `requirepass`，缺密码时组件按设计降级为仅进程内缓存
         （不阻断启动），因此 `NOAUTH` 只在日志出现一次，极易忽略。已补 `REDIS_PASSWORD`。

      **另记一条 GitOps 现场教训**：直接 `kubectl apply` 改 Deployment 会被 ArgoCD 的
      selfHeal 在秒级同步回去（本次实测撞上）。`helm/values.yaml` 是真相源，只能走 Git。
- [x] ~~**部署前端**~~ **已完成**：`https://shop.apikv.com` 首页 200。
- [x] **真浏览器跑通登录后修掉的 5 个问题（2026-08-19）**——它们的共同点是
      **单测和 tsc 一个字都不会说**，要么在响应头里，要么只在「真浏览器 + 真 Casdoor
      + 真跨源」的组合下才显形；页面看着完全正常，但登录态是坏的。
      ①**顶栏用 `isLoggedIn()` 这个非订阅式函数** —— 令牌改内存态后，登录成功不再
      产生任何能触发重渲染的信号，顶栏永远停在首渲结果（表现为"用户资料都拿到了，
      顶栏还显示未登录"）。改用 `useAuthState()`；`isLoggedIn` 已标 `@deprecated`，
      全仓无调用方。②**CSP 漏 `font-src`** —— MUI 图标字体是 base64 `data:` URI，
      只有 `default-src 'self'` 时被全拦（实测 5 条违规），图标是空的但不看控制台
      发现不了。③**`frame-src` 漏 `'self'`** ④**`X-Frame-Options: DENY` 挡死静默续期** ——
      ③④同一个成因：静默续期的最后一跳是 Casdoor 把 iframe **重定向回我们自己的
      `/callback`**，两者都会把这一跳拒掉，`postMessage` 发不出来 → 每次刷新都要重登。
      原注释断言"DENY 只约束别人嵌我们、不影响我们嵌别人"是**错的**；且控制台那条
      CSP 违规写的是被拦的是 shop 自己的 URL，极易看反方向。已改 `SAMEORIGIN` +
      `frame-ancestors 'self'`。⑤**`img-src` 漏 `cdn.casbin.org`**（Casdoor 默认头像）。
      **线上实测已生效**：`curl -D-` 读 `https://shop.apikv.com/` 的响应头，
      CSP 八段与 `X-Frame-Options: SAMEORIGIN` 与仓库一致。
- [x] **删掉 `localStorage.user`，用户资料改从 JWT 派生（2026-08-19）**：它是令牌还存
      localStorage 时代的产物，令牌改内存态后变成纯负债 —— PII 无限期留盘且登出带不走，
      而且它是**未经验证的输入**（`hooks/useAddresses.ts` 直接拿 `account.id` 当 `userId`
      发请求）。**但不能直接删**：它是当时唯一让资料跨刷新存活的东西，删掉会让刷新后
      头像昵称变空、`useAddresses` 拿空 `userId` 发请求，且不报任何错。改为 store 订阅
      令牌变化、从 JWT 解出资料（Casdoor 的 JWT 本来就带这些 claim），一处派生覆盖
      登录/续期/冷启动/登出四条路径。**顺带修掉两个同源问题**：AppBar 的登出是第二条
      并行路径，只调 `clearToken()` 漏了 `stopRenew()`——续期定时器在登出后照跑，到点用
      Casdoor 会话 Cookie 静默换新令牌，即**登出后会自己登回去**；以及 `setAccount({})`
      是 `{...旧值, ...{}}`，**什么都清不掉**，而登出与两处路由守卫全写的这个。
      已补 6 条 store 单测（含反证：注掉订阅后 3 条转红）。
- [x] **登录冒烟测试接进 CI（2026-08-19）**：`apps/consumer/e2e/login.smoke.mjs`，
      `frontend.yml` 里独立 job `smoke-login`，走 `workflow_dispatch` + 每日定时，
      **不挂在发版流水线上** —— 它测的是线上已部署的那一份，放构建前跑等于测上个版本，
      放构建后又要等 ArgoCD 同步完（时长不可控）；且它依赖外部基础设施（Casdoor、
      Pangolin 隧道、网关），红了不该卡发版。断言覆盖 PKCE 参数、无 `client_secret`、
      localStorage 无 token/user、刷新后登录态与头像仍在、全程零 CSP 违规。
      **待办**：仓库要配 `CASDOOR_E2E_USER` / `CASDOOR_E2E_PASS` 两个 secret，
      没配时该 job 整体跳过（不是失败）。
- [ ] ⚠️ **`frontend.yml` 的构建/发布段已经全是死引用，跑起来必失败**（2026-08-19 实查，
      本轮只加了 smoke job，没动它）：`file: frontend/Dockerfile` **不存在**（真实位置是
      `frontend/apps/consumer/Dockerfile`）、`helm/charts/frontend/` **不存在**、
      registry 写的 `harbor.apikv.com:5443` 本集群没部署（前端实际用 TCR）、
      Manifest 仓库路径 `connect-example/frontend/argo.yaml` 是另一个项目的布局。
      前端目前是手工 `kubectl apply frontend/apps/consumer/deploy/pre/` 部署的。
      要么按现状重写这条流水线，要么删掉只留 smoke job，别让它假装还在工作
- [ ] **网关部署补 `redis-tls-ca` Secret**：`deploy/dev/deployment.yaml` 已挂载但标了
      `optional: true`（缺了只退化成仅进程内缓存，不会让网关起不来）。
      `kubectl -n redis get secret redis-tls -o jsonpath='{.data.ca\.crt}' | base64 -d` 后
      在网关所在命名空间建同名 Secret。
- [ ] **Casdoor 密码策略只有 `AtLeast6`**，且无 IP 限制；正式上线前收紧。
- [ ] **`/api/get-application` 匿名可读**（返回值已脱敏，`clientSecret`/`tokenFormat` 为 `***`），
      仍会泄露应用存在性与部分配置形态。评估是否在 Pangolin 侧限制。

### P0 · 假成功与越权（2026-08-06 对抗评审发现，优先于一切新功能）

> 这批的共同点是**调用会「成功」但结果是错的**，或**任何登录用户都能越权**。
> 比「未实现」更危险：不会在联调时暴露，只在上量后以超卖、丢单、数据泄露的形式爆发。
> 双模型独立评审 + 逐条代码核实，全文见 `docs/reviews/ADVERSARIAL_REVIEW_20260806.md`。
> `payment` 显式返回 `Unimplemented` 的做法是本仓的正确示范，下面几处应向它看齐。

- [ ] **库存 `Reserve` 静默无操作**（`inventory/internal/data/inventory.go:52`）：传当前 version 而非 `+1`、
      检查 execrows 为 0 时返回冲突错误、修正扣减量语义、错误分支传对变量、整段包进 `ExecTx`
- [ ] **库存 `ReleaseReserve` 是 panic 桩**（同文件 :88）：实现或至少改成显式 `Unimplemented`
- [ ] **`CreateOrder` 返回假成功**（`order/internal/service/order.go:31`、`application/order.go:61`）：
      **立即改成显式 `CodeUnimplemented` 止血**——结算页已接线，当前用户会看到「下单成功」但无订单
- [ ] **`CompleteOrder` 不落库**（`order/internal/data/order.go:83`）：实现 `SaveOrder`；
      持久化成功前不得发布 `OrderCompleted`
- [ ] **地址服务全线越权**（`address/internal/service/address.go:26,71,84,95`）：user 取自网关身份头、
      所有查询加 `AND user_id = ?`、网关策略从 `AddressService/*` 整段放行收敛到 RPC 粒度
- [ ] **商家审批全表 UPDATE**（`merchant/internal/data/queries/merchant.sql:23`）：补
      `WHERE application_id = @application_id`，repo 层把 `ApplicationId` 传下去
- [ ] **登录 token 落日志**（`user/internal/data/user.go:39`）：删掉 `u.l.Debug(token.AccessToken)`
- [ ] **`AddProductToCart` 必然失败**（`cart/internal/data/queries/cart.sql:3` vs `schema/cart.sql:17`）：
      INSERT 补 `shop_name`（proto/biz/data 一路补字段）或给 schema 默认值——需先定契约
- [ ] **`UpdateCartItemQuantityParams` 缺 Quantity 字段**（`cart/internal/data/cart.go:57`）
- [ ] **商家 `RejectApplication`/`ActivateMerchant` 是 panic 桩**（`merchant_service.go:57,98`）
- [ ] **网关重试可复制非幂等写**（`gateway/proxy/proxy.go:263-310`）：补 `requestId` 幂等键，
      或对非幂等方法关闭重试（与下方「下单防重的 requestId 一直是假的」一起做）
- [ ] **搜索读的字段与 `docs/design/search/search.md` 的 ES mapping 不兼容**（`search/internal/data/search.go:63-90`）：
      实现读 `id`/`skus[].price`/`sale_detail[].quantity`，设计写 `spu_id`/顶层 `price`/`sale_count`——
      按设计建索引则结果全为零值。二者需对齐（改实现或改设计，待决策）
- [ ] **给上述路径补测试**：本轮 22 条发现全部位于零覆盖路径上，`go test ./...` 却是全绿的——
      不补测试，修完还会重演

### 其余近期待办

- [ ] **集群重装在即（2026-08-21 登记）**：组件数据不保留（拍板），脚本与配置全部以 git 为源自动重建。恢复链均已实测：①`~/lens077/kubernetes` bootstrap 装集群（`/etc/containerd/certs.d`、kubelet 配置等节点自定义项已入库脚本化；动手前逐条过其 `bootstrap/config.env` 尾部「重建须知」，creds 目录——尤其 `dragonfly-password`——先带走）②组件按 config.env 开关重装，external-secrets 注入 AppRole 后密钥自 VPS Vault 流回 ③`ADDON_CNPG` 勾选即自动建 pg-main+`ecommerce` 库 ④建表走 `make migrate-cnpg-up`（12 迁移实测全过）⑤config-center `scripts/deploy-k8s.sh` + bootstrap SQL 直灌 ⑥ArgoCD 按上表「2026-08-19 集群重建后 GitOps 重新接线」行的 runbook 接回（config source Secret/tcr-pull-secret/pg-ca-cert）
- [x] **AI Coding 交付效率治理与日报（2026-08-19）**：阅读腾讯健康实践，将可信状态、
      组织摩擦、P50/P85、长尾指标、人机责任边界和日报证据规则写入
      `context/harness-framework/delivery-efficiency.md`；基于今日 3 个提交及已知本地修改生成
      `docs/reports/2026-08-19.md`，来源不明的并发变更按用户要求排除
- [x] **Go PGO 评估与验收指南（2026-08-19）**：阅读 Go PGO 实测文章，将优化机制、
      profile 代表性、交叉负载验证、收益边界、回退条件与 profile 管理要求补入
      `docs/design/platform/performance.md`；外部实验的 2%–4.7% 提升不作为项目性能承诺
- [x] **go-redis 使用约定补充（2026-08-19）**：阅读 OneUptime 教程，将 cache-aside、连接池、
      `context`、Key/TTL、Pipeline、Pub/Sub 与锁的可靠性边界合并到 `context/team/go-redis.md`；
      同步两级 INDEX，`verify-context` 与 `verify-freeze` 门禁通过
- [x] **配置 YAML 的 IDE 校验（2026-08-18）**：`make conf-schema` 从各服务 `conf.proto` 生成 `configs/bootstrap.schema.json`（protovalidate `in`/`required` → schema `enum`/`required`，Duration 后处理成 Go 风格正则），IDEA 映射在 `.idea/jsonSchemas.xml`（gitignore，工作区 `~/lens077/.idea` 与仓库 `.idea` 各一份），GoLand 实测能拦枚举/类型/未知键/缺段。顺带修掉三处「约束从没匹配过现实」的 proto 漂移（server.addr 带端口、casdoor.endpoint 是 URL、consul.addr 端口可选）+ behavior 配置里 proto 未定义的 `log.elasticsearch` 块。详见 `context/project/ecommerce/config/INDEX.md`
- [x] **运行时 protovalidate 接线（2026-08-18，matrix config_validation 的 known_defect 已修）**：10 个服务的 `decodeConfig` 开 `ErrorUnused`（未知键报错），`Init`/热更新在解码后调 `protovalidate.Validate`；启动校验失败直接起不来，热更新校验失败保留当前配置只记 ERROR。先跑红后跑绿（未知键/缺 required 段/校验失败保留配置三用例），每服务新增 `TestRealConfigFiles_DecodeAndValidate` 在本机验证真实 dev/pre.yml（CI 自动 skip）。**接线立即暴露并修掉一批规则类型错配**：`uint32` 字段挂 `int32` 规则、`repeated string` 挂标量 `string` 规则（protovalidate 运行时编译直接报错，schema 生成器此前静默忽略）——`allowed_origins`/ES `addresses` 改为 `repeated.items.string.uri`（真实值都带 scheme）。structcheck 同构门禁与全量构建通过
- [x] **发布前置：配置中心 bootstrap.yaml 审计（2026-08-18 完成）**——经确认本地 `configs/{dev,pre}.yml` 即配置中心内容的副本。20 份全部通过「解码 + protovalidate」全链路（`go test -run TestRealConfigFiles ./services/*/internal/pkg/config/`），并用严格 YAML 解析器扫过无重复键。期间修掉 user/dev.yml 里 redis 块整套键重复（换本地 Redis 时旧 dragonfly 尾部键没删，Go 解析器静默取后者不报错，IDE 才看得见）。以后改配置后照这两条命令复验即可
- [ ] **全量 `make generate`/`make conf` 是坏的（2026-08-18 发现，先于本轮存在）**：order/payment/address/cart/merchant 五个服务目录下各有一份 `services/<svc>/third_party/validate/validate.proto` 复制品，与 `backend/third_party/validate/validate.proto` 的扩展号 1159/1160 冲突，buf 全量 build 直接失败（`field number used more than once`）；带 `--path` 的按服务生成不受影响（conf-schema 就是这么绕的）。修法：删掉五份复制品（先确认没有 proto 以相对路径 import 它们）
- [ ] **文档整理遗留（2026-08-07 盘点发现，本轮未动）**：①`docs/SCAFFOLD.md` §四内嵌的 AGENTS.md 模板还是旧版「项目速览」结构，与真身已分叉，需同步 ②~~`.github/workflows/backend.yml` 过时~~（2026-08-07 已重写为模板+矩阵，见上「CI/CD」行）；`frontend.yml`（2025-11）仍是 `connect-example-*` 旧身份待重写——**且它本就是 tag 触发：2026-08-20 起每个发布 tag 都会唤起它并在 Setup pnpm 步失败（pnpm/action-setup 自装炸），发布页红噪直到重写** ④`gateway/README.md` 的 CI badge 与 `go.mod` module 名仍是上游 `go-kratos/gateway` 身份 ⑤`frontend/apps/{admin,merchant}` 缺 README（与 consumer/desktop 不对称）⑥`gateway/.github/workflows/gitee-sync.yaml` 上游残留可删 ⑦`.scratch/architecture-hardening/` 只有 spec.md 没按 `docs/agents/issue-tracker.md` 拆 issues/
- [x] **`service_name` 撞名**：已退役 `backend/services/config`；独立 config-center 用 `service.namespace=config-center` 区分遥测，系统查询精确筛选，电商 Grafana 看板排除其基础设施指标
- [ ] **订单服务**：补 `GetOrder` / `ListOrders` / `CancelOrder` RPC 与订单状态机（带守卫的状态迁移 + `order_log`）
- [x] **数据库迁移工具落地（2026-08-21，异构对抗第4轮终裁 goose v3）**：10 服务 `internal/data/schema/*.sql` 全部转为 `internal/data/migrations/*.sql`（goose 注解、DDL 语义原样，仅两处真实修复：user 删模板残留 `CREATE DATABASE connect_example`、inventory 修非法 `warehouse_id VARCHAR DEFAULT 1`）；examples 示例数据改写为**幂等种子** `internal/data/seeds/*.sql`（goose no-versioning：ON CONFLICT/NOT EXISTS 守卫、外键改业务键子查询，删掉故意冲突演示与 TRUNCATE；order 示例 650.50×5≠3250 的金额不一致已修）；工具 `backend/tools/dbmigrate`（goose 库内嵌零外部 CLI，per-service 版本表 `public.goose_db_version_<svc>` + per-service 咨询锁 + `baseline` 接管存量库）+ `make migrate-up/-status/-down/-create/seed/seed-down`；sqlc 的 `schema:` 全部改指 migrations 目录（官方支持解析 goose 注解），**连真库重生成暴露并补齐三笔生成物欠账**（merchant 缺整张 agreement 表与两列、order `merchant_id` int64→UUID、product SKU 枚举名规范化 `ProductsSkusStatusEnum`）；postgres:18-alpine 实测 up/幂等重跑/seed×2 计数不变/down-to 0 回滚/up 重放/baseline 记账+拒绝重复 全绿。规范沉淀 `context/team/db-migrations.md`（含 `SET search_path` 毒版本表等三坑），操作手册 `backend/tools/dbmigrate/README.md`。集群 CNPG 首次接管手顺：port-forward 后 `make migrate-baseline`（未执行，等发布窗口）
- [ ] **一致性底座**：落 Outbox 表 + **自写 relay → NATS JetStream**（2026-08-20 选型定稿，原「Kafka relay」表述作废，见下「技术选型定稿」小节），替换现有进程内 `GoEventBus`（跨服务事件当前到不了其他服务）。**2026-08-21 底座代码与 dev 集群 worker 已落地并完成回灌/积压重放验证**（见「③NATS JetStream 落地」行的进展注），剩 Product Service 事务内生产者、order 侧接线、NATS 鉴权与声明式治理
- [ ] **建单全链路**：cart 补"按 CartItemIds 取选中项"RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车
- [x] **consumer 结算页（前端）**：已接选中项/地址弹层选择+新增/防重 requestId/下单调用，去优惠券、运费恒 0、统一 sp[]；生成 `api/order` 客户端并在 `gen/api` 导出 order
- [ ] **consumer 结算页（待后端联通）**：后端补 `CreateOrderRequest.requestId`、`CreateOrderResponse.orderNo` 并 `make api` 后，提交订单接真实响应、跳真实支付页（现为固定 `/payment/result` 占位）
- [ ] **下单防重的 `requestId` 一直是假的（迁 connect-query 时查实）**：旧代码 `client.createOrder(message as Parameters<...>[0])` 在假装 proto 有这个字段，而 `CreateOrderRequest` 只有 `cartItemIds`/`addressId`/`remark` 三个，那个 UUID 运行时直接被丢掉 —— 也就是说**防重从来没生效过**。迁移时删掉了那个 cast 和对应的 `useState`，把「假装成立」改成了明面上不成立，结算页留了 TODO。要真生效得先补 proto 字段再 `make api`，与上一条一起做
- [ ] **cart 的删除/改数量前端未接线**：`RemoveCartItem` 后端实现完整；**`UpdateCartItemQuantity` 后端也不完整**——`UpdateCartItemQuantityParams` 里根本没有 Quantity 字段（`internal/data/cart.go:57`），即便前端接上也改不了数量，需先补字段（本行原写「后端实现完整」，2026-08-06 回扫订正）。前端 `useCart` 的 `removeItem`/`updateQuantity` 只动本地 valtio store 不发请求 —— **用户删掉商品后刷新页面它会回来**（`GetCart` 拉的还是旧数据，同步 effect 会 clear 再灌回去），即删除与改数量这两个功能对用户实际不存在。修法：两个 hook 各接 `useMutation` + `invalidateQueries`，模式与现有 `addProductToCart` 同构。**同批的 `GetCartSummary` 已删**（2026-08，见下一条）
- [x] **购物车 cart_item_id 修复（前后端已闭环）**：后端 `AddProductToCart` SQL 改 `RETURNING id`、`AddProductToCartResponse` 增 `cart_item_id`（proto/biz/data/service 已改，`make api` 已跑，`make sqlc` 需在有 DB 的环境重跑以校验，手写已对齐）；前端 `store/cart.ts` 删除伪造 ID、`useCart` 从 `GetCart` 取真实 ID、`api/cart` 乐观新增改用后端返回的真实 `cart_item_id`
- [ ] **consumer 订单页**：订单列表/详情接真实查询 API，替换 mock
- [ ] **支付闭环**：`payment/result` 接支付状态查询 + 回调后订单状态同步（订单订阅 `OrderPaid`）
- [ ] **库存联动**：下单同步 `Reserve`（TCC-Try），支付成功确认扣减，取消/超时 `ReleaseReserve`
- [ ] **商品服务 ListProducts（设计已定，见 `docs/design/product/listing.md`）**：首页无限滚动 + 游标(keyset)分页，无总数；`ProductCard` 含 brand/价格区间(min~max)。落地：`product.proto`→`make api`→`query.sql`→`make sqlc`→biz/data/service 样板→前端 `useInfiniteQuery` 接首页
- [x] **商品示例数据**：`schema/examples/spu.sql`+`sku.sql` 追加 3 个商品（罗技鼠标/索尼耳机/Nike 跑鞋，SPU 5–7，多 SKU）
- [ ] **推荐链路收尾**：~~建表~~ / ~~修 gorse 部署~~ / ~~product item 同步实测~~ 已完成；只差把带 `recommend:` 的 `ecommerce/{product,behavior}/dev.yml` 上传 Consul KV → 起服务端到端验证 Track/Recommend/SimilarItems → 删掉 gorse 里的 `smoke-a/b/c`
- [ ] **consumer 接入 tracker**：`tsconfig.json` 加 `@ecommerce/tracker` paths、`package.json` 加 `workspace:*` 依赖、入口 `initTracker({gatewayUrl})`、商品卡挂 `useImpression`、详情页挂 `useProductView`、加购/收藏/支付成功处补 `tracker().cart/favorite/purchase`
- [ ] **领域事件**：引入 **NATS JetStream**（2026-08-20 选型定稿替代 Kafka），落地 `OrderCreated/OrderPaid/OrderCancelled` 事件驱动（编舞 Saga）+ CloudEvents 信封（TECH-RADAR 1.6）
- [ ] **订单缺陷修复**：金额改 `decimal`（现为 `float64`）、修 `AddressPostalCode` 空指针、统一 `merchant_id` 类型（UUID）、`Complete()` 应要求已发货
- [ ] **merchant 端**：新增 `api/` 客户端，接商家入驻/商品/订单
- [ ] **admin 端**：新增 `api/` 客户端，接商家审核/用户/类目管理
- [ ] **RBAC**：补齐三角色细粒度权限校验与网关策略
- [ ] **测试**：补 consumer 关键路径 playwright/vitest 用例、后端核心 biz 单测
- [ ] **日志限流（方案已定稿，待拍板实现）**：防"基础设施故障 → 周期性错误日志"风暴（真实暴露面：PG 挂时 behavior `flush()` 每 2s 一条 ERROR、Consul 断连时 11 个服务的 `TtlCheckPinger` 各每 10s 一条，且都经 otelzap 走网络到 Loki，故障时恰是网络最脆弱时；DEBUG 级别现在能热改，忘改回去的风险也变高了）。**机制**：用 zap 内置 Sampler Core 包在 `newLogger` 的 Tee 外层（两条通路 stdout+otelzap 都受管），按 message 键控——结构化日志的 message 是常量串，等价于 VM 按调用位置限流；不选 fluent-bit/collector 侧（只保护存储，保护不了应用自身 I/O）。**分级**：FATAL/PANIC 永不限；ERROR/WARN 每秒同消息前 3 条放行、之后 1/100；INFO 前 10 条；DEBUG 跟随或不限。**压制必须可见**：丢弃钩子打 OTel counter `logs_suppressed_total`（带 level 标签）进 VM——压制速率突增本身就是故障信号，比日志更早；静默压制是最大反模式。**配置**：第一版写常量不动 proto（阈值不是按环境调的东西），要调再走 `Log.Application` 加字段。**铺开**：`internal/pkg/log/log.go` 10 份复制关系全改（同日志级别热生效那轮的改法），网关日志栈不同这轮不动。**测试**（先跑红）：①1s 内 1000 条同消息 ERROR 只写出 ~13 条 ②counter 记到 ~987 ③风暴中其他消息与 FATAL 直通；端到端停 PG 实测"前 3 条 + 稀疏心跳"。待定两点：阈值 3/100 可调；INFO 是否纳管（更保守就只管 ERROR/WARN）
- [x] **可观测性**：Loki 日志采集、VictoriaMetrics 指标、Grafana 看板（业务盘 + 基础设施盘）均已落地，见 `docs/observability/grafana/`
- [x] **前端错误基线**：`vp lint` 的 25 条告警已清零；修复未处理导航 Promise、定位 API 的 async Promise executor、SKU JSON 属性的 `[object Object]` 展示风险与 `VirtualList` 对函数式 `sx` 的错误展开。consumer、merchant、admin 的生产构建均通过
- [x] **merchant 首包拆分**：补齐已安装但未启用的 TanStack Router Vite 插件，修正报表路由的 `as any` 非字面量声明后启用 `autoCodeSplitting`。首页入口从 `926.92 kB`（gzip `298.70 kB`）降至 `340.92 kB`（gzip `108.89 kB`）；ECharts 报表移至仅访问 `/reports` 才加载的独立 `526.58 kB` chunk
- [x] **可观测性 · RPC 指标基数失控（已修）**：11 个服务的 otelconnect 拦截器加 `WithoutServerPeerAttributes()`。`net_peer_port` 按 TCP 连接取值，实测 cart 单个 `rpc_server_duration_milliseconds_count` 就有 39 条序列、每条只有一个样本且永不递增 → `rate()` 恒为 0，「请求率/错误率/P95」在改之前算的都是错的值。代价：server span 与指标上不再有 `net.peer.*`（调用方 IP 仍能从 trace 上游 span 看到）
- [x] **可观测性 · 采样率可配（已落地）**：`observability.trace.sample_ratio`（wrapper 类型，不配=1.0 全采）+ `observability.metric.export_interval`（不配=30s）。上生产前把 `sample_ratio` 显式调下来；采样器是 `ParentBased(TraceIDRatioBased(x))`，整条链的采样决策一致，不会采出半截 trace
- [ ] **可观测性 · 采集管道自盲（优先级最高，代价最小）**：`otelcol_*` 不在 VM 里，只在每个 collector pod 的 `:8888`，没有任何东西采集它。后果是"遥测有没有在半路丢"只能靠 `kubectl port-forward` 逐个 pod 看——2026-08-06 排查 trace 断链时就是这么干的。补法：collector 加 `prometheus` receiver 自采 `127.0.0.1:8888`，约 30 个序列。做完基础设施盘补一行 accepted/sent/send_failed + 队列深度
- [ ] **可观测性 · k8s 视角（单独一轮，勿与看板混做）**：上 `kubelet_stats`（容器/Pod CPU 内存）+ `k8s_cluster`（Pod 重启次数、Deployment 副本状态）receiver，distro 里都有、无需引入新组件。两个前置约束：①都是基数敏感的，`kubelet_stats` 要按 collector CR 里已有的那套思路控制维度（**别带 pod 名**，Pod 名带 ReplicaSet 哈希，每次发版全部序列作废重开一套）②`k8s_cluster` 是集群单例语义，在 DaemonSet 下**必须配 `k8s_leader_elector`**，否则每个 pod 各采一遍 = N 倍重复计数，且要加 ClusterRole
- [ ] **可观测性 · fluent-bit k8s 标签失效**：`fluent-bit.conf:78` 的 `Label_keys $k8s.pod_name, $k8s.namespace_name, $k8s.container_name` 取不到值，Loki 里这三个标签的值是字面量 `".pod_name"` 之类，日志按 pod/namespace 下钻不了。根因：第 61-62 行 `Nested_under kubernetes` + `Add_prefix k8s.` 把字段拍平成了名字里带点的**扁平 key**，而 record accessor 把 `.` 当嵌套分隔符。改 `$['k8s.pod_name']` 形式
- [ ] **可观测性 · 网关指标未实现**：`gateway/` 下没有任何 meter（只有 tracing 中间件），`http_server_*` 整族不存在，所以看板上「网关→上游 HTTP 时延」这张图已删。要看网关侧耗时得先加 metrics 中间件
- [ ] **可观测性 · 10 个电商服务缺 Go 运行时指标**：goroutine/堆/进程 CPU 内存全都没有。唯一在报的是**独立仓 config-center**（它实现了 `internal/pkg/sysstat`），而不是本仓任何服务；它以 `service.namespace=config-center` 区分遥测。把那套搬进 10 个服务，或抽成共享埋点。附带：config-center 未装 OTel ErrorHandler，导出失败没有任何日志（本仓 10 个服务已在 2026-08-06 那轮补上，可照抄）
- [ ] **技术债**：修复 `product/$spuCode.tsx:156` 的 `shopName` 类型报错；清理其余 mock 数据

### 技术选型定稿（2026-08-20 三轮对抗评审，回填记录）

> **结论真相源**：[`docs/TECH-RADAR.md`](docs/TECH-RADAR.md)（定稿版，逐行状态+结论）；过程证据：[`docs/技术栈选型对抗/`](docs/技术栈选型对抗/)（claude 主稿 × codex(gpt-5.6-terra) × claude2 三方独立稿 + 三轮审阅表）。`STACK.md` §二 已挂定稿指针并订正数据/中间件现状表。
> **环境前提（用户设定）**：集群 = 3× PD 虚拟机（arm64，4c/6.5G，同宿主 Mac ⇒ 伪故障域，异地备份是硬前提）；线上 2 台低可用 docker 机：4c4G=备份靶、2c2G=哨兵，均不载业务。
> **用户直接拍板**：ClickHouse 单节点 / 网关保持自研+不上网格+LB Cilium 零新增 / VictoriaLogs+Vector / OpenFGA / trust-manager。
> 以下待办按定稿优先级排列；标 ⁽ᴿ³⁾ 的项有对抗第 3 轮实施稿与补丁清单可直接执行。

- [x] **⓪e Vector 采集加固（2026-08-21）**：VM 官方 log-collectors-benchmark 与本集群 08-20 PII 冒烟**独立互证**「`glob_minimum_cooldown_ms` 默认 60s 静默丢新 Pod 头分钟日志」——已修：收紧 10s + `read_from: beginning`（checkpoint 已持久化，不回灌旧文件），helm 已滚动、渲染双参确认；**功能级回归被集群重建打断，新集群起来后按 vector README 手法补验**。雷达 8.5 记陷阱已修、新增 8.9 vlagent 🟡 观察（无 VRL 等价=非候选，翻盘条件在档）
- [x] **⓪d 建库自动化 + 迁移真库实测（2026-08-21 完成）**：部署仓 postgres 组件从「只装算子+手工提示」升级为**勾选 ADDON_CNPG 即全自动**（算子→pg-main 实例→ecommerce 库，PG_CREATE_MAIN_CLUSTER 可退回手工；现集群幂等实测 unchanged×3+condition met）；第 4 轮 migrations 线在当前 CNPG 用一次性 migrate_smoke 库**真库实测**：12 迁移全过→19 业务表+9 goose 版本表、重跑 no-op、seed 幂等执行；一键命令固化 `make migrate-cnpg-up`（tools/dbmigrate/cnpg-up.sh，临时 LB 直连；port-forward 对 PG 场景实测即死、网关 VIP 需 SNI 域名两坑记 README）。user 表在 public 的历史债与 sale_detail/cart_item 单数表名照旧不趁机改
- [x] **⓪c CI 触发改为仅 tag（2026-08-20 完成）**：`backend.yml` 由 push-path 改为仅 semver tag `X.Y.Z` 触发（dispatch 留手动例外；frontend.yml 本就是 tag 制）；detect diff 基线改上一 semver tag；镜像升级 `X.Y.Z`+`sha-<7>` 双标、values 回写用版本号。规范=`context/team/git-commit.md`「发布 tag 与 CI 触发」（X=破坏性/Y=功能/Z=其余；tag 不可变；**必须推 github 远端**），AGENTS 反直觉约定挂索引，触发事故记 evolution-log（同日 push 即全量构建+机器人回写历史分叉两连击）。旧 `v1.3.x` 系冻结不匹配新模式；新制首 tag `1.4.0`
- [x] **⓪b 缓存切回 Dragonfly + 原生 TLS（2026-08-20 完成，先关停 redis 后切换）**：dragonflydb 组件镜像 redis 组件 TLS 形态（cert-manager `global-ca-issuer` 签 `dragonfly-tls`，SAN 含 `dragonfly.dragonfly.svc`；6379 单口 TLS-only；网关重写 TCP 6380 直通，顺手清掉 L428 的 Terminate 死路）；**密码与 redis 同值 ⇒ 全链 host-only 切换**：Config Center 10 份 pre bootstrap SQL 替换+revision 补行、本地副本 10/10 同步、CC 自举 Secret 同步替换。**验证**：TLS+CA 严格校验 PONG / SET-GET / 明文被 `Bad TLS header` 拒（三段冒烟）→ 10 服务+网关滚动后 cart healthz `{"postgres":"ok","redis":"ok"}`、dragonfly `connected_clients:13`。**踩坑已沉淀**：滚动重启引爆「CC 早已 NotReady」隐雷——CC 自己也是 redis 消费者且不在 config.entry 排查面（老 pod 靠内存配置掩盖），见 `context/project/ecommerce/config/experience/config-center-self-bootstrap-blindspot.md`；⑤去 Consul/⑧casdoor 收编照此消费者三查清单执行。redis 组件 scale 0 留备回滚
- [x] **⓪定稿栈部署测试（2026-08-20 完成，node1/node2 测试环境）**：11 组件按 `~/lens077/kubernetes` 组件契约（component.env/install.sh/values/README/examples）部署并逐项验证——NATS(R3 杀 pod 选主实测)/VictoriaLogs(29.5k 行/h 入库)/Vector(**PII 端到端脱敏实证 + 原始手机号全库 0 命中反证**)/ClickHouse(SQL 通,内存帽 1.2G)/OpenFGA(check `allowed=true`,store=pg-main `Database`+`DatabaseRole` CR)/OpenBao×ESO(init→unseal→kv-v2→只读 token→ExternalSecret Ready 全链路)/trust-manager(Bundle 自动分发新 ns 实测)/Kyverno(audit PolicyReport 产出,策略 failurePolicy=Ignore 防阻塞)/KEDA(cron 0→2 实测)/Argo Rollouts(金丝雀 Healthy 2/2)/Spegel(**P2P 命中实证**:同镜像 node1 首拉 8.811s→node2 102ms(86×),hit 计数器 docker.io=1、TCR 自然流量=2;containerd 2.3.4 实测 `use_local_image_pull=false` 不碍 mirror,免改节点)。**两个裁决/发现**：①**OpenKruise 撤除**——fail-closed 全局 pod webhook 在单副本 manager 崩溃期冻结全集群 Pod 创建(含挡自己新 pod 的死锁),ImagePullJob 收益<风险,TECH-RADAR 7.2 应改 ❌暂缓(第 3 节点/无 webhook 最小安装再试)；②**控制面 4 天重启史定性=宿主 Mac 睡眠冻结客户机**(PSI 零压力+etcd 293s 时间戳断层+node2 自发重启实证),测试期建议 caffeinate 防睡眠。完整记录与坑册：`~/lens077/kubernetes/DEPLOY-RECORD-2026-08-20.md`；OpenBao 每次重启需手工解封(examples/unseal.sh)
- [x] **⓪d 存量 MinIO 切 Silo 分叉（2026-08-20 完成；据用户情报当日复审，记录=TECH-RADAR §10 复审附记：主结论 SeaweedFS 维持、silo 🟡 收编备选、「上游无人修 CVE」论据降级为「修复线转移至单厂商分叉」）**：node2 `/home/docker/minio/compose.yml`（服务器侧真相源，备份 `compose.yml.bak-20260820`）镜像 `pgsty/minio`（原无 tag + `pull_policy: always`，顺手消掉漂移面）→ `pgsty/silo:RELEASE.2026-08-06T00-00-00Z@sha256:29a498b…`（pin digest）；旧运行 digest `b6bfe72…` 恰是 silo 上游升级测试 pin 的对照组镜像=走的就是官方实测过的升级路径。**踩坑（已沉淀 `context/team/tls-enablement.md`）**：silo 镜像仍 root 运行但 `HOME=/tmp`，默认证书搜索路径随之离开 `/root/.minio/certs` → TLS 静默降级 HTTP、公网 500 约 3 分钟；修复=command 显式 `--certs-dir /root/.minio/certs`。**实测验收**：容器 healthy、启动横幅 `API: https://`、bucket `ecommerce` 与对象完好（mcli ls 通——silo 镜像自带 mcli）、公网严格校验 root=403/health=200 与切换前基线一致、缩略图匿名 GET 200（94KiB，cart 消费路径）；回退=镜像行换回 `b6bfe72…`。选型评审教训另沉淀 `context/team/tech-selection.md`（镜像谱系必查三件套）
- [ ] **①灾备止血——⏸ 用户拍板暂缓（2026-08-20：测试期数据不重要、Mac 全灭场景接受重建）**。**重启触发条件（任一命中即恢复为最高优先）**：出现真实用户/不可再生数据或上线前；casdoor 收编落地（⑧，IdP 数据入集群）；OpenBao 成为正式凭据后端（②(c)，其 file 存储承载真凭据）。方案存档（不重议）：4c4G 云箱 SeaweedFS 备份靶 → Velero（K8s 资源+非 PG PVC）+ CNPG Barman Cloud Plugin（PG 一致性 PITR，RPO=WAL 5min）→ age 密文着陆 → 哨兵互拨 → 每周恢复演练。**拆出独立保留**：商品图 MinIO→SeaweedFS 迁移（供应链风险与数据重要性无关，见 TECH-RADAR 10.6；未来任何备份流量不写 MinIO）
- [ ] **②凭据整改次序化**（对抗第 1 轮 D1 定稿）：(a) 即刻用现有手段吊销/轮换/盘点泄露口令（止血不等工具）(b) 按硬规则 5 修订 AGENTS.md 硬规则 4 措辞并记 evolution-log（触发事故=git 历史明文凭据）(c) 修订合入后上 **external-secrets + OpenBao**（锁 chart/image digest）(d) SOPS+ksops 管 bootstrap 静态密文兼应急路径 (e) 新链路完成正式轮换后 P0 关闭；**trust-manager 同窗上**（CA bundle 分发，修 /etc/ssl/certs 遮蔽坑）
- [ ] **③NATS JetStream 落地**（TECH-RADAR §1 定稿）：helm 3-server（meta R3）+ NACK CRD 进 ArgoCD → stream 分级副本（**交易域 R3、埋点 R1**）→ outbox 表按 CloudEvents 属性设计 + 自写 relay（复用 pg_notify 经验，`Nats-Msg-Id=outbox_id`）→ 首接消费者=search 索引喂养 → **交易事件接入前置=R1 故障→outbox 积压重放演练**；季度演练：`prlctl stop` 单 VM 验选主+重放+CNPG switchover；随后退役 Strimzi/Kafka/Debezium 部署。**2026-08-21 应用侧底座已落地并本地实跑贯通**（异构对抗第4轮维持本链路、否决 Debezium Server/Sequin/pglogrepl/Watermill/Benthos/PeerDB 换件，审阅表见 docs/技术栈选型对抗/）：`products.outbox` 迁移（CloudEvents 属性列+未发布部分索引，`product/internal/data/migrations/00004_outbox.sql`）、`backend/pkg/outbox`（同事务 Insert+pg_notify 唤醒；relay=咨询锁单活+批扫 `FOR UPDATE SKIP LOCKED`+按 id 序首错即停保序+PubAck 后标记+按龄清理+滞留 WARN 告警锚点）、`backend/pkg/searchindex`（durable pull 消费者：Meili task **succeeded 才 ACK**、毒消息 MaxDeliver 后 TERM 留痕、spu.deleted tombstone、全量重建=临时索引+index swap 原子切换；索引 schema 一次定稿清掉三笔历史债：顶层数值 id/price/sale_count + filterable/sortable 设置）、独立二进制 `tools/outbox-relay`+`tools/search-indexer`+端到端校验 `tools/cdc-demo`（compose 起 PG18/NATS2.12/Meili v1.53，实测 upsert 0.3s 进索引、tombstone 0.3s 删除、outbox 全 published、重建路径可搜，`tools/cdc-demo/run.sh` 10s 全绿）。codex t3 终稿攻击后加固两处并复跑 PASS：消费者默认 `MaxAckPending=1` 串行保序（JetStream 重投不回插原序）+ reindex 水位 delta 补偿（swap 竞态窗口按 `updated_at>=水位` 重放含删除侧）。**2026-08-21 dev 集群已落地**：NATS 3/3 server + 3 个 Bound PVC；relay 幂等创建 R1 `ECOMMERCE_EVENTS(events.>)`，indexer durable=`search-indexer`/filter=`events.product.>`/`MaxAckPending=1`，两者均使用 digest 固定的独立 TCR 镜像、Secret 和最小 egress NetworkPolicy。仓库幂等 seed Job 灌入 7 SPU/13 SKU/21 销量明细，reindex Job 经临时索引+swap 回灌 7 文档；8 组名称/描述/SPU/拼写容错查询 top1 正确，已记录 `苹果手机` 无法召回英文品牌的词表缺口。真实 outbox upsert 已贯通，另实测 relay 停机时事件保持 pending、恢复后发布且 consumer pending=0；并发 reindex 被 PostgreSQL 咨询锁拒绝，释放锁后重跑成功且临时索引已清理。**仍未完成**：Product Service 尚无商品写 RPC，也未在业务事务中调用 `outbox.Insert`；terminal delivery 持久 DLQ/告警（完成前 dev relay 已禁用 published outbox 清理）、NATS TLS/客户端认证、NACK CRD/ArgoCD 声明式 stream、KEDA lag 扩缩和大样本中文相关性评测继续保留。search 服务本体 ES→Meili 已完成（见下方搜索小节）
- [ ] **④日志栈切换**（用户拍板）：Vector DaemonSet 替 fluent-bit（**VRL 重写 PII 脱敏 + `vector test` 反例用例进 CI**，正面修 P0 脱敏失效）→ VictoriaLogs 单机版落地 → **≤72h 有界双写**（验收：PII 反例被拦、3 个 logs 面板改 datasource、查询等价抽查、丢/重检查）→ 切主，Loki 冻结只读至保留期满退役
- [ ] **⑤服务发现去 Consul（四步）**：每服务建 ClusterIP+readiness → 网关双写影子解析比对（Consul vs Service DNS）→ 灰度切 ClusterIP（**gRPC/h2c 长连接对策**：每 endpoint 多连接+优雅轮换 → headless+DNS → watch EndpointSlice）→ 删 Registrar、退役 Consul、收 NetworkPolicy + 开 Cilium WireGuard + Hubble。**开发机通信配套**：mirrord（默认 mirror；steal 限 dev+TTL）+ 网关 VIP 直连（dev 允许、prod 收敛）
- [ ] **⑥KEDA**（graduated）：`cron`（大促预热）+ `prometheus`（VM）scaler **先行不等 NATS**；NATS 落地后加 `nats-jetstream` scaler（社区维护，验收 lag 语义）；`maxReplicaCount` 按节点余量圈死；与 VPA 分工不同调同一指标
- [ ] **⑦Argo Rollouts**（**硬前置=⑤完成**，此前 Service 权重切分不生效）：AnalysisTemplate 接 VM（Prometheus 协议）；无状态服务多副本+容量余量后启用金丝雀
- [ ] **⑧casdoor 收编进集群** ⁽ᴿ³⁾（方案=对抗第 3 轮 R3-A + 3 补丁）：P0 查证（DB 引擎/redirect 白名单含 Tauri loopback/钉 arm64 镜像 digest **同版本迁移禁升级**）→ P1 集群就绪（`Database` CR 建 casdoor 库 + **JWKS `/api/certs` 与现网 diff==0 门禁**）→ P2 切流（写冻结→终版 dump（**+校验和/行数断言**）→ Pangolin 路由切集群 newt，停机 ≤30min，回退=路由切回+旧容器 start）→ P3 收内（仅 user-service endpoint 一处改动；集群内短期 http+NetPol，避 TODO L32 CA 遮蔽坑）；验收 8 项 + **切流后 CSP/XFO/Set-Cookie 头 diff 冒烟** + 节点 NTP 前置；公网 origin `casdoor.apikv.com` 不变 ⇒ 前端零改动、存量 token 存活
- [ ] **⑨mirrord×KPR PoC** ⁽ᴿ³⁾（验收单=对抗第 3 轮 R3-B + 5 补丁）：`{Consul,DNS}×{mirror,steal}` 四格矩阵 + 基线；**netkit 兼容探针为第一 go/no-go**；grpc **trailers/status 保真断言**；**健康检查路径排除出 steal**（防 pod 被摘）；既有 h2c 长连接 tcpdump 双视角实录；本地 DNS 解析 svc 域名；outgoing 写共享库声明+只读角色；性能门槛 p95 增量 ≤max(5ms,10%)；prod 护栏=无 RoleBinding+MirrordClusterPolicy block；通过后 mirrord 转默认内环，Okteto 保留集群身份场景（devwindow 纪律随之仅限 Okteto 使用时）
- [ ] **⑩CI 供应链三阶段** ⁽ᴿ³⁾（实施稿=对抗第 3 轮 R3-C + 6 补丁，并入 DEVOPS.md 阶段①④）：阶段一 `backend.yml` 加 security job（gitleaks+Trivy fs 门禁+豁免流程）+ 全部 action 改 40 位 SHA（+renovate 更新链）+ `MANIFEST_PUSH_TOKEN` 降细粒度 PAT；阶段二 `service-ci.yml` 对 TCR@digest 做 Trivy image+Syft SBOM+**cosign key-based 签名**（仅 TCR，`rekor.ignoreTlog:true`，弃 keyless）+ helm library 加 `image.digest` + update-manifests `crane digest`+`cosign verify` 回写（`dev` 可变 tag 限非验签环境）；阶段三 Kyverno verifyImages **audit 14 天零误报→enforce**，enforce 前处理**签名纪元**（存量运行 digest 补签+删 pod 强制重建演练）+ `PolicyException` 带 TTL/事故号；CI 时长 warm ≤+3min 硬约束；门禁正反例（高危镜像负例/gitleaks 正反例）
- [ ] **⑪OpenFGA 落地**（用户拍板；形态=对抗第 2 轮 T5）：2 副本反亲和；store=pg-main `Database` CR 独立库+独立 role/连接池上限；**边界条款：Casbin 管路由粗闸（进程内不动）、FGA 管商家-店铺-商品-操作员资源关系、禁止网关热路径远程 check**；首接 merchant 域影子双跑→强制；p95≤15ms 验收/p99 25ms 目标/50ms 熔断；失败分级「降级只准缩小授权集」（写/资金 fail-close、列表/推荐降仅本人+公开）
- [ ] **⑫ClickHouse 触发式缓上（2026-08-20 拍板人复审改判，原「单节点常驻」撤回；复审账见 TECH-RADAR §3.2）**：不常驻部署，1–2Gi 归还余量池；埋点照常落 PG（`behaviors.events`）+ BEHAVIOR stream 照 ③ 接 NATS（R1 可重放，数据零丢失）。**触发条件（任一即拉起）**：①第一个真实分析需求（报表/漏斗/商品统计）②`behaviors.events` 千万行级或分析查询可测影响交易库 p95 ③gorse 特征加工需流式清洗落地。触发后照抄原形态：与 PG 主错开节点、`max_server_memory` 2G 顶格、localPV SSD、NATS 表引擎或批量摄入、历史自 PG/NATS 回灌；组件契约已在 ⓪ 验证（拉起=install.sh 一条）。PeerDB PoC 仍待 CH 基线稳定后
- [ ] **⑬资源与残留**（预算=对抗第 2 轮 T2）：~~先杀残留~~（🟡 2026-08-20 部署测试时已清：seata ns/cilium-test-1 ns/strimzi/tempo/集群内 minio，node2 内存 77%→48%；dragonfly 已转正为缓存主力（⓪b）不再属残留、redis 组件 scale 0 留备（回滚窗口过后可卸载）；剩 loki+fluent-bit(随④切主)/consul(随⑤)）；全栈 requests 目标 ≈13Gi/19.5Gi（余量 ≥20%），limits=1.5×requests（CH/网关 2×），requests 按 VPA 实测校准；装不下按砍序：残留→Tetragon(已缓)→Kyverno audit-only→Jaeger 采样→KEDA→OpenFGA 2→1（CH 已改触发式缓上出列，见 ⑫）
- [ ] **⑭真相源对齐**：~~`.service-matrix.yaml` externals 按集群现实重写并跑 structcheck~~（✅ 2026-08-20 完成：postgres→CNPG rw svc、redis 集群内 TLS、kafka「无实例已退役」、elasticsearch 退役标注、meilisearch 新增条目、casdoor/minio/consul 加定稿标注、search 服务加 CrashLoop 已知状态注；structcheck 通过。剩余：casdoor 收编落地后 host 改集群内 svc）；`docs/DEVOPS.md` 阶段①④并入 ⑩ 的实施稿；OpenKruise ImagePullJob、Spegel 试装、ko 试点、k6 基线、Chaos 触发式、Tetragon 一周实测等 🟡 项按 TECH-RADAR 定稿的触发条件逐个开卡

### 搜索引擎切换 Meilisearch（2026-08-16 拍板：ES → Meilisearch，两仓合计约 2 人日）

> 背景：新集群安装器（`~/lens077/kubernetes`；2026-08-17 重构后为 `bootstrap/` + `components/`，原 `system/` 与节点 `/root/.k8s-installer-credentials` 路径不复存在——路径订正 2026-08-21）的搜索组件已从 OpenSearch 改为 **Meilisearch v1.53**（svc: `search/meilisearch:7700`，master key 落安装器 STATE_DIR `creds/`——节点 `/var/lib/k8s-installer/creds/`、Mac 执行为 `~/.local/state/k8s-installer/creds/`）。选型依据：官方 `go-elasticsearch` v8+/v9 客户端带产品头校验，连 OpenSearch 直接拒连；而本仓搜索面极小（search 服务仅 1 条 Search + 1 条 Index），正是 Meilisearch 甜点区——中文分词开箱（ES 需自定义 IK 镜像）、~300Mi 内存（ES 单节点需 1.5Gi 堆）、typo 容忍/即时搜索默认开启。**已知取舍**：无 ES 级聚合分析，将来若要在搜索数据上做统计报表需重新评估；排序语义与 ES 不同，切换后必须用真实商品数据抽查相关性。

- [x] **[本仓] search 服务 ES→Meilisearch（2026-08-21 完成）**：`go-elasticsearch/v9` typed API 已替换为 `meilisearch-go` v0.36.3；查询使用 `q` 与 `status = online` 过滤，结果按 `backend/pkg/searchindex.Doc` 的扁平字段解析；启动与 `/healthz` 先检查 Meilisearch `/health`，再以最小查询验证 API key、`products` 索引和 `status` 过滤设置；search 运行时不再初始化未使用的 PostgreSQL、Redis 和 Casdoor 客户端。合成在线、离线文档的端到端 RPC 验收通过，离线文档未返回，测试数据已清理
- [x] **[本仓] address 服务清理 ES 残留（2026-08-21 完成）**：删除无业务调用的客户端字段、Fx Provider、`NewElasticSearchClient` 与健康检查项；address 已恢复 Ready
- [x] **[本仓] 配置与依赖收尾（2026-08-21 完成）**：Config Center `dev` 与本地配置改为 Meilisearch；服务使用仅限 `products` 索引 `search` 动作的 API key；`backend/go.mod` 已移除 `go-elasticsearch/v9` 与 `elastic-transport-go`。Compose 和 Helm 不含搜索引擎连接值，继续只挂 Config Center selector
- [x] ~~**[postgres-kafka-es-streaming-pipeline 仓] CDC 写入端 ES→Meilisearch**~~（**2026-08-21 整条作废**：该仓属 Debezium+Kafka 管道，随 Kafka 退役失去载体；替代实现已在本仓落地——`backend/pkg/searchindex` 消费 JetStream 事件写 Meili，含 tombstone 删除映射与 index swap 全量重建，见上「③NATS JetStream 落地」2026-08-21 进展注）
- [x] **[两仓] 重建索引时一次洗掉三笔历史债（2026-08-21 完成）**：`backend/pkg/searchindex.Doc` 与 search 服务读路径已统一为顶层 `id`、`price`、`sale_count`；价格是数值投影，只用于展示和排序，不参与交易金额计算
- [x] **[本仓] `SearchRequest.index` 从前端收回服务端（2026-08-21 完成）**：索引固定为服务端配置的 `products`；proto 字段 1 保留并标记 deprecated，服务端忽略传入值；前端已删除常量和参数
- [x] **dev 商品相关性抽查（2026-08-21）**：使用仓库幂等 seed 的 7 个代表性 SPU 回灌，不冒充生产客户数据；`降噪`、`咖啡`、`修护`、`无线鼠标`、`跑鞋`、`快速充电`、SPU code 与拼写容错 `Nespreso` 共 8 组 top1 正确，price=8999 与 sale_count=9 投影一致。已知 `苹果手机` 无法召回英文名称，后续用真实业务大样本补同义词/拼音评测集

### 可观测性「统一关联底座」评审新增待办（2026-08-06,全文见 `docs/reviews/OBSERVABILITY_REVIEW_20260806.md`)

> 该轮用集群真实数据 + 双模型对抗评审验证「五维统一采集·存储·查看·分析」目标。§234/236/237/238 四条**已被本轮实测复核确认仍未修**(尤其 §236 fluent-bit 标签,Loki 里 `k8s__pod_name` 就是 `.pod_name`,日志按 pod 下钻彻底不可用)。以下为**新查出的确认缺陷**:

- [ ] **可观测性 · PII 脱敏形同虚设(P0 安全)**:部署中 fluent-bit lua 手机号脱敏用 `(%d{3})%d{4}(%d{4})`,**Lua 模式不支持 `{n}` 量词**,匹配不上任何手机号=空操作;更严重的是 `Merge_Log On`+`Keep_Log On` 保留原始 `log` 明文字段,连有效的 email 脱敏也被绕过——完整未脱敏 JSON 整条进 Loki。且脱敏只碰顶层 `email`/`phone` 两键,漏掉 `payment/internal/server/logging.go` dump 的 `form_data`(交易/回调数据)、RUM 的 `user_id`/`session_id`、debug 日志里的 bearer token。改法:`Keep_Log Off` + 手机号用有效 pattern + 扩展脱敏字段名单
- [ ] **可观测性 · RUM 与后端 trace 无 join key**:前端 `packages/perf` 用 web-vitals + 手写 Connect-JSON,无 `@opentelemetry/*`、不透传 traceparent、后端不回 Server-Timing——慢 `frontend.api.duration` 无法关联到后端 span,`anon_id`/`session_id` 只在日志不在 metric/span。且只有 consumer 一个前端调 `initPerf`,merchant/admin/config 三个没接。设计声称的「前端→网关→微服务全链路」（见 `docs/observability/OBSERVABILITY.md`）前端那段不存在
- [ ] **可观测性 · 网关 5xx 被记成成功**:`tracing.go:81-90` 只在 `err!=nil`(传输层错误)时 `SetStatus(Error)`,后端返回 HTTP 503 但 `err==nil` → span 状态 OK、`logging.go` 记成 `LevelInfo`。Jaeger 错误检索、日志 error 级告警都漏掉真实 5xx。改法:按 `reply.StatusCode>=500` 设 span/日志级别
- [ ] **可观测性 · 网关采样口径与后端相反**:gateway `AlwaysSample()`(非 `ParentBased`),后端 `ParentBased`;网关是 trace 根永远 100% 采样,设 `sample_ratio` 也压不住,高峰会压垮 collector + 单副本 Jaeger。网关改 `ParentBased(TraceIDRatioBased)` 并统一读同一采样率
- [ ] **可观测性/安全 · 免鉴权入口身份可伪造**:gateway jwt 中间件命中白名单(`telemetry.v1/CollectWebVitals`、`behavior.v1/Track`)时直接 return 不剥离入站头,rewrite/remove-header 中间件在 config.yaml 全注释掉;`behavior/identity()` 又把 `x-md-global-user-id` 当可信源。攻击者带 `x-md-global-user-id:<受害者ID>` 即可冒名上报,污染统一口径身份基座。补一条入站 `x-md-*` 剥离中间件
- [ ] **可观测性 · 看板两处口径错**:①`build_infrastructure.py:133-139`「DB 错误率」= `(errors or count*0)` 画的是**错误/秒不是比率**,1 err/s 混在 10000 ops/s 里飘红误报,需除以操作总量;②`build_infrastructure.py:38-41` 节点覆盖 stat 阈值 ≥2 为绿、desc 说「node1 是 control-plane collector 不调度」——**实测已不成立**(collector/fluent-bit DaemonSet 现 3/3,VM 里 node1/2/3 各 32 条 system 序列),阈值应对齐 3 节点否则掉 1 节点仍绿
- [ ] **可观测性 · 事件/变更两维未采**:无 kube-state-metrics、无 k8s event exporter,Kubernetes 事件、Pod 状态、ArgoCD 变更历史/部署 marker 都不进面。CrashLoopBackOff+内存压力的发布事故无 event/restart 序列可查(与 §235 k8s 视角一并做)
- [ ] **可观测性 · 生产级 HA 缺失**:Jaeger(badger 本地盘)、VM(single 本地 PV)、Loki(single-binary)、Grafana 均单副本,承载卷节点故障时无法带数据漂移。整个可观测栈在 `cloud-native-deploy` 的 imperative `install.sh` 里、未纳 GitOps,节点上还手改过 loki values;`loki/helm/other/install.sh:51` 等处 MinIO 凭据明文进 Git
- [ ] **可观测性 · `OTEL_LOGS_EXPORTER: "none"` 是死配置**:该 env 无任何 Go 代码读(grep OTEL_ 零命中),`log.go` 无条件 `NewTee(stdout, otelOTLP)`。日志实际同时经 stdout→fluent-bit 和 OTLP→collector→Loki 两条路进 Loki,标签 schema 不兼容(`k8s__*` vs `service_name`),无单一 LogQL 覆盖全部日志。要么真接 autoexport 让该 env 生效,要么删掉误导性注释

### 基础设施 TLS 收敛（2026-08-08 实测盘点，清单见 `docs/design/platform/pre-environment.md`）

> 目标态是「每个基础设施都 TLS」。下面按**代价从低到高**排序，前两条是一次性小改动即可拿到大部分收益。
> ⚠️ 验收一律以**实测握手/协议响应**为准，不以 listener 配置表面状态为准——本段第 2、5 条正是
> 「配置看着对、实际不通/未启用」被实测揪出来的。

- [ ] **12 条基础设施 HTTPRoute 从 http listener 迁到 https**（一行改动一批，收益最大）：grafana / vm / kibana / es / kafka-ui(×2 hostname) / minio-api / minio-ui / jaeger-ui / jaeger-http / seata / consul-ui / argocd-server 目前全挂 `sectionName: http`（80 明文），改挂 `https` 即获得网关终止的 TLS（泛域名证书 `global-default-tls` 已覆盖 `*.dev.test`，无需新签）。**验收**：改前 `https://<host>` 返回 404、改后返回与 http 相同的业务响应；同时决定 80 listener 是保留（做 301 跳转）还是关闭
- [x] **修 dragonfly 网关路径：Terminate → Passthrough**（✅ 2026-08-20 随「缓存切回 dragonfly + 原生 TLS」整组解决：dragonfly 进程自身终结 TLS，网关重写为 TCP 6380 直通 listener（TCPRoute→svc:6379），Terminate 死路整组替换；见 kubernetes 仓 `components/dragonflydb/gateway/`）。~~现状 listener 是 `Terminate`，网关解密后把明文 redis 协议转给只收 TLS 的后端——这条路径是坏的~~
- [ ] **公网明文端点（优先级高于所有集群内明文）**：casdoor `apikv.com:8000`（=node1）承载 OAuth code/token 交换，**走公网 http**。node2（node2）上的 minio 与 gorse 已于 2026-08-19 全部解决，见下条
- [x] **MinIO 上 TLS + 管理台收回内网（2026-08-19 完成）**：`node2` 的 ssh 别名是 **`node2`（端口 34124，阿里云，与集群内 node2 `192.168.3.202` 重名但完全无关）**，同机还跑着 harbor 与 gorse。MinIO 是 docker 容器 `pgsty/minio`，compose 在 `/home/docker/minio/compose.yml`（**服务器侧是真相源**，备份 `compose.yml.bak-20260819`）。三处改动：①挂 node1 那张 ZeroSSL 泛域名证书 `*.apikv.com` 到 `/root/.minio/certs`——**宿主机侧必须自带空 `CAs/` 目录**，整卷挂载会遮蔽容器内原有结构，且挂 `:ro` 后 MinIO 无法自建（与 helm `db-ca-cert` 遮蔽系统 CA 是同一个坑）②9001 由 `9001:9001` 改 `127.0.0.1:9001:9001`，运维走 `ssh -p 34124 -L 9001:127.0.0.1:9001 node2` ③healthcheck 由 `mc ready local`（alias 硬编码 `http://localhost:9000`，启用 TLS 后必失败）改 `curl -fsk https://localhost:9000/minio/health/live`。**实测验收**：9001 公网 http/https 均 `000`、9000 明文 http 返 `400`、`https://minio.apikv.com:9000` **不带 `-k` 的严格校验** 200（证书 3 张链完整，SAN `*.apikv.com`+`apikv.com`，ECDSA P-256）
- [x] **node2 接入 Pangolin + 全部端口收回回环（2026-08-19 完成）**：⚠️ **先记住这条硬约束**——`node2` 是阿里云机，`apikv.com` **未在阿里云备案**，任何经该域名访问本机的请求都被阿里云在网络层拦掉（HTTP 返 403 `Server: Beaver` + `<title>Non-compliance ICP Filing</title>`，HTTPS 直接 reset）。`harbor`/`img` 两个早就存在的子域同样被拦。**所以"给这台机的服务配域名+证书直连"这条路根本走不通，唯一解是让公网流量落到 node1 再经隧道回来**。做法：node2 装 newt 1.15.0（二进制 `/home/docker/newt/newt` + systemd `newt.service`，`systemctl link` 自 `/home/docker/newt/`，凭据在同目录 `newt.env` 权限 600，不入库），建站点 **siteId 5 `node2`**；建资源 `minio.apikv.com`(rid 16, SSO off, target `127.0.0.1:9000` https) 与 `gorse.apikv.com`(rid 17, **SSO on**, target `127.0.0.1:8088` http)。随后 minio 9000/9001、gorse 8086/8088 **全部改绑 `127.0.0.1`**。**实测**：四个端口公网均 `000`，`https://minio.apikv.com` 严格校验 200，`https://gorse.apikv.com` 302（被 SSO 挡住）
- [x] **gorse 恢复 + 自带鉴权（2026-08-19 完成）**：故障链是「**Redis 被停 → gorse 启动时 fatal**」：`node1:6379` 的 redis 容器 2026-08-18 15:40 被主动停掉（SIGTERM、退出码 0、正常存盘 36 keys，重启策略 `no` 不自愈），而此前 gorse 是 6 月启动的老实例，带着断掉的连接空转（`Ready:false`）才显得"还活着"——**一重启就再也过不了启动检查**，这类隐性故障只有在重启时才暴露。恢复后还差一步：redis/pg 起来了但 **node2 仍连不上 6379**，根因是**腾讯云 Lighthouse 防火墙没放行 6379**（5432 早就是 `0.0.0.0/0` 所以 PG 一直通）。已加规则但**锁定源 IP 为 `<node2-source-cidr>`**（Redis 密码是 `***REMOVED-PASSWORD***` 弱口令，绝不能对全网开），实测本机连 6379 超时、node2 连通、对照组 443 两边都通。gorse 侧同时配好自己的鉴权（`config.toml` 备份 `config.toml.bak-20260819`）：`[server] api_key`、`admin_api_key`、`[master] dashboard_user_name/password` 原本**全是空串**。**实测验收**：`Ready:true`（两个 store 都连上）；经 `https://gorse.apikv.com` 无 key/错 key 均 **401**、正确 key 404（鉴权已过）、Dashboard 未登录 302→`/login`、`verify=0`；IP 直连 8088 仍 `000`。SSO 已关（改由 gorse 自身鉴权），三份业务配置已切到 `https://gorse.apikv.com`
- [x] **彻底登出 + 修掉登录入口的两套机制混用（2026-08-19，本地实测通过）**：改动三处——①`logout()` 末尾跳 Casdoor 的 `end_session_endpoint`（`/api/logout`）②**必须带 `id_token_hint`**，缺了它 Casdoor 返回 `{"status":"error","msg":"Missing parameter: id_token_hint"}` 且**不结束会话**，页面还停在那段 JSON 上；为此把 `id_token` 一路接进 `TokenResult`→`setTokens`→`tokenStore`（同样只存内存），登出时**先取后清** ③`AppBar` 的登录按钮由 `window.location.href = getSigninUrl()`（casdoor-js-sdk 老路径，state 写进 `casdoor-state`、**不生成 code_verifier**）改为 `useAuthActions().login()`（PKCE）。**②③ 是两个独立的既有 bug，不是本次引入**：入口走 SDK、回调走 `exchangeCode()` 读 `oauth_state`/`oauth_code_verifier`，必然报「OAuth state 校验失败」——**线上同样是坏的**，只是开了「自动登录」的用户靠 `silentRenew` 直接静默登入，走不到那个按钮所以没暴露。**实测判据**（生产构建 + 全新浏览器）：登录成功 → 登出后自动跳回应用且未登录 → 刷新仍未登录 → **再点登录时 Casdoor 要求重新输密码**（最后这条才是「会话真的结束」的证据，前两条只能证明本地清理生效）
- [ ] **`restoreSession` 与 callback 的竞态**：`AuthProvider` 用 `router.state.location.pathname` 判断是否跳过 `restoreSession()`，但那要等 TanStack Router 初始化完，effect 首跑时可能还是 `/`，防护形同虚设。已改用 `window.location.pathname`（不依赖框架初始化）。**Casdoor 开「保持登录会话」后 `silentRenew` 更容易成功，这个竞态被放大**。改动已验证不影响登录，但没有回归测试守着
- [ ] **`e2e/login.smoke.mjs` 缺少隐私弹窗处理**：首页的 Privacy policy 模态会盖住顶栏，**点不到 SIGN IN**，脚本会在第一步就超时。本地实测必须先点 `Reject all`/`Accept all` 才能往下走。这条 e2e 至今没在 CI 里真跑过（secret 刚配上），跑起来第一次大概率就挂在这里
- [ ] **前端没进 GitOps（2026-08-19 记录，用户明确暂缓）**：`frontend/apps/consumer/deploy/` 下 7 份 manifest（`deployment/service/configMap` + `pre/` 四份）是手工 `kubectl apply` 的，不在 ArgoCD 里。而且**和线上对不上**：manifest 写 `harbor.apikv.com/ecommerce/frontend:dev`，线上实际跑 `ccr.ccs.tencentyun.com/sumery/ecommerce-frontend:sha-auth4`（deploy 名 `ecommerce-frontend-deploy`，ns `ecommerce`，revision 5）。镜像 tag 是手打的（`sha-bf8dae2`→`sha-csp1`→`sha-auth2`→`sha-auth4`），不是 CI 产物。**基础设施稳定后再收口**
- [ ] **接入企业微信告警（2026-08-19 探明拓扑与落点，只差凭据）**

  **① 先分清三个端，别配错地方**（版本都不同，很容易混）：

  | 端 | 是什么 | 发不发告警 |
  |---|---|---|
  | `grafana.dev.test` | **集群内** `observability` ns，**12.3.1** | ✅ k8s 侧发送方，已有飞书 contact point |
  | `192.168.3.210:3000` | Pigsty 自带，**13.1.3** | ❌ 实测 **0 contact point / 0 规则**，纯看板 |
  | `192.168.3.210:9059` | Pigsty **Alertmanager** 0.33.1 | ✅ 基础设施侧发送方 |

  ⚠️ Alertmanager 配置里那行 `wechat_api_url` 是它的**全局默认值**（指向 `qyapi.weixin.qq.com`），**不代表已配企业微信** —— receivers 实际只有 `default` 和 `feishu`。

  **② 两种企业微信形态，给的凭据不一样 —— 这是选型的关键分岔**：
  - **应用消息**（`corp_id` + `agent_id` + `api_secret`）：Alertmanager 的 `wechat_configs` **只吃这种**；Grafana 的 WeCom 也支持。**推荐**，两边统一且不必再引入转换层
  - **群机器人 webhook**：Grafana 能用，**Alertmanager 不能**（它发自己的格式，群机器人不认），只能经 PrometheusAlert 转换

  **③ 凭据获取步骤**（[work.weixin.qq.com/wework_admin](https://work.weixin.qq.com/wework_admin/)）：
  1. `corp_id`：「我的企业」→ 页面最下方「企业ID」
  2. 「应用管理」→「应用」→「自建」→「创建应用」，**可见范围决定谁能收到告警**；创建后详情页拿 **AgentId**，**Secret** 点「查看」会推送到手机企业微信
  3. ⚠️ **必须配「企业可信IP」**：应用详情 →「开发者接口」→「企业可信IP」→ 填 **`<operator-egress-ip-b>`**（210 与集群 Grafana 实测是同一条家宽出口）。不配则调 API 报 `not allow to access from your ip`，**且该错误只在 Alertmanager 日志里，界面无感知**。这是家宽出口 IP，**会漂** —— 以后告警突然静默，先查它

  **④ 落点已就绪**（2026-08-19）：210 的 SSH 已通，**用户名是 `root` 不是 `sumery`**（用后者会被 publickey/password 拒）；配置在 **`/etc/alertmanager.yml`**（不是 `/etc/alertmanager/alertmanager.yml`，路径从 `ps -eo args` 的 `--config.file=` 反查），已备份 `.bak-wecom-20260819`。现有结构：`route` 下两条子路由（`severity="CRIT"`→feishu/4h、`severity="WARN"`→feishu/24h），receivers 只有 `default`/`feishu`。**改法**：加 `wecom` receiver，CRIT 那条路由用 `continue: true` 让它同时进飞书和企业微信，不动现有飞书链路。⚠️ 按 `context/team/local-env.md`，Pigsty 侧要**模板与已部署文件双改**，否则 `./infra.yml -t alertmanager` 重跑会覆盖回去

  **⑤ 仍缺**：企业微信三件套；**集群 Grafana（12.3.1）的 admin 密码**（用户此前给的 `FMU5...` 经实测是 210:3000 那个 13.1.3 的，对集群那个 401）

  **⑥ 验收不能只测「发得出去」**：造一条 `severity=CRIT` 的假告警，确认**同时**进飞书和企业微信；再造一条 `WARN`，确认**不**进企业微信 —— 否则路由条件没生效等于全量轰炸
- [ ] **告警链路已断：PrometheusAlert 转换层随 210 停机消失（2026-08-19 发现）**：`context/team/local-env.md` 记的链路是「k8s Grafana → PrometheusAlert(192.168.3.210:8080) → 飞书」，但 **210 已于 2026-08-19 停机**，实测 8080/9059/3000 全部不可达。集群里只有 Grafana（`observability` ns，12.3.1），**没有 alertmanager / prometheusalert**。所以飞书告警此刻发不出去，而且是**静默失败**（Grafana 侧只会在 UI 留错误）。Grafana 12 原生支持企业微信（`wecom` contact point）与飞书需要转换层不同，**接企业微信不必重建转换层**；但飞书那条要么把转换层迁到集群里，要么改用别的通道
- [ ] **`HELM_REGISTRY_PASS` secret 缺失**：`.github/workflows/frontend.yml` 的 chart 推送用 `helm registry login harbor.apikv.com -u rebot@github`，但仓库里只有 `MANIFEST_PUSH_TOKEN`/`TCR_*`/`CASDOOR_E2E_*`，没有这个。要在 harbor 里建机器人账号 `rebot@github` 并把 token 配成 secret，否则打 tag 后 chart 推送步骤必失败
- [ ] **给 Config Center 灌 gorse 的 api_key**：`backend/services/behavior/configs/{dev,pre}.yml` 与 `product/configs/pre.yml` 的 `api_key` 按硬规则 4 **保持空串**，但 gorse 侧鉴权已开——**KV 里不填真值的话业务调用会全部 401**。真值在 node2 的 `/home/docker/gorse/config.toml`
- [x] **node1 的 Redis 上 TLS + 强随机密码（2026-08-19 完成）**：`/home/docker/redis/conf/redis.conf` 改为 **`port 0` + `tls-port 6379`**（明文端口彻底关闭），证书复用本机那张 ZeroSSL `*.apikv.com`（`/home/docker/redis/tls/`，**属主必须是 uid 999**，redis 官方镜像以该用户运行，否则读不到私钥启动即失败）；`tls-auth-clients no` 时 Redis 仍强制要求 `tls-ca-cert-file`，用 fullchain 自身充数即可。密码换成 40 位随机（原 `***REMOVED-PASSWORD***`）。客户端必须 **`rediss://` + 连 `redis.apikv.com`**——证书无 IP SAN，连 `node1` 校验必失败。gorse 的 `GORSE_CACHE_STORE` 已切换，实测 `Ready:true` / `CacheStoreConnected:true` / `DBSIZE` 回升。**实测验收**：公网 TLS 握手 + 系统 CA 严格校验通过（TLSv1.2，SAN `*.apikv.com`）、明文连接收到 TLS Alert `\x15\x03\x03`、未认证 `PING` 返回 `NOAUTH`、错误密码 `WRONGPASS`
- [x] **公网 docker 端口随机化（2026-08-19 完成）**：全部改到 **>32767**（避开 k8s NodePort 的 30000-32767 段）。node1：redis `6379 → 61246`、postgres `5432 → 52288`（Lighthouse 防火墙同步迁移，**先加新规则再删旧规则**）；node2：harbor `5080 → 41311`、`5443 → 49600`（`harbor.yml` 与 `docker-compose.yml` **两处都要改**，前者供下次 `prepare` 用，否则会被覆盖回去）。gorse 的两个连接串已同步。**实测**：旧端口全 `000`、新端口可达、gorse `Ready:true`
- [ ] **⚠️ Redis 61246 目前对 `0.0.0.0/0` 开放（测试期，上线前必须收窄）**：用户明确要求测试阶段公网可达。虽有 TLS + 40 位随机密码 + 非常规端口，但公网 Redis 会被持续扫描，**且 `protected-mode no` 仍在**。收窄命令见 `context/team/pangolin-tunnel.md` 的 Lighthouse 小节，把 `CidrBlock` 改回实际来源（如 `<node2-source-cidr>`）。postgres 的 52288 同理
- [x] **harbor 修复：换掉过期证书 + 经 Pangolin 暴露（2026-08-19 完成）**：浏览器报红有**两个叠加原因**，只修一个不够——①**证书早已过期**：harbor 用的是 `Apr 22 → Jul 21 2026` 那张（6 月放进去的），而 node1 上有效的是 `Jul 29 → Oct 27`；②**即使换新证书也还是红**：`*.apikv.com` 证书配 IP 访问必然域名不匹配，而域名访问又被阿里云 ICP 拦截。所以真正的解法是走 Pangolin：资源 `harbor.apikv.com`(rid 18, SSO off——docker login 过不了 SSO, target `127.0.0.1:49600` **https**；41311 是 http 会 308 跳转，用它会把浏览器导回被拦的地址)，并删掉 `harbor` 的 DNS A 记录让它回落泛解析到 node1。**证书要放两处**：`harbor.yml` 指定的 `ssl/`（原本是空目录，`prepare` 会从这里取）和 `data/secret/cert/`（实际生效的副本）。**实测**：`https://harbor.apikv.com` 严格证书校验通过、HTTP 200、`/v2/` 返回 401（registry API 正常）。仓库里 6 处 `harbor.apikv.com:5443` 引用已同步改为不带端口
- [ ] **node1 的 PostgreSQL 5432 对全网开放且仍是明文 + `***REMOVED-PASSWORD***` 弱口令**：比 Redis 更糟（Redis 至少已上 TLS+强密码）。同一张 `*.apikv.com` 证书可直接用于 PG 的 `ssl_cert_file`，改法参照上面 Redis 那条；密码也该一并轮换
- [x] **修掉 node1 Redis 无持久化卷的隐患（2026-08-19）**：compose 原本只挂 `./conf`，**RDB 落在容器可写层**，`docker compose up --force-recreate` 一重建就丢——2026-08-19 已因此丢过一次 gorse 的 36 个缓存 key（可重建，无实质损失，重启后已回升到 28）。已加 `data:/data` 具名卷
- [ ] **Config Center 的 cart KV 同步 MinIO 新端点**：仓库副本 `backend/services/cart/configs/{dev,pre}.yml` 已改为 `https://minio.apikv.com`（**443，不带 9000**——入口是 Pangolin 的 Traefik），但 KV 是另一份（「三份配置对齐」的教训）。灌之前先 `curl https://minio.apikv.com/minio/health/live` 确认隧道在
- [ ] **证书续期现在是三处同步**：`*.apikv.com`（ZeroSSL，**2026-10-27 到期**）部署在 blog ssl / pangolin traefik certs / node2 的 `/home/docker/minio/certs`，而 node1 续期链路缺位（见 `context/team/pangolin-tunnel.md:26`）。影响面有别：前两处过期会让**所有** Pangolin 资源挂（blog/config/casdoor/minio/gorse 全部），node2 那份因 Traefik 侧 `insecureSkipVerify` 过期也不影响转发——**但别因此忘了它**
- [ ] **Consul 启用 TLS**：8501/HTTPS 未启用、gossip `encrypted=false`。**连带修复**：`backend/services/*/deploy/prod/` 全部写着 `CONSUL_ADDR=consul-server.consul.svc:8501` + `CONSUL_SCHEME=https`——**这个端点不存在**，prod 清单照此起不来（与 known_gaps 里「prod.yml 键不存在」是两个独立断点）
- [ ] **Elasticsearch 恢复 HTTP 层 TLS**：ECK 的 `spec.http.tls.selfSignedCertificate.disabled=true`，是被主动关掉的；打开后 search 服务的客户端配置需同步（CA 或 skip_verify）
- [ ] **Kafka 启用 9093 TLS listener**：Strimzi 已定义 `tls:9093`（`tls=true`，Strimzi 自签 CA）但无人使用，现用 `plain:9092`。Kafka 客户端代码为 0，**接 Kafka 时直接从 9093 起步**，别先接明文再改。两个 listener 都是 `internal` 型、无外部入口；将来若需外部访问，走 TLSRoute Passthrough 而非新开 LB
- [ ] **清理两个僵尸 LoadBalancer（占 IP）**：`default/dragonfly`（192.168.3.113，无 endpoint，实测 nc 拒绝——deploy 实际在 dragonfly ns，default 只剩 svc 残留）、`kube-system/cilium-ingress`（192.168.3.108，集群内**没有任何 Ingress 资源**）
- [ ] **统一 cart `pre.yml` 的 OTel exporter TLS 口径**：三个 exporter 的 `tls.insecure_skip_verify` 写成 false/true/false 三处不一致，而端点是集群内明文 `otel-collector.observability:4318`——需统一并核对 exporter 在明文端点下对该字段的实际行为
- [ ] **（观察项）dragonfly 重启历史**：旧集群曾 57 天重启 32 次；2026-08-20 转正为缓存主力（原生 TLS 新 Deployment）后基数清零重新观察——排查 redis 相关问题时仍先看它的重启历史，别默认它一直在线

### 评审对既有证据的订正

- 上一轮认为「基础设施盘 Loki 面板 `{service_name=~".+"}` 只能看到 0.05% 的 OTLP 流」**方向反了**:实测 Loki `service_name` 值就是 `"kube-logs"`(从 `job` fallback),`.+` 匹配得上主体(约 99.9%);真正缺陷是 §236 的坏 `k8s__*` 标签,不是「面板几乎空」
- 「代码里完全没有 exemplar」措辞过强:OTel Go SDK v1.45 默认启用 trace-based exemplar filter,但 VM 数据源 + Grafana 未配 exemplar 导航,查询层做不到 metric→trace 跳转,实际结论(无法跳转)仍成立

---

## 四、实施路线

### 分阶段迭代实施策略

采用敏捷迭代模式，先核心后扩展，分四个阶段落地，保障业务快速闭环，同时控制技术风险：

第一阶段：核心业务 MVP

- 核心目标：完成电商核心交易闭环，实现可上线的最小可用版本
- 核心工作：
  1. 完成基础设施搭建：Kubernetes 集群、PostgreSQL 集群、Redis 集群、Kafka、可观测性组件部署
  2. 落地 6 个核心微服务：认证服务、商品服务、订单服务、支付服务、库存服务、搜索服务
  3. 完成核心交易流程：商品浏览→下单→支付→订单状态同步全流程打通
  4. 前端用户端核心页面开发：商品详情、购物车、下单、支付、订单列表
- 交付成果：可上线的 MVP 版本，支持用户完成完整的购物流程

第二阶段：商家与平台能力落地

- 核心目标：完成 B2B2C 平台核心能力，支持商家入驻、运营，平台管理
- 核心工作：
  1. 落地商家服务、履约服务、结算服务三个扩展微服务
  2. 完成商家后台开发：商品管理、订单履约、售后处理、财务结算
  3. 完成平台管理后台开发：商家审核、类目管理、订单仲裁、平台配置
  4. 完善 RBAC 权限体系，实现商家、管理员的细粒度权限管控
- 交付成果：完整的 B2B2C 平台版本，支持商家入驻运营，平台统一管理

第三阶段：性能优化与高可用加固

- 核心目标：优化系统性能，完善高可用架构，支撑高并发流量
- 核心工作：
  1. 全链路压测，优化慢查询、性能瓶颈，达到预设的 QPS/TPS 目标
  2. 完善多级缓存架构，提升缓存命中率，降低数据库压力
  3. 完善限流熔断、弹性扩缩容机制，应对流量波动
  4. 完善可观测性体系，补全监控指标、告警规则、链路追踪
- 交付成果：高性能、高可用的生产级版本，可支撑大促峰值流量

第四阶段：营销与扩展能力落地

- 核心目标：完善平台营销能力、数据分析能力，提升平台竞争力
- 核心工作：
  1. 落地营销服务、数据分析服务两个扩展微服务
  2. 实现优惠券、满减、秒杀等营销活动能力
  3. 完成数据分析平台搭建，实现商家经营报表、平台运营报表
  4. 完善搜索推荐能力，实现个性化推荐、智能搜索
- 交付成果：具备完整营销能力、数据分析能力的全功能平台版本

### 技术风险与应对方案

| 风险类型       | 风险描述                         | 应对方案                                                                                                 |
|------------|------------------------------|------------------------------------------------------------------------------------------------------|
| 库存超卖与数据不一致 | 高并发下单场景下，库存扣减异常，导致超卖、库存数据不一致 | 1. 采用 Redis 分布式锁 + PostgreSQL事务行锁双重保障；2. 所有库存扣减 SQL 添加库存校验条件；3. 库存操作全链路流水记录，支持对账与补偿；4. 定期库存对账，修复数据差异 |
| 支付状态不一致    | 支付回调异常，导致订单支付状态与第三方支付状态不一致   | 1. 支付回调验签 + 幂等处理，避免重复回调异常；2.主动轮询查询支付状态，作为回调的兜底方案；3. 每日自动对账，修复状态差异；4. 支付状态变更通过事件驱动，保证各服务数据同步          |
| 大促峰值流量过载   | 秒杀、大促场景下，流量突增导致系统响应慢、甚至宕机    | 1. 采用 Kafka 实现请求削峰，同步转异步；2.多级缓存架构，热点数据全缓存，避免请求打穿到数据库；3. 全链路限流熔断，保护核心服务；4. 基于 K8s 实现弹性扩缩容，快速应对流量增长    |
| 微服务复杂度失控   | 微服务数量过多，服务间依赖复杂，导致运维、迭代难度提升  | 1. 严格遵循 DDD 领域边界划分，避免微服务过度拆分；2.采用事件驱动架构，解耦服务间依赖；3. 统一的代码规范、工程结构，降低维护成本；4. 完善的可观测性体系，快速定位问题           |

## 建议

1. 代码规范与工程化：统一前后端代码规范、工程结构，通过 CI/CD 流水线实现代码门禁、单元测试、自动部署，保障代码质量，避免技术债务累积。
2. 先闭环后优化：优先完成核心交易闭环，再逐步优化性能、扩展功能，避免过早优化导致的开发周期延长，快速验证业务模式。
3. 全链路压测前置：每个阶段上线前，都需要进行全链路压测，提前发现性能瓶颈、隐藏 bug，避免线上故障。
4. 数据备份与灾备：核心数据定期备份，制定完善的故障恢复预案，定期进行故障演练，保障数据安全与系统可用性。
5. 文档同步维护：维护完善的架构文档、API 文档、数据库设计文档，同步更新，避免文档与代码脱节，降低团队协作成本。

---

## 五、会话记录：配置中心迁移与 Cart 灰度（2026-08）

### 问题：遗留的 registry 测试、网关测试包和 Check Connect import 应如何处理？

**回答：** 目标是让测试只覆盖仍存在的实现：按照当前 registry/config 接口重写 stale
测试，修正网关包的依赖与断言，并将 `checkv1connect` 的旧
`connect-go-example/...` import 改为本仓模块路径；若仓库中已没有对应实现，则删除失效测试。
本次迁移摘要没有保留这些子任务的可验证完成记录，继续处理前应重新运行相关包测试确认现状。

**步骤：**

1. 分别运行 address、merchant、payment 的 registry 测试，以及网关 config/cors/jwt/rbac/routerfilter 测试。
2. 以仍在使用的构造函数、环境变量和接口为准改写断言，删除只引用已删 API 的用例。
3. 搜索并替换 Check API 生成代码及调用处的旧 module import。
4. 对每个修复后的包运行 `go test`，不要把其他代理的工作区改动纳入提交。

### 问题：Cart 如何接入独立配置中心并禁止回退到旧 Bootstrap？

**回答：** Cart 已改用独立 `github.com/lens077/config-center` Go SDK。启动时读取本地
`CONFIG_SOURCE_FILE` 的 `SourceConfig`，且正常启动只允许 `type: config_center`；不做静默
自动降级。`CONFIG_SOURCE=file` 仅供显式本地测试，Consul KV Bootstrap 路径已删除。

**步骤：**

1. 维护未入库的 `backend/services/cart/configs/source.dev.yaml`，填写当前灰度 source。
2. 通过 `make dev` 启动 Cart，并确认它与独立配置中心建立连接。
3. 配置中心不可达、token 无效或 key 缺失时确认服务快速失败，不恢复 Consul KV 回退。
4. 生产迁移使用独立 SDK 的远端模块版本，不使用本地 `replace`。

### 问题：使用既有配置进行配置中心和 Cart 灰度，应如何验证？

**回答：** 已使用历史 Consul 中的 `ecommerce/config/dev.yml` 为独立配置中心启动自举，
且不把敏感配置写入工作区。Config Center 的 `/healthz`（30010）与 Cart 的
`/healthz`（30006）均返回 `200`；Cart 与 30010 存在已建立连接，说明 SDK 的
`config_center` source 生效。

**步骤：**

1. 将历史 bootstrap 仅经标准输入传给配置中心的 `make dev`。
2. 配置中心健康后启动 Cart 的 `make dev`。
3. 用只读 `curl` 验证 `/healthz`、`GetCart`，避免测试写入共享开发数据。
4. 集群阶段另建 Config Center IAM/bootstrap/Cart selector Secret，并以单副本 Cart canary 发布。

### 问题：如何提供方便 IDE 调试的 Cart HTTP 请求并发布包含 SDK 的 dev 镜像？

**回答：** `backend/services/cart/internal/tests/req.http` 已整理为本地直连的 Connect
HTTP Client 请求，使用正确的 `x-md-global-user-id` 元数据与 RPC 字段，并明确标记
会写入开发购物车的请求。`make docker-deploy VERSION=dev` 已构建并推送 Linux/amd64
镜像 `ccr.ccs.tencentyun.com/sumery/cart:dev`。

**步骤：**

1. 在 IDE 打开 `internal/tests/req.http`，先运行健康检查和只读的 GetCart。
2. 仅在需要时运行 Add/Update/Remove 三个写请求，之后可用 GetCart 确认结果。
3. 使用等价 `curl` 进行自动化本地烟测；本次三条只读调用均返回 `HTTP 200`。
4. 使用 `make docker-deploy VERSION=dev` 生成并推送镜像；构建基础镜像必须满足根
   `go.mod` 的 Go 版本要求（目前为 `golang:1.26.5-alpine3.24`）。

**验证记录：** `go test ./services/cart/...` 已通过；远端 `:dev` OCI index 摘要为
`sha256:d4daa8ca7fa2f2e8272d449e1e6d887ec9cf07e05b63fa912edb3fd909ba2a74`，Linux/amd64
manifest 为 `sha256:26537ddf368b58ea10067a58948c636a6de862307a20df5a54a784b92b525d5c`。

**提交注意：** Cart 的 Dockerfile、Makefile 和 HTTP 请求文件应只单独暂存。提交钩子
调用裸 `pnpm exec commitlint`；若环境仅有 `corepack pnpm` 而 PATH 中没有 `pnpm`，应先
修复 pnpm shim，再正常提交，不能以 `--no-verify` 绕过规则。
