# Agent skills —— 本项目实际用到的

> 本文件取代原 `skills/README.md`（2026-08-24 删除）。原文件是第三方 skill 的安装笔记，
> 大段抄录上游 README、含机翻残留，且没有任何工具读取它；同时它与 `docs/agents/`
> 构成了两个 skills 位置。现在只保留一处：**本项目真用到哪些、为什么、当前装没装。**
>
> skill 本体不入本仓，装在 `~/.claude/skills/`（多数是 `~/.agents/skills/` 的符号链接）。
> 这里只登记项目侧的依赖关系。

## 项目明确依赖的

| skill | 状态 | 项目为什么依赖它 |
|---|---|---|
| `tech-doc-style-chinese` | ✅ 已装 | 写中文文档/界面文案/注释的统一风格。**AGENTS.md「中文文案约定」直接引用**，并覆盖了「允许第二人称你」这一条。保持上游默认，不做本地改动。 |
| `impeccable` | ✅ 已装 | 设计系统与视觉迭代。三处接线都活着：`.claude/settings.local.json` 的 PostToolUse/Stop 钩子、`.claude/hooks/impeccable-frontend-only.sh` 路径过滤、`.impeccable/design.json`（「灯市」设计系统，被根 `DESIGN.md` 引用，入库）。 |
| `adversarial-review` | ✅ 已装 | 核心改动 push 前的异构双审，`context/team/runbook.md` 的双审一节引用。 |

## 顺手会用到的

| skill / 工具 | 状态 | 说明 |
|---|---|---|
| `archify` | ✅ 已装 | 架构图/流程图。`npx skills add tt-a1i/archify -g` |
| `agy`（Antigravity CLI） | ⚠️ 已装但**已摘出引擎链** | 原用于给 DSH 补联网搜索。2026-08-27：其登录态过期且本机连不上 Google，Firecrawl 冷却后每次 `read_page` 都落到它并弹 OAuth，故 `modsearch config set agy.bin /nonexistent/agy-disabled` 摘出。本体仍可手动 `agy` 使用。 |
| `agent-reach` | ✅ 已装 | 多平台调研。搜索走 Exa MCP（`mcporter call exa.web_search_exa`），2026-08-27 补齐 `mcporter` + `~/.mcporter/mcporter.json` 的 exa 条目后实测可用，**无需 API key**。B站/YouTube 可用；小红书/Reddit/Twitter 需登录态。 |
| `hcom` | ✅ brew 已装 | 编码代理之间在终端互发消息。全局 `~/.claude/settings.json` 的 Notification/Permission 钩子在用它。`brew install aannoo/hcom/hcom` |

## 已移除的条目

- **`playwright-cli`** —— 原文件写了安装与用法，但本机 `command -v playwright-cli` 失败，**并未安装**。
  前端 E2E 实际走的是 `frontend/apps/consumer` 的 `pnpm e2e:login`（Playwright 库，不是这个 CLI），
  由 `.github/workflows/frontend.yml` 的 smoke-login 定时跑。
  另：`playwright` MCP 只挂在 `/Users/sumery/lens077/go-connect-template-cli`，不在本仓。
- **`helper.sh` 那行裸路径** —— 原文件首行是一个没有说明的绝对路径。该脚本仍在仓库根，
  但它不是 skill，与本文件无关。

## 相关但不在这里的

- MCP 服务端配置：全局在 `~/.claude.json`，本仓按需挂载的 kaneo 在 `.claude/kaneo-mcp.json`
  （**刻意不常驻**，理由见 `.claude/skills/kaneo-sync/SKILL.md` 与 evolution-log）
- issue/spec 存放约定 → [issue-tracker.md](issue-tracker.md)
- triage 标签 → [triage-labels.md](triage-labels.md)
- 领域文档约定 → [domain.md](domain.md)
