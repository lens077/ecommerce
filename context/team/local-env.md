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
| PostgreSQL（当前 node3 Pigsty） | `node1:30001` | 10 个业务服务当前使用，`sslmode=verify-ca`；CNPG `pg-main` 已 hibernate，只是保留数据的回切候选 |
| Config Center | `config-center.config-center.svc:30010` | **跑的是 control-tower 的 config 镜像**，ns 名只是遗留标签；Web `https://config.app.com`，API `https://config-api.app.com` |
| 搜索 | Meilisearch（`search` ns），`search.dev.test` | Elasticsearch 已退役 |
| 消息 | 当前 NATS JetStream（`nats` ns，nats-0/1/2）；Kafka 学习入口 `node1:30004` | NATS 仍承载搜索链；Kafka 已重新纳入目标栈但本仓 used_by 为空，生产目标另建 Strimzi/KRaft 私网拓扑 |

> **网关与配置中心都由 control-tower 提供**（sibling 仓 `../control-tower`）。
> 旧 `gateway/` 目录和旧 config-center 都已不再运行，不要按「两个独立仓」来理解。

当前 PostgreSQL 经 node1 Pangolin TCP 入口访问 node3 Pigsty：`node1:30001`。业务配置使用 `sslmode=verify-ca`；CA 与账号从 Config Center/Kubernetes Secret 或本地环境注入，不在本文给出。CNPG 的 `192.168.3.132:5432` 入口只属于 hibernate 回切候选，取消 hibernate 并完成数据回切前不得作为当前配置。

### Pigsty 数据面（192.168.3.210）—— 已退役

该旧机 2026-08-19 停机并已下线；当时组件曾迁回集群，之后 PostgreSQL 与可观测数据面又切到下面的新 node3。不要把旧机 `192.168.3.210` 与当前 node3 混为一谈。

工作区 `pigsty-deploy/pigsty-node3-deployment.md` 记的是下面这台 node3 的部署实录。

### node3（新 Pigsty，2026-08-24/27 盘点）—— PG 与可观测已接线，Kafka 仅 PoC 入口

另一台 Pigsty v4.5.0，ssh 别名 `node3`。它**不在家里的内网**，是一台 NAT 后的云主机。

| 项 | 值 |
|---|---|
| ssh | `node3` → `node3:44172`，user `root` |
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

Silo S3 入口已建为 `https://node3-minio.apikv.com`，但业务当前对象 endpoint 仍是 node2 Silo/MinIO-compatible 路径；迁移和备份验收完成前不能把 node3 Silo 写成业务真相。

已为本项目预建数据库 `ecommerce`、用户 `app`、Kafka 用户 `ecommerce_app`。PG 已完成业务全量迁移并成为当前主库；Kafka 只有预建账号/topic；本仓已有未部署的 producer Adapter，但没有业务 producer/consumer。

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

TCP 类走 **node1 `node1`** 的 raw 端口（Pangolin siteResource → gerbil WireGuard → newt）：

| 服务 | 入口 | 实测 |
|---|---|---|
| PostgreSQL | `node1:30001` | `select current_database(),current_user` → `ecommerce\|app`，PG 18.6 |
| Redis | `node1:30002` | `AUTH` → `+OK`，`PING` → `+PONG`，7.2.15 |
| Kafka | `node1:30004` | ApiVersions 正常应答 |

> 排查提示：这三个端口不是常规端口号，`nc node3 5432` 这种探法**永远是 filtered**，
> 会让人误判成「没通路」。要测就测 node1 的 `30001/30002/30004`，域名要带 `node3-` 前缀。

**Silo 入口已建**（2026-08-24，Pangolin resourceId 29）：`https://node3-minio.apikv.com`
→ 站点 `node3`(siteId 7) → target `127.0.0.1:9000` method `https`。
实测 `/minio/health/live` 200、`/` 返回 S3 的 `AccessDenied` XML 且响应头 `server: Silo`。

建的时候有三个坑：

- **`tlsServerName` 必须设成 `sss.pigsty`**。Silo 用的是 Pigsty 自签证书，
  CN/SAN 都是 `sss.pigsty` 而非 `*.apikv.com`，不设的话 Traefik 回源校验过不去。
  node2 minio 那条不需要这步是因为它挂 ZeroSSL 泛域名证书——**别照抄它的配置**。
