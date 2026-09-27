# 告警规则与 Gatus 探针目录

> 自动生成；不要手改。本目录是源码投影，不是 live 配置或送达证明。
> 生成基准日期：2026-09-26；来源：同级 kubernetes 仓。
> 源码集合 SHA-256：`9ff808837d525595dd96ab3db2b1d131e0f60aa5be1836e59f57d93f58a59c46`。

策略、账号与运维边界见 [告警与通知手册](alerting-notification.md)。

## 再生成与漂移检查

在 ecommerce 仓根目录执行；依赖同级 kubernetes checkout 与已有 PyYAML 工具环境。
脚本只读取规则和探针 YAML，不读 Secret、env、数据库或线上 API。

```bash
../kubernetes/.venv-tools/bin/python scripts/generate-alerting-catalog.py --date 2026-09-26
../kubernetes/.venv-tools/bin/python scripts/generate-alerting-catalog.py --date 2026-09-26 --check
```

发布规则或探针变更时，用本次维护日期再生成并运行 `--check`；日期相同的重复生成字节一致。
`--kubernetes PATH` 可指定 checkout。`--check` 非零表示本文与该 checkout 的源码不一致；
它不检查集群内存加载态，部署后仍须核对 vmalert rules API 与 Gatus 配置。

## 规则文件总览

| 源文件（components/vmalert/rules） | alert | record | SHA-256 |
|---|---:|---:|---|
| cnpg.yml | 10 | 0 | `d53a0e663e470083d91cb95e37dde716b5d2de6b8c1bf5f7b4f2846d51d4d03c` |
| ecommerce-app.yml | 5 | 0 | `f943309d3d1ef53d54bc54aece8c9d4fa1545af4deeeb25bda14c82e73a229ec` |
| ecommerce-cdc.yml | 9 | 0 | `4ff58942b9c0645fab4cab5e44b51f77a03856176c4ea9f4a1da5a62b3451ad9` |
| ecommerce-k8s.yml | 8 | 0 | `8430f52a8b1d8eba57aa8ae59dad27bd199dc46353791ed12479e9f05652203e` |
| ecommerce-observability-readiness.yml | 2 | 0 | `ca9571c2364129946a0ffb9c7cc5a53af38bdc215f59995524925fe0317d7baf` |
| ecommerce-security.yml | 5 | 0 | `3cd85e90b090726110a87ce8d1c8800c33b183975c63a65f686011cef25bef7c` |
| observability-pipeline.yml | 6 | 0 | `28e08b0d9af9c7a4b27c69e55633fe41c0f488e43029bd0be738a136f02abcaf` |
| **合计** | **45** | **0** | |

## 逐条规则

severity 是规则源标签；critical/crit 仍保留其级别，由 bridge 映射 core/page priority 4。
其余 severity 进入 ticket（Watchdog 在 AM 先路由 null）。每条 expr 与全部 annotations 原样保留；
description 中的操作是排障提示，不构成自动执行授权，也不代表其中历史措辞已逐条复验。

### 1. CNPGMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
absent(cnpg_collector_up) == 1
```

```yaml
labels:
  severity: critical
  category: database
annotations:
  summary: CNPG 指标停止写入 VictoriaMetrics
  description: 连续 10 分钟没有 cnpg_collector_up。检查 postgresql 命名空间的实例 Pod 是否 Running、otel collector 的 cnpg 抓取 job 与到 VM 的写入。此时本文件所有数据库告警均已失效。
```

### 2. PostgresDown

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
cnpg_collector_up == 0
```

```yaml
labels:
  severity: critical
  category: database
annotations:
  summary: PostgreSQL 实例不可用 {{ $labels.pod }}
  description: 实例持续不可用超过 10 分钟。先看 kubectl -n postgresql get cluster pg-main 与 describe pod；核对数据库连接及业务影响。
```

### 3. PostgresRestarted

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
(changes(cnpg_pg_postmaster_start_time[10m]) > 0) and on(pod) (cnpg_collector_up == 0)
```

```yaml
labels:
  severity: warning
  category: database
annotations:
  summary: PostgreSQL 实例最近重启 {{ $labels.pod }}
  description: 正常的参数变更(shared_buffers 等)也会触发滚动重启；先对照 CNPG 事件区分"计划内"与"崩溃"。
```

### 4. PostgresReplicationLag

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
cnpg_pg_replication_lag > 30
```

```yaml
labels:
  severity: warning
  category: database
annotations:
  summary: 从库复制延迟 {{ $value | printf "%.0f" }}s {{ $labels.pod }}
  description: 复制延迟超过 30 秒持续 5 分钟。看从库 IO/网络与主库 WAL 生成速率；延迟期间 -ro 服务读到的是旧数据。
```

### 5. PostgresXidWrapAround

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`15m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
max by (pod) (cnpg_pg_database_xid_age) > 1000000000
```

```yaml
labels:
  severity: critical
  category: database
annotations:
  summary: 事务 ID 年龄超过 10 亿 {{ $labels.pod }}
  description: 距事务 ID 回卷保护停库已不远。立刻对 age 最大的库做 VACUUM FREEZE，并检查是否有长事务/失效复制槽阻止冻结。
```

