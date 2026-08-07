---
name: local-env
layer: team
description: 本地跑后端服务/网关时连本地 k8s 集群的地址约定；Consul 用 192.168.3.112:8500
---

# 本地开发环境约定

> ⚠️ **本文件只记录主机名和端口，不记录任何凭据。**
> 用户名/密码/密钥只存在于 Config Center、Kubernetes Secret 和本地环境，不进仓库。

## Consul：用 IP，不要用域名

本地跑后端服务 / 网关连本地 k8s 集群时，Consul 地址是：

```
192.168.3.112:8500    (http)
```

这也是 `gateway/Makefile` 的 `dev` target 在用的（`CONSUL_ADDR=consul://192.168.3.112:8500`）。

**陷阱**：主机名 `consul.app.com`（/etc/hosts 指向 `192.168.3.110:8500`）从宿主机访问会**超时**。

因此，任何显式配置 `CONSUL_ADDR=consul.app.com` 的本地服务，**从宿主机跑时必须覆盖成 `192.168.3.112:8500`**。独立 `config-center` 从本地 `CONFIG_FILE` 自举；Consul 仅用于服务发现。

## 配置加载：Config Center 是唯一来源

10 个服务的默认 `make dev` 都通过被忽略的 `configs/source.dev.yaml` 读取配置中心；selector
只负责自举，Consul 仍用于服务注册发现。配置中心键是 `<service>/dev/bootstrap.yaml`。
selector 缺失、token 无效或目标 key 不存在时服务直接启动失败；没有 `dev-consul` 或 KV 回退。

⚠️ 更隐蔽的失败模式：KV **存在但缺子块**时，配置解码用的 mapstructure 没开 `ErrorUnused`，多余键不报错、缺失键生成 nil-safe 的 getter —— 功能会被**静默关掉而不是启动失败**。踩过的实例见
[`context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md`](../project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)。

## 基础设施主机

| 组件 | 地址 | 备注 |
|---|---|---|
| Consul | `192.168.3.112:8500` | http，见上 |
| Postgres | `pg-dev.app.com`（192.168.3.109） | TLS `verify-ca`，CA 为 postgres-internal-root-ca |
| Redis (Dragonfly) | `dragonfly.app.com:443`（192.168.3.114） | TLS，`insecure_skip_verify` |
| Casdoor | node1 | JWT 公钥 kid=lens / public.pem |

凭据由 Config Center 管理，或向用户确认；不要从历史 Consul 导出恢复运行时 KV。

**`*.app.com` 域名只在开发机可解析**：这些不是真实公网记录（公网 DNS 返回的是
被污染的假 IP，如 <resolved-public-ip>），映射只存在于开发机本地 hosts。
由此产生两条硬约束（2026-08-07 部署 cart 时踩过）：

1. **Config Center 配置分环境**：`<svc>/dev/bootstrap.yaml` 用 `*.app.com` 域名，**只能在
   开发机跑**；`<svc>/pre/bootstrap.yaml` 全用集群内 svc 域名（`postgres-postgresql.postgres.svc`、
   `dragonfly.dragonfly.svc`、`consul-expose-servers.consul.svc:8500`、
   `otel-collector.observability:4318`），**k8s 部署必须用 pre**。
   拿错环境的症状：DB ping `context deadline exceeded` 起不来（dev.yml 进集群），
   或 Consul 注册超时但服务照常跑、网关路由不到（`consul.app.com` 解析到假 IP）。
2. **集群 CoreDNS 已补 hosts 映射**（pg-dev→192.168.3.109、dragonfly→192.168.3.114，
   kube-system/coredns ConfigMap 的 hosts 插件段）：这是给误用 dev.yml 的兜底，
   不是正路；`consul.app.com`/`otlp-http.app.com` 故意没加。

## 相关

- 网关 JWT 与 Casdoor 时钟偏移的坑见
  [`context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md`](../project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md)
