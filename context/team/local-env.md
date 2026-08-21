---
name: local-env
layer: team
description: 本地后端服务和网关连接当前 Kubernetes 集群时使用的地址、TLS 与凭据约定
---

# 本地开发环境约定

> ⚠️ **本文件只记录主机名和端口，不记录任何凭据。**
> 用户名/密码/密钥只存在于 Config Center、Kubernetes Secret 和本地环境，不进仓库。

## Consul：按运行位置选择地址

本地进程连接 Consul 时，使用 LoadBalancer 地址：

```text
192.168.3.120:8500    # HTTP，consul-expose-servers
```

Kubernetes Pod 连接 Consul 时，使用集群内地址：

```text
consul-server.consul.svc:8500
```

`consul.dev.test` 通过共享网关提供 Consul UI，不是服务注册发现地址。独立的 Config Center
从本地 `CONFIG_FILE` 自举；Consul 只用于服务注册发现。

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

当前集群有 3 个节点：control plane `node101`（`192.168.3.101`）以及 worker
`node102`（`192.168.3.102`）和 `node103`（`192.168.3.103`）。3 个节点都允许调度工作负载。
节点执行 `shutdown now` 时会进入最多 90 秒的优雅退出窗口；机制、验证与终态 Pod 清理见
[node-graceful-shutdown.md](node-graceful-shutdown.md)。

| 组件 | 地址 | 备注 |
|---|---|---|
| 共享网关 | `192.168.3.121:80/443` | Cilium Gateway；HTTPRoute 按各自 hostname 接入 |
| Consul（发现） | 本地 `192.168.3.120:8500`；集群内 `consul-server.consul.svc:8500` | 已启用 ACL；token 从 Kubernetes Secret 或本地环境注入 |
| Dragonfly | 集群内 `dragonfly.dragonfly.svc:6379`；本地 `192.168.3.122:6380` | TLS-only，需 AUTH；CA 在 Secret `dragonfly-tls` |
| Casdoor | `https://casdoor.apikv.com` | JWT 公钥由各服务配置和 Config Center bootstrap 提供 |
| PostgreSQL（CNPG） | `pg-main-rw.postgresql.svc:5432` | 数据库 `ecommerce`，owner=`app`；凭据在 Secret `pg-main-app`，CA 在 `pg-main-ca`，使用 `verify-full` |
| Config Center | `config-center.config-center.svc:30010` | dev Deployment；Web 为 `https://config.app.com`，API 为 `https://config-api.app.com` |

### OpenBao 自动解封

`node101` 上的 `openbao-auto-unseal.timer` 每 60 秒检查一次 OpenBao。OpenBao sealed 时，
`openbao-auto-unseal.service` 读取 `/var/lib/k8s-installer/creds/openbao-init` 并执行解封。
这套方案满足无人值守重启，但 unseal key 与集群管理权限位于同一信任域。它不能替代外部 KMS
或独立 Transit auto-unseal；生产环境迁移到独立信任根后应移除该 timer。

### ⚠️ 集群节点拉镜像依赖**这台 Mac 上的代理**

节点的 containerd 配了 `http-proxy = 192.168.3.220:7890`，而 **192.168.3.220 就是开发用的这台 Mac**
（FlClash 的混合端口）。**Mac 关机或代理没开 → 全集群拉不了任何新镜像**，
症状是 `ImagePullBackOff` + `proxyconnect tcp: dial tcp 192.168.3.220:7890: connect: connection refused`
—— 很容易误判成"私有仓凭据不对"（2026-08-19 实测踩过，当时 TCR 凭据完全正常）。

判据：报错里出现 `proxyconnect` 就是代理问题，与 registry 凭据无关。
已在集群里跑着的 Pod 不受影响（只在拉镜像时才走代理）。

**这是个真实的单点**：把开发机当集群的镜像出口，笔记本合盖就等于集群失去发布能力。
要去掉这个依赖，得给节点配 registry mirror（`certs.d`，与代理无关）或让节点直连。
| 搜索 | Meilisearch（`search` ns） | Elasticsearch 已退役，见 TODO.md 的迁移项 |

### Pigsty 数据面（192.168.3.210）—— ⚠️ 2026-08-19 起已停机

> **该机已关闭**，PostgreSQL 与 Redis 的位置改为集群内（见上表 CNPG / Redis 两行）。
> 10 份 `configs/pre.yml` 与 config-center 的 `configs/pre.yaml` 已切走，旧值整块注释保留可回滚。
> **`configs/dev.yml`（本机开发用）仍指向 210，尚未切换 —— 210 不开机则 `make dev` 连不上库。**
> Kafka 与 Silo(MinIO) 也随之不可用，依赖它们的链路（CDC、对象存储）同样停摆。
> 下面这一节保留为 210 重新开机时的参考。

PostgreSQL、Redis、Kafka、Silo(MinIO) 与 Grafana 由 Pigsty v4.5 部署在 `192.168.3.210`，
不在 k8s 集群内。部署记录与凭据在 `../pigsty-deploy/`（不入库）。

| 服务 | 地址 | TLS | 备注 |
|---|---|---|---|
| PostgreSQL | `192.168.3.210:5432` | ✅ verify-full | 集群 pg-meta，PG 18.6，库 `ecommerce`，用户 `dbuser_meta` |
| PgBouncer | `192.168.3.210:6432` | ❌ | 连接池，**不支持 SSL**（实测 SSLRequest 返回 N） |
| Redis | `192.168.3.210:6379` | ❌ | redis-main，requirepass，ACL 用户 `default` |
| Kafka | `192.168.3.210:9092` | ✅ SASL_SSL | kf-dev，SCRAM-SHA-512 + TLS，默认拒绝；用户 `ecommerce` 限 `ecommerce.` 前缀 |
| Silo(MinIO) | `192.168.3.210:9000` | ✅ | bucket 为 `pgsql`/`meta`/`data`，**不含 ecommerce 业务桶** |
| Grafana | `192.168.3.210:3000` | ❌ | Pigsty 自带监控，与 k8s 的 grafana.dev.test 是两套 |

