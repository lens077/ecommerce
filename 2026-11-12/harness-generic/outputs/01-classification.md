# 三类划分：通用语义 / 适配点 / 业务绑定

计数口径：**通用 22 项、适配 13 项、业务绑定 10 项**（逐项列在下面，可核对）。

---

## A. 通用 Harness 语义（22 项，可直接移植）

判据：换一个技术栈、换一批服务名，这条规则仍然成立。

| # | 能力 | 源证据 | 为什么通用 |
|---|---|---|---|
| A1 | AGENTS.md 只做索引与硬规则，规范本体外置 | `AGENTS.md:3-5` | 防「同一约束两处漂移」，与语言无关 |
| A2 | context 分层路由（根 INDEX 只回答「进哪层」） | `context/INDEX.md:14-27` | 分层的目的是控制上下文预算，通用 |
| A3 | 逐篇清单只维护在层 INDEX（防两层索引分叉） | `context/INDEX.md:16-19` | 单清单原则，通用 |
| A4 | INDEX 行只写「管什么/何时读」，不写结论 | `context/INDEX.md:82-83` | 渐进式披露，通用 |
| A5 | frontmatter 必填 `name`/`description`，`name`=文件名，`layer`/`module` 与路径一致 | `scripts/verify-context.sh` [FRONTMATTER] | 结构可判定，通用 |
| A6 | experience 四段格式（症状 / 根因 / 关键陷阱 / 证据标签） | `scripts/verify-context.sh` [FORMAT] | 踩坑复用的最小字段集，通用 |
| A7 | 决策记录「路径即状态」+ 必写「考虑过的替代方案」 | `scripts/verify-context.sh` [DECISION]；`context/decisions/INDEX.md` | 决策可审计，通用 |
| A8 | 基线棘轮：存量冻结，只拦新增 | `scripts/lint-baseline.sh`；三份 `context-*-baseline.txt` | 渐进式治理的通用机制 |
| A9 | 反向棘轮：基线只降不升 + 陈旧行必须清理 | `scripts/verify-context.sh:388-389`（注释与 `budget=13000`） | 防基线退化成永久免罪符，通用 |
| A10 | 豁免必须精确到目标路径，放行词不跨行污染 | `scripts/path-refs.py` 的 `future_scoped` 精确放行 | 豁免语义，通用 |
| A11 | 路径引用校验：正文反引号路径必须在 git 索引中存在 | `scripts/verify-context.sh:575-590` 调 `scripts/path-refs.py check` | 文档可执行化，通用 |
| A12 | 死链校验：Markdown 相对链接必须可达，跳过代码块/外链/锚点 | `scripts/verify-context.sh:124-143` | 通用 |
| A13 | 孤儿校验：每个非 INDEX 文件必须被所属层 INDEX 链接 | `scripts/verify-context.sh:147-173` | 通用 |
| A14 | 预算门禁：整份注入上下文的文件有字节上限 | `scripts/verify-context.sh` [BUDGET] | 通用（数值需配置） |
| A15 | 退役物横幅：已删除能力在文档中必须显式标记 | `scripts/verify-context.sh` [RETIRED] | 防"文档说有、代码没有"，通用 |
| A16 | 生成物禁止手改 | `scripts/verify-context.sh` [GENERATED] | 通用 |
| A17 | 受管代码块投影（文档片段由脚本刷新） | `scripts/verify-context.sh:520-528` 调 `scripts/doc-embed.py` | 通用 |
| A18 | 工具链投影校验（文档里登记的命令/版本与真实配置一致） | `scripts/verify-context.sh` 输出项「工具链投影」 | 通用 |
| A19 | canary 元评测：探针 0 必绿 + 每个检查至少一个红探针 + tag 断言 + 假阳性守卫 | `scripts/verify-context-canary.sh:1-25, 345-372` | **最该优先搬**，通用 |
| A20 | 软门禁显形：所有被放行的存量集中打印，不静默 | `scripts/harness-scars.sh:1-22` | 通用 |
| A21 | 一键并行验证：绿只打一行、红只打失败段、完整日志落文件 | `scripts/verify-quick.sh:1-19, 90-119` | 通用（命令可配置） |
| A22 | hook 幂等安装 + 单一 `core.hooksPath` | `frontend/.vite-hooks/commit-msg:1-12`（记录九个月静默失效） | 两套钩子互抢必静默失效，通用 |

