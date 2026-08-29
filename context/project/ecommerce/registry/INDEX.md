# registry（服务注册与发现，后端共享模块）

**代码路径**：`backend/services/*/internal/pkg/registry/`（10 份，同一套代码）

> **迁移期定位（2026-08-28）**：按 `docs/TECH.md`，生产注册发现目标为 Kubernetes Service + CoreDNS，pre 半生产测试使用 Docker Compose 服务名（开发内环评估中）；本文记录 Consul 退役完成前的活系统行为与操作约束。

每个后端服务用 hashicorp 官方 `api` 客户端自行向 Consul Agent 注册，并挂两个健康检查：

- **TTL check**：服务通过 `TtlCheckPinger` 主动上报，只证明进程还在运行；进程退出并持续
  critical 后，由该 check 负责自动注销。
- **gRPC deep readiness check**：Consul 主动调用同一端口的
  `grpc.health.v1.Health/Check`。handler 复用 `/healthz` 的数据库、缓存等深度检查结果，
  避免 Kubernetes 已摘流、Consul 仍显示 passing。

TTL goroutine 的生命周期挂在 fx 的 `OnStart` / `OnStop` 上。gRPC readiness check 不设置
`deregister_critical_service_after`：依赖故障只摘流，不永久注销仍在运行的实例；依赖恢复后
Consul 可以自动把它转回 passing。

发现侧不在这里——网关（`control-tower/services/gateway/internal/resolver`）用自己的
Consul 目录 Watch（blocking query），**只取所有检查均为 `passing` 的实例**
（`consul.go` 里 `Health().Service(service, "", true, ...)` 的第三个参数）。
这条是理解本模块大多数问题的前提：**任一检查没转 passing，该实例对网关等于不存在**。

## 关键约定

| 事项 | 值 |
|---|---|
| TTL CheckID | 显式指定为 `service:<实例 ID>`，注册与 pinger 共用 `healthcheck.ConsulTTLCheckID` |
| gRPC readiness CheckID | 显式指定为 `service:<实例 ID>:grpc-readiness` |
| 检查周期来源 | Config Center `<svc>/<env>/bootstrap.yaml` 的 `discovery.consul.check.ttl.ping_interval`（Consul KV 已退役） |
| gRPC readiness 阈值 | timeout 12s；连续 3 次失败转 critical；1 次成功转 passing |
| 注册地址 | `AppInfo.Host` + 自身 `server.addr` 的端口（**不是** Consul 的地址） |
| 服务名 | 必须与网关 `discovery:///<name>` 一致，不带 `-v1` 后缀 |

## experience

| 症状 | 文件 |
|---|---|
| 服务日志干净，前端却要刷好几次才出数据 | [consul-ttl-first-ping-blind-window.md](experience/consul-ttl-first-ping-blind-window.md) |
| 复验 10 个服务的双检查与可逆依赖故障 | [consul-dual-check-runbook.md](consul-dual-check-runbook.md) |

## 2026-08-27 dev 验证

10 个业务服务已部署同一不可变 health rollout，并逐实例核对：每个 Ready Pod 在 Consul 中只有一个实例，且同时存在 `TTL process liveness=passing` 与 `gRPC deep readiness=passing`。Consul ACL 的默认策略是 deny；匿名查询会返回空 catalog，不能据此判断服务未注册。

依赖故障实验临时把 inventory 扩为 2 副本，只阻断其中一个 Pod 到 PostgreSQL 和 Dragonfly 的 egress，同时保留 DNS、Consul 与 Config Center。结果符合设计：

- 故障 Pod 的 TTL 保持 passing，gRPC readiness 在连续失败后转 critical；
- catalog 继续保留 2 个实例，`passingOnly` 只返回健康的 1 个实例；
- 撤销策略后，gRPC readiness 一次成功即恢复 passing，`passingOnly` 恢复 2 个实例；
- 最后删除临时 NetworkPolicy、移除 Pod 标签，并把 inventory 还原为 1 副本。

这里的「摘流」指从 passing-only 服务发现结果中排除，不是立即从 catalog 注销。只有进程 TTL 持续 critical，才由 TTL check 的 `deregister_critical_service_after` 注销实例。

## 已知注意事项

- `Check` 与 `Checks` 会被 Consul 合并成一个数组。存在多个检查时，未显式指定的 CheckID 会按位置变成
  `service:<ID>:1`、`service:<ID>:2`；TTL 注册与 `UpdateTTL` 必须共用显式 ID，否则心跳会持续 404。
- gRPC readiness 注册后的初始状态是 critical，首次检查前实例不会进入 `passingOnly` 结果。这段最多一个
  `ping_interval` 的启动等待是有意的：不能在深度检查尚未成功时伪造 passing。
- **`deregister_critical_service_after` 有 1 分钟硬下限**，写更小的值会被 Consul 静默钳制。
- 心跳 goroutine 里 **panic 会带走整个进程**。`ping_interval` 缺失或为 0 时
  `time.NewTicker` 会 panic，现已回落 10s 默认值。
- registry 接线在 10 个服务里仍是复制关系。改一处要么全改，要么在提交里写清为什么只改一处。
  gRPC handler 与 Consul readiness check 的协议细节集中在 `backend/pkg/healthcheck/`；各服务只传入
  自己的 `healthStatus` 和监听地址。当前 pinger 块 10 份完全一致，fx hook 块已漂移出 5 个变体。
