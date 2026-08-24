# 规则与环境重新对齐 — 清单与逐条方案（待你确认）

生成于 2026-08-24。基准是 [`ground-truth.md`](ground-truth.md)（实测，非设计意图）。
**本文件只是方案，尚未执行任何修改。**

---

## 一、我读取的全部规则/约束/MCP/Skills 文件

### A. 仓库级行为基线

| 文件 | 行数 | 作用 |
|---|---:|---|
| `AGENTS.md` | 113 | 所有 AI 工具的硬规则 + 索引（每轮整份注入，预算 ≤14000B，现 10832B） |
| `.service-matrix.yaml` | 222 | 服务拓扑真相源，被 `backend/structcheck` 强制核对 |

### B. `context/` 三层知识库（46 文件 / ~5020 行）

**团队级 `context/team/`（16 файл / 2438 行）**
`INDEX.md` `runbook.md` `git-commit.md` `proto-design.md` `local-env.md` `go-redis.md`
`go-testing.md` `db-migrations.md` `cron-jobs.md` `shell-scripting.md` `node-graceful-shutdown.md`
`okteto-inner-loop.md` `pangolin-tunnel.md` `ssh-port-migration.md` `tls-enablement.md` `tech-selection.md`

**框架级 `context/harness-framework/`（9 文件 / 901 行）**
`INDEX.md` `evolution-log.md` `self-refinement.md` `knowledge-layering.md` `e3-execution.md`
`subagent-dispatch.md` `graph-engineering.md` `delivery-efficiency.md` `cordis-evaluation.md`

**服务级 `context/project/ecommerce/`（22 文件 / 1588 行）**
`INDEX.md` + 7 个模块（`gateway` `registry` `config` `behavior` `consumer` `merchant` `frontend-api`）
下的 `INDEX.md` / `experience/` / `sop/`

**导航入口** `context/INDEX.md`（93 行）

### C. 各 AI 工具的适配层

| 文件 | 行数 | 说明 |
|---|---:|---|
| `.cursor/rules/*.mdc` | 12 файл / 259 | Cursor 规则，全部是指向 `context/` 的薄指针（审计确认零内容重复） |
| `.claude/settings.local.json` | 60 | 权限白名单 20 条 + impeccable 钩子链 |
| `.claude/kaneo-mcp.json` | 6 | kaneo MCP（按需挂载，非常驻） |
| `.claude/hooks/impeccable-frontend-only.sh` | 15 | 前端路径过滤钩子 |
| `.claude/skills/kaneo-sync/SKILL.md` | 63 | TODO.md ↔ Kaneo 看板双向同步 |
| `.codex/config.toml` | 12 | Codex 全自动审批策略 |
| `docs/agents/{issue-tracker,triage-labels,domain}.md` | 133 | mattpocock 系列 skill 的项目配置 |
| `skills/README.md` | 139 | 第三方 skill 安装笔记（无人读取） |

### D. 门禁与 CI

`scripts/`：`verify-quick.sh` `verify-context.sh` `verify-freeze.sh` `freeze.sh` `lint-baseline.sh`
`harness-scars.sh` `deploy-k8s.sh` `argocd-devwindow.sh` `kaneo/extract_todo.py`
`.github/workflows/`：`backend.yml` `frontend.yml` `service-ci.yml` `context-gate.yml`
`deploy-consistency.yml` `freeze-check.yml` · `.gitlab-ci.yml` · `.github/CODEOWNERS` · `.freeze/README.md`

### E. 全局层（不在仓库里，但每轮都影响我）

| 项 | 实测 |
|---|---|
| `~/.claude.json` MCP | `ccteam`（127.0.0.1:7331 — **连接失败，已死**）、`codex`（✅）、`goland`（✅ 200）、`kitesurf`（✅ 浏览器工具） |
| 项目级 MCP | `playwright` 只挂在 `go-connect-template-cli`，**不在本仓** |
| `kaneo` MCP | `https://kaneo.apikv.com/api/mcp` → **401**，可达但需鉴权 |
| `~/.claude/settings.json` | 3 个插件（gopls-lsp / mattpocock-skills / warp）+ hcom 钩子 + `e3-overread-guard.py` |
| `~/.claude/skills/` | 41 个（多数是 `~/.agents/skills/` 的符号链接） |
| brew | 22 个 leaf，全部验证存在；`playwright-cli` **未安装** |

