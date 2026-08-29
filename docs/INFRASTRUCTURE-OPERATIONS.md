# 基础设施恢复与可观测性运维手册

> 更新日期：2026-08-27。本文记录已部署实况、验收判据和回滚入口。拓扑真相仍以 `.service-matrix.yaml` 与 `context/team/pangolin-tunnel.md` 为准；凭据值、DSN、ping UUID、topic、token 和私钥不写入本文。

## 1. 快速入口

仓库根的 `helper.sh` 是**命令备忘**（2026-08-28 起改为纯备忘：打开阅读、按小节逐条复制执行，不要整体运行；文件顶部有 `exit 0` 防呆，误执行零副作用）。分节：一、状态检查（只读）；二、恢复与演练（有副作用）；三、本地开发域名（`/etc/hosts`）；四、Pangolin；五、根域导航页；六、OTLP 鉴权；七、工具速查。

有副作用的只有第二节三组命令：newt 重启、告警链路测试、强制证书续期。其余状态检查小节均只读。强制续期会执行真实 DNS-01 并短暂重启 Traefik、Redis 和 Silo，不要当普通健康检查反复运行。

## ntfy 告警闭环

所有通道使用私有 topic 和 bearer token，凭据分别保存在 node1/node3 本地 secret 文件。

| 发送方 | 接法 | 已验收 |
|---|---|---|
| Gatus | 原生 ntfy provider，token 鉴权，failure/success threshold 都为 2 | 失败与 resolved；核心公网、Bugsink、Healthchecks origin、证书剩余期 |
| Healthchecks | v4.3 原生 `ntfy` Channel | test、任务 start/success/fail |
| Alertmanager | node3 `pigsty-alert-audit.service`，`127.0.0.1:9099/alerts` | firing 和 resolved payload |
| Bugsink | Slack-compatible → `172.17.0.1:9199` 本机 bridge → ntfy | backend test 与真实 New Issue |
| ZeroSSL timer | node1 root wrapper 直接发 ntfy | 续期/分发成功与任一步失败 |

```bash
# 端到端测试命令见 helper.sh 第二节「告警链路测试」（有副作用：会真实发送 ntfy）
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
# 状态检查见 helper.sh 第一节「node3：Healthchecks 与 Gatus」（只读）
ssh node3 'curl -fsS http://127.0.0.1:8000/api/v3/status/'
```

Healthchecks 与被监控的 pgBackRest 同在 node3，只能发现任务未执行、超时或失败，不能在 node3 整机失联时主动告警。异机或托管 dead-man switch 仍是残余项。

## 5. Kubernetes 状态与 Event 采集

启用项：

- `clusterMetrics` → `k8s_cluster` receiver → node3 VictoriaMetrics。
- `kubernetesEvents` → `k8sobjects` receiver → node3 VictoriaLogs。
- remote exporter 使用 protobuf + gzip、15 秒 timeout、retry 和 sending queue。
- metrics pipeline 在 batch 前使用 `delta_to_cumulative`。

公开的是经过 Pangolin policy 明确放行的 write-only path，不是查询面：

- `https://node3-metrics.apikv.com/opentelemetry/v1/metrics`
- `https://node3-logs.apikv.com/insert/opentelemetry/v1/logs`
- `https://node3-traces.apikv.com/insert/opentelemetry/v1/traces`

```bash
# 摄入链路检查见 helper.sh 第一节「node3：K8s 状态/Event 摄入链路」（只读）
ssh node3 'docker logs --since 10m gatus 2>&1 | grep -E "k8s-(cluster-state|event)-ingestion.*success=true"'
```

2026-08-27 验收：VM 有 27 个 `k8s.*` metric，`k8s.deployment.available` 有 49 条结果；collector 发送失败计数为 0。故障注入 Pod `otel-event-validation-*` 产生 `ErrImagePull`/`ImagePullBackOff`，VL 随后保存对应 `object.kind=Event` 记录；receiver accepted 与 VL 24 小时存量持续增长。两者分别是进程累计值和时间窗存量，不要求每次读取完全相等。Gatus 的 Event endpoint 直接查询 VL 中 `object.kind:=Event`，不再用 receiver counter 冒充落库成功。

