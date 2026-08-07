# config（配置中心与配置加载，后端共享模块）

**代码路径**

- 配置中心服务本体：独立仓 `github.com/lens077/config-center`（本机 `../config-center`；设计见 `docs/design/config-center/design.md`）
- **各服务的配置加载层**：`backend/services/*/internal/pkg/config/`（10 份，同一套代码）
- 审计/迁移工具：`backend/tools/config-seed/`（只输出版本、大小、哈希和段名，不输出值）

每个服务启动时读**整份 Bootstrap 配置**（一份 YAML）。10 个服务统一优先读取本地
`CONFIG_SOURCE_FILE`，并使用独立 `config-center` Go SDK 的 `SourceConfig` 契约读取
`config_center`。selector 选择其他类型会快速失败；不设 selector 也会失败，不存在 Consul
KV 回退。`CONFIG_SOURCE=file` 只保留为显式本地测试入口。默认 `make dev` 使用被忽略的
`configs/source.dev.yaml`。后端依赖 `config-center v0.1.0`，不用本地 `replace`。

⚠️ **`go mod tidy` 不会把依赖往前挪**——它只增删，版本仍是 `go.mod` 里钉住的那个。
config-center 出了新版要用 `go get github.com/lens077/config-center@v0.x.y`；
代理（goproxy.cn）有抓取延迟，新 tag 拿不到时先 `curl` 一下
`https://goproxy.cn/github.com/lens077/config-center/@v/v0.x.y.info` 触发它去拉。
配置中心不可达、selector 缺失、token 无效或 key 不存在时都必须直接启动失败。

## 配置的唯一运行时来源

| 位置 | 角色 | 谁在读 |
|---|---|---|
| 配置中心 `<svc>/<env>/bootstrap.yaml` | 唯一运行时 Bootstrap，支持 Watch 热更新 | 10 个业务服务 |
| 本地 `configs/source.dev.yaml` / 集群 selector Secret | 只包含地址、三元组与机器 token | SDK 启动选择器 |
| 本地历史 Bootstrap/Consul 导出 | 一次性迁移材料，**不是回退源且不入库** | 只有迁移工具 |

改配置只通过 Config Center 管理员 API/UI；服务端 machine token 只能调用 `GetKey` / `WatchKeys`。
集群 selector 以 `ecommerce-config-source-<env>` Secret 挂载，不在仓库生成或保存。

## 关键约定

| 事项 | 值 |
|---|---|
| 配置中心三元组 | `namespace` = 服务目录名，`environment` = `dev`/`pre`，`key` = `bootstrap.yaml` |
| 环境语义 | `dev` = 从宿主机连集群，用外部域名 `*.app.com` + TLS；`pre` = 集群内，用 `*.svc` + 明文 |
| 段序 | `server → data → <服务专属段> → observability → discovery → search → log → auth`（只保留该服务实际消费的段） |
| 服务专属段 | `store`(cart) / `pay`(payment) / `recommend`(behavior、product)，以各服务 `conf.proto` 的 `Bootstrap` 字段为准 |
| 热生效边界 | `server` / `discovery` / `observability` 三段只打 WARN，其余立即生效 |

## experience

| 症状 | 文件 |
|---|---|
| 配置改了没反应 / 想知道热更新到底能不能生效 | [config-hot-reload-boundaries.md](experience/config-hot-reload-boundaries.md) |
| 配置文件在仓库、KV、配置中心之间对不上 | [three-copies-of-one-config.md](experience/three-copies-of-one-config.md) |
| Consul KV 已退役，服务必须从配置中心启动 | [consul-kv-retired.md](experience/consul-kv-retired.md) |

## 已知注意事项

- **config-service 不能从配置中心读自己的配置**（自举）。它从本地 `CONFIG_FILE` 启动，
  Consul 只用于服务注册发现；把自身 Bootstrap 放进 ConfigService 会形成启动死锁。
- **`required = true` 目前形同虚设**：配置解码只跑 mapstructure，从不调 `protovalidate`，
  且没开 `ErrorUnused`。缺块不报错、多余键也不报错，功能被静默关掉而不是启动失败。
  见 `.service-matrix.yaml` 的 `config_validation.known_defect`。
- 这套加载代码在 10 个服务里是**复制关系**，不是共享包（抽共享包见 TODO.md）。
  改一处要么全改，要么在提交里写清为什么只改一处。
