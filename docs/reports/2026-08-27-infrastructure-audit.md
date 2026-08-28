# 基础设施入口、证书与补强审计：2026-08-27

> 审计时间：2026-08-27，Asia/Shanghai。
> 探测视角：主要从 `node3` 经公网 DNS/Pangolin 访问；Kubernetes 内部证书与对象状态从当前 kubeconfig 对 live cluster 读取。
> 变更范围：在 `node3` 部署 Gatus 和 Healthchecks，并把现有 pgBackRest cron 接入任务心跳。未部署 Velero、Bugsink、Sentry、SeaweedFS、imgproxy 或新的 Kubernetes collector。
> 敏感信息：只记录证书、公网主机名、端口和本地 secret 路径，不记录任何密码、token、私钥或 S3 凭据。
>
> **审计后闭环（同日）：**本文正文保留审计时快照，不再代表当前运行状态。newt 与四个核心入口已恢复；OTel `k8s_cluster`/`k8sobjects`、Bugsink、authenticated ntfy 和 ZeroSSL 自动续期/跨节点分发均已部署并实测。新证书到期日为 2026-11-25。当前操作入口和最终证据见 `docs/INFRASTRUCTURE-OPERATIONS.md`；正文第 1、2、4、6 条只用于说明修复前证据。

## 结论

1. **Kubernetes 已运行，但商城、网关和 Config Center 的公网链路仍中断。**`pangolin` namespace 为空，全集群也没有 newt workload；Pangolin 仍把四个入口转发到已消失的 `100.89.128.12` 隧道目标，因此 `shop.apikv.com`、`gateway.apikv.com`、`config.apikv.com`、`config-api.apikv.com` 均返回 `502`。Casdoor 返回 `200`。
2. **公网证书当前有效，但续期链路仍是 P0。**27 个公网 HTTPS hostname 均呈现同一张 ZeroSSL `*.apikv.com` 证书，2026-10-27 到期，审计时剩余约 61.8 天。Gatus 会在低于 30 天时标红，但监控不等于自动续期。
3. **Silo 可以作为异机 S3 备份靶。**此前「Silo 不能做异机 S3 靶」的说法不准确。真正的问题是当前 PostgreSQL 与 Silo 同在 node3，处于同一故障域；远端 Silo 只要跨宿主/存储故障域并通过 pgBackRest restore 验证，就是合法的异机 S3 repository。
4. **Vector 不是 Kubernetes 状态采集器。**live `logging/vector` DaemonSet 3/3 只读取容器日志；当前没有 OTel Collector、kube-state-metrics 或 event exporter。最小补法是恢复单副本 OTel Collector Deployment，启用 `k8s_cluster` 和 `k8sobjects`，暂不重复引入 kube-state-metrics。
5. **Healthchecks 不会与未来 scheduler 重复。**scheduler/cron 继续拥有触发、重试、锁、并发和业务状态；Healthchecks 只观察 `/start`、成功、`/fail` 和缺失心跳。它不是 PostgreSQL 专用工具，当前部署也没有使用 PostgreSQL，而是单机 SQLite。
6. **错误追踪优先 Bugsink，不在 node3 自建 Sentry。**Bugsink 只补错误事件聚合、release 和 Source Map，与现有 Victoria/OTel 分工清楚；self-hosted Sentry 官方最低 16 GiB RAM + 16 GiB swap，明显超过 node3 的 7.3 GiB 总内存。
7. **imgproxy 可以引入，但先做单一商品图片读取 PoC。**服务端生成签名 URL，前端不持有签名密钥；原始 object key 保持事实源。newt 和源存储路径稳定前，不部署一个只能经故障公网隧道回源的 imgproxy。

## 公网与节点入口实测

### 核心业务

| 入口 | 实测 | 判定 | 证据 |
|---|---:|---|---|
| `https://shop.apikv.com/` | `502` | 失败 | Pangolin router 存在，newt 目标不可达 |
| `https://gateway.apikv.com/health` | `502` | 失败 | 同上 |
| `https://casdoor.apikv.com/api/health` | `200` | 正常 | 当前直接回源 node1 `10.1.0.8:8000` |
| `https://config.apikv.com/` | `502` | 失败 | Pangolin router 存在，newt 目标不可达 |
| `https://config-api.apikv.com/health` | `502` | 失败 | 同上 |