对象状态、ready/restart、requests/limits 已有；容器实际 CPU/MEM、filesystem 和 network 仍需 kubeletstats/cAdvisor，不能用 request/limit 冒充。

## 6. Bugsink

> **决策更新（2026-08-28 复核）**：错误监控定稿**维持 Bugsink**，本节从「存量待替换」恢复为目标态运行事实；GlitchTip 转为条件采纳（触发条件见 [TECH.md](TECH.md) §11.3）。

Bugsink 2.5.0 当前仍运行在 node3，容器只发布 `127.0.0.1:8010`。公网资源 `bugsink.apikv.com` 是 Pangolin rid 35，siteId 7，target `127.0.0.1:8010 http`，SSO off。SDK 无法通过交互式 SSO，访问控制由 Bugsink 登录、项目成员和 DSN 承担。

```bash
# 状态检查见 helper.sh 第一节「node3：Bugsink」（只读）
curl -fsS https://bugsink.apikv.com/health/ready
ssh node3 'cd /data/bugsink && docker compose ps'
```

已创建 `infrastructure-validation` 项目。Python Sentry SDK 提交 2 个同栈异常后，保存 2 个 Event 并聚合成 1 个 Issue，release 为 `infrastructure-validation@2026.08.27`；New Issue 实际触发 authenticated ntfy。DSN 和管理员凭据只在 Bugsink UI/node3 secret 中，不写入文档。

详细部署、升级、桥接和备份说明见同级仓 `../../docker-deploy/bugsink/README.md`；本仓前端 SDK 接入手册见 [docs/observability/error-monitoring.md](observability/error-monitoring.md)，容量实测与调研结论见 [docs/reports/2026-08-28-bugsink-integration-research.md](reports/2026-08-28-bugsink-integration-research.md)。

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
# 指纹/到期日检查见 helper.sh 第一节「证书」（只读）
ssh node1 'systemctl list-timers apikv-cert-renew.timer --no-pager'
ssh node1 'journalctl -u apikv-cert-renew.service -n 100 --no-pager'
```

本轮首次分发故意暴露出一个权限错误：blog 容器以 uid 100/gid 101 的 `nginx` 运行，`root:root`/`0600` 私钥导致 `nginx -t` 失败。node1 自动回滚恢复旧证书，修正为 `root:101`/`0640` 后重试成功。这个结果证明回滚路径实际执行过，也说明「私钥一律 0600」不是脱离进程身份的绝对规则。

2026-08-27 严格握手验证中，Traefik、blog、Bugsink、Silo/MinIO、Harbor 和 Redis 都呈现上述新指纹与 `2026-11-25` 到期日。以后仍以 `helper.sh`「证书」小节命令的实际握手结果为准；只比较磁盘文件不能证明服务已 reload。

## 8. 残余风险

- Gatus、Healthchecks、Bugsink、Victoria 数据面都在 node3，node3 整机失联需要异机探针发现；错误监控定稿维持 Bugsink（[TECH.md](TECH.md) §11.3），该单点故障域靠异机探针缓解而不是靠迁移消除。
- Kubernetes Gateway HTTPS listener 仍引用 `default/global-default-tls`，集群直连特定域名会呈现 `dev.test` wildcard；公网在 node1 终止 ZeroSSL，因此不影响本轮四个公网入口，但 certificateRef 收敛仍单独跟踪。
- Bugsink Source Map 上传路径尚未做真实前端构建验收；前端接入时用 `sentry-cli sourcemaps inject`（debug ID）+ artifact bundle 链路验收（Bugsink 2.0.14+ 支持，见接入报告）。
- 部分电商服务仍向受保护的 `node3-otlp.apikv.com/v1/logs` 直发日志，2026-08-27 观察到 `401 missing or empty authorization header`。stdout → Vector → VL 与本轮 Kubernetes Event pipeline 不受影响；应用 SDK endpoint/header 需要单独收敛。
- OTel `k8sobjects` alias 有弃用提示，当前稳定配置暂不在恢复期改为 `k8s_objects`；升级 chart/collector 时再迁移并回归 Event 查询。
- 本轮不部署 Velero。
