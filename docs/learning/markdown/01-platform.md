# 01 引出前端、网关与配置中心：让业务接得上、守得住

[学习入口](README.md) · 上一课：[系统模型](00-system.md) · 下一课：[购物车](02-cart.md)

## 0. Git 证据：实际不是「后端完成后才出现前端」

| 历史证据 | 当时范围/做法 | 后来为什么变、今天哪里仍受限 |
|---|---|---|
| [ac0e420f README](https://github.com/lens077/ecommerce/blob/ac0e420f/README.md) 与 [前端入口](https://github.com/lens077/ecommerce/blob/ac0e420f/frontend/src/main.tsx)，2025-11-06 | Connect example已经同时有Go/React，前端生成pb、单路由应用，后端认证示例 | 所以「从后端引出前端」是教学顺序，不是真实时间上后端先全部完成。现在目录更丰富，但购物业务仍依赖后端真实结果 |
| [f3fe86d3 README路线图](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L854-L898)，2026-02-25 | 原始MVP明确要详情/购物车/下单/支付/订单列表 | 页面齐全仍不满足验收；要有持久订单、真实支付、状态同步 |
| [46ac18f0旧网关说明](https://github.com/lens077/ecommerce/blob/46ac18f0/gateway/README.md)，2025-12-17 | 本仓展开网关：HTTP→Proxy→Router→Middleware→Client，Consul/JWT/RBAC，示例带重试 | 当前control-tower收敛为Connect直通、总超时、默认无重试，避免网关放大非幂等写入；对象权限仍归业务服务 |
| [e5e7db72 workspace](https://github.com/lens077/ecommerce/blob/e5e7db72/frontend/pnpm-workspace.yaml)，2026-03-19 | apps/*、packages/*、catalog与vite-plus，服务于多端复用 | 消除多个app各配一套工具，但共享包不能掩盖未接业务接口 |
| [457eb537配置初稿](https://github.com/lens077/ecommerce/blob/457eb537/CONFIG_CENTER_DESIGN.md)，2026-07-31 | 原文「首轮范围：打通竖切」：PG、CRUD、版本历史、格式校验、编辑UI；Watch/机器token/审批为后续 | 不应把灰度/审批全算首轮未完成；同时首轮格式校验不证明字段Schema或连接已生效 |
| [af54f8bb配置实现](https://github.com/lens077/ecommerce/blob/af54f8bb/backend/services/cart/internal/pkg/config/config.go)，2026-08-01 | Source.Load→解码→Live.Set，支持Watcher时订阅，坏推送保旧，不支持则说明启动读取 | 当前已抽到kit和SDK，增加Schema和重连；仍需每种client消费新配置和故障可观测 |
| [control-tower 1e4e645架构](https://github.com/lens077/control-tower/blob/1e4e645/docs/design/architecture.md)，2026-08-23 | 首份新仓架构明确单仓两服务、剥身份头、Connect直通、配置自举 | 这份设计所在首提交是骨架，不能把文字当该提交已实现全部功能；后续P2/P3才加入服务实现 |

**MVP判定**：前端的原始交易页面要求尚未形成完整购物闭环；网关与配置的核心能力已有源码，但本轮未重跑全套入口/权限/控制台/回滚验收。**生产判定**：不能仅因UI可开、服务可启动就批准生产；跨服务身份、网络不可绕过、配置轮换与恢复证据仍需要独立验收。

## 1. 为什么先有服务，还需要这三层

后端能接收一个合法请求，不代表真实用户能可靠使用它：浏览器有跨域与登录问题，多个页面会重复拉数据，环境端点与凭据会变化，服务间还有越权和失败传播。

这三层分别解决不同问题：

- **前端**：把人的意图变成请求，表达等待、成功、失败和恢复；不拥有订单与库存真相。
- **网关**：统一外部入口、会话识别、路由与协议错误；不拥有各业务表的归属规则。
- **配置中心**：发布并分发有版本、权限和校验的运行配置；不替代服务内部对热生效的验证。

```text
人 → 页面 → hook / Connect Query → 共享 transport
                                  ↓
                    gateway：身份识别、路由、超时
                                  ↓
                     service → biz → data → PostgreSQL

配置控制面：Config Center → SDK Watch → Bootstrap 校验 → 业务客户端重建
观测平面：  RPC/用例 → OTel → 日志、指标、trace → 告警与定位
```

配置流和业务请求流不是同一条链。Config Center 不应该在每一个商品查询请求中重新被访问。

## 2. 前端从页面原型到业务客户端

### 术语

- **SPA**：页面主要在浏览器渲染的单页应用，适合登录后的交互。
- **SSR**：服务端先生成页面内容。本项目公开商品页使用 consumer-next；不意味着交易页自动完成。
- **Query**：读取服务器状态；**Mutation**：改变服务器状态。
- **缓存失效**：通知 Query 的副本已旧，应重新拉取，不是删除业务数据。
- **Transport**：封装 RPC 的地址、fetch、拦截器和协议传输。
- **乐观更新**：先显示预期结果，再与服务器确认；失败必须回滚/重同步。

[前端 README](../../frontend/README.md) 已列出五个 app 与共享包。根 README 的旧四-app目录统计不能覆盖这里的实际目录。consumer-next 管公开页，consumer 管交互页；merchant/admin 的页面骨架并不等于服务 API 已接好；desktop 是复用页面的 Tauri 壳，不是第五套电商业务。

### 从早期页面切片演进出的工程化能力

[transport.ts](../../frontend/packages/api/src/transport.ts) 用懒初始化单例统一地址、fetch 和拦截器。Connect Query 的 key 带 transport 身份；每个组件随手创建 transport 会让缓存分裂，失效可能命不中。这里的单例是在维护缓存契约，不是无缘无故使用全局对象。

[useCart](../../frontend/apps/consumer/src/hooks/useCart.ts) 已把 GetCart 查询与徽标共享，并把响应映射抽到模块作用域，避免每次 render 创建新 select 函数引起无意义更新。加购后失效查询，而不是再往本地累加一次，避免重复计数。

[AuthProvider](../../frontend/apps/consumer/src/providers/AuthProvider.tsx) 区分匿名请求的 401 和已有会话失效，避免匿名逛商城被强制登录；用布局阶段同步的 ref 避免回调读到上一个登录状态。

### 当前仍存在的边界问题

1. 购物车删除/数量 mutation 没接，见 [cart 课](02-cart.md)。本地 store 变化不等于持久化。
2. 地址弹窗的旧问题已在当前工作树修正：hook返回mutateAsync，表单等待成功再关闭、失败保留输入；见 [address课](04-address.md)。这项前端修复不替代后端归属和默认唯一性。
3. 当前结算新增服务端购物车快照核对和本页重复提交防护，但仍缺真实订单响应，成功后仍跳固定支付结果；见 [order课](10-order.md)。不能继续把「静默过滤未同步商品」列为当前缺陷，也不能因此认定交易完成。
4. [bffLogout](../../frontend/packages/configs/src/auth/bff.ts) 没有检查 HTTP 非成功状态，网络异常只告警后继续本地清理。**UI 登出不证明服务端会话已撤销**。后续应定义失败提示和重试/撤销验证，而非在前端重新引入长期 token。
5. `fetchIdentity` 将网络失败与未认证都投影成匿名，保护启动不崩溃，但丢掉「身份服务不可达」信息。更健壮的模型应区分 loading、authenticated、anonymous、unavailable；这是建议演进，不是已实现状态。

### 性能与扩展的正确顺序

先统一 Query/Mutation 和缓存 key，再处理页面拆分、延迟加载和资源性能。不要因为组件 500 行就拆十个透传 hook；优先按可独立解释的用例拆：地址选择、表单提交、结算摘要。

公开 SSR 缓存只装匿名内容；用户会话、地址、购物车不能被放进共享页面缓存。平台已有单独的匿名/带鉴权 transport，但前端 publicTransport 仍继承 cookie fetch 设置，**不能仅凭名字断言它绝不携带凭据**；SSR 必须显式验证请求隔离。

## 3. 网关：先识别「是谁」，再问「能干什么」

### 术语与类比

- **Authentication（认证）**：确认来者身份，像核对证件。
- **Authorization（授权）**：确认此身份能做此操作，像核对是否有房门钥匙。
- **BFF（Backend for Frontend）**：服务端代客户端处理会话/令牌；这里由网关承担。
- **Session**：服务端保存的一次登录关系；session ID 是查询关系的凭据，仍须保密。
- **CSRF**：攻击者利用浏览器自动附带 cookie 发起非用户本意的操作。
- **Fail-closed**：无法确认授权时拒绝，不把鉴权故障当作匿名放行到敏感业务。

**网关放行一个 RPC，不代表它拥有读取用户 B 地址的权利。** procedure 级授权与对象级授权必须分层做。

### 当前本地源码依据

网关不在本仓。只读核对了 `../control-tower/services/gateway/internal/httpmw/auth.go` 和 `../control-tower/docs/design/architecture.md`。这些路径属于同级 control-tower 仓库；本地源码也不证明线上镜像已包含它们。

当前源码会先剥离入站身份头，再按四类路由处理：

| 类别 | 意义 | 典型消费者 | 服务侧不能误解的事 |
|---|---|---|---|
| anonymous | 不要求也不注入身份 | 商品详情、搜索、地区列表 | 不可依赖请求体里一个用户 ID 获得权限 |
| guest | 识别/签发访客身份 | cart 的四个 RPC | 访客只能进入允许的购物车业务，不能据此下单支付 |
| optional_auth | 能识别时注入身份，失败按匿名 | behavior 三个 RPC | 只用于行为归因，不可绕过敏感业务的登录要求 |
| authenticated | 要求认证并做当前角色策略 | 地址、订单等 | 数据归属仍由服务查询条件保证 |

身份轨仍有 cookie → 桌面 session header → legacy bearer JWT。新前端已经使用 BFF，但**兼容轨是否能删除**必须经过调用方盘点，不可从前端注释推定它已从网关消失。

### 当前待验证风险

核查时 guest 分支在普通 authenticate 之前直接进入下游；分支注释声称已登录用户可由 claims 优先保持身份，但本分支没有执行普通会话识别。不能只读注释就认定用户一定不被降为访客。

这是需要跨仓请求测试确认的风险：分别用匿名、有效登录 cookie、session header 访问购物车 RPC，验证后端实际收到的主体和访客标记。若确实丢失登录身份，应在 guest 路径先尝试同一身份识别逻辑，有效登录保留用户主体，无法识别才走访客策略；不要在 cart 内自行解析 cookie。

另外，[identity helper](../../backend/pkg/identity/identity.go) 的登录主体校验只有在服务调用它时才生效。NetworkPolicy 的默认拒绝与可信入口仍需按 TODO 验收；客户端伪造头直达后端会破坏「网关注入即可信」的假设。

## 4. 配置中心：配置写入成功不等于功能生效

### 从 MVP 理解

历史初稿并不是从零的本地文件场景：`457eb537` 明确说服务当时已集中读取 Consul KV 整份 YAML，痛点是无版本历史/回滚/治理、无字段校验和密钥处理不足。Config Center 首轮选择 PG 为真相源，补CRUD、版本和编辑UI；Watch与治理后续落地。当前不应恢复Consul KV作为配置回退源。

**Bootstrap** 是服务启动所需的完整配置；**selector** 是「到哪取、取哪个 namespace/environment/key、用什么机器身份」的小配置。selector 不是又一份完整 Bootstrap 副本。

```text
selector → 获取 Bootstrap → 解码 → 拒绝未知键 / 校验 required
                                      ↓
                                 创建业务客户端
Watch 新版本 → 同样校验 → 先建并验证新客户端 → 原子换入 → 退役旧客户端
```

### 现有工程化

- [configsource.New](../../backend/pkg/configsource/source.go) 使用 kit 的 provider-neutral 配置入口。
- [服务 adapter](../../backend/services/cart/internal/pkg/config/config.go) 只绑定自己的 Bootstrap 类型和需要重启的配置段。
- 同级 control-tower 的 `sdk/configsource/kit.go` 对 Watch 中断做指数退避并向消费方报告错误。
- Config Center 写入侧有 Schema 校验；SDK 消费侧仍需解码校验，两者不能互相替代。
- [热更新边界](../../context/project/ecommerce/config/experience/config-hot-reload-boundaries.md) 规定哪些组件可热重建、哪些只告警等重启。正在工作树里的 gorse 热重建改动不等于已经发布。

### 仍要解决的对接问题

1. **Schema 发布顺序**：本仓新增 Bootstrap 字段后，先同步并发布控制面的 Schema，再写配置、发布消费服务；否则老控制面会拒绝新字段。
2. **版本已下载、连接仍旧**：新 endpoint 连接失败时保留旧客户端是可用性保护，但要报告 stale，否则用户会以为轮换成功。
3. **配置中心自举**：config 服务自己的 DB/鉴权配置来自本地文件或 Secret，不能只存在于自己里面。
4. **权限与脱敏**：机器 token 只准读所属 namespace/environment；不能为了方便给所有服务管理员 token。整份 Bootstrap 含凭据，不进日志和教材。
5. **真实环境漂移**：静态扫描不知 Config Center 当前值；`backend/tools/config-seed -drift` 是另一种验证，需受限身份与正确目标环境，本轮没有执行远端审计。

## 5. 本课的三组验收练习

| 练习 | 正常输入 | 故意破坏 | 必须观察的结果 |
|---|---|---|---|
| P1 会话与归属 | 用户 A 操作自己的地址 | 用户 A 带用户 B 的地址 ID；伪造身份头；访客进入 C 类 RPC | 无越权数据、无副作用；明确错误，不是 200 空对象 |
| P2 配置热更新 | 把连接换到可用测试端点 | 错 endpoint、错凭据、缺 required 段、Watch 中断 | 启动失败与热更新保旧语义分清；stale/日志可定位，旧连接不被意外销毁 |
| P3 前端状态 | 一次 mutation 后重新查询 | 网络超时、RPC 拒绝、两标签页同时改 | 页面不伪报成功；缓存最终与服务器对齐；重复操作语义明确 |

真实配置轮换、网络策略修改、集群部署不属于「学习测试可随便执行」的范围。先用测试依赖和合成凭据验证，再按项目授权流程推进。