Kubernetes API、三个 node 和业务 Pod 已恢复，不代表公网隧道自动恢复。当前集群的 `pangolin` namespace 返回 `No resources found`，这与四个核心 `502` 完全一致。

### node1

| 类型 | 入口 | 实测 | TLS |
|---|---|---:|---|
| HTTP | `apikv.com`、`blog.apikv.com`、`pangolin.apikv.com`、`kaneo.apikv.com`、`ntfy.apikv.com` | `200` | ZeroSSL wildcard |
| HTTP | `vault.apikv.com` | `307 /ui/` | ZeroSSL wildcard |
| TCP | `node1:52288` PostgreSQL | 可连接 | **明文，无证书** |
| TLS | `redis.apikv.com:61246` Redis | 握手成功 | ZeroSSL wildcard |

node1 的 PostgreSQL 和 Redis 端口仍对公网监听。Redis 至少有 TLS；PostgreSQL 仍是明文入口，不能因为 Gatus 的 TCP connect 成功就视为安全或业务健康。

### node2

| 入口 | 实测 | 判定 |
|---|---:|---|
| `https://minio.apikv.com/minio/health/live` | `200` | Silo 正常 |
| `https://harbor.apikv.com/api/v2.0/health` | `200` | Harbor 正常 |
| `https://gorse.apikv.com/` | `302 /login` | 后端可达，应用要求登录 |

node2 的 Silo API/UI 只绑定 `127.0.0.1:9000/9001`，公网经 node1 Pangolin 转发。它可以作为 node3 的远端备份靶，但若备份流量仍经 node1，恢复路径会额外依赖 node1/Traefik/Pangolin；更稳妥的是提供受防火墙保护的私网 TLS 入口。

### node3

| 类型 | 入口 | 实测 | 说明 |
|---|---|---:|---|
| HTTP | Grafana public `/api/health` | `200` | edge 与 origin 均正常 |
| HTTP | VictoriaMetrics/Logs/Traces、vmalert、Alertmanager public | `302` | Pangolin SSO 按预期拦截；对应 origin 检查均为 `200` |
| HTTP | Silo public `/minio/health/live` | `200` | edge 与 origin 均正常 |
| HTTP | OTLP public `/` | `401` | bearer 鉴权按预期生效；本机 health endpoint `200` |
| PostgreSQL | `node1:30001` | TCP + PostgreSQL TLS 握手成功 | Pigsty CA leaf |
| Redis | `node1:30002` | TLS 握手成功 | Pigsty CA leaf |
| Kafka DEV | `node1:30004` | TCP 可连接 | `SASL_PLAINTEXT`，无证书 |
| Kafka internal | `127.0.0.1:9092` | TLS 握手成功 | `SASL_SSL`，Pigsty CA leaf |

按需入口 `dev.apikv.com` 和 `cat.apikv.com` 当前也是 `502`；`dsh.apikv.com` 返回 Pangolin SSO `302`，`stream.apikv.com` 根路径返回 `404`。它们不计入核心四项故障，但 Gatus 仍保留检查。

## 证书报告

### 公网边缘证书

下列入口在 node1 Traefik 终止 TLS，并呈现同一张证书：商城、网关、Casdoor、Config Center Web/API、node1 的所有 Pangolin HTTP 资源、node2 的 Silo/Gorse/Harbor、node3 的观测栈/Silo/OTLP，以及 apex/`www`。

| 字段 | 值 |
|---|---|
| Subject | `CN=*.apikv.com` |
| SAN | `*.apikv.com`、`apikv.com` |
| Issuer | `C=AT, O=ZeroSSL GmbH, CN=ZeroSSL ECC DV SSL CA 2` |
| 签发方式 | `acme.sh` + DNSPod `dns_dp`，DNS-01 wildcard；随后人工/脚本复制到多处 |
| Valid from | 2026-07-29 00:00:00 UTC |
| Valid until | **2026-10-27 23:59:59 UTC** |
| 审计时剩余 | 约 **61.8 天** |
| SHA-256 | `B3:6C:D8:D8:80:0F:61:38:29:15:51:5F:EA:8A:79:44:3C:31:B4:57:3F:63:2A:C9:34:79:31:7F:8D:1E:F3:B8` |

已确认相同证书副本至少存在于：

- node1 `/home/docker/pangolin/config/traefik/certs/apikv.com.crt`
- node1 `/home/docker/blog/ssl/nginx.crt`
- node1 `/home/docker/redis/tls/redis.crt`
- node2 `/home/docker/minio/certs/public.crt`
- node2 `/home/docker/harbor/data/secret/cert/server.crt`