- **必须关掉 SSO**（`sso: false`）。默认开着，S3 客户端拿不到 302 跳转的登录页，
  症状是所有请求都返回 302。
- **Pangolin API 有个静态 CSRF 门槛**：所有非 GET 请求要带 `x-csrf-token: x-csrf-protection`
  （值就是这个字面量，见 `csrfProtectionMiddleware`），否则一律 403。
  登录走 `POST /api/v1/auth/login`，之后 `PUT /api/v1/org/main/resource` 建资源、
  `PUT /api/v1/resource/<id>/target` 挂 target、`POST /api/v1/resource/<id>` 改属性。
  ⚠️ `apiKeys` 表仍是 0 行，目前只能用面板管理员账号登录后调 API。

#### 加密现状

| 通路 | 状态 |
|---|---|
| PostgreSQL `30001` | 对 SSLRequest 回 `S`，客户端用 `sslmode=require` 及以上即端到端加密 |
| Redis `30002` | **2026-08-24 已上 TLS**（做法见下）。明文 `PING` 得空响应，TLS 1.3 握手后 `AUTH` → `+OK` |
| Kafka `30004` | SCRAM-SHA-512，口令不过明文，但载荷仍未加密 |

#### 给 node3 Redis 加 TLS（2026-08-24 实施，含为什么不用原生 TLS）

**Pigsty v4.5 的 redis 角色没有任何 TLS 变量**——`roles/redis/defaults/main.yml` 里
`redis_tls_*` 一个都没有，`files/pki/redis/` 是空目录，角色 tasks 里 grep 不到 cert/tls。
要走 Redis 原生 TLS，得改**四处 Pigsty 自带文件**：角色模板 `redis.conf`、
`redis_exporter_options`、`/infra/targets/redis/*.yml` 里的 `redis://` 前缀，
以及 infra 的 `/data/infra/prometheus.yml` 里 `^redis://(.*):(\d+)$` 那条 relabel 正则。
**每次 Pigsty 升级都会被覆盖**，所以没走这条路。

实际做法是外挂 TLS 终止器——一个 Pigsty 支持的变量 + 一个独立服务：

```text
客户端 ─TLS─> node1:30002 ─WireGuard─> newt ─> 127.0.0.1:6379 (stunnel) ─明文─> 10.10.21.172:6379 (redis)
```

1. **签证书**（用 Pigsty 自签 CA `files/pki/ca/ca.key`），SAN 必须含
   `redis.pigsty` / `node3` / `localhost` / `10.10.21.172` / `127.0.0.1`：

   ```bash
   openssl genrsa -out redis.key 2048
   openssl req -new -key redis.key -out redis.csr -config redis-san.cnf
   openssl x509 -req -in redis.csr -CA files/pki/ca/ca.crt -CAkey files/pki/ca/ca.key \
     -CAcreateserial -out redis.crt -days 3650 -extensions v3 -extfile redis-san.cnf
   ```

   装到 `/etc/redis/certs/`（属主 `redis`，key 权限 640）。

2. **把 `127.0.0.1:6379` 让给 stunnel**：`pigsty.yml` 的 `redis-ms` 组里
   `redis_bind_address: 0.0.0.0` → `10.10.21.172`，再 `./redis.yml -l redis-ms`。
   `redis_bind_address` **是 Pigsty 支持的变量，能存活重跑**——这是整个方案的关键。

3. **stunnel**：`/etc/stunnel/redis-tls.conf` 写 `accept = 127.0.0.1:6379`、
   `connect = 10.10.21.172:6379`、`cert` 指向 crt+key 合并的 pem（属主 `stunnel4`，600）、
   `sslVersionMin = TLSv1.2`。别忘了 `/etc/default/stunnel4` 里 `ENABLED=1`。

**为什么不用动 Pangolin**：它的 target 本来就是 `127.0.0.1:6379`，换成 stunnel 监听后
自动变 TLS，资源定义一个字都不用改（正好——那边没有 API key，本来也改不了）。

**为什么 exporter 和主从复制没坏**：两者连的都是 `10.10.21.172:6379/6380` 而非回环，
Redis 收到 LAN 地址后照常工作。实测 `master_link_status:up`、`connected_slaves:1`、
exporter `redis_up 1`。

⚠️ **仍未解决**：`10.10.21.172/24` 是 VPS 厂商的共享内网，而 ufw 放行了整个 `10.0.0.0/8`，
同网段其他租户理论上能明文摸到 6379/6380（有密码，但仍是暴露面）。
要收紧就把 ufw 对 6379/6380 的来源限制到 node3 自己。

