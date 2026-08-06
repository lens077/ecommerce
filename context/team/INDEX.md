# context/team/ — 团队级规范

**范围**：所有项目、所有模块、所有 AI 会话都必须遵循。这一层最稳定，改动频率最低。
一条规范能进这一层的判据：**换个模块、换个服务，它依然成立**。

| 文件 | 约束什么 | 违反的后果 |
|---|---|---|
| [runbook.md](runbook.md) | 提交前必跑的命令与验收锚点、改动前必读的限制（规则的命令化汇总，供 Codex 直读） | 靠模型自报放行、跳过 build/test/structcheck |
| [git-commit.md](git-commit.md) | 提交信息格式、分支策略、提交前必须更新 TODO.md | 文档与实现脱节 |
| [proto-design.md](proto-design.md) | proto 字段的设计依据与校验约束 | 脏数据穿透到 biz 层 / 契约破坏炸前后端 |
| [local-env.md](local-env.md) | 本地跑服务时连哪套基础设施 | 连不上、超时、白排查半天 |

## 不属于这一层的

- 某个服务特有的坑 → `context/project/ecommerce/{module}/experience/`
- AI 协作机制本身的规则 → `context/harness-framework/`
- 架构设计 → `Design.md` / `CONFIG_CENTER_DESIGN.md`（那是设计真相源，本层不复制）
