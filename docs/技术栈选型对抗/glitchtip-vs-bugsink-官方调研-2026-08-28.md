# GlitchTip 与 Bugsink 官方资料对比

- **实际查询时间**：2026-08-28（UTC）
- **目标截止日**：2026-09
- **来源范围**：仅使用产品官方文档、官方代码仓库、官方 Releases/Tags 和托管平台 API。
- **时间边界**：2026-09 尚未到达。本文只能确认截至查询日已经公开的事实，不能预言 2026 年 9 月届时的版本或能力变化；用于最终决策时，应在目标日重查发布页。

## 决策摘要

| 维度 | GlitchTip | Bugsink |
|---|---|---|
| 最新稳定版 | 后端 `v6.1.8`，2026-06-05 发布 | `2.5.0`，GitHub 于 2026-07-26 发布；Release 正文版本日期为 2026-07-21 |
| 发布活跃度 | 近 12 个月 12 个、近 24 个月 29 个官方 backend Release | 近 12 个月 25 个、近 18 个月 47 个、近 24 个月 48 个稳定 Release |
| 官方最低硬件 | all-in-one 最低 256 MB RAM；谨慎配置可用 128 MB + swap；推荐 512 MB | 官方没有严格的最低 CPU/RAM/磁盘表；2 GiB 是单机生产指南示例，不是最低值 |
| 产品范围 | errors + transactions/spans 性能监控 + uptime + logs | 专注 errors；明确不处理 metrics、traces 或其他事件类型 |
| Sentry SDK errors | 明确支持；多语言/框架 SDK 文档 | 明确支持；常见 SDK 仅需切换 DSN，但不保证全部边缘情况 |
| Performance / tracing | 明确接收 transaction/span，支持聚合指标和 span breakdown | 明确不支持；官方建议 `traces_sample_rate=0` |
| 项目 | organization/team/project/DSN；按项目设置告警和 uptime | team/project；可按微服务、前后端、语言或责任边界拆分，文档称项目数不设限 |
| 告警 | 错误频率规则；邮件、webhook；当前发布线含 Feishu webhook | 新 issue、regression、unmute；邮件三级偏好；Slack/Mattermost/Discord webhook |
| Source map | GlitchTip CLI 注入 debug ID 并上传；CLI 标为 Beta；本地或 S3 文件存储 | 2.0.14+；`sentry-cli` debug ID + artifact bundle；不抓远程脚本，额外上传 API 不保证兼容 |
| 更适合 | 需要同一平台覆盖错误和基础性能 tracing | 只需要轻量错误追踪，并明确接受没有 APM/tracing |

## 1. 最新版本与发布活跃度

### GlitchTip

截至查询日，最新可核验稳定后端版本为 **`v6.1.8`**，官方 Release 时间为 **2026-06-05 15:46:31 UTC**。GlitchTip 的官方 GitHub `GlitchTip/GlitchTip` 只是 README 配置仓，Releases/Tags 均为空；官方文档将代码入口指向 GitLab，因此发布真相源是官方 GitLab 后端仓。

按官方 GitLab Releases API 的 `released_at` 统计，并排除 `upcoming_release=true`：

| 窗口 | Release 数 | 最早 | 最新 |
|---|---:|---|---|
| 2025-08-28—2026-08-28 | **12** | `v5.2.0`，2025-11-12 | `v6.1.8`，2026-06-05 |
| 2024-08-28—2026-08-28 | **29** | `v4.1.0`，2024-08-29 | `v6.1.8`，2026-06-05 |

一手来源：

- https://gitlab.com/glitchtip/glitchtip-backend/-/releases/v6.1.8
- https://gitlab.com/glitchtip/glitchtip-backend/-/tags/v6.1.8
- https://gitlab.com/glitchtip/glitchtip-backend/-/releases
- https://gitlab.com/glitchtip/glitchtip-backend/-/tags
- https://gitlab.com/api/v4/projects/glitchtip%2Fglitchtip-backend/releases?per_page=100
- https://github.com/GlitchTip/GlitchTip
- https://github.com/GlitchTip/GlitchTip/releases
- https://github.com/GlitchTip/GlitchTip/tags

### Bugsink

