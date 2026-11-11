# 配置 schema：`harness.config.yaml`

目的：把 `05-scripts/adapt-points.md` 里列出的硬编码常量收进一个文件，让门禁脚本与模板保持通用。

> 状态：**草案**。源仓（ecommerce）尚未采用此文件，脚本仍是硬编码。本 schema 是根据现有实现倒推的，
> 未在任一仓跑通——落地时以 `05-scripts/adapt-points.md` 的行号为准逐项替换。

## 字段定义

```yaml
version: 1

scan:
  roots: [AGENTS.md, README.md, TODO.md]   # 受扫描的顶层 Markdown
  trees: [context, docs]                   # 全树扫描的目录

context:
  root: context
  layers:                                  # 层名 + 该层用途（用于 INDEX 路由校验）
    - name: team
      kind: team
    - name: harness-framework
      kind: framework
    - name: decisions
      kind: decisions
  project:
    name: "{{PROJECT_SLUG}}"               # 对应 context/project/<name>/
    index: "project/{{PROJECT_SLUG}}/INDEX.md"

budgets:                                   # 字节上限，按各仓体量自定
  AGENTS.md: 13000
  TODO.md: 96000

baselines:
  dir: scripts
  format: context-format-baseline.txt      # [FORMAT] 存量豁免
  progress: context-progress-baseline.txt  # [PROGRESS-SRC] 复选框上限
  pathref: context-pathref-baseline.txt    # [PATH-REF] 存量豁免
  ratchet: strict                          # strict = 只降不升 + 陈旧行必清

exemptions:
  files: []                                # 例：helm/files/zero-trust.yaml（KYAML 豁免）
  path_refs: []                            # 例：允许引用的未来路径前缀
  retired_terms: []                        # [RETIRED] 术语表

generated_paths: []                        # [GENERATED] 禁止手改的产物目录

doc_ownership:                             # verify-doc-sync 的规则表
  enabled: false
  required_marker: "doc-sync: required"
  mapping_file: ""

skills:
  registry: docs/agents/skills.md
  status_column: 2                         # 0-based；源仓实际在第 3 列，与脚本判据不一致（见 07）

commands:
  quick: scripts/verify-quick.sh
  backend: "cd backend && go build ./... && go vet ./..."
  test: "cd backend && go test -short ./..."
  frontend: "cd frontend && pnpm ready"
  context_gate: scripts/verify-context.sh
  canary: scripts/verify-context-canary.sh
  deployments: []                          # 例：["scripts/verify-kyaml.sh", "scripts/verify-deploy-parity.sh"]

ci:
  providers: [github, gitlab]
  gate_job_name: context-gate
  required_check: true                     # 仅登记意图；实际由平台分支保护决定

hooks:
  install: custom                          # custom | husky | lefthook | vp
  hooks_path: ""                           # 例：frontend/.vite-hooks/_
  pre_commit_steps: []
  commit_msg: "commitlint --config {{COMMITLINT_CONFIG}} --edit $1"

security:
  secrets_scanner: gitleaks                # 缺失即红（fail-closed）
  fail_closed: true
  allowlist_file: .gitleaks.toml
```

## 两条设计约束

1. **`ratchet: strict` 才是源仓真实语义**。若目标仓只做「在基线里就放行」，豁免会退化成永久免罪符
   （`07-drift-corrections.md` 第 2 条记录了这个具体风险）。
2. **`scan.roots` 里不要写不存在的文件**。源仓把 `STACK.md` 写进扫描集（`scripts/verify-context.sh:143`），
   文件确实存在所以没炸；但同类写法在 `deploy/` 上已经造成一次失效——路径必须由生成器校验存在性。
