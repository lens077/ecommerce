---
name: local-env
layer: team
description: 本地后端服务和网关连接当前 Kubernetes 集群时使用的地址、TLS 与凭据约定
---

# 本地开发环境约定

> ⚠️ **本文件只记录主机名和端口，不记录任何凭据。**
> 用户名/密码/密钥只存在于 Config Center、Kubernetes Secret 和本地环境，不进仓库。

## ⚠️ 当前 `*.dev.test` 解析是断的

`/etc/resolver/dev.test` 与 `splitdns` 都把 `dev.test` 指向 `192.168.3.202`，
**这台机器不存在**（ping 100% 丢包）。查询因此穿透到公网 DNS，得到 NXDOMAIN。

```
Mac(220) → /etc/resolver/dev.test → 192.168.3.202（不存在）→ 超时 → 公网 NXDOMAIN
```

网关本身是好的——`curl --resolve <域名>:443:192.168.3.121` 能拿到 200。
**坏的只有名字到 IP 这一步**，不是网关、不是证书、不是路由。

绕开办法（二选一，都不改全局状态）：

```bash
curl --resolve argocd.dev.test:443:192.168.3.121 https://argocd.dev.test/   # 单次
# 或在 /etc/hosts 写死：192.168.3.121 argocd.dev.test grafana.dev.test ...
```

**真正的修复需要决定 dnsmasq 落在哪台机器上**（`infrastructure/dnsmasq-cluster-domains.conf`
仍是旧集群的记录：网关写成 `192.168.3.100`、节点写成 `.201/.202`，全部过期）。
这个决定尚未做出，本文不替你假定；改完记得把 `/etc/resolver/dev.test`、
`splitdns list` 与该 conf 三处一起改。

## Consul：按运行位置选择地址

本地进程连接 Consul 时，使用 LoadBalancer 地址：

```text
192.168.3.120:8500    # HTTP，consul-expose-servers
```

Kubernetes Pod 连接 Consul 时，使用集群内地址：

```text
consul-server.consul.svc:8500
```

`consul.dev.test` 通过共享网关提供 Consul UI，不是服务注册发现地址。
Consul 只用于服务注册发现，**不再存配置**（Consul KV 已退役）。

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
  （`/v1/catalog/services` → `{}`）。所以「注册看似成功、网关就是路由不到」时先确认 token。

## 配置加载：Config Center 是唯一来源

10 个服务的默认 `make dev` 都通过被忽略的 `configs/source.dev.yaml` 读取配置中心；selector
只负责自举，Consul 仍用于服务注册发现。配置中心键是 `<service>/dev/bootstrap.yaml`。
selector 缺失、token 无效或目标 key 不存在时服务直接启动失败；没有 `dev-consul` 或 KV 回退。

⚠️ 更隐蔽的失败模式（与配置**存放在哪**无关，问题出在解码器）：配置**存在但缺子块**时，
mapstructure 没开 `ErrorUnused`，多余键不报错、缺失键生成 nil-safe 的 getter ——
功能会被**静默关掉而不是启动失败**。原始实例踩在已退役的 Consul KV 上，
但同一个解码器现在读 Config Center，坑照样成立。见
[`context/project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md`](../project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)。

### ⚠️ `make dev` 现在连不上库

各服务的 `configs/dev.yml` 已切到集群内 svc 域名（`pg-main-rw.postgresql.svc`、
`dragonfly.dragonfly.svc`、`consul-server.consul.svc:8500`）。这些名字**只在 Pod 里解析得了**，
在 Mac 上直接跑 `make dev` 会 DNS 失败。

两条出路：

1. 用上表的 LAN 地址覆盖（`192.168.3.132:5432` / `192.168.3.122:6380` / `192.168.3.120:8500`）；
2. 干脆走内环开发，在集群身份下跑代码——见 [okteto-inner-loop.md](okteto-inner-loop.md)。

`cart/configs/dev.yml` 里还留着 `http://es.dev.test`，Elasticsearch 已退役，搜索走 Meilisearch。

## 基础设施主机