截至查询日，最新稳定版为 **`2.5.0`**。GitHub `published_at` 为 **2026-07-26 18:33:01 UTC**，Release 正文写作「2.5.0 (21 July 2026)」；前者是平台发布日期，后者是版本说明日期，不能混用。

按 GitHub Releases API 统计并排除 draft/prerelease：

| 窗口 | 稳定 Release 数 | 最早 | 最新 |
|---|---:|---|---|
| 2025-08-28—2026-08-28 | **25** | `2.0.0`，2025-09-18 | `2.5.0`，2026-07-26 |
| 2025-02-28—2026-08-28 | **47** | `1.4.0`，2025-03-13 | `2.5.0`，2026-07-26 |
| 2024-08-28—2026-08-28 | **48** | `1.3.0`，2025-02-22 | `2.5.0`，2026-07-26 |

官方 API 当时返回 49 条 Release，其中 `2.0.0a1` 是 prerelease，未纳入稳定版计数。

一手来源：

- https://github.com/bugsink/bugsink/releases/latest
- https://github.com/bugsink/bugsink/releases/tag/2.5.0
- https://github.com/bugsink/bugsink/releases
- https://github.com/bugsink/bugsink/tags
- https://api.github.com/repos/bugsink/bugsink/releases/latest
- https://api.github.com/repos/bugsink/bugsink/releases?per_page=100
- https://api.github.com/repos/bugsink/bugsink/tags?per_page=100

## 2. 官方硬件要求

### GlitchTip

官方安装页给出：

- 推荐 512 MB RAM，支持 x86 或 arm64 CPU。
- all-in-one 最低 256 MB RAM。
- 谨慎配置可运行在 128 MB RAM + swap；这是极限值，不是常规推荐值。
- 磁盘随事件量和事件大小变化；官方粗略示例为每月 100 万事件约需 30 GB。
- 官方没有给最低 CPU 核数、最低磁盘容量或 IOPS，不能自行补充。

一手来源：

- https://glitchtip.com/documentation/install/#system-requirements
- https://glitchtip.com/assets/compose.sample.yml

### Bugsink

官方文档**没有**严格的最低 CPU、RAM、磁盘规格表。可确认的只是：

- 单机生产指南以 2 GiB 服务器和 10 个 Gunicorn worker 为示例。
- 官方称每个 worker 远低于 100 MiB，并建议可靠运行时让内存占用远低于可用内存的 50%。
- 该指南声称单台廉价服务器可达约 150 万事件/日；这是容量参考，不是最低规格保证。
- CPU 最低核数和磁盘最低容量未明确。

因此，**不能把 2 GiB 写成 Bugsink 官方最低 RAM**。

一手来源：

- https://www.bugsink.com/docs/single-server-production/
- https://www.bugsink.com/docs/settings/
- https://www.bugsink.com/docs/ingestion-rate-limits-and-retention/

## 3. 部署组件

### GlitchTip

必需或核心组件：

1. GlitchTip 应用：单一 all-in-one 服务即可；扩容时可拆为 web 与 worker。
2. PostgreSQL 14+：必需。
3. 生产反向代理/负载均衡与 TLS：不是启动硬依赖，但官方强烈建议支持 request buffering 与 chunked `Transfer-Encoding`，示例为 nginx。

可选组件：

- Valkey 或 Redis 7+：任务队列、缓存和 session；关闭后可由 PostgreSQL 承担。官方称 Redis 可能可用，但测试少于 Valkey。
- 本地或 S3 兼容文件存储：source maps、debug symbols 等上传功能需要。
- S3/本地 cold storage + DuckDB：旧 errors、transactions、logs 可归档为 Parquet 并查询。
- SMTP/Mailgun/SendGrid/Anymail 邮件服务：用于邮件告警。

官方部署方式包括 Docker Compose、Kubernetes Helm、若干托管商，以及不推荐的手工 Django 部署。

一手来源：

- https://glitchtip.com/documentation/install/
- https://glitchtip.com/documentation/install/#docker-compose
- https://glitchtip.com/documentation/install/#helm
- https://glitchtip.com/documentation/install/#advanced-settings-for-cache-and-tasks
- https://glitchtip.com/documentation/install/#file-storage
- https://glitchtip.com/documentation/install/#cold-storage

### Bugsink

生产拓扑可包含：

