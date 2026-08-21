# context/team/ — 团队级规范

**范围**：所有项目、所有模块、所有 AI 会话都必须遵循。这一层最稳定，改动频率最低。
一条规范能进这一层的判据：**换个模块、换个服务，它依然成立**。

| 文件 | 约束什么 | 违反的后果 |
|---|---|---|
| [runbook.md](runbook.md) | 提交前必跑的命令与验收锚点、改动前必读的限制（规则的命令化汇总，供 Codex 直读） | 靠模型自报放行、跳过 build/test/structcheck |
| [git-commit.md](git-commit.md) | 提交信息格式、分支策略、提交前必须更新 TODO.md | 文档与实现脱节 |
| [proto-design.md](proto-design.md) | proto 字段的设计依据与校验约束 | 脏数据穿透到 biz 层 / 契约破坏炸前后端 |
| [local-env.md](local-env.md) | 本地跑服务时连哪套基础设施 | 连不上、超时、白排查半天 |
| [node-graceful-shutdown.md](node-graceful-shutdown.md) | Kubernetes 节点关机/重启的 90/30 秒优雅退出、systemd inhibitor、终态 Pod 与清理边界 | 把正常的 90 秒等待误判成卡死而强断电 / 把终态历史误判成运行副本 / 只改 kubelet 不改 logind 导致提前关机 |
| [shell-scripting.md](shell-scripting.md) | 仓库脚本对 macOS Bash 3.2 的兼容边界 | `set -u` 下空数组展开导致入口在第一条命令前退出 |
| [go-redis.md](go-redis.md) | go-redis v9 的客户端生命周期、cache-aside、连接池、Key/TTL、Pipeline、重试、锁与消息边界 | 抓到已 Close 的旧客户端 / 缓存一致性失控 / 连接池饱和 / 非幂等命令被重复执行 |
| [cron-jobs.md](cron-jobs.md) | 定时任务的执行边界：重叠、panic、超时、时区、优雅停止、多实例与「错过不补」 | 扩副本后同一任务跑 N 次 / 对账悄悄漏掉一天 / 首次触发盲窗 |
| [pangolin-tunnel.md](pangolin-tunnel.md) | 公网暴露基础设施：拓扑事实、面板 API 模式、k8s HTTPRoute 暴露两步法与 `sectionName: https` 坑 | target 走 80 得 envoy 404 白排查 / 证书只续一处 / 新资源忘了默认带登录保护 |
| [ssh-port-migration.md](ssh-port-migration.md) | Ubuntu 24.04(socket activation) 改 SSH 端口的正确姿势与 node1 VPS 锁死实录 | 改 sshd_config 的 Port 白改 / ListenStream 纯端口号 v4 全断锁死 / cloud-init 首值覆盖 PasswordAuthentication |
| [tls-enablement.md](tls-enablement.md) | 给已在跑的服务补 TLS 的检查项与验收法（MinIO/gorse 实付学费） | **在未备案的云主机上就地配域名证书，白做一轮**（阿里云 ICP 拦截，纯 IP 通、带域名 403/reset）/ 健康检查硬编码 http 静默失效、服务好着却永远 unhealthy / 整卷挂证书遮蔽原目录且 `:ro` 后建不回来 / 拿公共 CA 证书去配 IP 端点（不签 IP SAN）/ 只测「该通的通了」，配置没生效也照样通 / **换镜像后 `HOME` 漂移，默认证书路径落空、TLS 静默降级 HTTP**（silo 学费） |
| [go-testing.md](go-testing.md) | 测试分层判定与硬约束（操作手册在 `docs/TESTING.md`） | 用 mock 测 SQL 等于没测 / go-sqlmock 接不上 pgx / 用 build tag 让测试脱离静态检查 / 只验一个方向不知道 `-short` 开关有没有生效 |
| [db-migrations.md](db-migrations.md) | 结构变更/种子数据的唯一路径（goose 迁移+幂等种子+baseline 接管），与 sqlc 生成物同 PR 的纪律 | 迁移里写 `SET search_path` 让版本表解析失败 / DO 块包 CREATE TYPE 令 sqlc 枚举退化 / 种子不幂等重跑翻倍 / 生成物落后 schema 整张表 |
| [tech-selection.md](tech-selection.md) | 选型/盘点中「上游已死」类结论的必查三件套：镜像谱系、namespace 现状、社区延续分叉；查到分叉 ≠ 采用 | 论据建立在过期前提上、漏掉零成本止血选项（MinIO/Silo 实付学费：自己跑的 `pgsty/minio` 就是分叉前身，三轮评审没人发现） |
| [okteto-inner-loop.md](okteto-inner-loop.md) | 内环开发判定与硬约束（操作手册在 `docs/OKTETO.md`） | 忘了关 ArgoCD 自动同步 → 开发容器被无声干掉 / 忘了恢复 → GitOps 静默失效 / 把开发窗口写进 Git 变成永久 / 改 root 绕过反而把要验的东西关掉 |

## 不属于这一层的

- 某个服务特有的坑 → `context/project/ecommerce/{module}/experience/`
- AI 协作机制本身的规则 → `context/harness-framework/`
- 架构设计 → `docs/design/`（按微服务分目录，那是设计真相源，本层不复制）