#### 可观测已切到 node3（2026-08-24）

三条信号都已改推 node3，集群内不再写本地后端。改的是 **kubernetes 仓**两处：

| 信号 | 通路 | 改哪里 |
|---|---|---|
| metrics | otel collector → `node3-metrics.apikv.com/opentelemetry/v1/metrics` | `components/opentelemetry/{component.env,install.sh}` 的 `REMOTE_METRICS_URL` |
| traces | otel collector → `node3-traces.apikv.com/insert/opentelemetry/v1/traces` | 同上 `REMOTE_TRACES_URL` |
| 应用 OTLP 日志 | otel collector → `node3-logs.apikv.com/insert/opentelemetry/v1/logs` | 同上 `REMOTE_LOGS_URL` |
| **容器日志** | vector DaemonSet → `node3-logs.apikv.com/insert/jsonline?...` | `components/vector/values.yaml` 的 sink uri |

**为什么容器日志要单独改**：otel collector 只承载**应用侧 OTLP 日志**；容器日志走
vector / fluent-bit 这条 DaemonSet 通路，根本不经过 collector。只切 collector 的话
日志大头仍然落在内网，与「把观测负载挪出内网」的目的不符。

**路径里的 `/insert` 不能省**：VictoriaLogs 与 VictoriaTraces 的 OTLP 摄入路径带
`/insert` 前缀。实测 `node3-traces.apikv.com/opentelemetry/v1/traces` 返回 400，
带 `/insert` 的返回 200。用 otlphttp 的 `endpoint` 字段会被自动补成 `/v1/xxx` 而打错地方，
必须用 `metrics_endpoint` / `logs_endpoint` / `traces_endpoint` 给全路径。

实测验收：node3 上查到 `k8s.container.*` 等集群指标（⚠️ VictoriaMetrics 里**点号原样保留**，
查 `k8s_*` 是查不到的）、`service.name="behavior-service"` 的 span、
以及 argocd/consul/ecommerce/kube-system/logging/openebs/search 七个命名空间的容器日志。

#### 集群内可观测组件已删除（2026-08-24）

**不是 scale 0，是连 Helm release 和 PVC 一起删掉了**，回收约 23Gi：

| 组件 | ns | 处理 |
|---|---|---|
| grafana / jaeger | observability | helm uninstall + 删 PVC（grafana 5Gi、jaeger-badger 5Gi） |
| loki / vl-victoria-logs / fluent-bit | logging | helm uninstall + 删 PVC（vl 5Gi） |
| vm-single | victoriametrics | helm uninstall + 删 PVC（8Gi） |
| otel-collector | opentelemetry | helm uninstall（服务已直连 node3，它成了多余的一跳） |

**只剩 `vector` 一个 DaemonSet**——它是把容器日志送到 node3 的那条腿，删了日志就断。

#### ⚠️ 想恢复内网可观测：重装组件只是一半，另一半不做会得到一个空壳

删掉的是**消费端**（存储与 UI）。但「数据往哪发」由**生产端**决定，而生产端的配置全都改过，
重装消费端**不会**把它们改回来。三处都得改，缺一处就白装：

| # | 改哪里 | 现在指向 | 改回集群内 |
|---|---|---|---|
| 1 | kubernetes 仓 `components/opentelemetry/component.env` | `REMOTE_{METRICS,LOGS,TRACES}_URL` = node3 | 注释掉这三行 |
| 2 | kubernetes 仓 `components/vector/values.yaml` 的 sink `uri` | `node3-logs.apikv.com/insert/jsonline?...` | `http://vl-victoria-logs-single-server.logging.svc.cluster.local:9428/insert/jsonline?...` |
| 3 | **Config Center 里 10 服务 + 网关的 `observability.{trace,metric,log}.endpoint`** | `node3-otlp.apikv.com:443`，`tls.enable: true`（对端是 node3 上的 collector） | `otel-opentelemetry-collector.opentelemetry.svc:4318`，`tls.enable: false` |

**第 3 处最容易漏**：collector 现在根本不在链路上，服务是直连 node3 的。不改它的话，
就算 collector 重装了、`REMOTE_*_URL` 也清了，collector 依然收不到任何数据——没人往它发。

