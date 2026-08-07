# context/team/ — 团队级规范

**范围**：所有项目、所有模块、所有 AI 会话都必须遵循。这一层最稳定，改动频率最低。
一条规范能进这一层的判据：**换个模块、换个服务，它依然成立**。

| 文件 | 约束什么 | 违反的后果 |
|---|---|---|
| [runbook.md](runbook.md) | 提交前必跑的命令与验收锚点、改动前必读的限制（规则的命令化汇总，供 Codex 直读） | 靠模型自报放行、跳过 build/test/structcheck |
| [git-commit.md](git-commit.md) | 提交信息格式、分支策略、提交前必须更新 TODO.md | 文档与实现脱节 |
| [proto-design.md](proto-design.md) | proto 字段的设计依据与校验约束 | 脏数据穿透到 biz 层 / 契约破坏炸前后端 |
| [local-env.md](local-env.md) | 本地跑服务时连哪套基础设施 | 连不上、超时、白排查半天 |
| [shell-scripting.md](shell-scripting.md) | 仓库脚本对 macOS Bash 3.2 的兼容边界 | `set -u` 下空数组展开导致入口在第一条命令前退出 |
| [go-redis.md](go-redis.md) | go-redis v9 的客户端生命周期、`redis.Nil`、Pipeline、重试与锁 | 抓到已 Close 的旧客户端 / 缓存未命中被当故障 / 非幂等命令被重复执行 |
| [cron-jobs.md](cron-jobs.md) | 定时任务的执行边界：重叠、panic、超时、时区、优雅停止、多实例与「错过不补」 | 扩副本后同一任务跑 N 次 / 对账悄悄漏掉一天 / 首次触发盲窗 |

## 不属于这一层的

- 某个服务特有的坑 → `context/project/ecommerce/{module}/experience/`
- AI 协作机制本身的规则 → `context/harness-framework/`
- 架构设计 → `Design.md` / `CONFIG_CENTER_DESIGN.md`（那是设计真相源，本层不复制）