当前缺少可验证的自动续期和多位置原子分发闭环。Gatus 只负责提前暴露过期风险，不能替代续期任务。

### node3 Pigsty CA 证书

| 服务/入口 | Subject / SAN 摘要 | Issuer | 签发方式 | Valid until |
|---|---|---|---|---:|
| Pigsty root CA | `O=pigsty, OU=ca, CN=pigsty-ca` | self-signed | Pigsty PKI/Ansible | 2126-07-31 |
| PostgreSQL `30001` / `5432` | `CN=pg-meta-1`；SAN 含 `pg-meta-1`、`10.10.21.172`、`127.0.0.1` | `pigsty-ca` | Pigsty PKI | 2046-08-19 |
| Redis TLS `30002` / `6379` | `CN=redis.pigsty`；SAN 含 `node3`、`10.10.21.172`、`127.0.0.1` | `pigsty-ca` | Pigsty PKI | 2036-08-21 |
| Silo `9000/9001` | `CN=minio-1.pigsty` | `pigsty-ca` | Pigsty PKI | 2046-08-19 |
| Kafka internal `9092` | `CN=pigsty-controller`；SAN 含 `10.10.21.172`、`127.0.0.1` | `pigsty-ca` | Pigsty PKI | 2046-08-19 |
| Kafka public DEV `30004` | 无 | 无 | `SASL_PLAINTEXT` | 无证书 |

公网 PostgreSQL/Redis 使用内部 CA 证书，因此普通系统 trust store 不会自动信任；客户端必须显式信任 Pigsty root CA，并按证书 SAN 使用正确的 server name。Gatus 对这两个公网裸 IP 检查使用 `insecure: true` 只为读取握手和过期时间，不能把它当作客户端严格校验已经通过。

### Kubernetes 私有 CA 与 leaf

证书链由 cert-manager 两级创建：

1. `ClusterIssuer/selfsigned` 签发 `Certificate/global-root-ca`；
2. `ClusterIssuer/global-ca-issuer` 引用 `global-root-ca-secret`，签发各 namespace leaf；
3. trust-manager 分发内部 root trust bundle。

| Certificate | SAN / 用途 | Issuer | Valid until | 当前呈现状态 |
|---|---|---|---:|---|
| `cert-manager/global-root-ca` | 私有 root，`CN=my-global-root-ca` | self-signed | 2036-08-18 | CA |
| `default/global-default-tls-cert` | `dev.test`、`*.dev.test` | `global-ca-issuer` | 2026-11-19 03:29 UTC | Cilium HTTPS Gateway 当前唯一 certificateRef |
| `dragonfly/dragonfly-tls` | `redis.dev.test`、Dragonfly service DNS | `global-ca-issuer` | 2026-11-19 03:29 UTC | `192.168.3.122:6380` 实际呈现 |
| `config-center/config-center-tls` | `config.app.com`、`config-api.app.com`、service DNS | `global-ca-issuer` | 2026-11-19 07:37 UTC | **已签发但 Gateway 未引用** |
| `ecommerce/ecommerce-cart-tls` | `cart-api.dev.test`、cart service DNS | `global-ca-issuer` | 2026-11-19 07:42 UTC | **已签发但 Gateway 未引用** |
| `trust-system/trust-manager` | trust-manager service DNS | namespace Issuer | 2026-11-19 03:29 UTC | 内部 webhook/service |

实测向 `192.168.3.121:443` 发送 SNI `config.app.com`、`config-api.app.com` 或 `cart-api.dev.test`，服务端仍呈现 `dev.test` wildcard。原因不是 leaf 未签发，而是 Gateway HTTPS listener 只引用 `default/global-default-tls`。公网用户看到的是 node1 ZeroSSL 证书，但集群内严格 TLS 客户端会遇到 hostname mismatch。

CloudNativePG 另有 operator 管理的独立证书链：

| 对象 | Subject / SAN | Issuer | Valid until | live 状态 |
|---|---|---|---:|---|
| `pg-main-ca` | `OU=postgresql, CN=pg-main` | self-signed | 2026-11-19 03:22 UTC | secret 存在 |
| `pg-main-server` | `CN=pg-main-rw`；SAN 含各 service DNS 与 `pg.dev.test` | `pg-main` CA | 2026-11-19 03:22 UTC | cluster `readyInstances` 为空，TLS passthrough 无 leaf 可呈现 |
| `pg-main-replication` | `CN=streaming_replica` | `pg-main` CA | 2026-11-19 03:22 UTC | secret 存在 |

