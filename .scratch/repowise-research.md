# Repowise 仓库阅读笔记

> 来源：Repowise 官方 GitHub 仓库 `main` 分支的 README、架构文档、用户指南、MCP 参考、配置参考、`pyproject.toml`、`package.json` 与 roadmap。本文只记录仓库已公开表达的事实，并将项目自报的 benchmark 与工程判断分开。

## 一句话定位

Repowise 是一个本地、可自托管的代码库智能层：先对源代码、依赖图、符号、Git 历史、测试、文档和架构决策建立索引，再通过 CLI、FastAPI/Next.js 仪表盘、MCP 和 PR 集成向开发者与 AI coding agent 提供可引用的代码库上下文、影响分析、风险排序、代码健康和重构线索。

## 主要架构

```text
源码 + Git 历史
    -> FileTraverser / tree-sitter AST / GraphBuilder / GitIndexer
    -> 依赖图、符号索引、Git 元数据、死代码、代码健康
    -> SQL + 向量库 + 图存储
    -> CLI / REST+Web UI / MCP / GitHub 集成
```

- `packages/core`：摄取、AST 解析、调用解析、依赖图、Git 分析、健康分析、死代码、文档生成、持久化和 provider 抽象。
- `packages/cli`：`repowise init/update/watch/serve/mcp/search/risk/health` 等命令。
- `packages/server`：FastAPI REST API、MCP server、后台任务、Webhook、调度器。
- `packages/web`：Next.js 15 前端；根 `package.json` 另有 `types/ui/api-client/vscode` workspace。
- `integrations/`：GitHub Action 和 GitHub App；`docker/`：镜像与 compose。

三类存储各自承担不同问题：

1. SQLAlchemy + SQLite（默认）或 PostgreSQL：wiki 页面、符号、任务、版本、Git 元数据等结构化事实。
2. LanceDB（SQLite 模式）或 pgvector（PostgreSQL 模式）：语义搜索和 RAG 上下文。
3. NetworkX，超大图时可落 SQLite/其他后端：文件/符号依赖图、PageRank、SCC、调用边和变更传播。

## 运行链路

### 首次索引

`repowise init` 先遍历文件并解析 AST，构造依赖图，再索引 Git 历史、死代码和代码健康。之后按层级生成 wiki：特殊文件、符号 spotlight、文件、循环依赖簇、模块、跨包、仓库概览和基础设施页。生成结果写入 SQL、向量库和图索引，并更新 `.repowise/state.json`。

`--no-prose` 模式不需要 API key，也不调用 LLM，仍然提供结构化 wiki、图、Git、健康、风险和死代码能力；LLM 只负责可选的模型生成 prose、部分决策提取和 chat。

### 增量维护

`repowise update` 或 webhook/轮询发现 HEAD 变化后，ChangeDetector 找出变更文件，GitIndexer 更新历史，调用图传播决定哪些页需要完整重生成、符号重命名补丁或只降低置信度。`cascade_budget` 限制一次推送的重生成数量，其余进入后台队列。

### Agent 接入

MCP 默认提供任务型工具，而不是要求 agent 逐个读取文件：`get_overview`、`get_answer`、`get_context`、`get_symbol`、`search_codebase`、`get_risk`、`get_change_risk`、`get_why`、`get_dead_code`、`get_health`。workspace 模式另有 `list_repos`，依赖路径、执行流、重构代码生成等工具可选启用。传输支持 stdio、streamable HTTP 和旧 SSE。

## 技术栈与要求

- Python `>=3.11`；核心依赖包含 tree-sitter、NetworkX、SciPy、SQLAlchemy/aiosqlite/Alembic、Pydantic、LanceDB、FastAPI、Uvicorn、MCP、Click/Rich、GitPython 等。
- 前端要求 Node.js `>=20`，由 npm workspaces 管理。
- LLM provider 通过统一抽象接入 Anthropic、OpenAI、Gemini、Ollama、LiteLLM 等；配置参考还列出 OpenRouter、DeepSeek、Kimi、EdenAI 等。
- 默认本地启动：`pip install repowise`、`repowise init --no-prose -y`、`repowise serve`。`serve` 默认 API 端口为 `7337`，MCP HTTP/SSE 端口为 `7338`；UI 与 API 可一起运行。

## 许可与成熟度

- 许可证是 `AGPL-3.0-or-later`，仓库同时宣传商业许可。
- `pyproject.toml` 的 PyPI classifier 标记为 `Development Status :: 3 - Alpha`；当前仓库元数据版本为 `0.52.0`。
- README 的 benchmark（例如减少 agent 输出、减少工具调用、上下文压缩和缺陷发现）是项目自己的测量结果，不应当直接当成独立验证结论。

## 优点

1. 把「上下文检索」从 agent 每次临时 grep/read，前移为一次索引、之后查询。
2. 健康、风险、Git、图和死代码等核心信号主要是确定性计算，LLM 不是索引链路的必需依赖。
3. MCP 工具以任务为单位，支持批量目标、引用和可恢复截断，适合 coding agent 的上下文预算。
4. 增量更新、hook、watch、webhook 和后台调度器覆盖从本地开发到团队服务的维护路径。
5. 支持单仓库和多仓库 workspace，且语言解析能力主要由 tree-sitter grammar/query 扩展。

## 需要留意的边界和风险

1. 调用图和死代码结果受解析与动态分派限制；空结果不等于运行时不存在，文档中的置信度和 basis 字段很重要。
2. code health 是静态/历史关联信号，不是运行时性能或未来缺陷概率的保证；项目 roadmap 明确不做 runtime/APM 数据。
3. 安装包把多个 LLM SDK 作为基础依赖，依赖面较大；完整仪表盘还要求 Node.js 20+。
4. `init` 默认可能写入机器级 Claude 配置和 hooks；CI、临时 clone、worktree 应考虑 `--no-editor-setup`。
5. API key 可由环境变量或 `.repowise/.env` 提供，后者会被 gitignore；服务鉴权是可选配置，远程部署必须显式设置 `REPOWISE_API_KEY` 并审查网络暴露面。
6. 遥测默认开启、可选择退出；使用前应审查 `DO_NOT_TRACK` / `REPOWISE_TELEMETRY_DISABLED` 及组织合规要求。
7. `config.yaml` 是宽松 YAML dict，未知或拼写错误的键可能被静默忽略，配置变更需要配合 `doctor` 和实际状态检查。
8. Roadmap 明确不做基于 LLM 的 PR reviewer、不把任何语言放到付费墙后，也不提供运行时/APM 观测。

## 参考来源

- [README](https://github.com/repowise-dev/repowise/blob/main/README.md)
- [Architecture](https://github.com/repowise-dev/repowise/blob/main/docs/architecture/ARCHITECTURE.md)
- [User Guide](https://github.com/repowise-dev/repowise/blob/main/docs/start/USER_GUIDE.md)
- [MCP Tools](https://github.com/repowise-dev/repowise/blob/main/docs/agent/MCP_TOOLS.md)
- [Configuration](https://github.com/repowise-dev/repowise/blob/main/docs/reference/CONFIG.md)
- [Roadmap](https://github.com/repowise-dev/repowise/blob/main/ROADMAP.md)
- [`pyproject.toml`](https://github.com/repowise-dev/repowise/blob/main/pyproject.toml)
- [`package.json`](https://github.com/repowise-dev/repowise/blob/main/package.json)
