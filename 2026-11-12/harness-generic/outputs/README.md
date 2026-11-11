# Harness 通用抽取（ecommerce → 可移植模板）

来源仓库：`/Users/lens/lens077/ecommerce`（只读审计，未改动任何原有文件）
抽取日期：2026-11-12

## 这份产出回答什么

把 ecommerce 的 Harness 从「一个仓库的实现」拆成三层：

1. **通用 Harness 语义**——换仓库仍然成立，可直接搬到模板；
2. **适配点**——语义不变但常量不同，必须由各仓通过配置注入；
3. **ecommerce 业务绑定**——服务名、端口、集群、领域术语，**不可直接搬**。

## 文件索引

| 文件 | 内容 | 可直接用？ |
|---|---|---|
| `01-classification.md` | 三类划分逐项清单（含 `file:line` 证据与计数） | 阅读用 |
| `02-AGENTS.template.md` | 占位符化的 AGENTS.md 模板（硬规则 + E3 + 消费边界 + 锚点区） | 是，替换 `{{...}}` |
| `03-config-schema.md` | `harness.config.yaml` 字段定义 + 示例 | 是 |
| `04-context-skeleton/` | `context/` 四层骨架（路由 INDEX + 各层 INDEX + frontmatter 约定） | 是 |
| `05-scripts/adapt-points.md` | 现有脚本里必须改的硬编码常量（逐行） | 是 |
| `05-scripts/canary-probe-template.md` | canary 探针注册模式（元评测骨架） | 是 |
| `05-scripts/verify-context.adapter.example.sh` | 配置加载器草案（**未执行验证**） | 需自行调试 |
| `06-porting.md` | 移植步骤、验收标准、第三仓成本 | 是 |
| `07-drift-corrections.md` | 已漂移断言的修正 / 占位化处置 | 是 |

## 三条硬性使用规则

1. **不要整份复制 `AGENTS.md`**。先按 `02` 生成骨架，再把业务段落按 `01` 的分类逐条填。
2. **不要复制 `docs/agents/skills.md` 的运行态工具表**。那张表在源仓已 11 行失效，且与「环境按需查询」的原则冲突；模板只保留「查法」。
3. **先让 canary 在沙箱里红一次，再接 CI**。源仓有两次恒绿门禁事故（commitlint 钩子静默失效九个月、`verify-freeze.sh` 恒绿十七天），`verify-context-canary.sh:2-12` 记录了判据：**门禁的存在性 ≠ 有效性**。

## 与源仓既有文档的关系

源仓已有 `context/harness-framework/portable-harness.md`，它给的是「复用方式清单 + 新项目采纳五步」。本目录是它的**可执行展开**：把「模板级复制」具体化成占位符文本、配置 schema 与适配点行号。两者不冲突，建议落地时把 `portable-harness.md` 的第 3 步指向本目录。
