---
name: local-env
layer: team
description: 本地跑后端服务/网关时连本地 k8s 集群的地址约定；开发域名后缀 dev.test，Consul 用 192.168.3.102:8500
---

# 本地开发环境约定

> ⚠️ **本文件只记录主机名和端口，不记录任何凭据。**
> 用户名/密码/密钥只存在于 Config Center、Kubernetes Secret 和本地环境，不进仓库。

## Consul：用 IP，不要用域名

本地跑后端服务 / 网关连本地 k8s 集群时，Consul 地址是：

```
192.168.3.102:8500    (http，consul-expose-servers LoadBalancer)
```

**陷阱**：`consul.dev.test` 解析到共享网关 `192.168.3.100`，走的是 HTTPRoute（UI/HTTP），
**不是 8500 的服务发现端口**。服务注册发现必须用上面的 LB 地址，或用
`consul-api.dev.test`（dnsmasq 中已指向 192.168.3.102）。

`gateway/Makefile` 的 `dev` target 里的 `CONSUL_ADDR` 若仍写旧地址，从宿主机跑时必须覆盖。
独立 `config-center` 从本地 `CONFIG_FILE` 自举；Consul 仅用于服务发现。

### 2026-08-18 起 Consul 开了 ACL，本地跑服务必须带 token

集群 Consul 已开 `acl.enabled + default_policy=deny`（8500 暴露在局域网，不开等于任何人可注销别人的服务）。
影响面只有注册发现，配置加载不受影响（配置早已在 Config Center）。

- **环境变量是 `CONSUL_HTTP_TOKEN`，不是 `CONSUL_TOKEN`**。`backend/constants/env.go` 里的
  `EnvConsulToken = "CONSUL_TOKEN"` 只是个未被 registry 读取的声明；`registry/consul.go` 构造
  `api.Config` 时不设 `Token`，而 `api.NewClient` 会回落到 `CONSUL_HTTP_TOKEN`（consul/api v1.34.2
  `api.go:35,796`）。所以零改码，导出这个环境变量即可。
- token 取值位置（**不写进本文件、不入库**）：

  ```bash
  export CONSUL_HTTP_TOKEN=$(kubectl -n consul get secret consul-ecommerce-token \
    -o jsonpath='{.data.CONSUL_HTTP_TOKEN}' | base64 -d)
  ```

- 该 token 绑定 policy `ecommerce-services`：`service_prefix "" = write`（注册/注销/TTL 心跳）
  + `node_prefix "" = read`（发现）。**不含 KV 权限**（读 KV 会 403，符合预期）。
- 不带 token 的症状**不是报错而是查不到**：写操作 403，读操作返回 200 但结果被 ACL 过滤成空
  （`/v1/catalog/services` → `{}`）。所以"注册看似成功、网关就是路由不到"时先确认 token。

## 配置加载：Config Center 是唯一来源

10 个服务的默认 `make dev` 都通过被忽略的 `configs/source.dev.yaml` 读取配置中心；selector
只负责自举，Consul 仍用于服务注册发现。配置中心键是 `<service>/dev/bootstrap.yaml`。
selector 缺失、token 无效或目标 key 不存在时服务直接启动失败；没有 `dev-consul` 或 KV 回退。

⚠️ 更隐蔽的失败模式（与配置**存放在哪**无关，问题出在解码器）：配置**存在但缺子块**时，
mapstructure 没开 `ErrorUnused`，多余键不报错、缺失键生成 nil-safe 的 getter —— 功能会被**静默关掉而不是启动失败**。原始实例踩在已退役的 Consul KV 上，但同一个解码器现在读 Config Center，坑照样成立。见
[`context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md`](../project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)。

## 基础设施主机

集群于 2026-08 重建，节点为 node1 `192.168.3.201` / node2 `192.168.3.202`（control-plane）。

| 组件 | 地址 | 备注 |
|---|---|---|
| 共享网关 | `192.168.3.100`:80/443 | Cilium Gateway，全部 HTTPRoute 挂这里；证书 `*.dev.test` |
| Consul（发现） | `192.168.3.102:8500` | LoadBalancer，见上 |
| Redis (Dragonfly) | `192.168.3.101:6379` | **纯 TCP，无 TLS**；需 AUTH（`dragonfly-password-secret`） |
| Casdoor | 114.132.233.129 | JWT 公钥 kid=lens / public.pem |
| Postgres | **未部署** | `cnpg-system` 只有 operator，没有 Cluster 实例 |
| 搜索 | Meilisearch（`search` ns） | Elasticsearch 已退役，见 TODO.md 的迁移项 |

### Pigsty 数据面（192.168.3.210）

PostgreSQL、Redis、Kafka、Silo(MinIO) 与 Grafana 由 Pigsty v4.5 部署在 `192.168.3.210`，
不在 k8s 集群内。部署记录与凭据在 `../pigsty-deploy/`（不入库）。