当前集群有 3 个节点：control plane `node101`（`192.168.3.101`）以及 worker
`node102`（`192.168.3.102`）和 `node103`（`192.168.3.103`），**全部 arm64，Ubuntu 26.04 LTS**。
3 个节点都允许调度工作负载。节点执行 `shutdown now` 时会进入最多 90 秒的优雅退出窗口；
机制、验证与终态 Pod 清理见 [node-graceful-shutdown.md](node-graceful-shutdown.md)。

| 组件 | 地址 | 备注 |
|---|---|---|
| 共享网关 | `192.168.3.121:80/443` | Cilium Gateway；HTTPRoute 按各自 hostname 接入 |
| Consul（发现） | 本地 `192.168.3.120:8500`；集群内 `consul-server.consul.svc:8500` | 已启用 ACL；token 从 Kubernetes Secret 或本地环境注入 |
| Dragonfly | 集群内 `dragonfly.dragonfly.svc:6379`；本地 `192.168.3.122:6380` | TLS-only，需 AUTH，明文被拒；CA 在 Secret `dragonfly-tls` |
| Casdoor | `https://casdoor.apikv.com` | **仍是集群外的外部服务**；JWT 公钥由各服务配置和 Config Center bootstrap 提供 |
| PostgreSQL（CNPG） | 集群内 `pg-main-rw.postgresql.svc:5432`；本地 `192.168.3.132:5432`（SNI `pg.dev.test`） | TLSRoute passthrough；数据库 `ecommerce`，owner=`app`；Secret `pg-main-app`，CA `pg-main-ca`；宿主客户端须 `verify-full` + direct TLS negotiation |
| Config Center | `config-center.config-center.svc:30010` | **跑的是 control-tower 的 config 镜像**，ns 名只是遗留标签；Web `https://config.app.com`，API `https://config-api.app.com` |
| 搜索 | Meilisearch（`search` ns），`search.dev.test` | Elasticsearch 已退役 |
| 消息 | NATS JetStream（`nats` ns，nats-0/1/2） | Kafka 已退役，零残留 |

> **网关与配置中心都由 control-tower 提供**（sibling 仓 `../control-tower`）。
> 旧 `gateway/` 目录和旧 config-center 都已不再运行，不要按「两个独立仓」来理解。

CNPG 的宿主网入口不做 TLS 终止，客户端直接校验 CNPG CA 和 `pg.dev.test`。libpq 17+
连接示例：

```bash
psql "host=pg.dev.test hostaddr=192.168.3.132 port=5432 dbname=ecommerce user=app \
  sslmode=verify-full sslnegotiation=direct sslrootcert=<pg-main-ca 的 ca.crt>"
```

局域网 DNS 当前没有 `pg.dev.test` 记录；`psql` 用上面的 `hostaddr` 直连 VIP，同时仍以
`host=pg.dev.test` 做 SNI 和证书校验。只支持单一 host 字段的 GUI 客户端需在宿主机增加
`192.168.3.132 pg.dev.test` 映射。VIP 来自 Cilium 地址池，集群重建后应重新查询 Gateway
status，不要永久假定 `.132`。

旧客户端不能发送 direct TLS ClientHello 时，不要降低 `sslmode`；改用 Kubernetes 仓
`components/postgres/examples/pg-tcproute.yaml` 的兼容入口。

### Pigsty 数据面（192.168.3.210）—— 已退役

该机 2026-08-19 停机并已下线，PostgreSQL / Redis / Kafka / Silo(MinIO) / Grafana
全部改由集群内组件承担（见上表）。不要再按它写配置或排查。

⚠️ 工作区 `pigsty-deploy/pigsty-redis-silo-kafka-deployment.md` 写的是**这台已退役的机器**
（ARM64、`192.168.3.210`、Kafka plaintext），且含明文口令。它不适用于下面的 node3，
读之前先看清 IP。

### node3（新 Pigsty，2026-08-24 盘点）—— 已部署，经 Pangolin 可达，业务侧尚未接线

另一台 Pigsty v4.5.0，ssh 别名 `node3`。它**不在家里的内网**，是一台 NAT 后的云主机。

| 项 | 值 |
|---|---|
| ssh | `node3` → `211.144.221.229:44172`，user `root` |
| 内网地址 | `10.10.21.172/24`（网关 `10.10.21.254`，与家里 `192.168.3.0/24` **不互通**） |
| 规格 | 4C / 7.3 GiB / 48 GiB（约 34 GiB 空闲），Ubuntu 26.04 LTS **x86_64** |
| 部署形态 | 全部 systemd 原生服务，**没有 docker 容器** |

