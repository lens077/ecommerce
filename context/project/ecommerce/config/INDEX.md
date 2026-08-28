# config（配置中心与配置加载，后端共享模块）

**代码路径**

- 配置控制面本体：合一仓 `github.com/lens077/control-tower` 的 **`config` 服务**
  （本机 `../control-tower/services/config`；设计见同级仓 `docs/design/architecture.md` 与 `docs/design/machine-token.md`）。
  2026-08-23 起由它承载，**已切流上线**：`config-center` ns 里的两个 Deployment
  仍叫老名字，但镜像已经是 `control-tower-config` / `control-tower-config-web`——
  那只是没改的遗留标签，**不代表旧的独立 config-center 还在跑**。
- **各服务的配置加载层**：`backend/services/*/internal/pkg/config/`（10 份，同一套代码）
- 审计/迁移工具：`backend/tools/config-seed/`（只输出版本、大小、哈希和段名，不输出值）

每个服务启动时读**整份 Bootstrap 配置**（一份 YAML）。10 个服务统一优先读取本地
`CONFIG_SOURCE_FILE`，并使用 `github.com/lens077/control-tower/sdk/configsource`
的 `SourceConfig` 契约读取 `config_center`。selector 选择其他类型会快速失败；不设
selector 也会失败，不存在 Consul KV 回退。`CONFIG_SOURCE=file` 只保留为显式本地测试入口。
默认 `make dev` 使用被忽略的 `configs/source.dev.yaml`。后端 `go.mod` 钉
`github.com/lens077/control-tower v0.1.0`，不用本地 `replace`。

⚠️ **`go mod tidy` 不会把依赖往前挪**——它只增删，版本仍是 `go.mod` 里钉住的那个。
control-tower 出了新版要用 `go get github.com/lens077/control-tower@v0.x.y`；
代理（goproxy.cn）有抓取延迟，新 tag 拿不到时先 `curl` 一下
`https://goproxy.cn/github.com/lens077/control-tower/@v/v0.x.y.info` 触发它去拉。
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
| 环境语义 | `environment` 只选择 Config Center 键；端点必须按实际运行位置配置。当前 `dev` 服务部署在集群内，因此使用 `*.svc`；TLS 是否开启由依赖本身决定 |
| 段序 | `server → data → <服务专属段> → observability → discovery → log → auth`（只保留该服务实际消费的段） |
| 服务专属段 | `store`(cart) / `pay`(payment) / `recommend`(behavior、product) / `search.meilisearch`(search)，以各服务 `conf.proto` 的 `Bootstrap` 字段为准；顶层 `search` 只属于 search 服务，其他服务已 `reserved 6` / `reserved "search"` |
| 热生效边界 | `server` / `discovery` / `observability` 只打 WARN；search 服务的 `search.meilisearch` 也需重启；数据库、缓存和日志级别可立即生效 |

## IDE 配置校验（JSON Schema，2026-08-18）

`backend/services/<svc>/configs/bootstrap.schema.json` 由各服务 `conf.proto` 的 Bootstrap
生成（`make conf-schema`，模板 `buf.gen.jsonschema.yaml`，本地插件
`protoc-gen-jsonschema` 需 `go install github.com/bufbuild/protoschema-plugins/cmd/protoc-gen-jsonschema@latest`）。
protovalidate 的 `in`/`required` 分别映射为 schema `enum`/`required`，未知键被
`additionalProperties: false` 拦截；`google.protobuf.Duration` 的 `format: duration`
（ISO 8601）会被 Makefile 后处理替换成 Go `time.ParseDuration` 风格正则（`"5s"`/`"1m30s"`），
因为配置解码走 mapstructure 钩子而非 protojson。

IDEA 侧映射在 `.idea/jsonSchemas.xml`（被 gitignore，机器级文件）：工作区
`~/lens077/.idea/` 与仓库 `.idea/` 各一份，把 `configs/{dev,pre}.yml` 指到对应 schema。
新机器丢失后在 Settings → JSON Schema Mappings 里重建，或找历史会话重新生成。
**改了 conf.proto 要重跑 `make conf-schema` 并把 schema 随代码提交。**

2026-08-18 起运行时校验也已接线（同一套约束两道门）：`decodeConfig` 开了
`ErrorUnused`（未知键报错），`Init` 与热更新在解码后调 `protovalidate.Validate`。
启动时校验失败直接起不来；热更新校验失败保留当前配置只记 ERROR。每个服务
config 包的 `TestRealConfigFiles_DecodeAndValidate` 在本机验证真实 dev/pre.yml
过得了校验（文件 gitignore，CI 自动 skip）。

2026-08-29 又在 `backend/structcheck` 接入 JSON Schema 硬校验：CI 始终验证已提交的
`config.yaml.example`，本机存在 dev/pre.yml 时一并验证；错误只打印实例路径，不打印值，
避免把配置里的凭据带进日志。门禁还检查 Bootstrap 必须设置
`additionalProperties: false`，且顶层 `search` 只允许 search 服务持有。
**收紧约束前先跑这两组测试**，防止把现网配置锁在门外。⚠️ 发布前须先对齐配置中心里的
bootstrap.yaml（未知键/缺段的副本会让服务重启后起不来），见 `.service-matrix.yaml`
config_validation.rollout_warning。

## experience

| 症状 | 文件 |
|---|---|
| 配置改了没反应 / 想知道热更新到底能不能生效 | [config-hot-reload-boundaries.md](experience/config-hot-reload-boundaries.md) |
| 配置文件在仓库、KV、配置中心之间对不上 | [three-copies-of-one-config.md](experience/three-copies-of-one-config.md) |
| Consul KV 已退役，服务必须从配置中心启动 | [consul-kv-retired.md](experience/consul-kv-retired.md) |
| 换基础设施后全量重启才爆雷 / 消费者盘点漏了 CC 自举配置 | [config-center-self-bootstrap-blindspot.md](experience/config-center-self-bootstrap-blindspot.md) |
| Secret 看似存在但 HTTP 客户端报 `invalid header field value` | [kubernetes-secret-trailing-newline.md](experience/kubernetes-secret-trailing-newline.md) |

## 已知注意事项

- **config 服务不能从配置中心读自己的配置**（自举）。它从本地 `CONFIG_FILE` 启动，
  Consul 只用于服务注册发现；把自身 Bootstrap 放进 ConfigService 会形成启动死锁。
- Config Center 当前会把 `is_secret=true` 的值统一返回为 `******`，machine token 也不例外。
  业务服务读取的是包含密码和 API key 的整份 Bootstrap，因此条目暂时必须使用
  `is_secret=false`，并依靠 Config Center 鉴权限制读取。改为字段级 Secret 引用或支持
  machine principal 读取原值后，才能安全启用该标记。
- `required` 与未知键校验已在启动和热更新路径接入。缺少必需段会阻止启动；热更新内容
  无效时保留上一份可用配置。修改 `conf.proto` 后必须先更新 Config Center，再滚动服务。
- 这套加载代码在 10 个服务里是**复制关系**，不是共享包（抽共享包见 TODO.md）。
  改一处要么全改，要么在提交里写清为什么只改一处。