### 6. PostgresConnUsageHigh

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
sum by (pod) (cnpg_backends_total) / on (pod) cnpg_pg_settings_setting{name="max_connections"} > 0.8
```

```yaml
labels:
  severity: warning
  category: database
annotations:
  summary: 连接数占用超过 80% {{ $labels.pod }}
  description: 业务应走 Pooler(事务池)而不是直连；先查是谁在直连(pg_stat_activity 的 application_name/client_addr)，再考虑调 max_connections。
```

### 7. PostgresIdleInTransaction

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
max by (pod) (cnpg_backends_max_tx_duration_seconds{state="idle in transaction"}) > 300
```

```yaml
labels:
  severity: warning
  category: database
annotations:
  summary: 存在超过 5 分钟的 idle-in-transaction 会话 {{ $labels.pod }}
  description: 事务开着不提交会挡住 autovacuum 并持有锁。实例参数 idle_in_transaction_session_timeout=10min 会强杀，但更该找到是哪个服务泄漏了事务。
```

### 8. PostgresWALArchiveFailing

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`15m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
increase(cnpg_pg_stat_archiver_failed_count_total[15m]) > 0
```

```yaml
labels:
  severity: critical
  category: database
annotations:
  summary: WAL 归档持续失败 {{ $labels.pod }}
  description: 15 分钟内有归档失败且未恢复。查对象存储凭据/网络(kubectl -n postgresql logs <pod> | grep -i archive)；归档断了等于备份的恢复点在倒退。
```

### 9. CNPGBackupStale

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`30m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
time() - max by (cnpg_cluster) (cnpg_collector_last_available_backup_timestamp) > 26 * 3600
```

```yaml
labels:
  severity: critical
  category: backup
annotations:
  summary: CNPG 集群 {{ $labels.cnpg_cluster }} 超过 26 小时没有可用备份
  description: 检查 ScheduledBackup 与最近的 Backup 对象状态(kubectl -n postgresql get backup)。没有备份的数据库不算生产库。
```

### 10. CNPGNoBackupEver

- 源码：同级 kubernetes 的 `components/vmalert/rules/cnpg.yml`；组 `cnpg`。
- interval：`15s`；for：`6h`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
(cnpg_collector_up == 1 unless on (cnpg_cluster) cnpg_collector_last_available_backup_timestamp) or on (cnpg_cluster) (cnpg_collector_last_available_backup_timestamp <= 0)
```

```yaml
labels:
  severity: warning
  category: backup
annotations:
  summary: CNPG 集群 {{ $labels.cnpg_cluster }} 没有任何可用备份
  description: 6 小时内没有出现过 last_available_backup 指标。要么备份没配(components/postgres README 已承认这是缺口)，要么第一次备份一直失败。
```

### 11. EcommerceServiceErrorRateHigh

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-app.yml`；组 `ecommerce-app`。
- interval：`30s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
(
  sum by (service_name, deployment_environment_name) (rate(rpc_server_duration_milliseconds_count{service_name!~"config-service|payment-service",deployment_environment_name!="dev",rpc_connect_rpc_error_code=~"unknown|internal|unavailable|deadline_exceeded|resource_exhausted|data_loss|unimplemented"}[5m]))
  /
  sum by (service_name, deployment_environment_name) (rate(rpc_server_duration_milliseconds_count{service_name!~"config-service|payment-service",deployment_environment_name!="dev"}[5m]))
) > 0.05
and
sum by (service_name, deployment_environment_name) (rate(rpc_server_duration_milliseconds_count{service_name!~"config-service|payment-service",deployment_environment_name!="dev"}[5m])) > 0.02
```