### F. control-tower（同级仓）

`AGENTS.md`（1880B）、`README.md`、`docs/design/`（6 篇：architecture / auth / decisions /
machine-token / cutover / adr-0001）、`Makefile`、`deploy/{dev,pre}`、`.github/workflows/ci.yml`

**逐条核对结论：control-tower 的文档与实测环境完全一致，无需修改。**
（Dragonfly `192.168.3.122:6380`、Consul `192.168.3.120:8500`、`pg-main-rw`、
`deploy/dev` 的 sha 钉与线上镜像逐字相符 —— 全部实测通过。）

---

## 二、核心漂移（实测 vs 文档声称）

### ⚠️ 最重要的一条更正

**control-tower 已经完整取代了旧网关和 config-center —— 两个服务都已切流上线。**

```
config-center      ns=config-center  → control-tower-config:sha-a27f90a      （6 个 Pod 全部核对）
config-center-web  ns=config-center  → control-tower-config-web:sha-a27f90a
control-tower-gateway ns=ecommerce   → control-tower-gateway:sha-143ef5f
```

`config-center` 这个 ns / Deployment 名只是**没改的遗留标签**。任何文档写「config 服务尚未切流」
都是错的（我的一份子代理审计就据旧信息得出了这个错误结论，已推翻）。

### 其余漂移

| # | 文档声称 | 实测 | 影响面 |
|---|---|---|---|
| 1 | ArgoCD GitOps 自动同步，helm/values.yaml 是集群权威真相源 | **零 Application / 零 ApplicationSet**，AppProject 只有 `default`；helm 钉 `1.4.0`，集群实跑 `:dev` | AGENTS.md、matrix、okteto 全链、backend.yml 回写、deploy-k8s.sh |
| 2 | `okteto up` 前必须 `argocd-devwindow.sh off` | 该脚本**直接 exit 1**（AppProject 不存在），不是空转 | 挡住了内环开发入口 |
| 3 | 凭据存 Consul KV | Consul KV 已退役，凭据在 Config Center | `runbook.md:25`、`knowledge-layering.md:84` 与 AGENTS.md 硬规则 4 互相矛盾 |
| 4 | Pigsty `192.168.3.210` / Kafka / Elasticsearch | 全部退役，Kafka **零残留** | `local-env.md` 89 行、`go-redis.md`、`cron-jobs.md`、`tls-enablement.md` |
| 5 | 节点 `.201` / `.202` / `.105` | 实际只有 **`.101`/`.102`/`.103`** | `local-env.md` `pangolin-tunnel.md` `node-graceful-shutdown.md`（含一条会报错的验证命令） |
| 6 | 11 个服务 | **10 个** | `go-redis.md` ×2、`cron-jobs.md` |
| 7 | `redis` ns 留着可回滚 | **ns 已删**，回滚路径消失 | matrix:55、`local-env.md` |
| 8 | `.freeze/` 是「main 上唯一必需的 CI 检查」 | `.freeze/` 只有 README，**零冻结集**，gate 恒绿 | AGENTS.md:57 —— 一个假的安全感 |
| 9 | 前端 CI | `frontend.yml` 指向不存在的 `helm/charts/frontend/`、`connect-example` ns、外部 `sunmery/Manifest`，**每个 tag 必红** | 已在 TODO.md 挂账 |
| 10 | 集群能力清单 | `openbao` `openfga` `kyverno` `keda` `cilium-gateway` `victoriametrics` `spegel` `external-secrets` `cert-manager` `argo-rollouts` **十项从未入表** | matrix / TECH-RADAR |

---

## 三、逐条处置方案

图例：**D**=删除 · **R**=重写 · **T**=修剪 · **A**=归档 · **K**=保留不动

### 你已拍板的三件事