**TLS 现状**（2026-08-18 实测）：

- PG 与 Silo 的证书由 Pigsty 自签 CA 签发（`O=pigsty, OU=ca, CN=pigsty-ca`），
  可从 `http://192.168.3.210/ca.crt` 获取，仓内副本在 `infrastructure/pigsty-ca.crt`
  （SHA256 指纹 `28:06:C8:B4:...:6F:6F:5B`，与服务端实时呈递的链已核对一致）。
  两张证书的 SAN 都含 `IP:192.168.3.210`，因此可以直接用 IP 走 `verify-full`，
  无需为它们加 DNS 记录。
- **Go 服务不依赖系统信任库**：各服务 `dev.yml` 的 `data.database.postgres.tls.ca_pem`
  直接内嵌这张 CA，与钥匙串无关。钥匙串只影响 `curl` / `psql` / 浏览器这类工具。
- 导入 Pigsty CA 到 Mac 钥匙串（不导入时访问 `https://192.168.3.210:9000/9001`
  会报 `unable to get local issuer certificate`）：

  ```bash
  sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain infrastructure/pigsty-ca.crt
  ```

  这与 k8s 的 `my-global-root-ca` 是**两张互不相干的 CA**，各管各的服务，都要导入。
- **Kafka 已开 TLS**（2026-08-18 切换）。`kafka_security: scram` 是完整安全档位，
  实测生效的 `/etc/kafka/server.properties`：

  ```
  listener.security.protocol.map=BROKER:SASL_SSL,CONTROLLER:SSL
  sasl.enabled.mechanisms=SCRAM-SHA-512
  advertised.listeners=BROKER://192.168.3.210:9092
  ```

  证书由 Pigsty CA 签发（实测 `CN=pigsty-controller`，链校验通过），
  `StandardAuthorizer` 默认拒绝。业务身份 `ecommerce` 已建，ACL 限定在
  `ecommerce.` 前缀的 topic 与 consumer group（密码见 `../pigsty-deploy/pigsty.yml`，
  不入本库）。

  ⚠️ **切换安全模式必须重建集群**：Pigsty 有护栏
  （`kafka_manifest_internal.security == kafka_security`），已格式化的存储不会被
  自动改写，直接改 `kafka_security` 重跑 `./kafka.yml` 会 assert 失败且不做任何变更。
  正确流程是 `./kafka-rm.yml -l kf-dev`（默认 `kafka_rm_data=true`，**会删数据**）
  再 `./kafka.yml`。

  ⚠️ Broker 的 `advertised.listeners` 用 `inventory_hostname`（这里是
  `192.168.3.210`），客户端必须能直连该地址，不能靠 LB/VIP 中转。
- **Redis 无法加 TLS**：Pigsty v4.5 的 redis role 没有任何 TLS 参数，
  `templates/redis.conf` 里 27 行 tls 配置全是注释状态、无一行生效。
  手改实例 conf 会被下次 `redis.yml` 覆盖。要加密只能换部署方式或前置 TLS 代理。

### 告警通知：飞书（2026-08-18 接入）

两套告警栈都经 210 上的 PrometheusAlert 转换层出飞书（飞书 webhook 只认自己的
消息格式，Grafana/Alertmanager 的 payload 都需转换）：

```
k8s Grafana(12.3.1, 无原生飞书) ──webhook──┐
                                            ├─> PrometheusAlert(210:8080, docker) ─> 飞书群机器人
Pigsty Alertmanager(210:9059) ─────────────┘
```

| 侧 | 路由条件 | 配置位置 |
|---|---|---|
| k8s Grafana | `severity=critical` 才发飞书，其余留 UI | contact point `feishu-critical` + policy，存 Grafana DB（**不在 git**，重装集群后要重建） |
| Pigsty Alertmanager | `CRIT`（30s 等待/4h 重复）与 `WARN`（5m 等待/**24h 重复**）都发飞书；INFO 留 UI。标签体系是大写 CRIT/WARN/INFO | 模板 `roles/infra/templates/prometheus/alertmanager.yml` 与已部署文件**双改**（`./infra.yml -t alertmanager` 重跑不丢） |

Pigsty 侧规则为自带全套（92 条：pgsql/redis/kafka/etcd/minio/node/infra/mysql），与官方
monitor 文档推荐逐条核对过无缺口；派生指标（`redis:ins:*`/`node:ins:*`/`pg:db:*` 等
recording rules）已抽查 9 项全部在算，告警不是摆设。mysql.yml 的 27 条因未装 MySQL
恒为 NoData，不响不扰。

- 转换层 compose 在 210 `/opt/prometheusalert/compose.yml`；管理台 8080（账号在 compose 里）
- 飞书 webhook URL 属于凭据，只存在于 Grafana DB、210 的 alertmanager.yml 与转换层调用方，不入库
- ⚠️ 转换层的 `/prometheusalert` 端点对局域网开放且无鉴权——内网可接受，暴露到外网前必须加防护
- 三条链路都已实测（直连 / Grafana testReceivers / Alertmanager 假告警），飞书侧均 success

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
