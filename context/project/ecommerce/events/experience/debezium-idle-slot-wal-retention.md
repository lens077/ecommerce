---
name: debezium-idle-slot-wal-retention
module: events
description: 被监控表长期无写入时 Debezium 不提交 offset，逻辑复制槽位点冻结、WAL 无限滞留，最终触发 max_slot_wal_keep_size 作废槽并被迫全量重快照；加 heartbeat 修复前必须先开 Kafka topic ACL，否则 task 直接 FAILED
---

# CDC 一切正常，却在悄悄撑爆 WAL

**症状**

`PostgresReplicationLag` 告警长期红着不走。去查 CDC，**每一处都是绿的**：

```
容器      cdc-connect            Up 22 hours (healthy)
连接器    ecommerce-postgres-source   RUNNING
任务      task 0                 RUNNING
日志      无 error、无 exception、无 warn
```

但复制槽在悄悄堆积：

```sql
slot_name=ecommerce_cdc  type=logical  active=true  plugin=pgoutput
restart_lag   = 256 MB
confirmed_lag = 256 MB      -- 持续增长，从不下降
```

**关键陷阱**

三层，一层比一层阴。

1. **没有任何报错。** 这是本仓第三个「健康检查绿、功能已死」的案例（另两个见文末「相关」）。
   容器健康检查只探 Kafka Connect 的 REST 端口活着，连接器状态只反映 task 线程没崩——
   两者都不检查**位点有没有推进**，而位点不推进正是这个故障的全部内容。

2. **`flush_lag` 会骗你。** `pg_stat_replication` 的 `write_lag/flush_lag/replay_lag` 是**时间**指标，
   连接一旦重建就重新计时。实测：故障中 `flush_lag=22:17:57`，重启 task 后立刻变成 `40 秒`——
   看起来修好了，但同一时刻 `confirmed_flush_lsn` **一个字节都没动**，`restart_lag` 仍是 256 MB。

   > **判断槽健康只看位点差，不要看 `*_lag` 时间**：
   > `pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)`

3. **告警本身是张冠李戴的。** Pigsty 的 `PostgresReplicationLag` / `PostgresReplicationBreak`
   是给**物理 HA 副本**设计的（阈值 1 MB / 1 秒）。本集群 `pg-meta` 是单节点、没有物理副本
   （`pigsty.yml` 里 replica 行是注释掉的），这两条规则实际套在了 Debezium 的**逻辑槽**上，
   `ins` 标签显示为 `Debezium Streaming`。阈值对逻辑 CDC 槽毫无意义，但它这次**恰好指向了真问题**——
   所以不要因为「规则用错了对象」就把它静音。

**根因**

```
table.include.list = orders.*, products.*
这些表最后一次写入：2026-08-24（发现时已 5 天前）
```

链条是：**没有变更 → 没有记录产出 → Kafka Connect 不提交 offset → Debezium 不推进
`confirmed_flush_lsn` → PostgreSQL 不敢回收 WAL**。

而 WAL 并不会停——同库的 `config.*`（Config Center 的表）、其他数据库、autovacuum 都在写。
槽把这些全钉住。**低流量的是被监控的表，不是数据库。**

代价有明确期限：

```
max_slot_wal_keep_size = 12288 MB
增速 ≈ 280 MB/天
→ 约 43 天后 PostgreSQL 作废该槽，Debezium 丢失位点，被迫全量重快照
```

**修复（⚠️ 不是一行配置，我按一行做，把 CDC 干挂了）**

正解分两个层次，**不要跳到第二层**：

| 配置 | 作用 | 何时需要 |
|---|---|---|
| `heartbeat.interval.ms` | 定期产出心跳记录，**记录本身携带当前 offset**，提交后位点推进 | 低流量库的常规解法，不碰 schema |
| `heartbeat.action.query` | 主动往库里 INSERT，人为制造可解码 WAL | 只在「本库完全收不到可解码变更」时才要（[Debezium 邮件列表](https://groups.google.com/g/debezium/c/39mmGEHii_8)：「useful to address situations with **multiple databases**, otherwise no/low traffic」） |

判据是 `write_lag`：本例 `write_lag=3.9 秒`，说明 Debezium **收到的位置是当前的**，
它不缺「知道现在在哪」，只缺「有条记录可提交」。所以只需要第一层，**不需要建心跳表**。

**⚠️ 但第一层也有前置条件：Kafka topic ACL。** 2026-08-29 实测，只加
`heartbeat.interval.ms=60000` 后 task 立刻 FAILED：

```
TopicAuthorizationException: Not authorized to access topics: [__debezium-heartbeat.ecommerce_cdc]
ConnectException: Unrecoverable exception from producer send callback
→ task FAILED → 槽 active=false → 连流都断了，比原来更糟
```

心跳走的是**独立的 `__debezium-heartbeat.<topic.prefix>` topic**，SCRAM 用户
`ecommerce_app` 只有业务 topic 的 ACL。正确顺序：

```bash
# 1. 先开 ACL（/opt/kafka/bin/kafka-acls.sh，broker 配置 /etc/kafka/server.properties）
#    给 ecommerce_app 加 __debezium-heartbeat. 前缀的 Write/Describe/Create
# 2. 再加 heartbeat.interval.ms
# 3. 验证：连续采样 confirmed_flush_lsn，必须看到位点前进，不要看 flush_lag
```

回滚方式（我用过，有效）：`PUT /connectors/<name>/config` 去掉该键 +
`POST /connectors/<name>/tasks/0/restart`，20 秒内恢复 `RUNNING` + `active=true`。

⚠️ Kafka Connect 的 `PUT /config` 是**整体替换**：必须先 GET 全量、改完再 PUT 回去，
只 PUT 一个键会清空其余 29 项配置。

**遗留（已知，未改）**

- ACL 尚未添加，`heartbeat.interval.ms` 已回滚，**槽仍在 256 MB 滞留并增长**，倒计时约 43 天。
- 重启 task 会让 `flush_lag` 归零但不释放滞留，因此「重启一下就好了」是假象，且会周期性复发。
- events/INDEX.md 的「当前事实」只描述了 outbox → NATS → Meilisearch 这条链，
  **没有记录 Debezium → Kafka → Elasticsearch 这条 CDC 链**（`cdc-connect` + `cdc-elasticsearch`
  两个容器在 node3，占 1.9 GiB）。两条链并存这件事本身该补进去。

**排查捷径**

- 「告警说复制滞后，但一切 RUNNING」时，**第一件事是查位点差不是查状态**：
  ```sql
  select slot_name, active,
         pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))     as retained,
         pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) as confirmed
  from pg_replication_slots;
  ```
- `write_lag` 新鲜而 `flush_lag` 陈旧 = 收得到但提交不了 → 心跳类问题；
  两者都陈旧 = 根本没收到 → 连接/权限类问题。这一条能直接分流。
- 改任何 Debezium 配置前，先问「这个改动会不会产出到新 topic」。会的话先查 ACL——
  Kafka 的授权失败在连接器配置校验阶段**不报错**，要等第一条消息发出去才炸。

**相关**

- 同类「健康绿、功能死」：[`registry/experience/consul-register-once-then-give-up.md`](../../registry/experience/consul-register-once-then-give-up.md)
- 告警为什么没被看见：[`context/team/alerting-signal-hygiene.md`](../../../../team/alerting-signal-hygiene.md)
- 外部依赖地址与端口：[`.service-matrix.yaml`](../../../../../.service-matrix.yaml) 的 `pigsty_node3`
