# 断言台账：AGENTS.md 与 docs/TECH.md（2026-11-12 复核）

口径：上一轮 63 条按「同一事实的重复表述」与「历史证据（带日期的已完成结果，不构成现行契约）」归并去重后，
本台账收录 31 条**可机械核对或需显式声明无校验**的断言。四态定义：

- **成立**：当前仓库存在对应证据，且门禁或运行时行为一致。
- **已修正**：本轮改过文档，使其与代码/配置一致。
- **显式标注无校验**：保留规则，但写明没有自动校验，靠评审。
- **删除**：表述已失效且无保留价值，整段移除（本轮无「删除」态；删除发生在上一提交的 skills.md 两节）。

不可验证项单列在末尾，不写成结论。

| # | 断言（file:line） | 状态 | 证据 |
|---|---|---|---|
| 1 | `AGENTS.md:4` 规范本体在 `context/` | 成立 | `context/INDEX.md` 存在，四层 INDEX 齐全 |
| 2 | `AGENTS.md:12` 服务拓扑查 `.service-matrix.yaml` | 成立 | 文件存在，12 条服务登记 |
| 3 | `AGENTS.md:15` 写 proto 前读 `context/team/proto-design.md` | 成立 | 文件存在，被 `context/team/INDEX.md` 收录 |
| 4 | `AGENTS.md:17` `TODO.md` 是唯一进度真相源 | 成立 | `[PROGRESS-SRC]` 扫复选框，索引由 `context/team/runbook.md` 约束 |
| 5 | `AGENTS.md:20` commitlint 强制十一类 type + emoji 匹配 | 成立 | `frontend/commitlint.config.mjs`；`core.hooksPath=frontend/.vite-hooks/_` |
| 6 | `AGENTS.md:24` 凭据不入库 | 成立 | pre-commit gitleaks + `.gitlab-ci.yml:73` gitleaks job |
| 7 | `AGENTS.md:27` 改 harness 要在改动处写触发事故 | 显式标注无校验 | 属评审约定，无脚本；本轮未加标注（它在「写理由」上下文中已自述理由要求） |
| 8 | `AGENTS.md:38` 四层 `context/` 各有 INDEX | 成立 | `[ORPHAN]` + 层 INDEX 检查 |
| 9 | `AGENTS.md:49` vite-plus 一个包承载 dev/build/test/lint/fmt/钩子 | 成立 | `frontend/package.json` + `frontend/.vite-hooks/` |
| 10 | `AGENTS.md:52` 部署清单在 `backend/services/*/deploy/{base,overlays/prod}` 与 `frontend/apps/*/deploy/` | 已修正 | `scripts/verify-deploy-parity.sh:13-17,66-79` 的遍历路径 |
| 11 | `AGENTS.md:53` 改路由模板须同 PR 升 control-tower 依赖版本 | 显式标注无校验 | `backend/structcheck` 只比对已安装 routes 模板 |
| 12 | `AGENTS.md:57` 中文文案约定（直角引号、第二人称） | 显式标注无校验 | 无排版校验器接入 |
| 13 | `AGENTS.md:98` `scripts/verify-quick.sh` 是默认入口 | 成立 | 脚本存在，5 段并行 |
| 14 | `AGENTS.md:100` `backend/structcheck` 测试 | 成立 | `backend/structcheck/` 目录与 `go test ./structcheck/...` 可跑 |
| 15 | `AGENTS.md:101` `verify-kyaml.sh` / `verify-deploy-parity.sh` | 成立 | 两脚本存在，已纳入 `verify-quick.sh` 的 deploy-manifests 段 |
| 16 | `AGENTS.md:108` `verify-context.sh` 是 main 唯一必需 CI 检查 | 已修正 | 改为「两侧 CI 都跑它；『必需检查』属平台分支保护，本地不可读」 |
| 17 | `AGENTS.md` 预算 13000 字节 | 成立 | `[BUDGET]` 实时统计，当前 12889 字节 |
| 18 | `docs/TECH.md:28` 目标是契约、不代表已实现 | 成立 | 阅读边界声明，且缺口只落 `TODO.md` |
| 19 | `docs/TECH.md:30` 文档责任由 `doc-sync: required` + `affects:` 检查 | 成立 | `scripts/verify-doc-sync.py`；`frontend/.vite-hooks/commit-msg:29`、`.gitlab-ci.yml:62` |
| 20 | `docs/TECH.md:38` Go 版本由 `backend/go.mod` 定义 | 成立 | `backend/go.mod` 的 `go` 指令 |
| 21 | `docs/TECH.md:42` `protoc-gen-connect-openapi` 钉 `v0.19.1` | 已修正 | 版本只出现在 `backend/buf.gen.openapi.yaml:16` 注释；已改为「目标版本、未强制、无自动校验」 |
| 22 | `docs/TECH.md:42` `make api` / `make api-openapi` 刷新产物 | 成立 | `backend/Makefile:113,150` |
| 23 | `docs/TECH.md:42` 渲染器用 Scalar | 成立 | `backend/openapi/index.html` 存在 |
| 24 | `docs/TECH.md:47` k6 是已确定测试选型 | 已修正 | 仓内无 k6 脚本、无 CI job；已标注「无落点，属目标契约」，并补 Playwright 的真实落点 |
| 25 | `docs/TECH.md:48` OpenFGA 是已确定安全选型 | 已修正 | 不在 `backend/go.mod`，同级 `../control-tower` 的 Go 依赖也未命中；已标注「无落点，属目标契约」 |
| 26 | `docs/TECH.md:52` GitLab 跑门禁、GitHub 只由 tag 发布 | 成立 | `.gitlab-ci.yml` 四个 job；`.github/workflows/backend.yml:2-4` tag-only |
| 27 | `docs/TECH.md:53` mirrord/Okteto 分工 | 未能验证 | 需集群与本地 CLI；文档已标注证据来源，不含版本承诺 |
| 28 | `docs/TECH.md:67` 供应链安全进度（1.5.2–1.5.4 等） | 成立（历史证据） | 带日期的已完成结果，不是现行门禁承诺 |
| 29 | `docs/agents/skills.md` 记「已安装/缺失」与工具版本 | 已修正 | 改为采用状态 + 查法；MCP / Hooks 两节历史记录已删除 |
| 30 | `docs/agents/skills.md` `## Skills` 列契约 | 成立 | 第 1 列 skill 名、第 2 列状态词；`[SKILL-REF]` 通过 |
| 31 | `scripts/verify-context-canary.sh` 覆盖所有启用 tag | 已修正 | 新增元断言；实跑 `18/18 tag 均有探针`，47 探针全过 |

## 不能进通用模板的断言

`#10`（部署路径形态）、`#17`（13000 预算）、`#21`（`v0.19.1`）、`#24`/`#25`（k6、OpenFGA 选型）、
`#27`（mirrord/Okteto 分工）均为 ecommerce 事实或未验证项，模板里只保留占位符与「查法」。

## 未验证（不写成结论）

- 平台侧是否把 `context-gate` 设为 required check：需在 GitHub/GitLab 分支保护设置确认。
- `docs/TECH.md` 中涉及集群、镜像仓、Terraform 状态的运行态描述：本轮未连集群，不复核。
