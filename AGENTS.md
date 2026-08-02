# AGENTS.md — AI 协作入口

> 本文件是所有 AI 编码工具（Claude Code / Codex CLI / Cursor / Gemini CLI …）的**共同行为基线**。
> 规范本体在 `context/`，本文件只做索引和硬规则。改规范请改 `context/`，不要改这里的副本。

## 硬规则（不可跳过）

1. **改代码前先读对应知识**：按 `context/INDEX.md` 的路径逐层缩小范围，不要全仓 grep 猜。
2. **写/改 proto 前必须先读设计文档**，并为每个字段推断出校验约束。见 `context/team/proto-design.md`。
3. **提交前先更新 `TODO.md`**，再 `git commit`。见 `context/team/git-commit.md`。
4. **不要把凭据写进仓库**。密码/密钥只存在 Consul KV 和本地环境，仓库里只写主机名和端口。
5. **踩到坑要沉淀**：判断是「模式性教训」还是「一次性 diff」，前者写进 `context/`。见 `context/harness-framework/self-refinement.md`。

## 知识索引

| 层 | 路径 | 范围 |
|---|---|---|
| 团队级 | `context/team/` | 所有工作都要遵循（最稳定） |
| 框架工程级 | `context/harness-framework/` | AI 协作机制本身（中频更新） |
| 服务级 | `context/project/ecommerce/{module}/` | 特定模块（高频演进、量最大） |

完整导航见 **[context/INDEX.md](context/INDEX.md)**。

**查服务拓扑不要现搜**：服务注册名、网关前缀、依赖关系、外部依赖、Consul KV 键，
一律查 **[.service-matrix.yaml](.service-matrix.yaml)**。里面区分了 `depends_on`（已接线）
和 `depends_on_planned`（设计要求但未接线），不要把后者当成已实现。

## 项目速览

- 后端：Go + Kratos 微服务（`backend/services/`），proto 契约在 `backend/api/`，网关在 `gateway/`
- 前端：pnpm workspace（`frontend/apps/{consumer,merchant,admin,config}` + `frontend/packages/`），React 19 + MUI 9 + TanStack + Connect-RPC
- 配置：Consul KV `ecommerce/<svc>/dev.yml`
- 鉴权：Casdoor + 网关集中式 JWT/RBAC
- 进度真相源：`TODO.md`；架构真相源：`Design.md`、`CONFIG_CENTER_DESIGN.md`