已部署（全部 `active`）：

| 组件 | 端口 | 说明 |
|---|---|---|
| PostgreSQL 18.6 | `5432` | Patroni 管的 `pg-meta`；pgbouncer `6432`、HAProxy `5433/5434/5436/5438` |
| Redis 7 | `6379`、`6380` | 两个实例，需 AUTH |
| Kafka 4.x | `9092`(BROKER) `9095`(DEV) `9093`(CONTROLLER) | KRaft，**SCRAM-SHA-512**（不是旧机的 plaintext），已建 topic `ecommerce.events` |
| etcd | `2379/2380` | 给 Patroni 用 |
| Grafana | `3000` | 用户名 `admin` |
| VictoriaMetrics | `8428` | |
| VictoriaLogs | `9428` | |
| VictoriaTraces | `10428` | |
| vmalert / Alertmanager | `8880` / `9059` | |
| exporters | `9100/9101/9113/9115/9121/9308/9404/9630/9631/9854` | node/haproxy/nginx/blackbox/redis/kafka/jmx/pg/pgbackrest |

| Silo（MinIO 模块） | `9000` S3 / `9001` 控制台 | **2026-08-24 补装**（`./minio.yml -l minio`，`ok=34 changed=20 failed=0`）。TLS 自签，域名 `sss.pigsty`，数据在 `/data/minio`，已建桶 `pgsql` / `meta` / `data` |

Pigsty v4.5 保留 MINIO 模块名与剧本名，实际装的是 **Silo**（`silo.service`、`/usr/bin/silo`）。
补装时 `pigsty.yml` 里原本**没有 `minio` 分组**，需要先加（本次已加，备份见
`pigsty.yml.bak-20260824T095349Z`）：

```yaml
    minio:
      hosts: { 10.10.21.172: { minio_seq: 1 } }
      vars:
        minio_cluster: minio
        minio_type: silo
        minio_data: /data/minio
        minio_users: []
```

⚠️ **Silo 还没有对外入口**：`9000/9001` 只在 node3 本机可达，Pangolin 里还没建对应资源，
所以集群和本机都还连不上它。要建的资源见下面「怎么连」表格后的说明。

已为本项目预建账号：数据库 `ecommerce`、用户 `app`、Kafka 用户 `ecommerce_app`。
但 `ecommerce` 库**目前只有 1 张表 `monitor.heartbeat`**，是空库，没有迁过业务数据。

#### 凭据位置（**只记路径，值不入库**）

| 内容 | 位置 |
|---|---|
| redis / kafka / pg 应用账号 | `node3:/root/pigsty-deploy/.credentials-extra`（0600） |
| Grafana admin、pg_admin、patroni、haproxy 等 | `node3:/root/pigsty-deploy/pigsty.yml` |
| Newt 站点凭据 | `node3:/opt/newt/config.json` |

VictoriaMetrics / VictoriaLogs / VictoriaTraces / vmalert / Alertmanager **当前无登录密码**。

#### 怎么连：全部经 node1 的 Pangolin（2026-08-24 实测通）

node3 自己的公网只开 SSH `44172`（`80/443` 被云厂商安全组挡在 ufw 之上），
`10.10.21.0/24` 也和家里 `192.168.3.0/24` 不互通、机器上没有 VPN。
**所有访问都走 node1 的 Pangolin 隧道**（node3 上 newt 站点 `node3`，siteId 7，online）。

HTTP 类走域名 + 443（Traefik SNI）：

| 服务 | 入口 | 实测 |
|---|---|---|
| Grafana | `https://node3-grafana.apikv.com` | 301（跳登录，用户名 `admin`） |
| VictoriaMetrics | `https://node3-metrics.apikv.com` | 200 |
| VictoriaLogs | `https://node3-logs.apikv.com` | 200 |
| VictoriaTraces | `https://node3-traces.apikv.com` | 200 |
| vmalert | `https://node3-vmalert.apikv.com` | 200 |
| Alertmanager | `https://node3-alerts.apikv.com` | 200 |

