# 基础设施恢复与可观测性运维手册

> 更新日期：2026-08-27。本文记录已部署实况、验收判据和回滚入口。拓扑真相仍以 `.service-matrix.yaml` 与 `context/team/pangolin-tunnel.md` 为准；凭据值、DSN、ping UUID、topic、token 和私钥不写入本文。

## 1. 快速入口

仓库根的 `ai-helper.sh` 是可执行命令入口，不再只是不可执行的命令草稿：

```bash
./ai-helper.sh --help
./ai-helper.sh all-status
```

会改变运行时的命令只有：

```bash
./ai-helper.sh newt-restart
./ai-helper.sh alerts-test
./ai-helper.sh cert-renew-force
```

其他 status 命令只读。`cert-renew-force` 会执行真实 DNS-01 并短暂重启 Traefik、Redis 和 Silo，不要当普通健康检查反复运行。

## 2. Kubernetes newt 与四个核心入口

### 当前实况

- Deployment：`pangolin/newt`，1 副本，`Recreate`。
- 镜像：`docker.io/fosrl/newt:1.15.0`。恢复期不升级到 1.16.0，也不扩副本。
- 凭据：Kubernetes Secret `newt-credentials`，仓库不保存值。
- Cilium Gateway：Service `default/cilium-gateway-cilium-gateway`，ClusterIP `10.110.51.106`，LB IP `192.168.3.121`。
- Pangolin site：`k8s-cluster`，siteId 4。
- 核心资源 rid 3/4/14/15 都指向 `10.110.51.106:443 https`。

| 入口 | 验收路径 | 期望 |
|---|---|---|
| `shop.apikv.com` | `/` | `200` |
| `gateway.apikv.com` | `/healthz` | `200` |
| `config.apikv.com` | `/` | `200` |
| `config-api.apikv.com` | `/health` | `401`，这是应用鉴权边界，不是故障 |

```bash
./ai-helper.sh core-status
```

### 2026-08-27 故障结论

故障有两层，不能只修第一层：

1. Kubernetes newt workload 缺失时，四个入口快速返回 `502`。
2. 恢复 newt 后，入口转为慢 `504`。Pangolin SQLite 中的四个 target 仍指向旧 Gateway ClusterIP `10.99.145.85`。

恢复顺序是：恢复固定版本单副本 newt → 用 SQLite backup API 备份 Pangolin DB → 在一个事务中把 rid 3/4/14/15 更新到 `10.110.51.106` → 重启 newt 重新下发 target → 集群内 Host/SNI 与公网双向验证。

```bash
ssh node1 'python3 -' <<'PY'
import sqlite3
c = sqlite3.connect("file:/home/docker/pangolin/config/db/db.sqlite?mode=ro", uri=True)
for row in c.execute("""
  select r.resourceId, r.fullDomain, t.siteId, t.ip, t.port, t.method
  from resources r join targets t on t.resourceId=r.resourceId
  where r.resourceId in (3,4,14,15)
  order by r.resourceId
"""):
    print(row)
PY
```

Pangolin DB 是热 SQLite。修改前必须用 SQLite backup API，不能用热 `cp` 冒充一致性备份。`Websocket connected` 只证明控制连接存在；必须在 newt 日志看到四条 `Started tcp proxy to 10.110.51.106:443`，再看业务响应。

## 3. ntfy 告警闭环

所有通道使用私有 topic 和 bearer token，凭据分别保存在 node1/node3 本地 secret 文件。

| 发送方 | 接法 | 已验收 |
|---|---|---|
| Gatus | 原生 ntfy provider，token 鉴权，failure/success threshold 都为 2 | 失败与 resolved；核心公网、Bugsink、Healthchecks origin、证书剩余期 |
| Healthchecks | v4.3 原生 `ntfy` Channel | test、任务 start/success/fail |
| Alertmanager | node3 `pigsty-alert-audit.service`，`127.0.0.1:9099/alerts` | firing 和 resolved payload |
| Bugsink | Slack-compatible → `172.17.0.1:9199` 本机 bridge → ntfy | backend test 与真实 New Issue |
| ZeroSSL timer | node1 root wrapper 直接发 ntfy | 续期/分发成功与任一步失败 |

