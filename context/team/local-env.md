---
name: local-env
layer: team
description: 本地跑后端服务/网关时连本地 k8s 集群的地址约定；Consul 用 192.168.3.112:8500
---

# 本地开发环境约定

> ⚠️ **本文件只记录主机名和端口，不记录任何凭据。**
> 用户名/密码/密钥一律只存在于 Consul KV 和本地环境变量里，不进仓库。

## Consul：用 IP，不要用域名

本地跑后端服务 / 网关连本地 k8s 集群时，Consul 地址是：

```
192.168.3.112:8500    (http)
```

这也是 `gateway/Makefile` 的 `dev` target 在用的（`CONSUL_ADDR=consul://192.168.3.112:8500`）。

**陷阱**：主机名 `consul.app.com`（/etc/hosts 指向 `192.168.3.110:8500`）从宿主机访问会**超时**。

所以凡是 Makefile 里硬编码了 `CONSUL_ADDR=consul.app.com` 的服务（例如 `backend/services/config/Makefile`），**从宿主机跑时必须覆盖成 `192.168.3.112:8500`**。

## 配置加载：Consul KV 是启动前置条件

每个服务启动时从 Consul KV 加载**整份 Bootstrap 配置**：

```
ecommerce/<service>/dev.yml
```

**这个 key 不存在，服务就起不来。** 新增服务时第一件事是上传它的 KV，不是写代码。

⚠️ 更隐蔽的失败模式：KV **存在但缺子块**时，配置解码用的 mapstructure 没开 `ErrorUnused`，多余键不报错、缺失键生成 nil-safe 的 getter —— 功能会被**静默关掉而不是启动失败**。踩过的实例见
[`context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md`](../project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)。

## 基础设施主机

| 组件 | 地址 | 备注 |
|---|---|---|
| Consul | `192.168.3.112:8500` | http，见上 |
| Postgres | `pg-dev.app.com`（192.168.3.109） | TLS `verify-ca`，CA 为 postgres-internal-root-ca |
| Redis (Dragonfly) | `dragonfly.app.com:443` | TLS，`insecure_skip_verify` |
| Casdoor | 114.132.233.129 | JWT 公钥 kid=lens / public.pem |

凭据去 Consul KV 对应的 `dev.yml` 里取，或问用户。

## 相关

- 网关 JWT 与 Casdoor 时钟偏移的坑见
  [`context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md`](../project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md)
