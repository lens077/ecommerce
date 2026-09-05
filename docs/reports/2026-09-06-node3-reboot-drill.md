# node3 受控重启演练报告（2026-09-06）

> 2026-09-04 事故（node3 重启后 `.172` 服务地址未恢复，PostgreSQL/Redis 起不来，Config Center 与全部 ecommerce 服务不可用）修复后的验证。
> 演练前先处理了顺带发现的第二个故障：Debezium 复制槽被 Patroni 删除、source task 静默 FAILED。
> 演练方式：`sudo systemctl reboot`，本机脚本轮询 node3 组件恢复时刻，另一路每 15s 采样集群 Deployment/搜索深健康。

## 结论

1. **`.172` 持久化修复成立**：开机即同时持有 `10.10.21.163/24` 与 `10.10.21.172/24`（netplan），Patroni/Kafka 开机即 active，PostgreSQL 在 SSH 恢复后 27s 内可写。
2. **CDC 复制槽跨重启存活**：把 `ecommerce_cdc` 声明为 Patroni 永久逻辑槽后，重启后槽仍在（inactive 等待 Debezium），Connect 容器 +193s 恢复后 task 全 RUNNING、槽转 active、Sink lag 0，真实增量 2.4s 到达 ES。修复前三次 PG 重启都会丢槽。
3. **集群侧自愈，无需人工**：10 个业务服务 + Config Center 在 +20s 失去就绪，+93s 全部恢复；search 依赖 ES 容器，+156s 恢复；全程无 CrashLoopBackOff，无人介入。对照 09-04 事故时需要手工重建 Config Center 与 CrashLoop Pod——差别在于这次数据面 90s 内回来，Pod 重启退避尚未拉长。
4. **Redis 靠重试而非顺序保证**：两个 Redis 实例开机首启（01:41:17）因 `.172` 尚未绑定失败，`Restart=on-failure` 100ms 后重试成功（01:41:18）。能自愈，但 unit 缺少 `After=network-online.target`，属知情保留。

## 时间线（node3 侧，`+秒` 自发出 reboot 起）

| +秒 | 观测 |
|---|---|
| 0 | `systemctl reboot` |
| 4 | SSH 断开 |
| 91 | SSH 恢复；`uptime -s = 01:41:09` |
| 92 | `ens160` 已同时持有 `.163/24` 与 `.172/24` |
| 93–104 | patroni / redis 6379 / redis 6380 / kafka / docker / vmetrics / vmalert / alertmanager / cdc-connect-exporter 全部 active |
| 116 | kafka_exporter active |
| 118 | Patroni Leader running；`select 1` 成功 |
| 119 | `pg_replication_slots`：`ecommerce_cdc` 存在（inactive） |
| 193 | `cdc-elasticsearch`、`cdc-connect` 容器 healthy |
| 194 | 两个 connector 与 task 全 RUNNING |
| 197 | 复制槽 active |
| 198 | Sink 全 topic lag = 0；Alertmanager 无 cdc 告警 |

## 时间线（集群侧，每 15s 采样）

| +秒 | Deployment 可用 | 说明 |
|---|---|---|
| 0 | 49/49 | 基线 |
| 20 | 38/49 | Config Center + 10 个 ecommerce 服务失去就绪（依赖 PG/Redis） |
| 58 | 37/49 | openfga 也短暂掉出 |
| 93 | 48/49 | Config Center、openfga、9 个服务恢复；只剩 search |
| 156 | 49/49 | search 深健康 `elasticsearch: ok`（ES 容器 +193s 才 healthy，探针更早通过是 alias 查询先于健康检查就绪） |
| 演练后 | 49/49 | 真实 ConnectRPC 查询成功 |

期间唯一的失败 Pod 是 `ces-audit` CronJob 的一次运行（`metrics push failed: timed out`，审计本身 OK），下一轮 2 分钟后成功；失败 Pod 作为历史保留，触发了既有的 `K8sFailedPodsAccumulating` warning。

## 演练前处理的故障：Patroni 删除 Debezium 复制槽

