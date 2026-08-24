# gateway

> 旧网关（本仓 `gateway/`，go-kratos/gateway 分叉）已于 2026-08-23 退役，目录待删；
> 历史见 tag `backup/pre-control-tower-20260823`。

**代码路径**：`/Users/sumery/lens077/control-tower/services/gateway`（合一仓 control-tower，
Connect 原生重写，零 kratos 代码）。集群里跑的是 `control-tower-gateway`（ecommerce ns）。

请求链：`recover → otel → accesslog → cors → auth → proxy`。
转发是端到端 Connect 直通——无转码、无请求体缓存、**默认无重试**；
选点走 Consul 目录 Watch + P2C，Consul 只负责服务发现，配置全部来自 Config Center。

## Config Center 五键（namespace=`gateway`）

| 键 | 作用 |
|---|---|
| `routes.yaml` | RouteConfig v2：路由表 + 匿名清单 + `online_check` + CORS |
| `secrets/public.pem` | JWT 验签公钥 |
| `policies/policies.csv` + `policies/model.conf` | Casbin RBAC |
| `auth/revocations.yaml` | 撤销名单（首次拉取 NotFound 容忍为空表） |

- **五个条目必须 `is_secret=false`**。Config Center 把 `is_secret=true` 的值统一返回
  `******`，机器 token 也不例外，网关会解析失败。selector token 与 TLS 私钥只进
  本地/Kubernetes Secret。
- 启动时前四键必须拉到并通过校验，否则**快速失败**；热更新遇到非法值或删除事件
  保留 last-known-good，只记 ERROR。
- `routes.yaml` 严格解析：未知键直接报错（`DiscardUnknown` 的静默丢弃是历史事故源）。

## experience

| 症状 | 文件 |
|---|---|
| 登录后立刻 401、前端无限跳登录页 | [jwt-nbf-clock-skew-loop.md](experience/jwt-nbf-clock-skew-loop.md) |
| 健康检查从不标出坏节点 | [retry-amplification-and-phantom-health-check.md](experience/retry-amplification-and-phantom-health-check.md) |

## 已知注意事项

- **错误 details 的 `type` / `value` 为空会被 connect-web 的 `errorFromJson` 静默丢弃**，
  前端表现为「未知错误」。网关自身错误一律走 `internal/gwerrors`：Connect 规范错误体
  + 非空 detail + `X-Error-Reason` 头。这条契约前端已依赖，不能改。
- 网关「拿不到节点」时不一定是网关的错。服务注册侧也会造成节点对外不可见，
  见 [`registry/experience/consul-ttl-first-ping-blind-window.md`](../registry/experience/consul-ttl-first-ping-blind-window.md)。