```yaml
labels:
  severity: critical
  category: application
annotations:
  summary: '[{{ $labels.deployment_environment_name }}] {{ $labels.service_name }} 服务侧错误率 {{ $value | humanizePercentage }}（>
    5%，持续 10 分钟）'
  description: 先看 APM 盘「错误分析」区：错误码分布定位是哪类故障，「错误 by 业务 reason」看是否集中在某条业务规则； 再按 logs_query 查日志，用 error.origin 找到抛错的数据层那一行，用
    trace_id 跳 VictoriaTraces 看调用链。 同时看时间轴上的紫色「发布」标记：刚发过版优先考虑回滚。
  dashboard: https://grafana.apikv.com/explore?schemaVersion=1&orgId=1&panes={{ printf `{"a":{"datasource":"P4169E866C3094E38","queries":[{"refId":"A","datasource":{"type":"prometheus","uid":"P4169E866C3094E38"},"expr":"sum
    by (rpc_method, rpc_connect_rpc_error_code) (rate(rpc_server_duration_milliseconds_count{service_name=\"%s\",deployment_environment_name=\"%s\",rpc_connect_rpc_error_code!=\"\"}[5m]))"}],"range":{"from":"now-1h","to":"now"}}}`
    $labels.service_name $labels.deployment_environment_name | queryEscape }}
  logs_query: service.name:="{{ $labels.service_name }}" deployment.environment.name:="{{ $labels.deployment_environment_name
    }}" rpc.code:in(unknown,internal,unavailable,deadline_exceeded,resource_exhausted,data_loss,unimplemented)
```

### 12. EcommerceUnknownErrorShareHigh

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-app.yml`；组 `ecommerce-app`。
- interval：`30s`；for：`1h`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
(
  sum by (service_name, deployment_environment_name) (increase(rpc_server_duration_milliseconds_count{service_name!~"config-service|payment-service",deployment_environment_name!="dev",rpc_connect_rpc_error_code="unknown"}[1h]))
  /
  sum by (service_name, deployment_environment_name) (increase(rpc_server_duration_milliseconds_count{service_name!~"config-service|payment-service",deployment_environment_name!="dev",rpc_connect_rpc_error_code=~"unknown|internal|unavailable|deadline_exceeded|resource_exhausted|data_loss|unimplemented"}[1h]))
) > 0.5
and
sum by (service_name, deployment_environment_name) (increase(rpc_server_duration_milliseconds_count{service_name!~"config-service|payment-service",deployment_environment_name!="dev",rpc_connect_rpc_error_code="unknown"}[1h])) >= 10
```

```yaml
labels:
  severity: warning
  category: application
annotations:
  summary: '[{{ $labels.deployment_environment_name }}] {{ $labels.service_name }} 的服务侧错误里 {{ $value | humanizePercentage
    }} 是兜底码 unknown'
  description: 有错误路径没有被 service 层映射归类。按 logs_query 找出这些错误的 error.origin 与错误文本， 在 service 层补 errors.Is 映射（或给领域错误声明 errinfo
    reason）。不是故障，不需要立即处置。
  dashboard: https://grafana.apikv.com/explore?schemaVersion=1&orgId=1&panes={{ printf `{"a":{"datasource":"P4169E866C3094E38","queries":[{"refId":"A","datasource":{"type":"prometheus","uid":"P4169E866C3094E38"},"expr":"sum
    by (rpc_method) (increase(rpc_server_duration_milliseconds_count{service_name=\"%s\",deployment_environment_name=\"%s\",rpc_connect_rpc_error_code=\"unknown\"}[1h]))"}],"range":{"from":"now-6h","to":"now"}}}`
    $labels.service_name $labels.deployment_environment_name | queryEscape }}
  logs_query: service.name:="{{ $labels.service_name }}" deployment.environment.name:="{{ $labels.deployment_environment_name
    }}" rpc.code:="unknown"
```

### 13. EcommerceRPCMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-app.yml`；组 `ecommerce-app`。
- interval：`30s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
(count(k8s_deployment_available{k8s_namespace_name="ecommerce",k8s_deployment_name=~"ecommerce-.+-deploy"} > 0) > 0)
unless on ()
(count(rpc_server_duration_milliseconds_count{service_name!="config-service",deployment_environment_name!="dev"}) > 0)
```

```yaml
labels:
  severity: warning
  category: application
annotations:
  summary: ecommerce 后端 Deployment 在跑，但 15 分钟内没有任何 RPC 指标
  description: 服务 OTLP 指标链路断了：应用错误率告警此刻全部失效（无数据不会触发）。检查服务 observability.enable 配置、 OTel collector 的 metrics pipeline 与 VictoriaMetrics
    写入口认证。
  dashboard: https://grafana.apikv.com/explore?schemaVersion=1&orgId=1&panes=%7B%22a%22%3A%7B%22datasource%22%3A%22P4169E866C3094E38%22%2C%22queries%22%3A%5B%7B%22refId%22%3A%22A%22%2C%22datasource%22%3A%7B%22type%22%3A%22prometheus%22%2C%22uid%22%3A%22P4169E866C3094E38%22%7D%2C%22expr%22%3A%22count%20by%20%28service_name%2C%20deployment_environment_name%29%20%28rpc_server_duration_milliseconds_count%29%22%7D%5D%2C%22range%22%3A%7B%22from%22%3A%22now-3h%22%2C%22to%22%3A%22now%22%7D%7D%7D
  logs_query: deployment.environment.name:!="dev" severity_text:=error
```

### 14. EcommerceConfigStale

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-app.yml`；组 `ecommerce-app`。
- interval：`30s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
max by (service_name, deployment_environment_name, component) (
  connectkit_config_stale{deployment_environment_name!="dev"}
) == 1
```

```yaml
labels:
  severity: warning
  category: application
annotations:
  summary: '[{{ $labels.deployment_environment_name }}] {{ $labels.service_name }} 的 {{ $labels.component }} 没有应用最新配置'
  description: 新连接按最新配置重建失败，服务仍在使用上一份可用连接；当前请求可能正常，但下次重启会直接读取坏配置并启动失败。 先查 logs_query 对应的 rebuild failed 日志，修正 Config Center
    后确认本告警恢复 resolved。
  dashboard: https://grafana.apikv.com/explore?schemaVersion=1&orgId=1&panes={{ printf `{"a":{"datasource":"P4169E866C3094E38","queries":[{"refId":"A","datasource":{"type":"prometheus","uid":"P4169E866C3094E38"},"expr":"connectkit_config_stale{service_name=\"%s\",deployment_environment_name=\"%s\"}"}],"range":{"from":"now-1h","to":"now"}}}`
    $labels.service_name $labels.deployment_environment_name | queryEscape }}
  logs_query: service.name:="{{ $labels.service_name }}" deployment.environment.name:="{{ $labels.deployment_environment_name
    }}" _msg:~"rebuild .* failed, keeping the current one"
```

### 15. EcommerceConfigStaleMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-app.yml`；组 `ecommerce-app`。
- interval：`30s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
(
  label_set(
    count by (service_name, deployment_environment_name) (
      rpc_server_duration_milliseconds_count{service_name=~"user-identity|behavior-service|product-service|cart-service|address-service|order-service|inventory-service|merchant-service|payment-service",deployment_environment_name!="dev"}
    ) > 0,
    "component", "pgpool"
  )
  unless on (service_name, deployment_environment_name, component)
  count by (service_name, deployment_environment_name, component) (
    connectkit_config_stale{component="pgpool",deployment_environment_name!="dev"}
  )
)
or
(
  label_set(
    count by (service_name, deployment_environment_name) (
      rpc_server_duration_milliseconds_count{service_name=~"user-identity|behavior-service|product-service|cart-service|address-service|order-service|inventory-service|merchant-service",deployment_environment_name!="dev"}
    ) > 0,
    "component", "redisclient"
  )
  unless on (service_name, deployment_environment_name, component)
  count by (service_name, deployment_environment_name, component) (
    connectkit_config_stale{component="redisclient",deployment_environment_name!="dev"}
  )
)
```

```yaml
labels:
  severity: warning
  category: application
annotations:
  summary: '[{{ $labels.deployment_environment_name }}] {{ $labels.service_name }} 有 RPC 指标，但没有配置生效状态指标'
  description: 该服务的 OTel 指标链可用，但 {{ $labels.component }} 的 connectkit_config_stale 缺失。 检查镜像是否已升级到包含 go-connect-kit 修复的版本；缺指标时
    EcommerceConfigStale 无法发现该连接配置未生效。 该规则检查服务级 component 完全缺失，不用于判断滚动发布期间的单副本覆盖率。
  dashboard: https://grafana.apikv.com/explore?schemaVersion=1&orgId=1&panes=%7B%22a%22%3A%7B%22datasource%22%3A%22P4169E866C3094E38%22%2C%22queries%22%3A%5B%7B%22refId%22%3A%22A%22%2C%22datasource%22%3A%7B%22type%22%3A%22prometheus%22%2C%22uid%22%3A%22P4169E866C3094E38%22%7D%2C%22expr%22%3A%22count%20by%20%28service_name%2C%20deployment_environment_name%2C%20component%29%20%28connectkit_config_stale%29%22%7D%5D%2C%22range%22%3A%7B%22from%22%3A%22now-3h%22%2C%22to%22%3A%22now%22%7D%7D%7D
  logs_query: service.name:="{{ $labels.service_name }}" deployment.environment.name:="{{ $labels.deployment_environment_name
    }}" severity_text:=error
```

### 16. CDCSlotWalRetention

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`30m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
max by (slot_name) (cnpg_pg_replication_slots_pg_wal_lsn_diff) > 256 * 1024 * 1024
```

```yaml
labels:
  severity: warning
  category: cdc
annotations:
  summary: 逻辑复制槽 {{ $labels.slot_name }} 位点差 {{ $value | humanize1024 }}B, WAL 被钉住
  description: '被监控表无写入时 Debezium 不推进 confirmed_flush_lsn, 整库 WAL 被槽保留。 核对 components/kafka/cdc/ecommerce-postgres-source.yaml
    的 lsn.flush.mode=connector_and_driver 与 heartbeat.interval.ms 是否还在, KafkaConnector task 是否 RUNNING; psql: select slot_name,
    pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) from pg_replication_slots。'
```

### 17. CDCSlotInactive

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`10m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
cnpg_pg_replication_slots_active{slot_name="ecommerce_cdc"} == 0
```

```yaml
labels:
  severity: critical
  category: cdc
annotations:
  summary: 复制槽 ecommerce_cdc 无活跃消费者
  description: kubectl -n kafka get kafkaconnector ecommerce-postgres-source; task 非 RUNNING 就看 Connect 日志。
```

### 18. CDCSlotMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
absent(cnpg_pg_replication_slots_pg_wal_lsn_diff{slot_name="ecommerce_cdc"}) == 1
```

```yaml
labels:
  severity: warning
  category: cdc
annotations:
  summary: CNPG 复制槽指标缺失, CDC 位点告警已失效
  description: 检查 cnpg pg-main 的 metrics 端口是否被 otel/VM 抓取, 以及槽 ecommerce_cdc 是否还存在。
```

### 19. CDCConnectTaskNotRunning

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
kafka_connect_connector_task_status{connector=~"ecommerce-.*", status!="running"} == 1
```

```yaml
labels:
  severity: critical
  category: cdc
annotations:
  summary: Connect task {{ $labels.connector }}/{{ $labels.task }} 状态 {{ $labels.status }}
  description: kubectl -n kafka get kafkaconnector {{ $labels.connector }} -o jsonpath='{.status.connectorStatus.tasks[0].trace}';
    source 使用 snapshot.mode=initial + offset.mismatch.strategy=trust_greater_lsn；位点不匹配不会自动全量重快照。先查 Connect 日志与 PG slot/offset，再判断是否需要人工恢复。
```

### 20. CDCDebeziumDisconnected

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
debezium_metrics_connected{context="streaming"} == 0
```

```yaml
labels:
  severity: critical
  category: cdc
annotations:
  summary: Debezium {{ $labels.server }} 与 PG 复制流断开
  description: 看 pg-main 是否切主/重启, 槽 ecommerce_cdc 是否还在; kubectl -n kafka logs my-connect-cluster-connect-0 | grep -i replication
```

### 21. CDCDebeziumLagHigh

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
debezium_metrics_millisecondsbehindsource{context="streaming"} > 300000
```

```yaml
labels:
  severity: warning
  category: cdc
annotations:
  summary: Debezium {{ $labels.server }} 落后源库 {{ $value | humanizeDuration }}
  description: 看 Connect CPU/内存与 Kafka broker 是否在滚动; 持续增长说明消费不过来。
```

### 22. CDCConnectMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
absent(kafka_connect_connector_task_status{connector="ecommerce-postgres-source"}) == 1
```

```yaml
labels:
  severity: warning
  category: cdc
annotations:
  summary: Connect JMX 指标缺失, task 级 CDC 告警已失效
  description: 检查 KafkaConnect CR 的 metricsConfig、Pod 端口 tcp-prometheus、otel prometheus/kafka 的 strimzi-jmx job。
```

### 23. CDCReconcileMismatch

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`15m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
abs(
  max by (cdc_table) (cnpg_cdc_rows_count)
  - on (cdc_table) max by (cdc_table) (cdc_es_docs_count)
) > 0
```

```yaml
labels:
  severity: critical
  category: cdc
annotations:
  summary: 'CDC 对账不平: {{ $labels.cdc_table }} PG 与 ES 相差 {{ $value }} 行'
  description: '链路各部件可能全绿(见 experience/debezium-offset-behind-slot-after-broker-roll.md 的「信任槽」代价)。 先看 DLQ topic ecommerce_cdc.elasticsearch.dlq
    有没有消息, 再比对具体 id: PG 查 id 列表 vs ES _search _source=false。'
```

### 24. CDCReconcileStale

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-cdc.yml`；组 `ecommerce-cdc`。
- interval：`60s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
absent_over_time(cdc_es_reconcile_run_ok[20m]) == 1 or max_over_time(cdc_es_reconcile_run_ok[20m]) == 0
```

```yaml
labels:
  severity: warning
  category: cdc
annotations:
  summary: CDC 对账 CronJob 20 分钟无成功运行
  description: kubectl -n kafka get jobs -l job-name | grep cdc-reconcile; kubectl -n kafka logs job/<最近一个>
```

### 25. K8sPodRestartStorm

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
(sum by (k8s_namespace_name,k8s_pod_name) (increase(k8s_container_restarts[15m])) > 2) and on(k8s_namespace_name,k8s_pod_name) (min by (k8s_namespace_name,k8s_pod_name) (k8s_container_ready) == 0) and on(k8s_namespace_name,k8s_pod_name) (k8s_pod_phase == 2)
```

```yaml
labels:
  severity: critical
  category: kubernetes
annotations:
  summary: Pod 重启风暴 {{ $labels.k8s_namespace_name }}/{{ $labels.k8s_pod_name }}（15 分钟 {{ $value | printf "%.0f" }} 次）
  description: 该 Pod 正在崩溃循环。先看 kubectl logs --previous 与 describe 的退出码；若同一 namespace 多个 Pod 同时中招，优先查共同依赖（缓存/数据库/网络策略），不要逐个服务排查。
```

### 26. K8sContainerNotReady

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
(min by (k8s_namespace_name,k8s_pod_name,k8s_container_name) (k8s_container_ready) == 0) and on(k8s_namespace_name,k8s_pod_name) (k8s_pod_phase == 2)
```

```yaml
labels:
  severity: warning
  category: kubernetes
annotations:
  summary: 容器持续未就绪 {{ $labels.k8s_namespace_name }}/{{ $labels.k8s_pod_name }}
  description: 容器已运行但就绪探针连续 15 分钟未通过。进程活着不等于在干活——重点查它依赖的下游是否可达。
```

### 27. K8sDeploymentUnavailable

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
(k8s_deployment_available == 0) and on(k8s_deployment_uid) (k8s_deployment_desired > 0)
```

```yaml
labels:
  severity: critical
  category: kubernetes
annotations:
  summary: Deployment 持续无可用副本 {{ $labels.k8s_namespace_name }}/{{ $labels.k8s_deployment_name }}
  description: 期望运行的服务连续 10 分钟没有可用副本。先查看 Deployment 的 rollout 状态及 Pod describe，区分发布失败与依赖故障。
```

### 28. K8sDeploymentDegraded

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`warning`；类型：`alert`。

```promql
(k8s_deployment_available > 0) and on(k8s_deployment_uid) (k8s_deployment_available < on(k8s_deployment_uid) k8s_deployment_desired)
```

```yaml
labels:
  severity: warning
  category: kubernetes
annotations:
  summary: Deployment 副本不足 {{ $labels.k8s_namespace_name }}/{{ $labels.k8s_deployment_name }}
  description: 仍有可用副本，但持续 10 分钟少于期望值。作为容量或冗余待办检查 rollout、调度与资源；完全不可用由 K8sDeploymentUnavailable 通知。
```

### 29. K8sFailedPodsAccumulating

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
count(k8s_pod_phase == 4) > 10
```

```yaml
labels:
  severity: warning
  category: kubernetes
annotations:
  summary: Kubernetes Failed Pod 积压 {{ $value | printf "%.0f" }} 个
  description: Failed phase Pod 超过 10 个并持续 15 分钟。先按 namespace 与 owner 归类，确认活动副本健康并保留必要日志，再定向清理终态历史；同时检查 kube-controller-manager
    PodGC 与 leader lease。
```

### 30. K8sNodeNotReady

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
k8s_node_condition_ready == 0
```

```yaml
labels:
  severity: critical
  category: kubernetes
annotations:
  summary: 节点 NotReady {{ $labels.k8s_node_name }}
  description: 三节点集群失去一个节点。检查 kubelet、容器运行时与网络；注意节点恢复不会自动把已迁走的 Pod 搬回来。
```

### 31. K8sClusterMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
absent(k8s_container_restarts) == 1
```

```yaml
labels:
  severity: critical
  category: observability
annotations:
  summary: K8s 集群指标停止写入 VictoriaMetrics
  description: 连续 10 分钟收不到 k8s_container_restarts。检查集群内 otel-opentelemetry-collector（单副本，本链路单点）、其 k8s_cluster receiver 与到集群内
    VictoriaMetrics 的写入。此时所有 K8s 告警均已失效。
```

### 32. AlertFiringTooLong

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-k8s.yml`；组 `ecommerce-k8s`。
- interval：`15s`；for：`15m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
(time() - ALERTS_FOR_STATE{alertname!~"AlertFiringTooLong|Watchdog"}) > 4*3600
```

```yaml
labels:
  severity: warning
  category: observability
annotations:
  summary: 告警已持续 {{ $value | humanizeDuration }}：{{ $labels.alertname }}
  description: 该告警长期未恢复，已失去信号价值。必须二选一：修掉根因，或删掉/修正这条规则。不要靠调阈值让它变绿——那会把真问题永久藏起来。
```

### 33. VectorDaemonSetReadyBelowExpected

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-observability-readiness.yml`；组 `ecommerce-observability-readiness`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
k8s_daemonset_ready_nodes{k8s_namespace_name="logging",k8s_daemonset_name="vector"} < on(k8s_daemonset_uid) k8s_daemonset_desired_scheduled_nodes{k8s_namespace_name="logging",k8s_daemonset_name="vector"}
```

```yaml
labels:
  severity: critical
  category: observability
annotations:
  summary: Vector DaemonSet Ready 节点数低于期望值
  description: Vector Ready 节点数连续 10 分钟少于该 DaemonSet 的 desired。检查 logging/vector Pod、节点状态与日志写入链路；不将整组指标缺失视作零副本。
```

### 34. OTelClusterCollectorReadyBelowExpected

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-observability-readiness.yml`；组 `ecommerce-observability-readiness`。
- interval：`15s`；for：`10m`；keep_firing_for：`5m`。
- severity：`critical`；类型：`alert`。

```promql
k8s_deployment_available{k8s_namespace_name="opentelemetry",k8s_deployment_name="otel-opentelemetry-collector"} < 1
```

```yaml
labels:
  severity: critical
  category: observability
annotations:
  summary: 集群内 OTel Collector Ready 副本数低于 1
  description: OTel Collector 连续 10 分钟没有可用副本。若对象指标也消失，则由 K8sClusterMetricsMissing 与独立 Gatus 探针负责发现，避免无数据生成多条零副本告警。
```

### 35. EcommerceServiceAccountTokenAccess

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-security.yml`；组 `ecommerce-security`。
- interval：`15s`；for：`1m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
increase(ecommerce_tetragon_security_events_total{event_type="token_access"}[5m]) > 0
```

```yaml
labels:
  severity: critical
  category: runtime-security
annotations:
  summary: ecommerce 工作负载读取了 projected ServiceAccount token
  description: Tetragon 在最近 5 分钟观察到 token 文件访问。立即查询 VictoriaLogs 中的 policy_name、Pod、binary 和 parent chain；不要输出 token 内容。
```

### 36. EcommerceSuspiciousToolExec

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-security.yml`；组 `ecommerce-security`。
- interval：`15s`；for：`1m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
increase(ecommerce_tetragon_security_events_total{event_type="suspicious_exec"}[5m]) > 0
```

```yaml
labels:
  severity: warning
  category: runtime-security
annotations:
  summary: ecommerce 工作负载启动了 shell 或网络调试工具
  description: 最近 5 分钟出现 bash、sh、curl、wget、nc、ncat 或 socat。先确认是否为授权运维，再按 Pod、binary、UID 和 parent chain 调查。
```

### 37. EcommerceSecurityMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-security.yml`；组 `ecommerce-security`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
absent(scrape_samples_scraped{service_name="vector-security"}) == 1
```

```yaml
labels:
  severity: warning
  category: observability
annotations:
  summary: Vector 运行时安全指标停止采集
  description: 连续 10 分钟没有 vector-security scrape 样本。检查 logging/vector Service 的 9598 端口、NetworkPolicy 与 OTel Collector 的 vector-security
    job；此时两条 Tetragon 事件告警均已失效。
```

### 38. EcommerceNetworkPolicyDeniedBurst

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-security.yml`；组 `ecommerce-security`。
- interval：`15s`；for：`1m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
sum(increase(hubble_drop_total{reason="POLICY_DENIED"}[5m])) > 20
```

```yaml
labels:
  severity: warning
  category: network-security
annotations:
  summary: Cilium NetworkPolicy 拒绝流量突增
  description: 最近 5 分钟 POLICY_DENIED 超过 20 次。通过 Hubble Relay 查询 DROPPED flow，定位 source、destination、port 和 CNP；不要为消除告警扩大 CIDR
    或放开 default-deny。
```

### 39. HubbleFlowTelemetryMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/ecommerce-security.yml`；组 `ecommerce-security`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
absent(hubble_flows_processed_total) == 1
```

```yaml
labels:
  severity: warning
  category: observability
annotations:
  summary: Hubble flow 指标停止写入 VictoriaMetrics
  description: 连续 10 分钟没有 hubble_flows_processed_total。检查 Cilium DaemonSet、Hubble metrics、OTel Collector prometheus/cilium
    receiver 与远端写入链路。
```

### 40. Watchdog

- 源码：同级 kubernetes 的 `components/vmalert/rules/observability-pipeline.yml`；组 `observability-pipeline`。
- interval：`15s`；for：`0s`；keep_firing_for：`0s`。
- severity：`none`；类型：`alert`。

```promql
vector(1)
```

```yaml
labels:
  severity: none
  category: observability
annotations:
  summary: 告警链路心跳(永远 firing, 不推送)
  description: 这条告警消失说明 vmalert 停止评估或到 Alertmanager 的通知断了。
```

### 41. VMAlertNotifierErrors

- 源码：同级 kubernetes 的 `components/vmalert/rules/observability-pipeline.yml`；组 `observability-pipeline`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
increase(vmalert_alerts_send_errors_total[10m]) > 0
```

```yaml
labels:
  severity: critical
  category: observability
annotations:
  summary: vmalert 向 Alertmanager 发送告警失败
  description: 最近 10 分钟有发送错误且未恢复。检查 observability/alertmanager StatefulSet 与 vmalert 的 -notifier.url。此时所有告警都到不了手机。
```

### 42. VMAlertRemoteWriteErrors

- 源码：同级 kubernetes 的 `components/vmalert/rules/observability-pipeline.yml`；组 `observability-pipeline`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
increase(vmalert_remotewrite_errors_total[10m]) > 0
```

```yaml
labels:
  severity: warning
  category: observability
annotations:
  summary: vmalert remoteWrite 到 VictoriaMetrics 失败
  description: 告警状态无法持久化。检查 vmalert 的 -remoteWrite.url 与 VM 写入端口。
```

### 43. AlertmanagerNotificationFailures

- 源码：同级 kubernetes 的 `components/vmalert/rules/observability-pipeline.yml`；组 `observability-pipeline`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`critical`；类型：`alert`。

```promql
increase(alertmanager_notifications_failed_total[10m]) > 0
```

```yaml
labels:
  severity: critical
  category: observability
annotations:
  summary: Alertmanager 通知失败 (integration={{ $labels.integration }})
  description: 最近 10 分钟通知投递失败且未恢复。先 kubectl -n observability logs deploy/alert-bridge 看桥是否收到、ntfy 是否返回非 2xx。
```

### 44. AlertmanagerMetricsMissing

- 源码：同级 kubernetes 的 `components/vmalert/rules/observability-pipeline.yml`；组 `observability-pipeline`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
absent(alertmanager_build_info) == 1
```

```yaml
labels:
  severity: warning
  category: observability
annotations:
  summary: 抓不到 Alertmanager 指标
  description: 连续 10 分钟没有 alertmanager_build_info。检查 otel collector 的 alertmanager 抓取 job 与 Alertmanager Pod。
```

### 45. OTelCollectorExporterQueueHigh

- 源码：同级 kubernetes 的 `components/vmalert/rules/observability-pipeline.yml`；组 `observability-pipeline`。
- interval：`15s`；for：`10m`；keep_firing_for：`0s`。
- severity：`warning`；类型：`alert`。

```promql
max by (exporter) (otelcol_exporter_queue_size / otelcol_exporter_queue_capacity) > 0.8
```

```yaml
labels:
  severity: warning
  category: observability
annotations:
  summary: OTel Collector 导出队列超过 80% (exporter={{ $labels.exporter }})
  description: 数据即将被丢弃。对照 exporter 名(victoriametrics/victorialogs/victoriatraces)检查对应后端、网络和磁盘；VL/VT 撑满 PVC 会拒写。
```

## Gatus 探针（22 项）

源码：同级 kubernetes 的 `components/gatus/endpoints.yaml`。本表保留实际 URL、完整 conditions、
interval 和端点覆盖的失败/恢复阈值。Gatus 没有 PromQL `for`，用连续结果数实现观察窗口；
窗口按第一次异常/成功观测到触发观测的 `(threshold - 1) × interval` 计算。
周期 2m 的恢复窗口为 6m（不短于 5m），不是精确 5m；调度/请求耗时还会带来延迟。
主配置 custom provider 默认 11/6，恢复通知开启、minimum-reminder-interval=0s（不重复提醒）。

| 名称 / 分组 | URL | interval | 失败/恢复次数 | 观测窗口（故障/恢复） | 完整 conditions |
|---|---|---|---|---|---|
| alert-bridge / cluster-origin | `http://alert-bridge.observability.svc.cluster.local:9099/healthz` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200`<br>`[BODY].ok == true`<br>`[BODY].ntfy == true` |
| otel-collector / cluster-origin | `http://otel-opentelemetry-collector.opentelemetry.svc.cluster.local:4318/v1/traces` | 1m | 11/6 | 10m / 5m | `[STATUS] == 405` |
| healthchecks / cluster-origin | `http://healthchecks.ops.svc.cluster.local:8000/api/v3/status/` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200` |
| config-center-api / cluster-origin | `http://config-center.config-center.svc.cluster.local:30010/health` | 1m | 11/6 | 10m / 5m | `[STATUS] == 401` |
| config-center-web / cluster-origin | `http://config-center-web.config-center.svc.cluster.local/` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200` |
| openbao-unsealed / cluster-origin | `http://openbao.openbao.svc.cluster.local:8200/v1/sys/health` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200`<br>`[BODY].sealed == false`<br>`[BODY].initialized == true` |
| postgres-cnpg / cluster-origin | `tcp://pg-main-rw.postgresql.svc.cluster.local:5432` | 1m | 11/6 | 10m / 5m | `[CONNECTED] == true` |
| alert-pipeline-watchdog / observability-pipeline | `http://alertmanager.observability.svc.cluster.local:9093/api/v2/alerts?filter=alertname%3DWatchdog` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200`<br>`len([BODY]) > 0` |
| k8s-cluster-state-ingestion / observability-pipeline | `http://vm-single-victoria-metrics-single-server.victoriametrics.svc.cluster.local:8428/api/v1/query?query=max_over_time(k8s_deployment_available%5B5m%5D)` | 2m | 6/4 | 10m / 6m | `[STATUS] == 200`<br>`[BODY].status == success`<br>`len([BODY].data.result) > 0` |
| cdc-source-task / cdc | `http://my-connect-cluster-connect-api.kafka.svc.cluster.local:8083/connectors/ecommerce-postgres-source/status` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200`<br>`[BODY].connector.state == RUNNING`<br>`[BODY].tasks[0].state == RUNNING` |
| cdc-sink-task / cdc | `http://my-connect-cluster-connect-api.kafka.svc.cluster.local:8083/connectors/ecommerce-elasticsearch-sink/status` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200`<br>`[BODY].connector.state == RUNNING`<br>`[BODY].tasks[0].state == RUNNING` |
| elasticsearch / cdc | `http://elasticsearch.elasticsearch.svc.cluster.local:9200/` | 1m | 11/6 | 10m / 5m | `[STATUS] == 401`<br>`[RESPONSE_TIME] < 3000` |
| casdoor / public-edge | `https://casdoor.apikv.com/api/health` | 1m | 11/6 | 10m / 5m | `[STATUS] == 200`<br>`[CERTIFICATE_EXPIRATION] > 720h`<br>`[RESPONSE_TIME] < 5000` |
| config-center-web-edge / public-edge | `https://config.apikv.com/` | 2m | 6/4 | 10m / 6m | `[STATUS] == 200`<br>`[CERTIFICATE_EXPIRATION] > 720h`<br>`[RESPONSE_TIME] < 5000` |
| config-center-api-edge / public-edge | `https://config-api.apikv.com/health` | 2m | 6/4 | 10m / 6m | `[STATUS] == 401`<br>`[CERTIFICATE_EXPIRATION] > 720h`<br>`[RESPONSE_TIME] < 5000` |
| grafana-edge / public-edge | `https://grafana.apikv.com/api/health` | 2m | 6/4 | 10m / 6m | `[STATUS] == 200`<br>`[CERTIFICATE_EXPIRATION] > 720h` |
| metrics-edge / public-edge | `https://metrics.apikv.com/api/v1/query?query=vm_app_version` | 2m | 6/4 | 10m / 6m | `[STATUS] == 200`<br>`[BODY].status == success`<br>`[CERTIFICATE_EXPIRATION] > 720h` |
| redis-edge / public-edge | `tcp://redis-dev.apikv.com:30005` | 5m | 3/2 | 10m / 5m | `[CONNECTED] == true` |
| pg-edge / public-edge | `tcp://pangolin.apikv.com:30001` | 5m | 3/2 | 10m / 5m | `[CONNECTED] == true` |
| homepage / node1-public | `https://apikv.com/` | 5m | 3/2 | 10m / 5m | `[STATUS] == 200`<br>`[CERTIFICATE_EXPIRATION] > 720h` |
| pangolin / node1-public | `https://pangolin.apikv.com/` | 5m | 3/2 | 10m / 5m | `[STATUS] == 200`<br>`[CERTIFICATE_EXPIRATION] > 720h` |
| ntfy / node1-public | `https://ntfy.apikv.com/v1/health` | 5m | 3/2 | 10m / 5m | `[STATUS] == 200`<br>`[CERTIFICATE_EXPIRATION] > 720h` |

URL 仅包含受控健康检查/指标查询，不包含 topic、token、用户名密码或业务查询结果。
TCP、匿名 HTTP、指标存在性各自证明的边界不同；探针成功不等于端到端业务成功。
