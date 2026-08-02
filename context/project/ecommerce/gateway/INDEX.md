# gateway

**代码路径**：`gateway/`

基于 go-kratos/gateway 的集中式网关：路由 + Casdoor JWT 鉴权 + Casbin RBAC + CORS + 统一错误层。
配置从 Consul KV 加载并热重载。

## 关键文件

| 路径 | 作用 |
|---|---|
| `gateway/configs/config.yaml` | 路由表（10 条 endpoint，`/user* /search* /product* /cart* /address* /config* /order* /inventory* /merchant* /payment*`） |
| `gateway/middleware/jwt/jwt.go` | Casdoor JWT 校验 |
| `gateway/middleware/cors/cors.go` | CORS |
| `gateway/errors/{response,mapping,cors}.go` | 统一错误层：非业务错误也按 Connect 规范返回 |
| `policies/policies.csv` + `model.conf` | Casbin RBAC 策略 |

## experience

| 症状 | 文件 |
|---|---|
| 登录后立刻 401、前端无限跳登录页 | [jwt-nbf-clock-skew-loop.md](experience/jwt-nbf-clock-skew-loop.md) |
| 一个 POST 被打上游多次；健康检查从不标出坏节点 | [retry-amplification-and-phantom-health-check.md](experience/retry-amplification-and-phantom-health-check.md) |

## 已知注意事项

- RBAC 策略路径常量早已从 `rbac/policies.csv` 改为 `policies/`。远端镜像若是旧版会**启动即 FATAL**，
  排查「网关起不来」时先确认镜像版本。
- 错误 details 的 `type` / `value` 为空会被 connect-web 的 `errorFromJson` **静默丢弃**，
  前端表现为「未知错误」。测试见 `gateway/errors/response_test.go`。
- 重试只由**路由层** `retry.attempts` 负责（它是**总尝试次数**，不是重试次数）。
  `client/client.go` 的 `defaultMaxRetries` 必须保持 `1`，改大会与路由层相乘。
- 网关「拿不到节点」时不一定是网关的错。服务注册侧也会造成节点对外不可见，
  见 [`registry/experience/consul-ttl-first-ping-blind-window.md`](../registry/experience/consul-ttl-first-ping-blind-window.md)。
- `config.yaml` 声明了 10 条路由但本地通常只起一两个服务，未启动的服务**不再**周期刷 WARN
  （15s 兜底轮询已删除）。若又看到刷屏，说明轮询被谁加回来了。
- `gateway/` 是独立 Go module，不在 `go.work` 里。编辑器报 `BrokenImport` 是工作区噪音，
  以 `cd gateway && go build ./...` 为准。`constants/discovery.go` 目前不是 gofmt-clean（既有问题）。
