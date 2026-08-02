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

## 已知注意事项

- RBAC 策略路径常量早已从 `rbac/policies.csv` 改为 `policies/`。远端镜像若是旧版会**启动即 FATAL**，
  排查「网关起不来」时先确认镜像版本。
- 错误 details 的 `type` / `value` 为空会被 connect-web 的 `errorFromJson` **静默丢弃**，
  前端表现为「未知错误」。测试见 `gateway/errors/response_test.go`。