| 动作 | 方案 |
|---|---|
| **GitOps 接回来** | ① 先把 `helm/values.yaml` 的 `1.4.0` 改成集群实跑的 tag ② `kubectl apply -f argocd-proj.yml -f argocd-repo.yml -f argocd-app.yml` ③ 确认 Application 起来后，okteto/devwindow 那条硬规则**自动恢复为真**，文档按「已生效」写 |
| **删 `gateway/` 目录** | 连同 `gateway/docs/ARCHITECTURE_EVOLUTION.md`（`context/INDEX.md:74` 引用它，需同步改）。有 `backup/pre-control-tower-20260823` tag 兜底 |
| **删 `gateway` remote** | `git remote remove gateway`，并在 `git-commit.md` 补一句「只推 `github`」 |

### context/team/（2438 → ~1650 行）

| 文件 | 动作 | 具体做什么 |
|---|:--:|---|
| `local-env.md` | **R** | 砍掉 Pigsty/Kafka/飞书告警 89 行 → 一行墓碑；修 `.201/.202/.210`→`.101-.103`；修 DNS 链；`postgres-postgresql.postgres.svc`→`pg-main-rw.postgresql.svc`；补十项新集群能力入口 |
| `okteto-inner-loop.md` | **R** | GitOps 接回来后这条**恢复为真**，改成「已生效」并补一条自检命令；修 checklist 示例（`cart` → `ecommerce-cart-deploy`，仓库自己正踩这个坑）；删 amd64 说法（集群全 arm64） |
| `pangolin-tunnel.md` | **T** | 修全部节点/网关 IP；把 `*.apikv.com` **2026-10-27 到期且无续期链**提到顶部醒目位置；删 blog 部署史 11 行 |
| `git-commit.md` | **T** | 补「`gateway` remote 是残留，永远别推」；删 `kafka-connect` scope；~100 行 emoji 表压成 top-15 + 指向 `commitlint.config.mjs` |
| `go-redis.md` | **T** | 版本 `v9.21.0@go.mod:22` → **`v9.22.0@:25`**（错 3 处）；Dragonfly 从「可能」改成「唯一」；Kafka → NATS JetStream；11→10 |
| `cron-jobs.md` | **T** | 「Kafka 依赖为 0 ⇒ 只能落 Postgres 任务表」已假（NATS 在跑）；Ticker 示例改指 control-tower；11→10；Asynq 37 行压到 ~8 |
| `node-graceful-shutdown.md` | **T** | **修会报错的验证命令** `for node in node1 node2` → `node101/102/103`；调和「两节点」vs「三节点」自相矛盾；40 行事故叙事压成结论 |
| `runbook.md` | **T** | **修 L25「凭据只在 Consul KV」**（与硬规则 4 冲突）；补 tag/CI 触发指针；真相源表收成指针 |
| `tech-selection.md` | **R** | 补一条规则：**新装集群能力必须当场登记进 matrix/TECH-RADAR**；消歧「node2」 |
| `tls-enablement.md` | **T** | 删已退役的 ES/Kafka 适用范围；「四条」→ 六条；ICP 一节收成指向 `pangolin-tunnel.md` 的指针 |
| `go-testing.md` | **T** | `make test-integration` **无此 target**，要么落地要么移出命令块；PG `18.4.0` 对 CNPG 重核 |
| `proto-design.md` | **T** | 一个词：`keyword 走 ES` → Meilisearch |
| `INDEX.md` | **T** | 同步 okteto 行；删 ssh 行 |
| `ssh-port-migration.md` | **A** | 归档出 `context/team/`（一次性主机迁移，Ubuntu 24.04 前提 vs 实测 26.04），保留 ~6 行 refused/timeout 判别术并入 `pangolin-tunnel.md` |
| `db-migrations.md` | **K** | 全部 make target 实测存在，CNPG 基线与实况相符 —— 目录里最干净的一份 |
| `shell-scripting.md` | **K** | Bash 3.2 约束与环境无关，零漂移 |

### context/harness-framework/

| 文件 | 动作 | 具体做什么 |
|---|:--:|---|
| `evolution-log.md` | **K+追加** | 条目作为历史保留不改；**修倒序**（最新 4 条掉到了最底）；本轮所有 harness 改动**必须追加一条**，触发事故 = 本次环境漂移审计 |
| `INDEX.md` | **T** | 删「校验 Consul KV 必需键」（KV 已退役） |
| `knowledge-layering.md` | **T** | L84「凭据只在 Consul KV」与硬规则 4 冲突；`../config-center` → control-tower |
| `graph-engineering.md` | **T** | 93 → ~30，删对话转录，留 banner + 三个坑 |
| `cordis-evaluation.md` | **K+2** | 它预设的「DSH 作为另一运行时」**已经发生**（本次就是），补状态行 |
| `self-refinement.md` `e3-execution.md` `subagent-dispatch.md` `delivery-efficiency.md` | **K** | 无环境依赖声称 |