1. Bugsink Web：Python/Django；无容器指南使用 Gunicorn。
2. 数据库：SQLite、MySQL 或 PostgreSQL。SQLite 是无容器默认路径；Docker 快速试用的 SQLite 容器删除即丢数据，且官方不建议用 Docker volume 承载其 WAL 模式。
3. Snappea：后台任务进程，处理事件和邮件等；使用独立数据库作消息队列。
4. Nginx 等反向代理与 TLS：生产强烈建议。
5. 邮件服务：可选，但未配置就不会发送问题通知或密码重置邮件。
6. 文件存储：可选，用于 source map artifact bundle 等。

官方方式包括单 Docker 容器、Docker Compose、virtualenv 和单机生产。Kubernetes 清单是用户贡献，安装总览明确说不是官方指南。

一手来源：

- https://www.bugsink.com/docs/installation/
- https://www.bugsink.com/docs/docker-install/
- https://www.bugsink.com/docs/docker-compose-install/
- https://www.bugsink.com/docs/single-server-production/
- https://www.bugsink.com/docs/settings/
- https://github.com/bugsink/bugsink/blob/2.5.0/docker-compose-sample.yaml

## 4. Sentry SDK 兼容面

### Errors

**GlitchTip：明确支持。** 项目提供 DSN，官方 SDK 文档覆盖 C#/.NET、JavaScript 及主流框架、Java/Android、Go、PHP、Python、Ruby、Swift、Rust、Flutter、React Native 等。官方仍未给出逐 SDK 版本、逐字段的 100% 兼容矩阵。

- https://glitchtip.com/sdkdocs/
- https://glitchtip.com/sdkdocs/all-sdks
- https://glitchtip.com/documentation/error-tracking/#configuring-your-app

**Bugsink：明确支持。** 官方将兼容重点限定为 Sentry SDK 的错误事件；常见 SDK 通常只需切换 DSN，无需 patch/fork，但官方承认仍可能存在边缘兼容问题。

- https://www.bugsink.com/sentry-sdk-compatible/
- https://www.bugsink.com/docs/sdk-recommendations/
- https://github.com/bugsink/bugsink/blob/2.5.0/api/event.schema.json

### Performance / tracing

**GlitchTip：明确支持 transaction/span 范围。** 启用 Sentry SDK tracing 后，GlitchTip 接收 transactions 和 spans；UI 按 endpoint/operation 聚合 average duration、p50、p95、request count、error count，并提供 span breakdown。生产环境建议降低 `tracesSampleRate` / `traces_sample_rate`。

不能外推为 Sentry 完整产品面等价：官方未承诺所有 SDK tracing 字段、完整 distributed tracing、profiling、replay、metrics、dynamic sampling 或 Discover 全套语义。

- https://glitchtip.com/documentation/performance/
- https://glitchtip.com/documentation/performance/#how-it-works
- https://glitchtip.com/documentation/performance/#configuring-tracing
- https://glitchtip.com/documentation/performance/#viewing-performance-data

**Bugsink：明确不支持。** 官方写明只处理 error events，不处理 metrics、traces 或其他 event types；推荐配置默认 `traces_sample_rate=0`。因此不能把 Bugsink 当成 Sentry Performance/APM 或 distributed tracing 后端。

- https://www.bugsink.com/docs/sdk-recommendations/
- https://www.bugsink.com/sentry-sdk-compatible/

## 5. 项目能力

### GlitchTip

- Project 是错误消息入口并组织 issues，每个项目有 DSN。
- 可按应用组件或 staging/production 拆分项目。
- Project 与 Team 关联；组织成员可查看/修改组织内项目，关联 Team 成员接收通知。
- 项目设置包含 alerts，也可关联 uptime monitoring。

一手来源：

- https://glitchtip.com/documentation/getting-started/#make-a-project
- https://glitchtip.com/documentation/getting-started/#create-a-team
- https://glitchtip.com/documentation/error-tracking/#configuring-your-app

### Bugsink

- Project 是组织 issues 的主要方式。
- 官方建议按独立部署组件、微服务、前后端、责任团队、语言或代码仓库拆分。
- Project 组织在 Team 下；告警偏好和 webhook 可在项目维度配置。
- 官方文档称项目创建数量没有限制；这不代表没有硬件成本。
- 2.5.0 增加全局 issue 列表、状态筛选、批量动作等能力。