```bash
./ai-helper.sh alerts-test
ssh node3 'systemctl status pigsty-alert-audit.service --no-pager'
ssh node3 'journalctl -u pigsty-alert-audit.service -n 50 --no-pager'
```

bridge 日志只记录来源、状态和标题，不记录 ntfy token、topic 或 Bugsink URL token。Alertmanager bridge 只有 ntfy 成功才返回 `200`；ntfy 失败返回 `502`，让 Alertmanager 保留重试语义。

## 4. Healthchecks

Healthchecks v4.3 运行在 node3，仅监听 `127.0.0.1:8000`。界面通过 SSH tunnel 访问：

```bash
ssh -L 8000:127.0.0.1:8000 node3
# 浏览器打开 http://127.0.0.1:8000
```

当前唯一 check：

- 名称：`pgBackRest full backup`。
- 周期：24 小时，grace 2 小时。
- ping URL：node3 `/etc/healthchecks/pgbackrest.url`，包含私有 UUID。
- wrapper：node3 `/etc/healthchecks/pg-backup-heartbeat.sh`。
- 通知：附加一个启用状态的原生 `ntfy` Channel。

```bash
./ai-helper.sh healthchecks-status
ssh node3 'curl -fsS http://127.0.0.1:8000/api/v3/status/'
```

Healthchecks 与被监控的 pgBackRest 同在 node3，只能发现任务未执行、超时或失败，不能在 node3 整机失联时主动告警。异机或托管 dead-man switch 仍是残余项。

## 5. Kubernetes 状态与 Event 采集

集群 OTel Helm chart 固定为 0.171.0，collector 为 0.158.0，Deployment 位于 `opentelemetry` namespace。启用项：

- `clusterMetrics` → `k8s_cluster` receiver → node3 VictoriaMetrics。
- `kubernetesEvents` → `k8sobjects` receiver → node3 VictoriaLogs。
- remote exporter 使用 protobuf + gzip、15 秒 timeout、retry 和 sending queue。
- metrics pipeline 在 batch 前使用 `delta_to_cumulative`。

公开的是经过 Pangolin policy 明确放行的 write-only path，不是查询面：

- `https://node3-metrics.apikv.com/opentelemetry/v1/metrics`
- `https://node3-logs.apikv.com/insert/opentelemetry/v1/logs`
- `https://node3-traces.apikv.com/insert/opentelemetry/v1/traces`

```bash
./ai-helper.sh otel-status
ssh node3 'docker logs --since 10m gatus 2>&1 | grep -E "k8s-(cluster-state|event)-ingestion.*success=true"'
```

2026-08-27 验收：VM 有 27 个 `k8s.*` metric，`k8s.deployment.available` 有 49 条结果；collector 发送失败计数为 0。故障注入 Pod `otel-event-validation-*` 产生 `ErrImagePull`/`ImagePullBackOff`，VL 随后保存对应 `object.kind=Event` 记录；receiver accepted 与 VL 24 小时存量持续增长。两者分别是进程累计值和时间窗存量，不要求每次读取完全相等。Gatus 的 Event endpoint 直接查询 VL 中 `object.kind:=Event`，不再用 receiver counter 冒充落库成功。

对象状态、ready/restart、requests/limits 已有；容器实际 CPU/MEM、filesystem 和 network 仍需 kubeletstats/cAdvisor，不能用 request/limit 冒充。

## 6. Bugsink

Bugsink 2.5.0 运行在 node3，容器只发布 `127.0.0.1:8010`。公网资源 `bugsink.apikv.com` 是 Pangolin rid 35，siteId 7，target `127.0.0.1:8010 http`，SSO off。SDK 无法通过交互式 SSO，访问控制由 Bugsink 登录、项目成员和 DSN 承担。

```bash
./ai-helper.sh bugsink-status
curl -fsS https://bugsink.apikv.com/health/ready
ssh node3 'cd /data/bugsink && docker compose ps'
```

已创建 `infrastructure-validation` 项目。Python Sentry SDK 提交 2 个同栈异常后，保存 2 个 Event 并聚合成 1 个 Issue，release 为 `infrastructure-validation@2026.08.27`；New Issue 实际触发 authenticated ntfy。DSN 和管理员凭据只在 Bugsink UI/node3 secret 中，不写入文档。