### context/project/ecommerce/

| 文件 | 动作 | 具体做什么 |
|---|:--:|---|
| `gateway/INDEX.md` | **R** | 50 → ~15：改指 `control-tower/services/gateway`，只留仍成立的约束（Config Center 四键、`is_secret=false`、错误契约），加退役横幅 |
| `gateway/experience/jwt-nbf-clock-skew-loop.md` | **K−3** | **教训已被新网关继承**（`verifier.go:93` 的 `WithLeeway` + 测试里直接引用这条历史）。只改路径 |
| `gateway/experience/retry-amplification-...md` | **T** | 76 → ~30：重试放大那半**已架构性消亡**（新网关无客户端重试）；健康检查那半**已写进 `resolver.go:7-8` 的设计契约**，保留 |
| `config/INDEX.md` | **R** | 独立仓/SDK/`go get` 路径全改 control-tower。**注意：服务已切流**（推翻子代理的相反结论） |
| `behavior/experience/consul-kv-missing-key-silent-disable.md` | **R** | 51 → ~25：根因改写成 Config Center 语境；三条「根治方向」**其实已在 2026-08-18 做完**，标完成并指向校验接线 |
| `three-copies-of-one-config.md` | **T** | 89 → ~45：留方法与陷阱，删已消失的 KV 逐服务清单 |
| `registry/INDEX.md` | **T** | 发现侧的 kratos consul contrib 已随旧网关消亡；心跳参数来源改 Config Center |
| `consul-ttl-first-ping-blind-window.md` | **T** | KV 参数表；11→10；发现侧重新归属（**失效模式在新网关依然存在**，教训保留） |
| `behavior/INDEX.md` | **T** | 「Consul KV 仍缺 recommend 块」—— 该 KV 已不存在 |
| `frontend-api/INDEX.md` | **T** | 「四个 app 含 config」错：实际是 admin/consumer/desktop/merchant，且 config 前端早已迁出 |
| `frontend-api/sop/connect-query.md` | **T−4** | 423 行只有 config app 迁出那段过期 |
| `config-hot-reload-boundaries.md` | **K−1** | 一处 `../config-center` 路径；**其余描述的运行时行为仍然在线**，且对刚完成的切流最有操作价值 |
| `config-center-self-bootstrap-blindspot.md` | **K** | 当前操作价值最高的一份 |
| 其余 8 篇 | **K** | `consul-kv-retired` `kubernetes-secret-trailing-newline` `duplicate-cart-queries` `mui-spacing-tokens-8x` `reports-chunk-over-500kb` `consumer/INDEX` `merchant/INDEX` `web-vitals-reporting` |
| `context/INDEX.md` | **T+4** | 35 个链接全部可达 ✅，但**漏登记 `team/runbook.md` 与 `team/db-migrations.md`**；L74 引用即将删除的 `gateway/docs/ARCHITECTURE_EVOLUTION.md` |

### AI 工具适配层

| 文件 | 动作 | 具体做什么 |
|---|:--:|---|
| `.claude/settings.local.json` | **T** | **20 条权限删 10 条**：`~/.agent-reach-venv/*`（目录已不存在）、`/private/tmp/ar-src/**`、`ping r.jina.ai`、`dscacheutil`、`cp services/user/...`（路径本身就是错的，永不匹配）、两条 `~/Downloads` 递归拷贝（长期授权风险）、裸 `cat`、冗余的 skills Read。钩子块原样保留 |
| `skills/README.md` | **R** | 修机翻残留（「出轨准备」「放大镗床设计」「代币」）、删已失效的 agent-reach venv、`playwright-cli` 实际未安装、补 `ccteam` MCP 已死。或整体并入 `docs/agents/` 只留一个 skills 索引 |
| `.cursor/rules/okteto-inner-loop.mdc` | **T** | 跟随 `context/team/okteto-inner-loop.md` 改（先改源，指针后跟） |
| 其余 11 条 `.mdc` | **K** | 审计确认全部是薄指针，零内容重复 |
| `.claude/kaneo-mcp.json` + `kaneo-sync` + 钩子 + `.codex/config.toml` + `docs/agents/*` | **K** | 链路完整、按需挂载是有意的成本决策（`evolution-log.md:287` 有据） |

