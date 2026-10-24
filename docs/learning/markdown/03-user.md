# 03 用户：把认证、会话与业务档案拆开理解

[学习入口](README.md) · 前置：[平台与 BFF](01-platform.md) · 关联：[地址](04-address.md)、[商家](05-merchant.md)

## 0. Git 证据：自研认证 → Casdoor交换 → BFF迁责

最早可读前身是 [8ee6ada4 greet.proto](https://github.com/lens077/ecommerce/blob/8ee6ada4/backend/api/greet/v1/greet.proto)（2025-11-04），Register/GetAuthChallenge/SubmitAuth。对应biz/data使用PG注册用户、Redis保存并GetDel消费一次性挑战，最后生成JWT；这是工程示例时代，不是Casdoor/BFF。

[28af32d4 data/user.go](https://github.com/lens077/ecommerce/blob/28af32d4/backend/internal/data/user.go)（2025-12-04）改为GetOAuthToken(code,state)，返回AccessToken；这是code交换代理，没有在该函数创建服务端session。`69f8ec6a`（12-16）新增UserProfile接口。

作者在 [f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L33-L46) 将认证列为首期核心，要求登录/登出/刷新/身份/角色；同时明确账号归Casdoor，业务不再自管密码。这意味着职责从最早的自研挑战方案被替换，不能要求今天恢复旧算法来「补原始MVP」。

当时user服务目录有gitlink，外仓对象在本地不可读；最早普通目录的 [dbeeb59d data](https://github.com/lens077/ecommerce/blob/dbeeb59d/backend/services/user/internal/data/user.go)（2026-04-26）可核实code交换和Casdoor GetUser。

后续 [f8e3eb88 AuthProvider](https://github.com/lens077/ecommerce/blob/f8e3eb88/frontend/apps/consumer/src/providers/AuthProvider.tsx)（08-24）把Web登录迁给BFF；`59a86622`（09-23）的[data错误处理](https://github.com/lens077/ecommerce/blob/59a86622/backend/services/user/internal/data/user.go)区分传输错误与认证拒绝。当前客户端两端已走session轨；工作树还有迟到身份响应/重复401防护，但这些不代替网关端撤销验收。

**原始MVP判定：认证切片部分满足，不能签完整通过。** code兑换和profile不是空桩，但全项目认证会话能力已分给BFF，需要跨仓整体验收。**生产判定：不满足**，遗留入口记录token是明确阻断，凭据轮换/主体与错误语义仍待收口。优化方向是收敛凭据职责，不重造另一套user会话系统。

## 1. 这门课要解决的业务问题

用户服务应该回答「当前主体对应什么业务档案」，而不是成为所有微服务的密码、权限、地址和订单数据库。

当前可读的最小服务切片是code交换与本人资料读取，它不等于作者全项目MVP的全部认证范围。登录/刷新/登出等职责已迁到BFF；不要为了让user服务自己「功能齐全」再次把凭据管理拉回来。

术语先分清：

| 术语 | 含义 | 本项目归属 |
|---|---|---|
| IdP（Identity Provider） | 负责身份认证的提供方 | Casdoor |
| OAuth access token | 访问受保护系统的凭据 | 新 BFF 流程留在网关服务端 |
| Session / session ID | 服务端登录关系及其不透明标识 | gateway；浏览器 cookie / 桌面 session header |
| Profile | 应用展示需要的资料 | user 将 Casdoor 资料映射为本项目响应 |
| Principal（主体） | 这次操作是谁发起的 | 来自可信认证上下文，不由请求体声明 |
| 对象级授权 | 当前主体能否访问这一条具体资源 | 各服务必须实施，不能全交给 user |

类比：证件签发机关负责确认你是谁；地址簿和订单柜台负责判断那份资料是不是你的。不能因为拿到了证件，就打开所有人的抽屉。

## 2. 当前调用路径

现行 [user.proto](../../backend/api/user/v1/user.proto) 只有 SignIn、UserProfile。业务用例转到 repo；[GetUserProfile](../../backend/services/user/internal/data/user.go) 当前直接调用 Casdoor GetUser，而不是查询本地用户表。

```text
新前端：登录 → gateway BFF → /auth/me → 会话
本人资料：UserProfile → service 读取身份头 → biz → repo → Casdoor
遗留接口：SignIn → repo 交换令牌 → 返回 bearer
```

这三条不能混成「调用 SignIn 后插入 public.users，再从本地表读取档案」。当前源码不支持这个叙述，即使旧 TODO 或旧 SQL 仍出现它。

matrix 中 user 没有业务微服务依赖，声明了 Casdoor 等外部依赖。订单将来需要的是可信用户主体，不应每一步都重新调用 user 做登录。

## 3. 当前已增加的可靠性

- proto/Connect 接口校验，service 统一做领域错误码映射。
- 数据层区分传输故障与身份失败，避免 Casdoor 不可达时一律说用户密码错误。
- 资料映射不直接把 IdP 的敏感字段全发给前端。
- 使用共享配置、日志、OTel、连接生命周期；不在每个请求中重新构造全部基础设施。
- 前端已有 BFF，而不是继续将长期 access/refresh token 存在浏览器业务 store。

已存在的 [service 错误测试](../../backend/services/user/internal/service/user_test.go) 和 [data 错误测试](../../backend/services/user/internal/data/user_errors_test.go) 是可以复用的验证入口，但它们不是下面所有安全行为的证明。本轮未运行这些测试。

## 4. 当前仍有的问题

### U1 SignIn 源头仍记录 access token

在 [data/user.go](../../backend/services/user/internal/data/user.go) 的 SignIn，当前仍将 AccessToken 传入 Debug，并返回 bearer。

**日志级别不是保密措施。** 今天不开 debug 不代表明天排障不会打开；只要代码路径能将凭据写出，就存在泄露路径。应从源头删敏感值，用请求 ID、错误类别和成功状态记录行为。

修复验收不是搜索日志文件里暂时没出现 token，而是用合成 token 调该分支，捕获日志，证明值永不进入任何级别输出。不能把真实 token 用作测试样本。

### U2 已有 BFF，但旧 SignIn 的退出边界尚未闭合

BFF 和 legacy SignIn 同时存在会增加凭据处理与兼容面。不能直接删除 RPC 让旧客户端断线，也不能以「将来再迁移」永久保留。

下一步是盘点谁仍调用它，按调用方迁移、错误提示、proto reserved/兼容策略推进；网关 legacy bearer 的移除必须跨仓协调。只改 consumer 不等于所有客户端已迁完。

### U3 资料查询没有完整绑定登录主体

[UserProfile handler](../../backend/services/user/internal/service/user.go) 读取 username 头；尚未统一使用 [RequireUser](../../backend/pkg/identity/identity.go) 拒绝访客并校验稳定主体。

Name 和 ID 不同：名字可能改，ID 用于稳定关联。应明确「身份头中的 ID 与要查的 Casdoor 用户如何一致」，不能把任意名字当查询许可。

这些头的可信性来自网关剥离后重新注入和后端网络边界；本轮只查源码，没有证明绕网关在公网可达。因此这里是明确的防御缺口，不夸称已实测互联网越权。

### U4 配置分发与客户端生效不是一件事

[data.go](../../backend/services/user/internal/data/data.go) 的 Casdoor client 从启动快照构造，没有在这条构造路径内订阅热更新。修改 Config Center 后，如果 operator 以为自动换了 endpoint/凭据，就会产生运维误判。

两种合理路线：明确声明重启生效并告警，或复用已存在的 Live/last-known-good 模式热重建。不要再复制一份独立配置 watcher。新配置必须验证可用后再切，失败时保旧且报告 stale。

## 5. 面向其他服务的契约

| 对接 | 需要承诺 | 不该要求调用方知道 |
|---|---|---|
| 前端 → user | 本人资料、稳定 ID、名字、最小公开字段；不存在与认证失败分开 | Casdoor SDK 全部字段、refresh token |
| gateway → service | ID/名字/角色来自同一次可信身份解析 | 每个服务自己兑换 OAuth code |
| user 与 address/order | 共享主体 ID 的意义，不共享业务表所有权 | 让 user 查询其他服务所有地址/订单来做万能授权 |
| user 与 merchant | 登录用户可以拥有/管理商家，但 user_id 不等于 merchant_id | 用一个布尔 isMerchant 代替组织与资源关系 |

性能上，先避免不必要的重复资料调用，再考虑受限缓存。缓存会延迟禁用账号、权限变更的可见性；不能只为了省一次网络调用，把授权事实长期缓存而没有撤销策略。

## 6. 分阶段学习与修复

| 练习 | 最小改动 | 验收 |
|---|---|---|
| U-A 凭据不落日志 | 删除 SignIn 的值日志，保留不含凭据的观测 | 合成 token 在成功/失败日志均不可见，旧错误映射测试仍通过 |
| U-B 主体明确 | UserProfile 复用 RequireUser，明确 ID→档案映射与最小响应 | 无身份/访客被拒且不调用 Casdoor；本人可读；不接受调用方冒充他人 |
| U-C 凭据职责收敛 | 按调用方清单迁移旧 SignIn，并定义 client 配置生效模式 | 旧调用方有明确迁移结果；配置轮换成功/失败可观测，不产生双套登录事实 |

**高内聚**是 user 只负责用户域事实与 IdP 适配；**低耦合**是业务服务拿稳定主体，不依赖 Casdoor SDK。要扩展会员资料、偏好时，先证明它们归 user 域，再加小而稳定的模块接口，而不是把登录模块继续变成平台大杂烩。