**第 1 处的坑在 `elif`**：`install.sh` 的判定是「`REMOTE_*_URL` 非空 → 推远端」
**`elif`**「集群内装了对应后端 → 推本地」。只要那三行还在，重装 collector 也只会往 node3 发。

失败时的症状是**沉默的**：后端全起来、Grafana 能打开、里面是空的，不报任何错。
与 `.freeze/` 恒绿门禁同一类问题——**装了不等于在工作，要验的是「它收到数据了吗」**。

完整恢复顺序：改 1、2、3 → 重跑
`components/{grafana,jaeger,loki,victoria-logs,victoriametrics,fluent-bit,opentelemetry}/install.sh`
→ 重启十个服务让它们重读配置 → **查一次集群内后端有没有真数据**再宣布恢复完成。

#### 服务 OTLP → node3 的 collector（2026-08-24）

十个业务服务 + 网关的 `observability.{trace,metric,log}.endpoint` 指向
`node3-otlp.apikv.com:443`（`tls.enable: true`），经 Pangolin（resourceId 30）
落到 node3 上的 **OTel Collector**（docker，`--network host`，监听 4317/4318），
再由它分发到本机三个 Victoria 后端。

```
服务 ─OTLP/HTTPS─> node3-otlp.apikv.com:443 ─Pangolin─> node3:4318 (otelcol)
                                                          ├─> 127.0.0.1:8428  VictoriaMetrics
                                                          ├─> 127.0.0.1:9428  VictoriaLogs
                                                          └─> 127.0.0.1:10428 VictoriaTraces
```

配置在 node3 的 `/etc/otelcol/config.yaml`，容器 `otelcol`
（`otel/opentelemetry-collector-contrib`，`--restart unless-stopped`，docker 已开机自启）。

**端点写 base，让 otlphttp 自己拼 `/v1/{signal}`**——这是唯一容易写错的地方，
因为三个后端的前缀并不一致：

| 后端 | exporter endpoint | 实际收到 |
|---|---|---|
| VictoriaMetrics | `http://127.0.0.1:8428/opentelemetry` | `/opentelemetry/v1/metrics`（**无** `/insert`） |
| VictoriaLogs | `http://127.0.0.1:9428/insert/opentelemetry` | `/insert/opentelemetry/v1/logs` |
| VictoriaTraces | `http://127.0.0.1:10428/insert/opentelemetry` | `/insert/opentelemetry/v1/traces` |

**为什么用 collector 而不是让服务直连后端**（一开始是直连 + nginx 改写 `/v1/*`，已废弃）：

1. 直连要在 nginx 上做路径改写才能对上三个不一致的前缀——多一层无谓转换，
   而 collector 天然就按 `/v1/{signal}` 收。
2. **直连没有批处理与重试**：公网隧道抖一下就直接丢数据。collector 有 `batch` 与导出队列。
3. 脱敏、采样、打标这类处理只能在 collector 做。

改端点时**不需要动服务配置**：`node3-otlp.apikv.com` 这个域名不变，只在 Pangolin 里
把 resource 30 的 target 从旧地址改到 `127.0.0.1:4318` 即可（改 target 要带 `siteId`，
否则报 `Invalid site ID`）。

⚠️ **容器日志不走这条链**：`vector` 推的是 jsonline 格式而非 OTLP，直接写
`node3-logs.apikv.com/insert/jsonline?...`。它不经过 collector，也不该经过。

##### OTLP 已强制鉴权（2026-08-27，匿名写入已关闭）

`node3-otlp` **不能挂 Pangolin SSO**（机器客户端过不了浏览器登录墙），鉴权因此落在 collector
自己这一层：`bearertokenauth/otlp` 扩展挂在 otlp receiver 的 grpc + http 两个协议上，
token 列表读 `/run/secrets/otel-tokens`（宿主 `/etc/otelcol/otel-tokens`，**每行一个**）。
无 token / 错 token 一律 **401**（三个信号实测）。

第一阶段三个身份（真相源 Vault `secret/observability/otlp`，仓库里只有引用）：

| 身份 | Vault key | 谁在用 | 怎么拿到 |
|---|---|---|---|
| Mac 本地 | `mac_default` | 本机 `make dev` 起的 10 服务 | `~/.config/apikv/otel.mk`（0600，仓库外），各服务 Makefile `-include` 它 |
| k8s 车队 | `k8s_ecommerce` | 集群里 10 服务 | ESO → Secret `otel-auth` → env（`helm/templates/otel-auth-externalsecret.yaml`） |
| 网关 | `gateway` | control-tower gateway | 同上，用 `OTEL_EXPORTER_OTLP_HEADERS_GATEWAY` 键 |