### CI / 门禁

| 文件 | 动作 | 具体做什么 |
|---|:--:|---|
| `.github/workflows/frontend.yml` | **D 部分** | 删 `frontend-test` / `frontend-deploy` 两个 job（指向三处不存在的东西，每个 tag 必红）；**抢救 `smoke-login`** 独立成 workflow（它的 `e2e:login` target 真实存在） |
| `scripts/argocd-devwindow.sh` | **T** | GitOps 接回来后**自动恢复正常**；仍建议补一条「零 Application → 无需守护，exit 0」分支，让它以后降级成诚实的 no-op 而不是 exit 1 |
| `scripts/deploy-k8s.sh` | **T** | argocd 模式接回来后为真；复核措辞 |
| `.github/workflows/backend.yml` | **T** | GitOps 回写注释接回来后为真；确认 `update-manifests` 回写目标与新 Application 一致 |
| `AGENTS.md:57` + `.freeze/` | **决策点** | 见下 |
| 其余（`service-ci` `context-gate` `deploy-consistency` `freeze-check` `.gitlab-ci` `verify-*` `lint-baseline` `harness-scars` `freeze`） | **K** | 全部实测可用、接线正确 |

### AGENTS.md 本身

1. 硬规则 4：Consul KV 那句保留（正确），但「Config Center」补一句它现在由 control-tower 承载
2. 反直觉约定第 4 条（okteto/ArgoCD）：GitOps 接回来后为真，补一条自检命令
3. 反直觉约定第 2 条：`docs/design/` 「含 config-center 设计存档」→ 指向 control-tower `docs/design/`
4. 验收锚点第 6 行：`verify-freeze.sh --all` 不再宣称是「唯一必需检查」（`context-gate` 也在每次 push 跑，且 freeze 目前恒绿）
5. **新增**：control-tower 是同级仓，网关+配置中心都在它那里；本仓 `gateway/` 已删
6. 预算：现 10832B / 14000B，以上改动需控制在预算内

---

## 四、已拍板的三个点（2026-08-24）

### 1. `.freeze/` → **整套删除**

要删的东西（一并处理，漏一个就会留下断链或红 CI）：

- `.freeze/`（含 `README.md`）
- `scripts/freeze.sh`、`scripts/verify-freeze.sh`
- `.github/workflows/freeze-check.yml`
- `.gitlab-ci.yml` 里的 `freeze-check` job
- `.github/CODEOWNERS` 里 4 条 freeze 相关行（删完该文件只剩注释，考虑整体删除）
- `AGENTS.md:57` 的 `verify-freeze.sh --all` 锚点行
- `context/team/runbook.md` 里的冻结验收集一节
- `context/harness-framework/graph-engineering.md` 对 Frozen Nodes 的引用（该文件本来就要压到 ~30 行）
- `docs/agents/` / `.cursor/rules` 若有引用一并清

⚠️ 连带影响：删掉后 **main 上的必需检查只剩 `context-gate`**（`verify-context.sh`）。
`evolution-log.md` 必须记一条，写清「为什么把一道门禁整套拆掉」——否则半年后有人会凭直觉加回来。

### 2. `skills/README.md` → **并入 `docs/agents/`**

新建 `docs/agents/skills.md`，只写「本项目真用到哪些 skill + 为什么 + 当前安装状态」：

| skill | 状态 | 处理 |
|---|---|---|
| `tech-doc-style-chinese` | ✅ 已装，AGENTS.md 明确引用 | 保留，指向 AGENTS.md 中文文案约定 |
| `impeccable` | ✅ 已装 + 钩子链完整 + `.impeccable/design.json` 在用 | 保留 |
| `archify` | ✅ 已装 | 保留一行 |
| `agent-reach` | ⚠️ skill 在，但 `~/.agent-reach-venv` 已不存在 | 标注需重装 |
| `hcom` | ✅ brew 已装 + 全局钩子在用 | 保留一行 |
| `playwright-cli` | ❌ **未安装**（`command -v` 失败） | 删除该节 |
| `antigravity`(agy) | ✅ 已装 | 保留一行 |