TCP 类走 **node1 `114.132.233.129`** 的 raw 端口（Pangolin siteResource → gerbil WireGuard → newt）：

| 服务 | 入口 | 实测 |
|---|---|---|
| PostgreSQL | `114.132.233.129:30001` | `select current_database(),current_user` → `ecommerce\|app`，PG 18.6 |
| Redis | `114.132.233.129:30002` | `AUTH` → `+OK`，`PING` → `+PONG`，7.2.15 |
| Kafka | `114.132.233.129:30004` | ApiVersions 正常应答 |

> 排查提示：这三个端口不是常规端口号，`nc 211.144.221.229 5432` 这种探法**永远是 filtered**，
> 会让人误判成「没通路」。要测就测 node1 的 `30001/30002/30004`，域名要带 `node3-` 前缀。

**Silo 的入口还没建。** 参照 node2 minio 那条资源（Pangolin resourceId 16 → target
`127.0.0.1:9000` method `https`），node3 要加的是同形状的一条：站点 `node3`（siteId 7）、
target `127.0.0.1:9000`、method `https`、域名 `node3-minio.apikv.com`。
两个注意点：

- Pangolin 里**一个 API key 都没有**（`apiKeys` 表 0 行），只能在面板
  `https://pangolin.apikv.com` 里手工建，或先建一个 API key 再走 API。
- Silo 的证书是 Pigsty 自签、CN/SAN 为 `sss.pigsty`，**不是** `*.apikv.com`。
  Traefik 回源时要么设 `tlsServerName: sss.pigsty` 并信任 Pigsty CA，要么跳过校验。
  node2 那条不需要这一步是因为它挂的是 ZeroSSL 泛域名证书——**别照抄它的配置**。

#### ⚠️ 切过去之前必须先解决的两件事

**一、Redis 是明文，且暴露在公网。** 两个实例（`6379`/`6380`）的配置里都只有 `port`，
没有 `tls-port` 和 `tls-cert-file`——**没开 TLS**。而 `30002` 监听 `0.0.0.0`，于是
「客户端 → node1:30002」这一段是**公网明文**，`AUTH` 口令和全部缓存数据都在明文里跑。
（node1 → node3 那一段被 gerbil 的 WireGuard 保护，问题只在第一段。）
这跟集群内 Dragonfly 的 **TLS-only、明文直接拒绝** 是反过来的，属于安全降级，
切之前要么给 node3 Redis 开 TLS，要么把 `30002` 收窄到固定来源 IP。

PostgreSQL 没有这个问题：`30001` 对 SSLRequest 回 `S`，客户端用 `sslmode=require`
及以上就是端到端加密。Kafka 用 SCRAM-SHA-512，口令不过明文，但载荷仍未加密。

**二、`ecommerce` 库是空的。** 只有一张 `monitor.heartbeat`，业务数据还在集群的 CNPG 里。
切 PG 是一次**数据迁移**，不是改连接串。

### OpenBao 自动解封

`node101` 上的 `openbao-auto-unseal.timer` 每 60 秒检查一次 OpenBao。OpenBao sealed 时，
`openbao-auto-unseal.service` 读取 `/var/lib/k8s-installer/creds/openbao-init` 并执行解封。
这套方案满足无人值守重启，但 unseal key 与集群管理权限位于同一信任域。它不能替代外部 KMS
或独立 Transit auto-unseal；生产环境迁移到独立信任根后应移除该 timer。

### ⚠️ 集群节点拉镜像依赖**这台 Mac 上的代理**

节点的 containerd 配了 `http-proxy = 192.168.3.220:7890`，而 **192.168.3.220 就是开发用的这台 Mac**
（FlClash 的混合端口）。**Mac 关机或代理没开 → 全集群拉不了任何新镜像**，
症状是 `ImagePullBackOff` + `proxyconnect tcp: dial tcp 192.168.3.220:7890: connect: connection refused`
—— 很容易误判成「私有仓凭据不对」（2026-08-19 实测踩过，当时 TCR 凭据完全正常）。

判据：报错里出现 `proxyconnect` 就是代理问题，与 registry 凭据无关。
已在集群里跑着的 Pod 不受影响（只在拉镜像时才走代理）。