| 服务 | 地址 | TLS | 备注 |
|---|---|---|---|
| PostgreSQL | `192.168.3.210:5432` | ✅ verify-full | 集群 pg-meta，PG 18.6，库 `ecommerce`，用户 `dbuser_meta` |
| PgBouncer | `192.168.3.210:6432` | ❌ | 连接池，**不支持 SSL**（实测 SSLRequest 返回 N） |
| Redis | `192.168.3.210:6379` | ❌ | redis-main，requirepass，ACL 用户 `default` |
| Kafka | `192.168.3.210:9092` | ❌ | kf-dev，plaintext 无鉴权；ecommerce 尚未接线 |
| Silo(MinIO) | `192.168.3.210:9000` | ✅ | bucket 为 `pgsql`/`meta`/`data`，**不含 ecommerce 业务桶** |
| Grafana | `192.168.3.210:3000` | ❌ | Pigsty 自带监控，与 k8s 的 grafana.dev.test 是两套 |

**TLS 现状**（2026-08-18 实测）：

- PG 与 Silo 的证书由 Pigsty 自签 CA 签发（`O=pigsty, OU=ca, CN=pigsty-ca`），
  可从 `http://192.168.3.210/ca.crt` 获取。两张证书的 SAN 都含 `IP:192.168.3.210`，
  因此可以直接用 IP 走 `verify-full`，无需为它们加 DNS 记录。
- **Redis 与 Kafka 无法加 TLS**：Pigsty v4.5 的 redis role 没有 TLS 参数（实例 conf 里
  `tls-port` 全是注释状态），`kafka_security` 只有 `plaintext | scram` 两个取值（`scram`
  是 SASL 认证，不是加密）。手改配置文件会被下次 `redis.yml` / `kafka.yml` 覆盖。
  要加密只能换部署方式或在前面加 TLS 代理。

### 地址分段（三段互不重叠，2026-08-18 起）

| 段 | 范围 | 用途 |
|---|---|---|
| DHCP | `192.168.3.2-20` | 路由器动态分配 |
| Cilium LB 池 | `192.168.3.100-199` | `CiliumLoadBalancerIPPool/default-pool` |
| 静态 | `.201` `.202` `.220` | node1 / node2 / Mac |

**新增静态地址前先确认不落在上面两段内**。2026-08-18 之前 DHCP 段覆盖了整个 LB 池，
`192.168.3.100` 被局域网其他设备（随机化 MAC）抢占过，表现为 ping 通但延迟数百毫秒、
80/443 全闭；把 DHCP 收窄到 `2-20` 后已解决。

网关不通时可用 NodePort 绕开 LB 层定位问题：
`curl -H "Host: <域名>" http://192.168.3.201:31753/`（https 为 31825）。

### TLS 信任

网关证书由集群自签根 CA `my-global-root-ca` 签发。该根 CA 已导入 Mac 系统钥匙串
（2026-08-18），`curl https://<域名>` 无需 `-k` 即可通过校验。新机器需重新导入：

```bash
kubectl get secret global-root-ca-secret -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > /tmp/global-root-ca.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/global-root-ca.crt
```

凭据由 Config Center 管理，或向用户确认；不要从历史 Consul 导出恢复运行时 KV。

**`*.dev.test` 域名只在开发机可解析**。`.test` 是 RFC 6761 保留的测试用顶级域，公网 DNS
不解析。解析链路（2026-08-18 由 `app.com` 迁移而来；旧域名是真实注册域名，公网会解析到
无关的真实 IP，这正是换成 `.test` 的原因）：

```
Mac(220) → /etc/resolver/dev.test → 192.168.3.202 的 dnsmasq → 应答
```

dnsmasq 有两份配置：`dev-domains.conf` 把 `*.dev.test` 通配到宿主机 192.168.3.220；
`cluster-domains.conf` 为集群服务写**具体记录**覆盖该通配（具体记录优先于通配）。
新增集群域名时必须往后者加记录，否则会被通配吸到宿主机。
部署步骤见 blog 仓 `docs/操作系统/Linux/macOS分域名DNS解析部署.md`。
由此产生两条硬约束（2026-08-07 部署 cart 时踩过）：

1. **Config Center 配置分环境**：`<svc>/dev/bootstrap.yaml` 用 `*.dev.test` 域名，**只能在
   开发机跑**；`<svc>/pre/bootstrap.yaml` 全用集群内 svc 域名（`postgres-postgresql.postgres.svc`、
   `dragonfly.dragonfly.svc`、`consul-expose-servers.consul.svc:8500`、
   `otel-collector.observability:4318`），**k8s 部署必须用 pre**。
   拿错环境的症状：DB ping `context deadline exceeded` 起不来（dev.yml 进集群），
   或 Consul 注册超时但服务照常跑、网关路由不到（`consul.dev.test` 解析到假 IP）。
2. **新集群的 CoreDNS 尚未补 hosts 映射**（旧集群曾为 pg-dev/dragonfly 加过兜底）。
   误把 dev.yml 用进集群会直接解析失败，而不是走兜底 —— 这样更早暴露问题。

## 相关

- 网关 JWT 与 Casdoor 时钟偏移的坑见
  [`context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md`](../project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md)
