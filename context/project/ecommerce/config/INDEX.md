# config（配置中心与配置加载，后端共享模块）

**代码路径**

- 配置中心服务本体：独立仓 `github.com/lens077/config-center`（本机 `../config-center`；设计见 `CONFIG_CENTER_DESIGN.md`）
- **各服务的配置加载层**：`backend/services/*/internal/pkg/config/`（10 份，同一套代码）
- 灌入工具：`backend/tools/config-seed/`

每个服务启动时读**整份 Bootstrap 配置**（一份 YAML）。其余服务仍由
`CONFIG_SOURCE` 选择 `file`、`consul` 或 `configcenter`；Cart 已改为读取本地
`CONFIG_SOURCE_FILE`，并使用独立 `config-center` Go SDK 的 `SourceConfig` 契约选择
`file`、`consul` 或 `config_center`。Cart 当前锁定远程默认分支的伪版本，未使用本地
`replace` 或发布 tag。
两者显式二选一，**不做失败自动降级**——静默降级会让服务拿着一份你以为早废弃的配置正常跑起来，
比直接启动失败难查得多。

## 一份配置存在三个地方

| 位置 | 角色 | 谁在读 |
|---|---|---|
| Consul KV `ecommerce/<svc>/<env>.yml` | 事实上的源 | `CONFIG_SOURCE=consul` 的服务；`config-seed` 的输入 |
| 配置中心 `<svc>/<env>/bootstrap.yaml` | 第二份，支持 Watch 热更新 | `CONFIG_SOURCE=configcenter` 的服务 |
| 仓库 `backend/services/<svc>/configs/<env>.yml` | 本地工作副本，**不入库** | 只有人 |

⚠️ **仓库那份是 gitignore 的**，因为它含 PG/Redis/ES 密码、Casdoor `client_secret` 和证书
（AGENTS.md 硬规则 4）。所以它在每台机器上都可能不一样，**任何自动化都不要拿它当输入**——
`config-seed` 的源是 Consul KV 就是这个原因。

改配置的动作是：改 Consul KV → `go run ./tools/config-seed -write` 同步到配置中心。
两处同内容是有意的（配置中心挂了还能切回 consul），代价就是这一步手动同步，
目前**没有门禁防漂移**，见 `.service-matrix.yaml` 的 known_gaps。

## 关键约定

| 事项 | 值 |
|---|---|
| 配置中心三元组 | `namespace` = 服务目录名，`environment` = `dev`/`pre`，`key` = `bootstrap.yaml` |
| 环境语义 | `dev` = 从宿主机连集群，用外部域名 `*.app.com` + TLS；`pre` = 集群内，用 `*.svc` + 明文 |
| 段序 | `server → data → <服务专属段> → observability → discovery → search → log → auth` |
| 服务专属段 | `store`(cart) / `pay`(payment) / `recommend`(behavior、product)，以各服务 `conf.proto` 的 `Bootstrap` 字段为准 |
| 热生效边界 | `server` / `discovery` / `observability` 三段只打 WARN，其余立即生效 |

## experience

| 症状 | 文件 |
|---|---|
| 配置改了没反应 / 想知道热更新到底能不能生效 | [config-hot-reload-boundaries.md](experience/config-hot-reload-boundaries.md) |
| 配置文件在仓库、KV、配置中心之间对不上 | [three-copies-of-one-config.md](experience/three-copies-of-one-config.md) |

## 已知注意事项

- **config-service 不能从配置中心读自己的配置**（自举）。它从本地 `CONFIG_FILE` 启动，
  Consul 只用于服务注册发现；把自身 Bootstrap 放进 ConfigService 会形成启动死锁。
- **`required = true` 目前形同虚设**：配置解码只跑 mapstructure，从不调 `protovalidate`，
  且没开 `ErrorUnused`。缺块不报错、多余键也不报错，功能被静默关掉而不是启动失败。
  见 `.service-matrix.yaml` 的 `config_validation.known_defect`。
- 这套加载代码在 10 个服务里是**复制关系**，不是共享包（抽共享包见 TODO.md）。
  改一处要么全改，要么在提交里写清为什么只改一处。