## Gatus 部署结果

部署源位于同级仓：

- `/Users/sumery/lens077/docker-deploy/gatus/compose.yml`
- `/Users/sumery/lens077/docker-deploy/gatus/config.yaml`
- `/Users/sumery/lens077/docker-deploy/gatus/README.md`

运行状态：

| 项目 | 结果 |
|---|---|
| Image | `ghcr.io/twin/gatus:v5.36.0`，固定 digest `sha256:c5f210...17f0` |
| 数据 | SQLite，`/data/gatus/data/gatus.db` |
| UI | 仅 `127.0.0.1:8080`；经 `ssh -L 8080:127.0.0.1:8080 node3` 访问 |
| 检查 | 42 个；最终 **36 pass / 6 fail** |
| 失败 | mall、gateway、Config Center Web/API、按需 dev/cat，均为真实 `502` |
| 资源快照 | 约 11.25 MiB RSS、0.02% CPU |
| 通知 | **未配置**；没有把 ntfy token 或匿名 topic 写入仓库 |

Gatus 同时检查公网 edge 和 node3 origin，避免 Pangolin SSO `302` 把后端故障伪装成健康。它与 node3 同机，所以无法发现 node3 整机或网络完全失联；要补齐这一故障域，应在 node1/node2 或独立 VPS 运行第二探针。

## Healthchecks 部署结果与调度边界

部署源位于：

- `/Users/sumery/lens077/docker-deploy/healthchecks/compose.yml`
- `/Users/sumery/lens077/docker-deploy/healthchecks/hooks/pg-backup-heartbeat.sh`
- `/Users/sumery/lens077/docker-deploy/healthchecks/README.md`

运行状态：

| 项目 | 结果 |
|---|---|
| Image | `healthchecks/healthchecks:v4.3`，固定 digest `sha256:cd7bcd...f56f` |
| 数据库 | SQLite Docker volume；**没有新增 PostgreSQL 实例/schema** |
| UI | 仅 `127.0.0.1:8000`；经 `ssh -L 8000:127.0.0.1:8000 node3` 访问 |
| worker | uWSGI 1 worker + 官方 `sendalerts`/`sendreports` daemon |
| 资源快照 | 约 190.3 MiB RSS、0.20% CPU |
| 当前 check | `pgBackRest full backup`，cron `0 1 * * *`，`Asia/Shanghai`，grace 2h |
| 状态 | `new`；部署后没有伪造一次成功备份，等下一次真实 cron 更新 |
| 通知 | **未配置**；当前先记录任务状态，不宣称已有外部告警闭环 |

postgres crontab 仍是唯一调度事实源：

```text
CRON_TZ=Asia/Shanghai
00 01 * * * /usr/local/sbin/pg-backup-healthchecked
```

wrapper 在备份前 best-effort 发送 `/start`，成功后发送 success，失败后发送 `/fail`。心跳请求有短超时和有限重试；Healthchecks 不可用不会阻止 pgBackRest 启动。Ping URL 只保存在 node3 `/etc/healthchecks/pgbackrest.url`，初始管理员凭据只保存在 `/data/healthchecks/secrets/initial_admin`，均未写入 Git。

因此未来引入应用任务 scheduler 时没有重复：

- scheduler/任务表：执行、重试、锁、并发、幂等、补偿和业务状态；
- Healthchecks：外部观察「应当发生的任务是否按时完成」。

当前不为索引重建、订单补偿等尚不存在的任务创建占位 check。它们落地时，应在同一次变更中注册任务心跳。

## Vector 与 Kubernetes 状态采集

「votor」应是 Vector。live 状态与仓库配置一致：

- `logging/vector` DaemonSet 3/3；
- source 只有 `kubernetes_logs`；
- VRL 脱敏后写入 node3 VictoriaLogs；
- 不产生 Deployment 可用副本、Pod phase/restart/OOM、Node condition 或 Kubernetes Event。

仓库 `/Users/sumery/lens077/kubernetes/components/opentelemetry/values.yaml` 已有 `presets.clusterMetrics.enabled: true`，但 live cluster 没有 OTel Collector workload。因此建议：

