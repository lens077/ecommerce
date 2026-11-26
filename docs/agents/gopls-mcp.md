# gopls MCP：让编码助手用语义而不是读文件

gopls 内置一个 MCP 服务器（截至 v0.24.0 标注为实验性）。它把编辑器同款的语义能力交给 AI 编码助手：工作区结构、符号搜索、同包依赖、包公开 API、符号引用、诊断（编译错误直接带修复建议）、漏洞检查。对 agent 的实际差别在于：不必靠 `grep` + 整文件读来判断「这个类型谁在用」，`go_symbol_references` 一条就够，上下文和 token 都省。

## 前置：gopls 版本

MCP 子命令随 gopls 版本走，命令里把版本写死，不要 `@latest`——工具行为换了版本就换，和 `backend/go.mod` 的 tool 段同一套纪律。

```bash
command -v gopls && gopls version        # 查法
go install golang.org/x/tools/gopls@v0.24.0   # 缺失时
```

## 两步接入

### 1. 注册 MCP 服务器

任何支持 stdio 传输的 MCP 客户端都用同一份配置：

```json
{ "mcpServers": { "gopls": { "type": "stdio", "command": "gopls", "args": ["mcp"] } } }
```

- Claude Code：`claude mcp add gopls -- gopls mcp`（`--scope local` 默认，只影响本机；`--scope user` 给所有项目；`--scope project` 会在仓库根写 `.mcp.json`，本仓不提交它，见下）。
- Codex：`codex mcp add gopls -- gopls mcp`，写进 `~/.codex/config.toml` 的形态是 `[mcp_servers.gopls]` + `command = "gopls"` + `args = ["mcp"]`。
- 其他客户端：按上面的 JSON 填，不要用 SSE/HTTP——gopls 的 MCP 只有 stdio。

本仓**不**提交 `.mcp.json`：gopls 没装时 MCP 客户端每次会话都会报连不上，把一个依赖本机安装的东西做成随仓库分发的默认配置，代价落在别人身上。

### 2. 注入指令

gopls 自带一份给模型看的操作指引（先 `go_workspace`，读文件后必须 `go_file_context`，改完必须 `go_diagnostics`，动过 `go.mod` 必须 `go_vulncheck`）。本仓把它落到 `docs/agents/gopls-mcp-instructions.md`，由下面这条命令生成，**不要手改**：

```bash
go run golang.org/x/tools/gopls@v0.24.0 mcp -instructions > docs/agents/gopls-mcp-instructions.md
```

升级 gopls 时同一命令刷新本文件，并把版本号一起改掉（本页与文件头各一处）。

## 暴露的工具

| 工具 | 用途 |
|---|---|
| `go_workspace` | 会话开始先看：是 module、workspace 还是 GOPATH 项目 |
| `go_search` | 模糊搜符号（类型/函数/变量），不必先知道准确名字 |
| `go_file_context` | 读完一个文件后看它用到同包其它文件的哪些声明 |
| `go_package_api` | 包的公开 API（尤其查第三方依赖时比读源码省 token） |
| `go_symbol_references` | 改定义前先查全部引用，评估影响面 |
| `go_diagnostics` | 每次改完就查：编译/分析错误，附可应用的修复 diff |
| `go_vulncheck` | 动过依赖就跑全工作区的漏洞检查 |

## 边界

- 它是给交互式会话用的**实验性**能力，不是门禁。CI 与提交前走 `.github/workflows/backend-gate.yml` 的 `make audit`/lint 棘轮，别指望 MCP 会话里「看起来没报错」等于绿。
- `go_vulncheck` 与 `go tool govulncheck` 是两条独立通道，结论可能因版本与漏洞库快照不同而不一致；以 `make audit-vuln` 的结果为准。
- gopls 只解析 Go 工作区。本仓 `frontend/`、`helm/`、`scripts/` 的语义它一概不知道，那部分仍靠 `grep` 与 `vp`/`verify-*` 脚本。
