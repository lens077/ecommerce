---
name: debezium-offset-behind-slot-after-broker-roll
module: events
description: Kafka broker 滚动（给 Strimzi 加 listener 也算）→ Connect rebalance 重启 Debezium task → 它拿 Connect offsets 里的 LSN 续流，但复制槽 restart_lsn 已经推进到更靠后（位点向 PG 确认了、对 Kafka 的 offset 提交却没落地），PG 无法从旧位点解码 → task FAILED、connector 仍 RUNNING、增量静默丢失；snapshot.mode=initial 只能人工删 offsets 重建，when_needed 让 Debezium 自己重快照恢复，小库首选——2026-09-23 k1/k2/k3 实测
---

# broker 一滚，CDC 就静默断流

**症状**

给 Strimzi Kafka 加了一个 external listener（`kubectl patch kafka ... listeners`），broker 按预期滚动一次，
`kubectl get kafkaconnector` 两个都 `Ready=True`，`connector.state=RUNNING`。随后改一行 `products.spus`，
Kafka topic 末端 offset 不动，ES 文档不变。

**关键陷阱**

- `kubectl get kafkaconnector` 的 `Ready=True` 与 `connector.state=RUNNING` **都不看 task**。唯一真相是
  `.status.connectorStatus.tasks[0].state`；Gatus `cdc-source-task` 探针断言的就是它，也是这次唯一先红的信号。
- 复制槽 `active=f` 但 `pg_replication_slots` 一行不少、publication 也在——**槽没坏**，别按「槽丢了」的手顺去删重建。
- 触发条件是任何让 broker/Connect 重启的操作（加 listener、升版本、改 resources、排空节点），不只是本例的 patch。

**根因**

broker 重启 → Connect worker rebalance → Debezium source task 重启。重启时它从 Connect 的 offsets topic
取回上次提交的位点 `LSN{0/1E001108}` 去续流，但 PG 里复制槽 `ecommerce_cdc` 的 `restart_lsn=0/21000130`、
`confirmed_flush_lsn=0/21000168`——**槽已经跑到前面去了**。Debezium 每处理一批事件就向 PG 确认位点
（`lsn.flush.mode=connector_and_driver`），而向 Kafka 提交 offset 是另一条周期性路径；broker 滚动把后者
卡在中间，于是「PG 认为已消费到 0/2100…」和「Kafka 记着 0/1E00…」分叉。PG 逻辑解码只能从
`restart_lsn` 之后开始，旧位点的 WAL 已回收，Debezium 报
`The connector is trying to read change stream starting at PostgresOffsetContext[... lsn=LSN{0/1E001108} ...],
but this is no longer available on the server. Reconfigure the connector to use a snapshot when needed if you
want to recover.` 然后 task 进 FAILED——**connector 级状态照样 RUNNING**。

判据（三处同时看，缺一个都会误判）：

```bash
kubectl -n kafka get kafkaconnector -o custom-columns=NAME:.metadata.name,\
STATE:.status.connectorStatus.connector.state,TASK:.status.connectorStatus.tasks[0].state
# task 列是 FAILED 才是真相；.status.conditions Ready=True 与 connector.state 都不看 task
kubectl -n postgresql exec pg-main-1 -c postgres -- psql -U postgres -d ecommerce -At -F'|' -c \
  "select slot_name, active, restart_lsn, confirmed_flush_lsn from pg_replication_slots"
# active=f + restart_lsn 大于 task trace 里的 lsn = 就是本文这个坑
kubectl -n kafka exec my-cluster-dual-role-0 -- bin/kafka-get-offsets.sh --bootstrap-server localhost:9092 \
  --topic ecommerce_cdc.products.spus   # 写一行后末端 offset 不 +1 = 增量没进 Kafka
```

**修法**

`components/kafka/cdc/ecommerce-postgres-source.yaml` 把 `snapshot.mode: initial` 改成 `when_needed`
（Debezium 文档：无 offset、或记录的位点在服务器上不可用时自动重做快照）。apply 后 task 自己从 FAILED
转 RUNNING，重快照把每张表的当前行按 `op=r` 再发一遍（spus topic 7→14），然后从槽的新位点接着 streaming。
ES sink 是 `write.method=INSERT` + `key.ignore=false`（external version = offset），重快照只是用更高 version
覆盖同 key 文档，不产生脏数据；`search_catalog` 的 trigger 投影也跟着走完（topic 43→51，ES 文档 v50）。

不要走 README 里「删 CR → 删 slot → 删 topic → 清索引 → 重建」那条——那是 slot 本身坏了或 schema 变了才用的
重手术；这里 slot 完好，只是 offset 落后。

**代价与边界**

- `when_needed` 意味着**以后任何 offsets 丢失都会静默重快照一遍**。种子级数据无所谓；表上百万行时改回
  `initial`，并按 README 手顺人工处理——把这条写在 CR 注释里，别让下一个人以为它是默认值。
- 触发条件不只是「改 listener」：任何让 broker 或 Connect 重启的操作（升版本、改 resources、节点排空）都可能踩到。
  改完 Kafka/Connect 后**必看 task 列**，不看 Ready。
- Gatus `cdc-source-task` 探针（`[BODY].tasks[0].state == RUNNING`）这次是**唯一**先红的信号，
  vmalert 侧仍缺「restart_lsn − connect offset」差值告警（同 [debezium-idle-slot-wal-retention.md](debezium-idle-slot-wal-retention.md) 末尾待办）。