1. 恢复一个单副本 OTel Collector Deployment；
2. `k8s_cluster` 输出集群状态指标到 VictoriaMetrics；
3. `k8sobjects` watch Kubernetes Events，并以 logs 形式写入 VictoriaLogs；
4. 先不装 kube-state-metrics，避免同类状态指标重复；只有 OTel receiver 缺少所需对象或现有 dashboard 强依赖 `kube_*` 指标名时再补；
5. 若需要容器/Pod CPU 与内存历史，再独立部署受控维度的 `kubelet_stats` DaemonSet。不要把集群单例 receiver 放进无 leader election 的 DaemonSet。

metrics-server 只服务 HPA 和即时资源查询，不等于持久化集群状态采集。

## Silo 与 SeaweedFS

### 为什么远端 Silo 完全可以做 S3 备份靶

Silo 是 PGSTY 维护的 MinIO 分支，保留 S3 API，并被 Pigsty 文档明确用于 pgBackRest S3 repository。能否称为「异机备份」取决于部署位置和恢复验证，不取决于名字是不是 SeaweedFS。

有效的远端 Silo 方案至少满足：

- Silo 数据盘、进程、宿主和 PostgreSQL 不在同一故障域；
- 通过 TLS 和独立最小权限凭据访问；
- 打开 pgBackRest repository encryption。当前 `pgbackrest info` 显示 `cipher: none`，TLS 只保护传输，不保护静态备份；
- 固化 retention，并演练 versioning/Object Lock 对 `expire` 和容量回收的影响；
- 定期从远端 repo 完整 restore/PITR，而不是只看「backup completed」；
- 保留另一份离线/不可变副本，单节点远端 Silo 不自动满足完整 3-2-1 或抗勒索要求。

node2 已有 Silo，可以作为候选靶。正式切换前应新建独立 bucket/凭据，跑 `stanza-create`、full、WAL push/get、expire 和 restore 演练，并避免让 node1 Pangolin 成为唯一备份路径。

### SeaweedFS 仍适合产品图片

SeaweedFS 的 master/volume/filer/S3 gateway 架构、卷复制、warm-volume erasure coding 和横向扩展，更适合大量产品图片与小对象；但这些能力不会自动让它成为比 Silo 更低风险的 pgBackRest 靶。项目保持原决策：

- pgBackRest 远端 repository：优先 Silo；
- 产品图片：按 `docs/TECH-RADAR.md` 继续评估 SeaweedFS；
- 若将 SeaweedFS 用于备份，必须额外通过 multipart、ListObjectsV2、versioning/Object Lock、WAL 和完整 restore 兼容性门禁。

## Bugsink 与 Sentry

| 维度 | Bugsink | self-hosted Sentry |
|---|---|---|
| 定位 | 只处理 error events：issue/grouping、release、Source Map、告警、retention | errors + tracing + replay + profiles + metrics 等完整平台 |
| SDK | Sentry SDK 错误事件兼容；官方明确不处理 traces/metrics | 原生完整 Sentry 产品面 |
| 依赖 | 单体 web + DB/后台任务，SQLite/PostgreSQL/MySQL 可选 | Postgres、Redis、Kafka、ClickHouse、Snuba、Relay、Symbolicator、多个 consumer/worker 等 |
| 资源 | 官方单机指南以 2 GiB 级主机为目标，仍需本项目压测 | 官方最低 4 CPU、16 GiB RAM + 16 GiB swap、20 GiB disk，推荐 32 GiB RAM |
| 与现有栈关系 | 补足错误聚合，Victoria/OTel 继续负责 logs/metrics/traces | 与现有 tracing/metrics 产生较大能力重叠 |
| 许可证 | PolyForm Shield 1.0.0，`ee/` 单独许可；source-available | FSL/Fair Source，约两年后转 Apache-2.0 |

结论：先做 Bugsink PoC，不部署当前 `/Users/sumery/lens077/docker-deploy/sentry/isntall.sh` 固定的旧 Sentry 24.1.0。PoC 必须同时验证 Go 与 TypeScript SDK、grouping、release、Source Map、PII 默认关闭、retention 和告警；只验证 DSN 能收事件不算通过。

## imgproxy 引入计划

第一阶段只做一个服务端签名的商品图片读取路径：