删 `skills/README.md`，`AGENTS.md` 的 Agent skills 一节补指向 `docs/agents/skills.md`，
消除「两个 skills 位置」的结构问题。

### 3. 全局层 → **全面清理 MCP 与 skills**

范围在仓库之外，逐项先给你看清单再动手：

- `~/.claude.json`：删已死的 `ccteam`（127.0.0.1:7331 连接失败）
- 核对 `codex` / `goland` / `kitesurf` 三个存活项是否都还要
- `~/.claude/skills/` 41 项逐个验证符号链接是否断裂（指向 `~/.agents/skills/`）
- 清理指向已删目录的失效链接
- `~/.claude/settings.json` 的 3 个插件与钩子链核对

⚠️ **不碰凭据**：`~/.claude/settings.json` 与 `~/.claude.json` 里有明文 token
（ANTHROPIC_AUTH_TOKEN、ccteam Bearer、Cloudflare browser-run token）。
我不会读写、复制或搬运它们，也不会写进任何仓库文件。删 `ccteam` 那项会连带删掉它的 Bearer，
这是删除不是外泄。**另外提醒：这些 token 以明文躺在全局配置里，值得你单独安排轮换。**

---

## 五、执行顺序（确认后）

1. 先改 `context/` 源文件 → 再改 `.cursor/rules` 指针 → 最后改 `AGENTS.md`（避免链接断裂）
2. `helm/values.yaml` 对齐实跑 tag → apply 三个 `argocd-*.yml` → 验证 Application 起来
3. 删 `gateway/` 目录 + `gateway` remote → 同步修 `context/INDEX.md:74` 等引用
4. `evolution-log.md` 追加一条（四要素齐全，触发事故 = 本次审计）
5. 跑 `scripts/verify-context.sh`（链接/INDEX/frontmatter/预算）与 `backend/structcheck`
6. 两个仓分别提交，不 push

---

# 六、执行结果（2026-08-24 完成）

验证全绿：`verify-context.sh` ✅ · `verify-quick.sh`（后端 build+vet+test / 前端 pnpm ready）✅
· `go test ./structcheck/...` ✅ · `shellcheck` ✅。AGENTS.md 12311/14000 B。

## 与计划的三处偏差

1. **GitOps 没有 apply** —— 计划是 apply 三个 `argocd-*.yml`。实际发现该 ApplicationSet
   带 `prune: true` + `selfHeal: true`，而 `helm/` 与集群在**资源名、标签方案、镜像 tag**
   三处都不一致；加上 chart 里 `CONSUL_ENABLED=true`，apply 后会起一套 1.4.0 影子服务
   并经 Consul 被网关解析到，把真实流量导过去。已改为：关掉 `automated`、加顶部告警、
   把 `argocd-devwindow.sh` 从 `exit 1` 改成诚实空转。**集群随后也失联**（三节点全部 DOWN），
   即便想 apply 也做不到。
2. **全局 MCP/skills 无需清理** —— 计划是删掉「已死」的 `ccteam`。实测发现它是
   `/Users/sumery/lens077/ccteam` 这个 Rust 项目的守护进程，只在运行时才绑 7331；
   `goland` 同理（JetBrains IDE 在跑时才有端口，我第一次探测 200、第二次 000）。
   47 个 skill 符号链接全部可解析且都有 SKILL.md。**删它们会弄坏你自己的工具，故未动。**
3. **`.cursor/rules/local-env.mdc` 有一处三份审计都没发现的硬错误** ——
   Consul 地址写的是 `192.168.3.112`，真值是 `192.168.3.120`。已修。

## 非本次改动

`TODO.md` 与 `docs/design/platform/pre-environment.md` 在本次会话期间（08:32-08:33）
被**另一个进程**改过，内容是 CNPG 宿主网 TLSRoute（`192.168.3.132:5432`）。
已核实 `pg-passthrough-gateway` 真实存在于同级仓 `kubernetes/components/postgres/`，
属于并发的真实工作，未回退。