演练前巡检发现 `ecommerce-postgres-source` connector RUNNING、task **FAILED**，`pg_replication_slots` 为空——09-04 19:22 PG 重启时槽被删。Patroni 日志：`Trying to drop unknown replication slot 'ecommerce_cdc'` → `Dropped`（09-01、09-03 亦然，三次复发）。

- 修复：`patronictl edit-config` 加 `slots.ecommerce_cdc = {type: logical, database: ecommerce, plugin: pgoutput}`；Patroni 数秒内自建槽。
- 恢复：按 pipeline RUNBOOK §6.3 步骤 1–4、6–7（暂停 Sink → 停 Source → 删 source offset → resume → initial snapshot 7 张表 → streaming）。**跳过第 5/8 步**（重建 PG 投影、恢复模式新建索引 + 切 alias）的依据：故障后 PG 零写入（`max(updated_at)` 早于故障时刻、`search_catalog` 7 行不变、`spus` 无更新），不存在需要 tombstone 清理的旧文档。恢复后 ES 7 = PG 7，真实增量 1.3s。
- 教训沉淀：`context/project/ecommerce/events/experience/patroni-drops-unmanaged-logical-slot.md`。

## 同日落地的 CDC 链告警

node3 `/infra/rules/ecommerce-cdc.yml`（源：pipeline 仓 `deploy/docker-node3/monitoring/`），12 条规则，只看三类真相：

| 信号 | 来源 | 规则 |
|---|---|---|
| Connect task 状态（按 task） | 新增 `cdc-connect-exporter`（拉 REST `/connectors?expand=status`，127.0.0.1:9405，接入 Pigsty kafka job file_sd） | `CdcConnectUnreachable`、`CdcConnectMetricsAbsent`、`CdcConnectorTaskNotRunning`、`CdcConnectorHasNoTask` |
| 复制槽 | pg_exporter `pg_slot_*{slot_name="ecommerce_cdc"}` | `CdcReplicationSlotMissing`、`CdcReplicationSlotInactive`、`CdcSlotWalRetentionHigh/Critical`、`CdcSlotInvalidated` |
| Sink 积压 | kafka_exporter `kafka_consumergroup_lag` | `CdcSinkLagStuck`、`CdcSinkLagCritical`、`CdcSinkLagMetricAbsent` |

触发测试：暂停 Source，~3 分钟后 `CdcConnectorTaskNotRunning` firing 并到达 Alertmanager（active），resume 后 1 分钟内解除。重启演练期间 Connect 中断 <2 分钟，`CdcConnectUnreachable`（for 2m）按设计未触发；Pigsty 既有的 `PostgresReplicationBreak/Lag`、`PostgresRestart`、`KafkaExporterDown`、`AgentDown` 正常触发并恢复。

## 发现与去向

1. **Redis unit 缺网络就绪顺序**：首启失败靠 `Restart=on-failure` 兜底。Pigsty 托管单元，不直接改；记入基础设施待办，优先级低（自愈 1s）。
2. **`CdcConnectUnreachable` 的 2 分钟窗口刻意容忍整机重启**；如果 Connect 单独挂掉超过 2 分钟一定会响。
3. **ces-audit 在数据面中断期间的 metrics push 失败**会留下 Error Pod 并触发 `K8sFailedPodsAccumulating`——属正确噪声，不改。
4. **未覆盖**：本次是「有序重启」，不是断电/内核崩溃；PG 崩溃恢复、Kafka 日志损坏、ES 分片恢复未验证。仍属 E3 待办。

## 复现方式

```bash
# 本机，需 ssh 别名 node3（免密 sudo）与 kubectl 上下文；两路并行
bash infrastructure/drills/node3-reboot-drill.sh   | tee /tmp/node3-reboot-drill.log
bash infrastructure/drills/k8s-dataplane-watch.sh  | tee /tmp/k8s-drill-watch.log
```

演练脚本核心判据：SSH 恢复 → 各 unit active → Patroni Leader + `select 1` → 槽存在 → 容器 healthy → connector/task 全 RUNNING → 槽 active → Sink lag 0 → 搜索深健康 + 真实查询。