1. 原始 object key 继续写数据库，对象存储中的原图保持事实源；不把派生 URL 或多尺寸结果写回业务表。
2. 后端共享签名边界把 object key 转成固定的 `product-image-v1` 变换 URL。签名 key/salt 通过 OpenBao/ESO 注入，前端永远拿不到。
3. imgproxy 使用只读、限 bucket 的 S3 凭据；配置 `IMGPROXY_S3_ALLOWED_BUCKETS` 和 `IMGPROXY_ALLOWED_SOURCES`，不允许任意 URL 回源。
4. 固定 `IMGPROXY_MAX_SRC_FILE_SIZE`、source resolution、result dimension、workers、queue 和 animation frame 上限，防止图片炸弹和并发挤压。
5. 候选公网名为 `images.apikv.com`，生产必须启用 HMAC URL signature。确定性 URL 设置长缓存；原图 key 不可变，或把 object version 纳入 URL。
6. PoC 通过正确性、签名拒绝、缓存、回源故障、失败回退和资源压测后，再扩展 `srcSet`/`sizes` 和更多页面。

当前代码接缝：

- `/Users/sumery/lens077/ecommerce/backend/services/cart/internal/pkg/minio.go` 的 `FormatObjectURL` 仍生成对象存储直连 URL；
- `/Users/sumery/lens077/ecommerce/frontend/apps/consumer/src/routes/product/$spuCode.tsx` 直接消费 `thumbnailUrl`。

优先把固定 hero/thumbnail 读取路径改成后端返回签名 URL，不在第一阶段迁移上传链路或允许前端拼任意变换参数。源存储优先随产品图片 SeaweedFS 方案落地；若临时使用 node3 Silo，也要避免 K8s imgproxy 经 node1 公网 Pangolin 再绕回 node3 的脆弱路径。

## 优先级

1. **P0：恢复 Kubernetes newt**，让 mall/gateway/Config Center 四个核心公网入口退出 `502`。
2. **P0：建立 ZeroSSL wildcard 自动续期 + 原子分发 + reload 验证**，不要等 Gatus 进入 30 天红线才处理。
3. **P1：补齐通知通道**。node3 Alertmanager 当前默认 receiver 只是 `local-audit` webhook，Gatus 与 Healthchecks 也没有 ntfy/飞书/企业微信凭据；先选一个受控通道并做 failure + resolved 双向演练。
4. **P1：把 pgBackRest repository 迁到异机 Silo 并启用加密**，完成真实 restore/PITR 演练。
5. **P1：恢复单例 OTel cluster collector + Kubernetes Events**，Vector 保持日志职责。
6. **P2：Bugsink 双 SDK PoC**，不在 node3 部署 self-hosted Sentry。
7. **P2：imgproxy 单路径 PoC**，待 tunnel 和源存储链路稳定后再部署。
8. **明确不做：Velero**。本轮没有创建任何 Velero manifest 或执行安装。

## 证据与官方来源

本地真相源：

- `.service-matrix.yaml`
- `context/team/pangolin-tunnel.md`
- `context/team/tls-enablement.md`
- `context/team/cron-jobs.md`
- `docs/TECH-RADAR.md`
- `/Users/sumery/lens077/kubernetes/components/vector/values.yaml`
- `/Users/sumery/lens077/kubernetes/components/opentelemetry/values.yaml`

官方来源：

- [Pigsty MINIO/Silo 模块](https://doc.pgsty.com/docs/minio/)
- [Pigsty pgBackRest repository](https://doc.pgsty.com/docs/pgsql/backup/repository/)
- [Silo repository](https://github.com/pgsty/silo)
- [SeaweedFS repository](https://github.com/seaweedfs/seaweedfs)
- [SeaweedFS S3 API 支持矩阵](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API)
- [Gatus configuration reference](https://github.com/TwiN/gatus/blob/master/README.md)
- [Healthchecks self-hosted Docker](https://healthchecks.io/docs/self_hosted_docker/)
- [Healthchecks cron monitoring](https://healthchecks.io/docs/monitoring_cron_jobs/)
- [Bugsink SDK boundary](https://www.bugsink.com/docs/sdk-recommendations/)
- [Bugsink single-server production guide](https://www.bugsink.com/docs/single-server-production/)
- [Bugsink license](https://github.com/bugsink/bugsink/blob/main/LICENSE)
- [Sentry self-hosted requirements](https://develop.sentry.dev/self-hosted/)
- [imgproxy configuration options](https://docs.imgproxy.net/configuration/options)
- [imgproxy S3 source guide](https://docs.imgproxy.net/image_sources/amazon_s3)
