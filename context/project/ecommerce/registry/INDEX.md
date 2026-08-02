# registry（服务注册与发现，后端共享模块）

**代码路径**：`backend/services/*/internal/pkg/registry/`（11 份，同一套代码）

每个后端服务用 hashicorp 官方 `api` 客户端自行向 Consul Agent 注册，
健康检查用 **TTL check**（服务主动上报，不是 Consul 来探），由 `TtlCheckPinger` 在
独立 goroutine 里周期性 `UpdateTTL(pass)`。生命周期挂在 fx 的 `OnStart` / `OnStop` 上。

发现侧不在这里——网关用的是 kratos `contrib/registry/consul/v2`，
**以 `passingOnly=true` 查询**。这条是理解本模块大多数问题的前提。

## 关键约定

| 事项 | 值 |
|---|---|
| CheckID 格式 | `service:<实例 ID>`，Consul Agent 强制 |
| 心跳参数来源 | Consul KV `ecommerce/<svc>/dev.yml` 的 `discovery.consul.check` |
| 注册地址 | `AppInfo.Host` + 自身 `server.addr` 的端口（**不是** Consul 的地址） |
| 服务名 | 必须与网关 `discovery:///<name>` 一致，不带 `-v1` 后缀 |

## experience

| 症状 | 文件 |
|---|---|
| 服务日志干净，前端却要刷好几次才出数据 | [consul-ttl-first-ping-blind-window.md](experience/consul-ttl-first-ping-blind-window.md) |

## 已知注意事项

- **`deregister_critical_service_after` 有 1 分钟硬下限**，写更小的值会被 Consul 静默钳制。
- 心跳 goroutine 里 **panic 会带走整个进程**。`ping_interval` 缺失或为 0 时
  `time.NewTicker` 会 panic，现已回落 10s 默认值。
- 这段代码在 11 个服务里是复制关系，不是共享包。改一处要么全改，要么在提交里写清为什么只改一处。
  当前 pinger 块 11 份完全一致，fx hook 块已漂移出 5 个变体。
