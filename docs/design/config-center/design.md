# 配置中心(Config Center)设计文档

> ⚠️ **代码已拆出本仓**：配置中心现为独立仓库 [lens077/config-center](https://github.com/lens077/config-center)
> （含其 Web 控制台，原 `frontend/apps/config` 已随之迁出）。本文保留在主仓作为设计存档与
> 服务侧接入（SDK `github.com/lens077/config-center`）的背景说明，文中提到的本仓代码路径均为历史位置。
>
> 面向网关与后端微服务的统一配置管理平台。类似 Consul KV,但补齐版本历史、语法/schema 校验、权限治理与玻璃态前端。
> 图例:✅ 本轮交付　🟡 部分　⬜ 后续阶段

---

## 一、背景与目标

### 现状

`ecommerce` 网关配置仍在 Consul KV；10 个后端业务服务的整份 YAML Bootstrap 只保留在
独立配置中心（`<svc>/<env>/bootstrap.yaml`）。服务通过本地 `CONFIG_SOURCE_FILE` selector
读取配置中心，再由各服务 `internal/pkg/config` 经 Viper 解码为 proto `Bootstrap`。
网关额外支持本地优先目录合并 + 热重载(`gateway/config/config-loader/`)。

### 痛点

| 痛点 | 说明 |
|------|------|
| 无治理 | 无版本历史、无回滚、无 diff、无审批;改错直接影响生产 |
| 无 UI | 只能手工改 Consul KV |
| 密钥明文 | `client_secret`、DB 密码、TLS 证书全部明文提交(见 `backend/services/user/configs/dev.yml`) |
| 无校验 | 改坏 YAML/字段类型无任何提示 |

### 目标

构建一个**以 Postgres 为数据源**的配置中心:

- **键值粒度**管理:每个 key 独立存储、独立版本历史、独立权限;value 携带 `format`(yaml/toml/json/plaintext)用于语法高亮与校验。
- **版本历史**:任意版本 diff 与一键回滚。
- **语法/schema 校验**:前端 Monaco 实时高亮 + 错误标注,后端保存时按 format 解析拦截非法内容。
- **权限**:复用现有网关的 Casdoor 鉴权(见下),后续叠加 per-namespace ACL。
- **前端**:Apple 玻璃态(glassmorphism)UI。

---

## 二、架构决策

三项已确认决策:

1. **架构:配置中心直接作为唯一数据源。** 服务经 ConnectRPC 读取(拉取)+ Watch 流(推送)获取配置；Consul 只保留服务发现/注册职责。Postgres 是配置中心事实源(SoR)，不存在 Bootstrap 回退源。
   - *不采用* FoundationDB(Apple 开源 KV):运维过重、无关系型 join、且会在 Consul 之外再引入第三套 KV。
   - *不采用* 继续以 Consul KV 为 SoR:无法做关系型的版本/审计/权限治理。
2. **粒度:键值粒度。** 每个 key 一行,独立版本;value 可为带格式的文档(整份 yaml/toml/json 亦可作为单个 key 的 value,由 `format` 驱动高亮与校验)。
3. **首轮范围:打通竖切。** 独立仓后端骨架 + Postgres 表 + CRUD + 版本历史;独立 Web 控制台 + Monaco 编辑器 + 玻璃态 UI。

### 总体架构

```
┌──────────────────── 配置中心(新 ConnectRPC 服务 config-service)────────────────────┐
│                                                                                      │
│   独立 Web 控制台(玻璃态 + Monaco)                                                     │
│        │ ConnectRPC-web(经网关,Casdoor JWT)                                          │
│        ▼                                                                              │
│   ConfigService(config.v1)                                                           │
│        │  biz(格式/schema 校验)                                                       │
│        ▼                                                                              │
│   Postgres  config.entry(当前值 + 版本号) / config.revision(append-only 历史)  ← SoR │
│        │                                                                              │
│        ├── GetKey / ListKeys ──────────►  服务拉取(读取路径,本轮)  ✅               │
│        └── Watch(server-stream)────────►  服务热更新(推送,后续)   ⬜               │
└──────────────────────────────────────────────────────────────────────────────────────┘
             ▲ 鉴权:复用现有网关 —— 网关验 Casdoor RS256 JWT + Casbin,注入
               x-md-global-user-id / -name / -role / -owner 头部,config 服务不重复验 JWT
```

---

## 三、数据模型(Postgres,`config` schema)

### `config.entry`(键 / 当前值)

| 列 | 类型 | 说明 |
|----|------|------|
| id | BIGSERIAL PK | |
| namespace | TEXT | 逻辑分组,如 `ecommerce` |
| environment | TEXT | 环境:dev/pre/prod/uat |
| key | TEXT | 层级路径,如 `gateway/config.yaml`、`user/data/postgres/host` |
| format | TEXT | yaml/toml/json/plaintext |
| value | TEXT | 当前值 |
| version | INT | 当前版本号(每次 Put 自增) |
| is_secret | BOOL | 是否密钥(后续:加密 + UI 脱敏) |
| description | TEXT | 说明 |
| updated_by | TEXT | 最后修改人(取自网关 `x-md-global-name`) |
| created_at / updated_at | TIMESTAMPTZ | |

约束:`UNIQUE(namespace, environment, key)`。

### `config.revision`(append-only 历史)

| 列 | 类型 | 说明 |
|----|------|------|
| id | BIGSERIAL PK | |
| entry_id | BIGINT FK→entry | |
| version | INT | 该历史版本号 |
| value | TEXT | 该版本值 |
| format | TEXT | 该版本格式 |
| comment | TEXT | 变更备注 |
| author | TEXT | 变更人 |
| created_at | TIMESTAMPTZ | |

约束:`UNIQUE(entry_id, version)`。

> PutKey / Rollback 在**单事务**内:更新 entry(version+1)并插入一条 revision,保证历史与当前值一致。

---

## 四、RPC 契约(`config.v1.ConfigService`)

proto 位于独立仓 `api/config/v1/config.proto`,`package config.v1`,protovalidate 校验。

| RPC | 说明 |
|-----|------|
| `ListKeys(namespace, environment, key_prefix)` | 列出 key 元数据(不含大 value / secret 脱敏) |
| `GetKey(namespace, environment, key)` | 取单 key 当前值 |
| `PutKey(namespace, environment, key, format, value, comment)` | 创建/更新,产生新 revision;**服务端按 format 校验** |
| `DeleteKey(namespace, environment, key)` | 删除 key(及历史) |
| `ListRevisions(namespace, environment, key)` | 历史版本列表 |
| `GetRevision(namespace, environment, key, version)` | 取某历史版本值 |
| `Rollback(namespace, environment, key, version, comment)` | 用旧版本值写为新 revision |

枚举 `ConfigFormat { UNSPECIFIED, YAML, TOML, JSON, PLAINTEXT }`。

---

## 五、鉴权模型

复用现有 Casdoor 与网关模式(见 `gateway/middleware/{jwt,rbac}`)，但独立服务不信任可被
直连客户端伪造的 `x-md-global-*` 头部：

1. 前端登录走 Casdoor OIDC(复用 `@ecommerce/configs` 的 `CASDOOR_CONF` 与 `/callback`)。
2. 网关继续验 Casdoor RS256 JWT 与 Casbin 路由策略；配置中心用与 user 服务相同的 Casdoor
   公钥证书再次验证 Bearer JWT，并仅接纳管理员身份。
3. 服务间 SDK 直连使用独立 machine token，只允许 `GetKey` / `WatchKeys`，不能写入或回滚。
4. 服务从已验证 principal 读取操作者写入 `updated_by/author`。

**用户名密码**:当前无本地密码流,密码登录发生在 Casdoor 托管页;如需可开启 Casdoor 内置密码登录(仍是同一 JWT 格式)。

后续(⬜):per-namespace/per-key 细粒度 ACL 存 Postgres,在 biz 层强制;服务账号/机器 token 供服务与 CI 非交互拉取。

---

## 六、语法与 Schema 校验

- **前端(Monaco)**:按 `format` 高亮 yml/toml/json;接 Monaco marker API 显示语法错误红色波浪线;历史用 Monaco DiffEditor。
- **后端(biz)**:PutKey 时按 format 解析(yaml/toml/json Unmarshal),非法返回 `InvalidArgument`。
- **后续(⬜)**:对接 proto `Bootstrap`/JSON Schema 做**结构化**校验(不仅语法),发布前拦截字段级错误 —— 这是防生产事故的关键能力。

---

## 七、玻璃态 UX 规范

- MUI `createTheme` 集中定义;`MuiPaper/MuiCard/MuiAppBar/MuiDrawer` 加玻璃样式:半透明 `rgba(...)` 背景 + `backdrop-filter: blur(20px) saturate(180%)` + 发丝边框 `1px solid rgba(255,255,255,.18)` + 柔和阴影 + 大圆角。
- 分层半透明面板营造景深;导航/卡片用玻璃,**编辑器容器保持不透明**确保代码可读。
- 间距遵循 `sp[]` 像素字符串约定(避免 MUI sx 数字 ×8)。

---

## 八、分阶段路线图

### 本轮竖切 ✅

- [x] 设计文档
- [ ] 后端 config 服务:proto + Postgres 表 + CRUD + 版本历史 + 服务端格式校验
- [ ] 前端 apps/config:玻璃态 UI + key 浏览器 + Monaco 编辑器 + 历史 Diff/回滚

### 后续阶段 ⬜

| 阶段 | 能力 |
|------|------|
| 下发 | Watch server-stream + Go 客户端 SDK 热更新已落地；后续补配置 schema/漂移检测，不再桥接 Consul KV |
| 治理 | 草稿→审批→发布工作流、环境间 diff 与晋升(dev→pre→prod)、灰度/金丝雀发布 |
| 安全 | 密钥标记 + 静态加密 + UI 脱敏 + 访问审计;审计日志(区别于版本历史) |
| 权限 | per-namespace/per-key ACL、服务账号/机器 token |
| 集成 | 变更通知(webhook/飞书/钉钉)、全文检索、标签、导入导出、备份恢复；Consul KV 仅保留历史导入能力 |

---

## 九、代码位置

| 部分 | 路径 |
|------|------|
| 后端服务 | 独立仓 `github.com/lens077/config-center` 根目录 |
| 后端 API proto | `config-center/api/config/v1/config.proto` → `config.pb.go` + `configv1connect/` |
| 前端应用 | `config-center/web/`（浏览器专用，不支持桌面端） |
| 前端生成客户端 | `config-center/web/src/gen/`（buf `protoc-gen-es`） |
| 网关放行 | `gateway/configs/policies/policies.csv` 增加 `config.v1.ConfigService/*` |
