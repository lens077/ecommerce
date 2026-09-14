# Graphify 文档与实测核查报告

> 核查对象：`https://github.com/Graphify-Labs/graphify`
>
> 固定版本：`v8` 分支、commit `23f2ffaa43fd12f25d9eabe91e6d184b5d89b474`（仓库声明版本 `0.9.58`）
>
> 核查日期：2026-09-12
>
> 上游仓库临时副本：`/tmp/graphify-upstream`

## 结论先行

**Graphify 的核心「代码库 -> 本地图谱 -> 可查询关系」效果可以复现，文档不是空壳；但「文档中的全部效果」不能据此视为已经独立验证。**

本次在无任何 LLM API key 的环境中复现了以下能力：

- 对 Python 代码做本地 AST 提取，不调用外部模型，生成带节点、边、源文件位置、关系类型和 `EXTRACTED` / `INFERRED` 标记的 `graph.json`。
- 通过 `explain` 查看概念邻居，通过 `path` 查找两个节点之间的最短路径，通过 `query` 返回问题相关的局部子图。
- 生成 `GRAPH_REPORT.md` 和可浏览的 `graph.html`。
- 修改代码后使用 `graphify update` 增量更新图谱；本次新增方法从图中出现，且调用边被提取出来。
- 在隔离的临时 Git 仓库中安装 Codex 指引和 `post-commit` / `post-checkout` hook。

没有独立复现或不能从当前仓库源码证明的部分：

- 文档/PDF/图片的语义抽取：缺少 LLM API key，因此只验证了它会明确拒绝运行，没有验证模型抽取质量。
- README 和 `BENCHMARKS.md` 的 LOCOMO、LongMemEval、ERPNext 数字：当前 clone 不包含 `memory/`、`crosstool/` 或数据集，仓库内给出的复现命令无法在该 clone 中直接执行。
- 「71.5x token reduction」：只能确认它是文档中的 headline，不能把仓库内的 `graphify benchmark` 命令输出当成同一实验的复现；两者的输入、估算方式和查询算法不同。
- 多语言、超大仓库、视频/音频、Office、Google Workspace、Neo4j/FalkorDB、各 AI 助手平台的完整兼容性。

因此，比较准确的评价是：**代码图谱和导航工具已经可运行，能提供真实的结构化结果；语义质量、基准数字和跨平台产品化效果仍应视为上游声明或待复现结果，而不是本次已证实事实。**

## 1. 文档与实现概览

### 1.1 文档声称的工作流

英文 README 将最小流程写成：

```bash
uv tool install graphifyy
graphify install
# 在 AI coding assistant 中：
/graphify .
```