详细部署、升级、桥接和备份说明见同级仓 `../../docker-deploy/bugsink/README.md`。

## 7. ZeroSSL wildcard 证书结论

### 签发与信任边界

- Subject/SAN：`*.apikv.com` 与 `apikv.com`。
- Issuer：`C=AT, O=ZeroSSL GmbH, CN=ZeroSSL ECC DV SSL CA 2`。
- 签发方式：node1 `acme.sh` + DNSPod `dns_dp`，DNS-01，EC-256。
- 本轮有效期：`2026-08-27 00:00:00 UTC` 至 `2026-11-25 23:59:59 UTC`。
- SHA-256 fingerprint：`2FD15276B8E2631F76267712A6D43581F12E477EAACD7CE081CB01717A8E28EF`。
- ACME state 与 DNSPod 凭据：node1 `/home/acme.sh/data/`，root-only。
- 定时器：node1 `apikv-cert-renew.timer`，每日检查并带随机延迟；systemd 实跑返回 `Result=success`。

公共 CA leaf 不包含 IP SAN。严格客户端必须使用真实域名和 SNI；`-k` 只能用于诊断，不能作为验收放行标准。

### 分发与 reload

| 节点 | 消费方 | 更新动作 |
|---|---|---|
| node1 | Pangolin Traefik | 原子替换后 restart |
| node1 | blog Nginx | 私钥 `root:101`/`0640`，`nginx -t` 后 reload |
| node1 | Redis | 保持 `999:999` 后 restart，严格验证 `redis.apikv.com` |
| node2 | Silo | 原子替换后 restart |
| node2 | Harbor | 同时更新 `ssl/` 源文件与 `data/secret/cert/` 运行副本，保持 `10000:10000` 后 reload |

node1 到 node2 使用独立 Ed25519 key；node2 `authorized_keys` 配置 `restrict` 和强制 receiver，不能用该 key 获得通用 root shell。两个节点都在 `/var/lib/apikv-cert/backups/<UTC timestamp>/` 保留更新前副本。node2 更新失败时在本机回滚；node1 后续步骤失败时，node1 恢复本机并把旧证书重新发送到 node2。跨节点回滚是 best-effort，不具备数据库事务语义；回滚失败时必须按两个节点的备份手工恢复并重新执行严格握手验证。

```bash
./ai-helper.sh cert-status
ssh node1 'systemctl list-timers apikv-cert-renew.timer --no-pager'
ssh node1 'journalctl -u apikv-cert-renew.service -n 100 --no-pager'
```

本轮首次分发故意暴露出一个权限错误：blog 容器以 uid 100/gid 101 的 `nginx` 运行，`root:root`/`0600` 私钥导致 `nginx -t` 失败。node1 自动回滚恢复旧证书，修正为 `root:101`/`0640` 后重试成功。这个结果证明回滚路径实际执行过，也说明「私钥一律 0600」不是脱离进程身份的绝对规则。

2026-08-27 严格握手验证中，Traefik、blog、Bugsink、Silo/MinIO、Harbor 和 Redis 都呈现上述新指纹与 `2026-11-25` 到期日。以后仍以 `cert-status` 的实际握手结果为准；只比较磁盘文件不能证明服务已 reload。

## 8. 残余风险

- Gatus、Healthchecks、Bugsink、Victoria 数据面都在 node3，node3 整机失联需要异机探针发现。
- Kubernetes Gateway HTTPS listener 仍引用 `default/global-default-tls`，集群直连特定域名会呈现 `dev.test` wildcard；公网在 node1 终止 ZeroSSL，因此不影响本轮四个公网入口，但 certificateRef 收敛仍单独跟踪。
- Bugsink Source Map 上传路径尚未做真实前端构建验收。
- 部分电商服务仍向受保护的 `node3-otlp.apikv.com/v1/logs` 直发日志，2026-08-27 观察到 `401 missing or empty authorization header`。stdout → Vector → VL 与本轮 Kubernetes Event pipeline 不受影响；应用 SDK endpoint/header 需要单独收敛。
- OTel `k8sobjects` alias 有弃用提示，当前稳定配置暂不在恢复期改为 `k8s_objects`；升级 chart/collector 时再迁移并回归 Event 查询。
- 本轮不部署 Velero。
