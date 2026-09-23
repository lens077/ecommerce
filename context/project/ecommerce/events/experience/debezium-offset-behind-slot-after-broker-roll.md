---
name: debezium-offset-behind-slot-after-broker-roll
module: events
description: Debezium PG 用 lsn.flush.mode=connector_and_driver 治 WAL 滞留后，Kafka offset 结构性落后于复制槽，**任何** task 重启都触发「Last recorded offset is no longer available」——snapshot.mode=initial 时 task FAILED 而 connector 仍 RUNNING（2026-09-23 broker 滚动那次），when_needed 时每次重启静默全量重快照（同日晚复现）；正解是 Debezium ≥3.4 的 offset.mismatch.strategy=trust_greater_lsn，配 initial，重启不重快照不 FAILED；Connected/MilliSecondsBehindSource/task status 三条指标看不见这个落后，不是差值告警的等价物
---

# 任何一次重启，CDC 都会重快照或断流

**症状**

给 Strimzi Kafka 加了一个 external listener，broker 滚动一次，`kubectl get kafkaconnector` 两个都 `Ready=True`、
`connector.state=RUNNING`。随后改一行 `products.spus`，topic 末端 offset 不动，ES 文档不变。

同日晚二次复现：什么都没坏，`Connected=1`、`MilliSecondsBehindSource=-1`、task `running`，只是
`strimzi.io/restart-task=0` 重启一次 task——Debezium 打 `Last recorded offset is no longer available on the server`，
`when_needed` 模式下全量重快照（spus topic +7）。

**关键陷阱**

- `kubectl get kafkaconnector` 的 `Ready=True` 与 `connector.state=RUNNING` **都不看 task**。唯一真相是
  `.status.connectorStatus.tasks[0].state`；Gatus `cdc-source-task` 断言的就是它。
- 复制槽 `active=f` 但 `pg_replication_slots` 一行不少、publication 也在——**槽没坏**，别按「槽丢了」的手顺去删重建。
- **broker 滚动只是触发器，不是根因。** 白天第一次排查把它记成「offset 提交被滚动卡住」，是错的；`when_needed` 只是
  把 FAILED 换成了每次重启重快照，表大了是灾难。
- `Connected`、`MilliSecondsBehindSource`、`kafka_connect_connector_task_status` 三条指标在这个状态下**全绿**，
  它们不是「offset 落后槽」的等价替代——只能事后发现 task 死了，看不见「下次重启必出事」。

**根因**

`lsn.flush.mode=connector_and_driver`（治 WAL 滞留，见 [debezium-idle-slot-wal-retention.md](debezium-idle-slot-wal-retention.md)）
允许 pgjdbc 的 keepalive 线程把槽 `confirmed_flush_lsn` 推过与监控表无关的 WAL（vacuum、checkpoint、其它库）。
Kafka Connect 的 offsets topic 只在有事件提交时前进，于是**结构性地落后于槽**（实测空闲十几分钟差 16MB）。
task 重启时 Debezium 拿 offsets 里的 LSN 去续流，发现 `offset_lsn < slot_lsn`：`initial` 模式认为可能丢数据 → FAILED；
`when_needed` → 重快照填补。Debezium 与 Zalando 的说明在
[官方文档 offset.mismatch.strategy](https://debezium.io/documentation/reference/stable/connectors/postgresql.html#postgresql-property-offset-mismatch-strategy)
与 [Contributing to Debezium: Fixing Logical Replication at Scale](https://engineering.zalando.com/posts/2025/12/contributing-to-debezium.html)。

判据（三处同时看）：

```bash
kubectl -n kafka exec my-connect-cluster-connect-0 -- curl -s http://localhost:8083/connectors/ecommerce-postgres-source/offsets
# offset.lsn 是十进制, printf '%x' 转十六进制后与下面比
kubectl -n postgresql exec pg-main-1 -c postgres -- psql -U postgres -d ecommerce -At -F'|' -c \
  "select active, restart_lsn, confirmed_flush_lsn from pg_replication_slots where slot_name='ecommerce_cdc'"
kubectl -n kafka get kafkaconnector -o custom-columns=NAME:.metadata.name,TASK:.status.connectorStatus.tasks[0].state
```

**修法**

`components/kafka/cdc/ecommerce-postgres-source.yaml`（kubernetes 仓）：

```yaml
lsn.flush.mode: connector_and_driver        # 保留, 治 WAL 滞留
snapshot.mode: initial                      # 从 when_needed 改回, 不再每次重启重快照
offset.mismatch.strategy: trust_greater_lsn # Debezium ≥3.4; 启动取 max(offset, slot), 双向同步, 自愈
```

验证：重启前 offset `0x32000130` < 槽 `0x33000130`，重启后 task RUNNING、spus topic 36→36（没重快照），
随后两次真实改行 36→37→38、ES 文档跟着还原。

**代价与边界**

- `trust_greater_lsn` 跳过 offset 与槽之间那段 WAL。按机制那段只含无关 WAL（driver 只在没有待提交事件时 flush），
  但这是「信任槽」——主从切换时槽不持久就可能丢；CNPG 单实例当前没有这个问题，上了副本要先确认槽复制。
- 差值本身现在是**预期非零**，拿它做阈值告警只会是噪音。真正的完整性守卫是 task 级告警
  （`CDCConnectTaskNotRunning`/`CDCDebeziumDisconnected`）加定期对账（PG 行数 vs ES 文档数），后者还没做。
- 改 Kafka/Connect 后必看 `tasks[0].state`。