并声称输出 `graphify-out/graph.html`、`GRAPH_REPORT.md` 和 `graph.json`；见 [README.md#L45-L67](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L45-L67)。

实现上，包名确实是 `graphifyy`，CLI 命令是 `graphify`，Python 最低版本是 3.10；见 [pyproject.toml#L5-L13](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/pyproject.toml#L5-L13) 和 [pyproject.toml#L104-L106](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/pyproject.toml#L104-L106)。

### 1.2 两份 README 存在版本漂移

仓库中的中文翻译页仍保留较早的叙述，例如：

- 将核心工作流描述为代码 AST + Claude 子代理 + NetworkX/Leiden；见 [中文 README#L26-L32](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/translations/README.zh-CN.md#L26-L32)。
- 写明每次查询可比直接读原文件少 `71.5` 倍 token；见 [中文 README#L8-L12](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/translations/README.zh-CN.md#L8-L12)。
- 仍使用较早的安装和平台列表；见 [中文 README#L34-L57](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/translations/README.zh-CN.md#L34-L57)。

英文首页已经补充到更多平台，并将代码、视频/音频与文档媒体的处理边界写得更清楚；见 [README.md#L30-L36](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L30-L36)、[README.md#L338-L358](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L338-L358)。阅读中文页时不能把它当成当前英文 README 的逐行等价翻译。

### 1.3 处理边界

官方「How it works」文档把流水线分成三类：

- 代码：Tree-sitter 本地解析，提取类、函数、导入、调用图和注释，不需要 API；
- 视频/音频：本地 faster-whisper 转录；
- 文档、论文、图片：调用 Claude 子代理做语义抽取，会消耗 token；

见 [docs/how-it-works.md#L3-L23](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/how-it-works.md#L3-L23)。英文 README 的隐私段也明确说代码可以完全离线，而文档、PDF、图片的 headless extraction 需要配置模型后端；见 [README.md#L562-L569](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L562-L569)。

这意味着「本地优先」不等于「所有文件类型都完全离线」。

## 2. 本次运行环境与步骤

### 2.1 环境

```text
OS/架构：macOS arm64
Python：3.14.7
uv：0.12.11
Graphify：0.9.58（源码 editable install）
上游 commit：23f2ffaa43fd12f25d9eabe91e6d184b5d89b474
LLM API key：未设置
```

在 `/tmp/graphify-upstream` 执行：

```bash
uv sync --frozen --no-dev
```

依赖安装成功，随后使用 `.venv/bin/graphify` 直接调用。`uv run graphify` 在本环境中尝试补齐开发依赖并在 30 秒探测中超时；这不是 Graphify CLI 失败，因此后续验证统一使用已创建虚拟环境里的可执行文件。

### 2.2 最小测试语料

测试语料放在 `/tmp/graphify-fixture`，包含 4 个文件：

- `src/auth.py`：`User`、`Database`、`authenticate()` 以及 `# WHY:` 注释；
- `src/service.py`：跨文件导入、类型引用、`UserService.load_user()`；
- `src/main.py`：`handle_request()` 调用服务；
- `pyproject.toml`：包元数据。

这是一个人为构造的、关系已知的小语料，适合验证结构识别，不适合证明大规模召回率或语义理解质量。

## 3. 实测结果

### 3.1 代码-only 建图：通过

执行：

```bash
.venv/bin/graphify extract /tmp/graphify-fixture --code-only --max-workers 2 --timing
```

实际输出：

```text
found 4 code, 0 docs, 0 papers, 0 images
AST extraction on 4 code files...
wrote .../graph.json: 15 nodes, 25 edges, 5 communities
semantic extract: 0.0s
total: 8.0s
```

这与文档「代码 AST 不需要 LLM」的核心声称一致。生成的 [graph.json](/tmp/graphify-fixture/graphify-out/graph.json) 中可以直接看到：

- `User`、`UserService`、`Database`、`authenticate()` 等节点；
- `source_file` 和 `source_location`；
- `calls`、`imports`、`contains`、`method`、`references`、`rationale_for` 等关系；
- 结构上直接读到的边为 `EXTRACTED`，本次样例中的推断边为 `INFERRED`，并带 `confidence_score`。

例如，`service.py` 的 `.load_user()` 到 `authenticate()` 的调用边为 `EXTRACTED`，`UserService` 到 `Database` 的 `uses` 边为 `INFERRED`、置信度 `0.95`。这与 [docs/how-it-works.md#L34-L50](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/how-it-works.md#L34-L50) 对置信度标记的说明一致。

### 3.2 报告与 HTML：通过

执行：

```bash
.venv/bin/graphify cluster-only /tmp/graphify-fixture --no-label
```

实际输出：

```text
Graph: 15 nodes, 25 edges
Done - 5 communities. GRAPH_REPORT.md, graph.json and graph.html updated.
```

实际生成：

```text
/tmp/graphify-fixture/graphify-out/GRAPH_REPORT.md
/tmp/graphify-fixture/graphify-out/graph.html
/tmp/graphify-fixture/graphify-out/graph.json
/tmp/graphify-fixture/graphify-out/manifest.json
```

报告里有 `Summary`、节点/边统计、`EXTRACTED` / `INFERRED` 比例、God nodes、Surprising Connections、Import Cycles、Knowledge Gaps 和 Suggested Questions。报告对本样例识别出 `User`、`UserService`、`Database`、`authenticate()` 等高连接节点，并列出了三条推断关系。

这里有一个实际使用边界：`extract --code-only` 本身输出的是图和分析文件，并提示下一步运行 `cluster-only` 生成报告；README 中「一次 `/graphify .` 得到三个文件」是 skill / 完整流程的体验描述，不应机械套用到每个底层 CLI 子命令。

### 3.3 `explain`、`path`、`query`：通过，但 query budget 不是硬截断

执行：

```bash
.venv/bin/graphify explain UserService \
  --graph /tmp/graphify-fixture/graphify-out/graph.json

.venv/bin/graphify path main.py Database \
  --graph /tmp/graphify-fixture/graphify-out/graph.json

.venv/bin/graphify query 'what connects authentication to the database?' \
  --graph /tmp/graphify-fixture/graphify-out/graph.json --budget 800
```

实测摘要：

```text
explain UserService
  Degree: 7
  --> Database [uses] [INFERRED]
  <-- main.py [imports] [EXTRACTED]
  --> .load_user() [method] [EXTRACTED]

path main.py -> Database
  Shortest path (2 hops):
  main.py --imports_from--> service.py --imports--> Database

query
  Traversal: BFS depth=2
  Start: ['Database']
  12 nodes found
  Complete answer over budget: ... ~857 tokens vs requested ~800
```

因此，文档声称的三类导航命令确实可用；源码还明确了 `query` 默认预算为 2000，使用 BFS 深度 2，并将图按无向方式遍历以同时找到 caller/callee，再保留边方向做展示，见 [cli.py#L1202-L1322](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/graphify/cli.py#L1202-L1322)。

重要限制是：预算参数不是严格的输出截断器。在本次 800-token 请求中，工具输出了完整的 12 个节点和 23 条边，并明确提示「complete answer over budget」。源码和提示的设计是「节点全部纳入后不丢边」，因此复杂图上不能把 `--budget N` 理解为严格最多 N token。

### 3.4 增量更新：通过

在 `src/service.py` 增加：

```python
def refresh_user(self, token: str) -> User:
    return self.load_user(token)
```

执行：

```bash
.venv/bin/graphify update /tmp/graphify-fixture --no-cluster
```

实际结果：

```text
Rebuilt (no clustering): 16 nodes, 31 edges
Code graph updated.
```

新增节点 `.refresh_user()` 出现在 `graph.json`，并出现：

- `UserService --method--> .refresh_user()`；
- `.refresh_user() --references--> User`；
- `.refresh_user() --calls--> .load_user()`。

这证明「代码文件变更后可进行 AST-only 增量更新」在小样例中成立。文档同时说明文档/图片变更需要重新做语义更新，不能把代码-only 更新的无 API 成本扩展到媒体语料；见 [README.md#L442-L464](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L442-L464)。

### 3.5 文档语义抽取无 key：按预期拒绝

对只含 `README.md` 的 `/tmp/graphify-doc-fixture` 执行：

```bash
.venv/bin/graphify extract /tmp/graphify-doc-fixture \
  --max-concurrency 1 --api-timeout 3
```

结果：退出码 `1`，并明确输出：

```text
error: no LLM API key found (1 doc/paper/image file(s) need semantic extraction)
...
A code-only corpus needs no key.
Or pass --code-only to index just the code ...
```

这验证了代码-only 的离线路径和文档/媒体语义路径是两条不同路径，也验证了它没有在没有 key 时悄悄把文档当作已完成结果。

### 3.6 Codex 安装和 Git hook：安装动作通过，自动重建未实测

在隔离临时项目中执行：

```bash
/tmp/graphify-upstream/.venv/bin/graphify codex install
```

成功写入：

```text
./AGENTS.md
./.codex/hooks.json
```

写入的 AGENTS 规则要求代码库问题先使用 `graphify query` / `path` / `explain`，与英文 README 对 Codex 的说明一致；见 [README.md#L280-L324](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L280-L324)。输出还明确说明 Codex 的 PreToolUse hook 是 intentional no-op，实际常驻指导来自 `AGENTS.md`。

在同一临时 Git 仓库执行：

```bash
/tmp/graphify-upstream/.venv/bin/graphify hook install
/tmp/graphify-upstream/.venv/bin/graphify hook status
```

成功安装并报告：

```text
post-commit: installed
post-checkout: installed
merge driver: registered
```

本次没有执行临时仓库的 commit，因此没有验证 post-commit hook 是否在真实 commit 后成功后台重建；只验证了安装和状态报告。

## 4. Benchmark 与 headline 的可信范围

### 4.1 仓库里的公开 benchmark 数字

`BENCHMARKS.md` 声称：

- LOCOMO recall@10 为 `0.497`；
- LOCOMO QA accuracy 为 `45.3%`；
- LongMemEval-S 为 `76%`；
- ERPNext 代码问题 key-fact coverage 从 `70.8%` 提升到 `82.0%`；
- 图构建为 `0` LLM credits；

见 [BENCHMARKS.md#L9-L34](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/BENCHMARKS.md#L9-L34) 和 [BENCHMARKS.md#L142-L149](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/BENCHMARKS.md#L142-L149)。文档也披露了共享模型、共享 embedder、token budget 和 judge 验证规则；见 [BENCHMARKS.md#L67-L92](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/BENCHMARKS.md#L67-L92)。

这里的「图构建 `0` LLM credits」必须按范围理解：它对应确定性的代码/AST 建图，或 benchmark 中特定的 code/index 阶段；官方 How it works 同时明确说明，混合语料的首轮仍要对 docs、papers、images 等做语义抽取并消耗 token，见 [docs/how-it-works.md#L53-L67](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/how-it-works.md#L53-L67)。因此不能把 `$0` 泛化为「包含文档和图片的完整首轮构建也完全零成本」。

### 4.2 不能从当前 clone 独立复现

`BENCHMARKS.md` 的复现段要求：

```bash
python memory/runner.py ...
python crosstool/run.py ...
```

见 [BENCHMARKS.md#L174-L187](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/BENCHMARKS.md#L174-L187)。但固定 commit 的仓库实际情况是：

```text
memory_dir=no
crosstool_dir=no
locomo_files=0
benchmark_files=0
```

也就是说，数据集不随仓库分发这一点文档有说明，但运行所需的 `memory/`、`crosstool/` harness 也不在当前 clone。没有额外的上游 harness、数据集和模型账户，无法独立重跑这些 headline 数字。

此外，文档自身披露 supermemory 的 recall 使用其自带的 768 维英文 embedder，作者认为 QA accuracy 轴才是更干净的比较；见 [BENCHMARKS.md#L110-L126](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/BENCHMARKS.md#L110-L126)。因此这些数字不能简化成「任何仓库、任何模型、任何问题都会提升 11 个百分点」。

### 4.3 `graphify benchmark` 不是 71.5x headline 的复现器

本次在小样例上运行：

```bash
/tmp/graphify-upstream/.venv/bin/graphify benchmark \
  /tmp/graphify-fixture/graphify-out/graph.json
```

输出：

```text
Graph: 16 nodes, 31 edges
Avg query cost: ~372 tokens
Reduction: 2.9x fewer tokens per query
```

源码显示，内置 benchmark 在未传入 `corpus_words` 时把语料字数粗略估成 `node_count * 50`，按 `100 words ≈ 133 tokens` 换算，查询 token 用 `len(text) // 4`，问题固定为 5 个英文样例，并用旧式 substring top-3 + BFS 估算；见 [graphify/benchmark.py#L11-L47](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/graphify/benchmark.py#L11-L47) 和 [graphify/benchmark.py#L85-L133](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/graphify/benchmark.py#L85-L133)。

因此：

- `2.9x` 是本次小样例、内置近似算法的结果；
- `71.5x` 是文档报告的另一组 52-file 混合语料 benchmark；
- 两者不能互相替代，也不能仅凭 `graphify benchmark` 命令复现 71.5x。

中文 README 的 worked examples 也写明 71.5x 来自「Karpathy 仓库 + 5 篇论文 + 4 张图片」的 52 文件语料，并承认 6 文件样例约为 1x；见 [中文 README#L199-L207](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/docs/translations/README.zh-CN.md#L199-L207)。当前 clone 没有这些 worked 输入和输出目录，因此不能以仓库内容做第三方复核。

## 5. 已确认的风险和限制

1. **语义结果依赖模型。** 代码 AST 边可以离线、确定性地提取；文档/PDF/图片的节点和关系由后端模型生成，结果质量、成本和数据驻留取决于后端配置。
2. **`INFERRED` 不是事实。** 实测样例中的 `UserService --uses--> Database` 是推断边，即使置信度为 `0.95`，仍应回到源代码复核。官方文档也要求对 `AMBIGUOUS` / `INFERRED` 关系人工审查。
3. **查询预算不是严格上限。** 当前实现为了保持完整边集合，可能返回超过 `--budget` 的完整答案；复杂图上应使用 `--context`、更窄的问题或 `explain`。
4. **节点消歧有边界。** 同名符号、跨仓库同名节点、旧 graph ID 可能需要 repo-relative path 或 full ID；源码在查询和 path 流程中有相应提示。不要把自然语言 label 当成全局唯一 ID。
5. **大图可视化有限制。** README 明确建议超过约 5000 节点时跳过 HTML，直接使用 JSON 和查询；见 [README.md#L627-L632](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/README.md#L627-L632)。
6. **中文文档滞后。** 使用中文 README 部署时，应以当前英文 README、`pyproject.toml` 和 CLI `--help` 为准。
7. **默认依赖不是所有 optional extras。** 例如 `leiden`、`pdf`、`office`、`mcp`、各模型后端均是可选 extra；见 [pyproject.toml#L52-L102](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/pyproject.toml#L52-L102)。文档中列出的能力不代表基础安装已包含对应依赖。
8. **基准缺少随仓库分发的复现 harness。** 公开数字可以作为上游报告阅读，但在当前 commit 上不应标为本次独立验证结果。

## 6. 许可证与供应链信息

`pyproject.toml` 声明 `Apache-2.0`，同时仓库包含 `LICENSE` 和 `LICENSE-MIT`；见 [pyproject.toml#L5-L12](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/pyproject.toml#L5-L12)、[LICENSE](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/LICENSE) 和 [LICENSE-MIT](https://github.com/Graphify-Labs/graphify/blob/23f2ffaa43fd12f25d9eabe91e6d184b5d89b474/LICENSE-MIT)。本报告没有对双许可证的法律适用方式作法律意见；正式采用前应按项目 NOTICE 和许可证文本评估。

## 7. 最终判定

| 文档效果 | 判定 | 依据 |
|---|---|---|
| 代码本地 AST 建图、零 API key | **已复现** | 4 文件 -> 15 节点 / 25 边；semantic extract 为 0 秒 |
| `graph.json` 含源位置和置信度标记 | **已复现** | 实测 JSON 中存在 `source_file`、`source_location`、`EXTRACTED`、`INFERRED` |
| `GRAPH_REPORT.md` + `graph.html` | **已复现** | `cluster-only --no-label` 成功生成 |
| `query` / `path` / `explain` 导航 | **已复现** | 三个 CLI 命令均返回结构化结果 |
| 代码变更后的增量更新 | **已复现** | 15/25 -> 16/31，新增方法和调用边出现 |
| Codex 指引、Git hook 安装 | **安装已复现** | 临时项目写入 AGENTS、`.codex/hooks.json`，Git hook status 为 installed |
| 文档/PDF/图片语义抽取质量 | **未验证** | 无 API key；只验证了无 key 时明确失败 |
| 71.5x token 节省 | **无法独立确认** | 当前 clone 无 worked 语料；内置 benchmark 是另一种近似口径 |
| LOCOMO / LongMemEval / ERPNext headline | **无法独立复现** | `memory/`、`crosstool/`、数据集不在当前 clone |
| 跨 40+ 语言、媒体和所有平台 | **未完整验证** | 仅运行 Python code-only 路径 |

**建议把 Graphify 当作「可落地的本地代码结构索引与图导航工具」试用；不要仅凭 README benchmark 数字，就把它当作已经证明能稳定提升所有 AI 编码任务质量的通用方案。**

## 8. 附录：接入 DSH 并分析 ecommerce backend（实测 2026-09-14）

### 8.1 接线产物

| 步骤 | 命令 | 结果 |
|---|---|---|
| 安装 CLI | `uv tool install 'graphifyy[sql]'` | `graphify 0.9.61`，位于 `~/.local/bin/graphify`；`[sql]` extra 是第二次补装，首轮缺它时 32 个 `.sql` 文件贡献 0 节点 |
| 接入 DSH | `graphify agents install --project` | 写入 `.agents/skills/graphify/SKILL.md` + `references/`（9 个文件）；**未改动 `AGENTS.md`**（`git diff` 为空） |
| DSH 发现 Skill | 同一会话内 skill 目录刷新出现 `graphify`，`skill("graphify")` 加载成功 | 不需要重启会话 |
| 建图 | `cd backend && graphify extract . --code-only --max-workers 4` | 430 代码文件 -> 11,294 节点 / 16,855 边 / 673 社区，13.5 秒，0 LLM 调用 |
| 报告 | `graphify cluster-only . --no-label --no-viz` | `GRAPH_REPORT.md` 生成；`--no-viz` 因 >5,000 节点跳过 HTML |

范围选择：全仓检测到 1,351 文件（超过 Skill 的 500 文件阈值），按 Skill 流程列出一级目录分布后由用户选定 `backend`。`graphify-out/` 落在 `backend/graphify-out/`，仓库根目录不保留输出。

### 8.2 查询实测与源码对照

| 查询 | 图谱结果 | 源码/真相源核对 | 判定 |
|---|---|---|---|
| `explain CreateOrder` | 报歧义：3 个同名节点（connect client / service / biz application），要求用 full id | — | 行为正确，需用 `service_orderservice_createorder` 等 id 重试 |
| `explain service_orderservice_createorder` | 6 条边，全部 `references` 类型，0 条 `calls` | `services/order/internal/biz/application/order.go:L46` 的 `CreateOrder` 是**桩**：只有注释和 `return &domain.CreateOrderResponse{}, nil` | **图与代码一致** |
| `path CreateOrder -> Reserve`（有向） | 无路径 | `grep Reserve services/order` 为空；`.service-matrix.yaml` 中 order 的 `depends_on: []`，inventory 只在 `depends_on_planned` | **图与两份真相源一致**，不是漏提取 |
| `path ... --undirected` | 3 跳，经过 `go.uber.org/zap.Logger` | zap.Logger 是共享依赖 hub | 结构上成立、语义上无用；`path` 没有 `--exclude-hubs` |
| `path service_inventoryservice_reserve -> data_inventoryrepo_reserve` | 无有向路径 | 源码明确有 `s.uc.Reserve(...)`（service->biz）和 `uc.repo.Reserve(ctx, req)`（biz->data） | **真实漏边**，见 8.3 |
| `query 'cart add item quantity' --context call` | 5 个种子节点，0 条边；种子含 `pkg/gorse/client.go` 的 `Item` 和 behavior 的 `CART` 枚举 | — | 子串匹配把无关同名节点当种子 |

### 8.3 已确认的提取边界（Go / Kratos 分层）

- **能提取**：同包内直接调用（`uc.flush()` -> `.flush()`、`truncate()`、`.GetOrderByNo()`），类型引用（参数/返回/泛型实参）、方法归属、文件包含关系。全图 `calls` 1,059 条，`references` 5,170 条，99% `EXTRACTED`。
- **不能提取**：经注入字段（`s.uc.Reserve`、`uc.repo.Reserve`）跨包调用的方法。原因是同名候选多（`Reserve` 约 10 个）且提取器不做接收者类型推断，按「Never invent an edge」规则直接丢弃，而不是猜一条 `INFERRED` 边。**后果：`path` 无法沿 service -> biz -> data 追踪调用链**，只能用 `references` 边或按 id 分别 `explain`。
- **噪声源**：God nodes 前 8 名中 6 个是各服务 `conf.pb.go` 的 `Bootstrap`，另有 `rawDescGZIP()`——全是生成代码。建议加 `.graphifyignore` 排除 `*.pb.go`、`*_pb.ts`、`*.connect.go` 后重建，再看业务 hub。本轮未做，因为会改变索引范围，需用户决定。
- **`Item`/`CART` 这类短标签**会被子串匹配命中无关节点；查询前先查 `graphify-out/.vocab.txt` 选词，或直接用 full id。
- **增量更新与全量重建不等价**。同一 HEAD（`9f91646`）下：`graphify update . --no-cluster` 重提取 34 个文件后得到 11,345 节点 / **19,693** 边；紧接着 `graphify extract . --code-only --force` 全量重建得到 11,345 节点 / **16,901** 边。节点数相同，增量路径多出约 2,800 条边（+17%），说明 `update`（watch 重建路径）的边去重与 `extract` 不一致。**建议：`update` 只用于快速刷新，关键分析前用 `--force` 全量重建。**
- 图谱新鲜度检查有效：图建于 `e3dde0d`，构建期间另一会话提交了 `9f91646`，`GRAPH_REPORT.md` 的「Built from commit」立即暴露了落后一个 commit；`update` 后刷新为 `9f916466`。

### 8.4 未做与后续

- 187 个 backend 文档文件未做语义抽取（需要模型后端，本轮明确不产生外部费用）。
- `backend/graphify-out/` 与 `.agents/` 均为 untracked，未提交；是否入库按上游「团队共享」建议和本仓 `TODO.md` 流程另行决定。`cost.json` 上游建议 ignore。
- Codex / Claude Code 的 `codex install --project` / `claude install --project` 未在本仓执行；隔离环境的验证见 3.6。
- 文档 `docs/agents/skills.md` 记录 `uv` 缺失、Python 为 3.9.6，与本轮实测（uv 0.12.11、Python 3.14.7）不符，该页需要更新，不在本轮范围。