补充（计在 A 类语义里、不单列）：凭据扫描 fail-closed「缺工具即红」（`scripts/verify-quick.sh:62-70`）、提交路径轻门禁 / 推送路径全量门禁的分层（`frontend/.vite-hooks/pre-push:3-8`）、异构双审流程（`AGENTS.md:110`）。

---

## B. 需按项目配置注入（13 项）

判据：语义不变，但值因仓而异；**硬编码即不可移植**。

| # | 适配点 | 源仓当前取值 | 应变成 |
|---|---|---|---|
| B1 | 扫描根文件 | `AGENTS.md README.md STACK.md TODO.md context docs`（`scripts/verify-context.sh:143`） | `scan.roots` |
| B2 | context 层名 | `team/` `harness-framework/` `decisions/` `project/ecommerce/`（`:147`） | `layers[]` + `project.name` |
| B3 | 预算数值 | AGENTS 13000 字节、TODO 96000 字节（`:35-38, 389`） | `budgets` |
| B4 | 基线文件路径 | `scripts/context-format-baseline.txt` 等三份 | `baselines.paths` |
| B5 | 豁免清单 | `helm/files/zero-trust.yaml`（`scripts/verify-kyaml.sh:45-47`）；`path-refs.py` 放行规则 | `exemptions` |
| B6 | 退役术语表 | [RETIRED] 检查的术语集 | `retired_terms` |
| B7 | 生成物目录 | [GENERATED] 的产出目录 | `generated_paths` |
| B8 | 文档责任映射 | `verify-doc-sync.py` 的 `doc-sync: required` + `affects:` 规则 | `doc_ownership` |
| B9 | skills 注册表与列位 | `docs/agents/skills.md` 第 3 列（`scripts/verify-context.sh` 的 `[SKILL-REF]`） | `skills.registry` + `skills.status_column` |
| B10 | 验证命令 | `go build/vet/test`、`pnpm ready`、`make check` | `commands.{backend,frontend,all}` |
| B11 | CI provider 与 job 名 | GitHub `context-gate.yml` + GitLab `context-gate` | `ci.providers[]` |
| B12 | hook 挂载方式 | vite-plus `core.hooksPath=frontend/.vite-hooks/_` | `hooks.install` |
| B13 | 安全扫描 allowlist | `.gitleaks.toml`、`verify-public-ips.py` 白名单 | `security.allowlist` |

---

## C. ecommerce 业务绑定（10 项，**不可直接搬**）

| # | 内容 | 证据 | 不可搬的原因 |
|---|---|---|---|
| C1 | 10 个业务服务名 / `discovery` / `gateway_prefix` | `.service-matrix.yaml:162-260` | 拓扑只属于本项目 |
| C2 | `.service-matrix.yaml` + `backend/structcheck` 同构性基线 | `backend/structcheck/structcheck_test.go:1-30` | 依赖具体的「矩阵↔目录↔网关」三面结构 |
| C3 | helm + 裸 manifest 双真相源 parity | `scripts/verify-deploy-parity.sh:4-20` | 「两份清单」这个前提本项目专有；路径与对象名全绑定 |
| C4 | KYAML 约定 + `zero-trust.yaml` 的 tpl 冲突豁免 | `scripts/verify-kyaml.sh:4-24` | 是格式偏好，不是通用语义 |
| C5 | control-tower 依赖版本联动规则 | `AGENTS.md:50` | 依赖特定同级仓；且当前无校验器 |
| C6 | 集群地址 / 命名空间 / ArgoCD 分区 | `.service-matrix.yaml:71-82` | 环境绑定 |
| C7 | 领域术语（订单/库存/超卖/Outbox/Debezium/行投影） | `docs/TECH.md:199-288` | 业务语义 |
| C8 | Config Center / Consul / Dragonfly / Silo / TCR+Harbor | `.service-matrix.yaml:72-79`、`docs/TECH.md:585-592` | 基础设施选型 |
| C9 | k6 / OpenFGA / Casdoor / Bugsink 等「已确定选型」 | `docs/TECH.md:36-53` | 项目决策 |
| C10 | 中文文案约定（直角引号、允许第二人称） | `AGENTS.md:55-58` | 项目偏好；且无校验器 |

---

## 一条容易忽略的边界

`verify-context.sh` 的**检查集合**是通用的，但它的**扫描根、层名、预算**是硬编码的（见 B1-B3）。因此「复制脚本」这个动作本身只能得到 70% 的价值——剩下 30% 是把常量外提。这也是第二阶段建议「共享核心 + 配置注入」而不是「纯复制」的直接理由。