**这是个真实的单点**：把开发机当集群的镜像出口，笔记本合盖就等于集群失去发布能力。
要去掉这个依赖，得给节点配 registry mirror（`certs.d`，与代理无关）或让节点直连。
集群已装 `spegel`（镜像 P2P 分发），能缓解重复拉取，但首拉仍要出网。

## 集群已装、但文档里一直没写的能力

这些 namespace 都活着。**做选型或排查前先看这里，别现搜**——
按 [tech-selection.md](tech-selection.md) 的规则，它们也应登记进 `.service-matrix.yaml` / `docs/TECH-RADAR.md`。

| 方向 | 组件 |
|---|---|
| 证书与密钥 | `cert-manager`、`trust-system`(trust-manager)、`external-secrets`、`openbao`(Vault 系) |
| 策略与授权 | `openfga`、`kyverno` |
| 弹性与发布 | `keda`、`argo-rollouts`、`argocd` |
| 网络 | Cilium Gateway API（`cilium-gateway` 192.168.3.121:80/443）、`cilium-secrets` |
| 存储与镜像 | `openebs`、`cnpg-system`、`spegel` |
| 可观测 | `victoriametrics`(vm-single)、`observability`(grafana + jaeger)、`logging`(loki) |

内网域名（HTTPRoute）：`argocd.dev.test`、`consul.dev.test`、`grafana.dev.test`、
`jaeger.dev.test`、`logs.dev.test`、`metrics.dev.test`、`search.dev.test`、
`cart-api.dev.test`、`config-api.app.com`、`config.app.com`。

### 地址分段

| 段 | 范围 | 用途 |
|---|---|---|
| DHCP | `192.168.3.2-20` | 路由器动态分配 |
| Cilium LB 池 | `192.168.3.100-199` | `CiliumLoadBalancerIPPool/default-pool` |
| 静态 | `.101` `.102` `.103` `.220` | node101 / node102 / node103 / Mac |

**新增静态地址前先确认不落在上面两段内**。2026-08-18 之前 DHCP 段覆盖了整个 LB 池，
`192.168.3.100` 被局域网其他设备（随机化 MAC）抢占过，表现为 ping 通但延迟数百毫秒、
80/443 全闭；把 DHCP 收窄到 `2-20` 后已解决。

### TLS 信任

网关证书由集群自签根 CA `my-global-root-ca` 签发。该根 CA 已导入 Mac 系统钥匙串
（2026-08-18），`curl https://<域名>` 无需 `-k` 即可通过校验。新机器需重新导入：

```bash
kubectl get secret global-root-ca-secret -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > /tmp/global-root-ca.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/global-root-ca.crt
```

凭据由 Config Center 管理，或向用户确认；不要从历史 Consul 导出恢复运行时 KV。

### `*.dev.test` 只在开发机可解析

`.test` 是 RFC 6761 保留的测试用顶级域，公网 DNS 不解析（2026-08-18 由 `app.com` 迁移而来；
旧域名是真实注册域名，公网会解析到无关的真实 IP，这正是换成 `.test` 的原因）。
当前解析链的断点见本文开头。由此产生两条硬约束（2026-08-07 部署 cart 时踩过）：

1. **Config Center 配置分环境**：`<svc>/dev/bootstrap.yaml` 用 `*.dev.test` 域名，**只能在
   开发机跑**；`<svc>/pre/bootstrap.yaml` 全用集群内 svc 域名（`pg-main-rw.postgresql.svc`、
   `dragonfly.dragonfly.svc`、`consul-server.consul.svc:8500`、
   `otel-collector.observability:4318`），**k8s 部署必须用 pre**。
   拿错环境的症状：DB ping `context deadline exceeded` 起不来（dev.yml 进集群），
   或 Consul 注册超时但服务照常跑、网关路由不到。
2. **新集群的 CoreDNS 尚未补 hosts 映射**（旧集群曾为 pg-dev/dragonfly 加过兜底）。
   误把 dev.yml 用进集群会直接解析失败，而不是走兜底 —— 这样更早暴露问题。

## 相关

- 网关 JWT 与 Casdoor 时钟偏移的坑见
  [`context/project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md`](../project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md)