一手来源：

- https://www.bugsink.com/docs/projects/
- https://www.bugsink.com/docs/teams/
- https://www.bugsink.com/docs/permissions/
- https://github.com/bugsink/bugsink/releases/tag/2.5.0

## 6. 告警能力

### GlitchTip

- 项目级 Project Alerts 可按错误发生频率触发。
- 默认邮件发送给项目 Team 成员。
- 可添加 webhook URL。
- `v6.1.7` Release 加入 Feishu（Lark）webhook recipient，并加强 webhook SSRF 校验。

现有文档不能证明其具有 Sentry 全套 issue alert、metric alert 或 workflow 规则；性能阈值告警也未在性能文档中明确确认。

一手来源：

- https://glitchtip.com/documentation/error-tracking/#turn-on-alerts
- https://gitlab.com/glitchtip/glitchtip-backend/-/releases/v6.1.7

### Bugsink

- 默认在状态恶化时通知：新 issue、regression、unmute。
- 邮件偏好按用户 → Team → Project 三级继承或覆盖。
- 项目 webhook 对新问题或恶化问题告警。
- 当前聊天集成：Slack、Mattermost、Discord。
- Telegram 与 Microsoft Teams 仍处于开发中。
- 项目级 sensitivity 和更完整的多层告警限流仍列为后续工作；2.5.0 只有邮件每小时上限这一单项能力。

一手来源：

- https://www.bugsink.com/docs/alerts/
- https://www.bugsink.com/docs/settings/
- https://github.com/bugsink/bugsink/releases/tag/2.5.0
- https://github.com/bugsink/bugsink/tree/2.5.0/alerts

## 7. Source map

### GlitchTip

- 官方支持 JavaScript source maps。
- 推荐使用仍标为 Beta 的 GlitchTip CLI：`sourcemaps inject` 注入 debug ID，`sourcemaps upload` 上传。
- 上传文件需要本地或远端/S3 兼容文件存储。
- `GLITCHTIP_FILE_RETENTION_DAYS` 控制 source map/debug symbol 文件保留期，默认继承 90 天总保留期。
- 官方没有承诺所有 bundler、旧式 release-name 流程或全部 `sentry-cli` 命令均兼容。

一手来源：

- https://glitchtip.com/documentation/error-tracking/#source-maps
- https://glitchtip.com/documentation/cli
- https://glitchtip.com/documentation/install/#file-storage
- https://glitchtip.com/documentation/install/#data-retention
- https://gitlab.com/glitchtip/glitchtip-backend/-/releases/v6.1.7

### Bugsink

- 需要 Bugsink 2.0.14+。
- 使用 `sentry-cli sourcemaps inject` 注入 debug ID，再上传 artifact bundle。
- 事件以 debug ID 选择源文件，不依赖 release 名或路径猜测。
- 支持标准 source map 和未压缩 JavaScript 的 identity source map。
- 明确不从 URL 抓取脚本；map 应包含 `sourcesContent`。
- 只实现 `sentry-cli` 使用的标准上传 endpoints；依赖额外上传 API 的工具不保证支持，更多构建工具和超大 bundle 仍在 issue #150 跟踪。

一手来源：

- https://www.bugsink.com/docs/sourcemaps/
- https://github.com/bugsink/bugsink/releases/tag/2.0.14
- https://github.com/bugsink/bugsink/issues/19
- https://github.com/bugsink/bugsink/issues/150

## 8. 选型结论

- 若硬需求包括 **errors + performance transactions/spans + tracing 视图**，两者不是同档替代：官方资料只支持选择 **GlitchTip**。
- 若硬需求只有 **errors、项目化组织、基础告警、现代 JavaScript source map**，Bugsink 的范围更窄、边界更清晰，并且官方 Release 频率更高；但官方没有最低硬件表，不能仅凭「轻量」宣传完成容量采购。
- 两者都不应被描述为 Sentry 全产品能力的 100% 等价实现。上线前应以目标语言、具体 SDK 版本、真实 envelope、告警和 source map 构建链做验证。
- 到 2026-09 决策日必须重查最新 Release、数据库要求、CLI 状态、告警集成和 SDK/tracing 文档。