**应用代码零改动**：三个 exporter（trace/metric/log）原生认标准环境变量
`OTEL_EXPORTER_OTLP_HEADERS`，现有代码只显式设 endpoint/TLS，headers 位留给环境变量。
值的格式是 `Authorization=Bearer%20<token>`——**空格必须写 `%20`**（按 W3C baggage 规则解码），
写成真空格会被截断。

两个坑：

- **容器以 `10001:10001` 跑**，token 文件给 `0600 root` 会读不到（症状是启动即失败）。
  正确权限是 `0640 root:10001`。
- 该容器是**裸 `docker run`**（无 compose，`--network host`），加挂载必须 `docker rm -f` 后
  用等价参数重建；重建前先 `docker run --rm ... validate --config` 干跑校验配置。

k8s 的 env 都写了 `optional: true`：Secret 未就绪时退回匿名发送而不是 CrashLoop——但匿名现在
会被 collector 拒（401），表现为遥测丢失而非服务挂掉。集群回线后先确认 `otel-auth` 已 Synced。

**2026-08-27 集群回线后的落地实录（两个坑，都会让「看起来正常」但遥测全丢）**：

1. **`vault-approle` Secret 在集群重建后没有重新注入** → ESO 报 `unable to create client`，
   `ClusterSecretStore vault` 是 `InvalidProviderConfig/False`，`otel-auth` 压根没被创建。
   凭据在 node1 `/home/docker/vault/approle-eso.json`（`role_id`/`secret_id`），注入后
   `kubectl annotate clustersecretstore vault force-sync=$(date +%s) --overwrite` 触发重连，
   否则要等最长 7 分钟的 reconcile 周期——**别看日志时间戳就下结论，旧错误会误导判断**。
2. **ESO 的模板占位符会被 Helm 提前吃掉**：`{{ .k8s }}` 写在 helm 模板里，Helm 渲染阶段就当成
   自己的变量求值（空），ESO 拿到的是写死的 `Authorization=Bearer%20`。**Secret 照样
   `SecretSynced=True`，看起来一切正常，但 token 是空的**，所有 OTLP 会被判 401 静默丢弃。
   正确写法是 `{{ `"...{{ .k8s }}"` }}` 转义。判据：`kubectl get secret otel-auth -o
   jsonpath='{.data.OTEL_EXPORTER_OTLP_HEADERS}' | base64 -d | wc -c` 应约 **87**，只有 23 就是被吃了。

验收：node3 `docker logs otelcol` 无错误行；VictoriaMetrics 的 `service.name` 标签
列出 13 个服务；traces 时间戳持续推进。
⚠️ **查询时标签名带点**（`service.name` / `k8s.container.*`），不是下划线。

#### 网关 OTLP 端点已修（2026-08-24）

切日志后从 node3 的日志里直接看到网关在刷
`failed to send metrics to http://jaeger.observability.svc:4318/v1/metrics: 404`——
它把**指标**发到了 Jaeger 的 OTLP 端口，而 Jaeger 只收 trace。

值在 ConfigMap `control-tower-gateway-config` 的 `OTEL_EXPORTER_OTLP_ENDPOINT`，
已改为 `otel-opentelemetry-collector.opentelemetry.svc:4318`（OTLP 三种信号交给
collector 统一分流，不要直连某个后端），control-tower 仓 `deploy/dev/gateway/deployment.yaml`
同步改好。重启后实测该报错归零。

⚠️ 顺带发现**第二个坑**：control-tower 仓当前的 Deployment 清单里这个 env 是
`valueFrom configMapKeyRef ... optional: true` 且 ConfigMap 原值有问题，而网关代码是
`os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")` 且**空值 = 直接 no-op 不报错**——
也就是说这个 key 一旦缺失或拼错，网关的可观测会**静默关闭**，没有任何告警。
改这一项时务必回头看一眼 pod 里的实际环境变量。

#### PG 数据已迁移（2026-08-24），但服务尚未切过去

`ecommerce` 库原本只有 `monitor.heartbeat`，现已从 CNPG 全量迁入：
`pg_dump --no-owner --no-privileges --clean --if-exists` → 经 `30001` 灌进 node3。

验收：32 张表行数与源库**逐表一致**（node3 多出的 `monitor.heartbeat` 是它自己的）；
`config.entry` / `products.spus` / `products.sale_detail` / `products.skus` 四张表
内容 md5 完全相同。

⚠️ **对比时必须统一会话参数**：两边时区不同（CNPG `Etc/UTC`，node3 `Asia/Shanghai`），
不设 `set timezone='UTC'` 直接比 md5 会全部不一致——那是渲染差异，不是数据差异。
**这个时区差本身也是切流风险**：任何依赖会话时区而非显式 UTC 的代码，切过去行为会变。

#### PG 已切流（2026-08-24）—— 业务库走 node3，Config Center 留在 CNPG

10 个业务服务的 `data.database.postgres` 已改指 `node1:30001`，经 Config Center
`PutKey` 下发。实测 13/13 Deployment 就绪，node3 上 70 个连接，网关读商品详情
（`GetProductDetail spuCode=iphone-15-pro`）返回真实数据。

**刻意没有一起搬的是 `config` schema**：Config Center 仍连 CNPG（残留 8 个连接）。
理由是它是 10 个服务的 bootstrap 来源——它要是也依赖 node3，隧道一断整个平台起不来。
业务库挪走已经拿到了绝大部分收益，把控制面也押上去不划算。

改的时候踩到三个坑，都值得记：

1. **整块替换 `postgres:` 会把 `pool:` 一起吃掉**。该块里 `tls.ca_pem` 之后还有
   `pool:`（`ping_timeout` / `max_conns` / `min_conns` / …），漏掉它的直接后果是
   `NewPostgresPool` 空指针 panic、服务 CrashLoopBackOff。**只改需要改的行，别整块换**。
2. **`ssl_mode` 必须降到 `verify-ca`，不能用 `verify-full`**。经隧道是以 IP
   `node1` 连接，而 node3 的 PG 证书 `CN=pg-meta-1`、SAN 只有
   `localhost / pg-meta / pg-meta-1 / 127.0.0.1 / 10.10.21.172`，主机名对不上。
   `verify-ca` 仍校验 CA 且全程加密，只是不校验主机名。CA 用 node3 的 `/etc/pki/ca.crt`。
3. **时区差其实已经被配置挡掉了**：`data.database.postgres.timezone` 本来就显式写着
   `Asia/Shanghai`，与 node3 服务端时区一致，所以之前担心的 UTC/上海渲染差异不成立。
   前提是这一行别删。

回滚：把 `host/port/password/ssl_mode/ca_pem` 五项改回 `pg-main-rw.postgresql.svc:5432`
与 CNPG 的 CA 即可，`pool:` 不动。Config Center 有 revision 历史可查。

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
**Config Center 也已切到 node3，CNPG 已 hibernate**（2026-08-24 补做）。切它之前必须先
把 `config` schema 重新同步一遍——PG 切流之后所有 `PutKey` 写的都是 CNPG，node3 上那份
是切流前的旧数据，**直接切会把十个服务的配置悄悄退回指向 CNPG**。手顺：

```bash
kubectl exec -n postgresql pg-main-1 -c postgres -- \
  pg_dump -U postgres -d ecommerce --schema=config --no-owner --no-privileges --clean --if-exists \
  | <灌进 node3:30001>
# 再改 secret config-center-bootstrap 的 config.yaml（host/port/password/ssl_mode/ca_pem）
kubectl annotate cluster pg-main -n postgresql cnpg.io/hibernation=on --overwrite
```

Config Center 自己**不从 Config Center 读配置**（`CONFIG_FILE` 指向本地文件，由 secret
挂载），所以没有先有鸡还是先有蛋的问题。

⚠️ **`outbox-relay` 会被 NetworkPolicy 挡住**。只有 `outbox-relay` / `search-indexer` /
`product-seed` / `search-reindex` 这几个 tool 带 NetworkPolicy，里面只放行了 `postgresql`
命名空间的 5432。库搬到集群外之后，egress 白名单必须补一条
`ipBlock: <node1-source-cidr>` + `port 30001`，否则症状是 **`connect: connection timed out`**
而不是拒绝——十个业务服务全好、唯独 relay 起不来，很容易误判成隧道不稳。
已在 `backend/tools/outbox-relay/deploy/dev/deployment.yaml` 补好。


