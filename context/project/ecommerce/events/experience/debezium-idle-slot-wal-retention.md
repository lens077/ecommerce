---
name: debezium-idle-slot-wal-retention
module: events
description: 被监控表长期无写入时 Debezium 默认的「按事件处理刷 LSN」不会推进位点，逻辑复制槽 WAL 无限滞留，最终触发 max_slot_wal_keep_size 作废槽并被迫全量重快照；正解是 lsn.flush.mode=connector_and_driver（不需要心跳表），而 heartbeat.interval.ms 单独无效且加它之前必须先开 Kafka topic ACL 否则 task 直接 FAILED
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

**修复：`lsn.flush.mode=connector_and_driver`（2026-08-29 实测有效）**

Debezium 3.6 为这个场景做了专门的选项，**不需要心跳表**：

```
lsn.flush.mode = connector_and_driver
```

官方文档原文（`/connector-plugins/.../config/validate` 取得）：

> `'connector'`（默认）Debezium 托管 LSN flush；`'manual'` 外部托管；
> **`'connector_and_driver'` 在此基础上让 pgjdbc driver 用 server keepalive LSN
> 刷新未被监控的 LSN，防止低活跃度数据库上的 WAL 增长。**

切换后启动日志会从 `keepalive flush is DISABLED` 变成 `ENABLED`。实测效果：

```
confirmed_flush_lsn  0/61001028 → 0/71000000
confirmed 滞后        256 MB → 0 bytes
walsender flush_lag  22:17:57 → 10 秒（与 write_lag 齐平）
```

**⚠️ 走过的两个弯路，都要避开**

**弯路一：以为 `heartbeat.interval.ms` 够。不够。** 实测加了它之后心跳消息确实产出
（topic 里有 5 条），但位点只在 task 重启时动了一次就再次冻结。原因写在 Debezium 自己的启动日志里：

```
Using LSN flush mode 'connector': Debezium will flush LSN on event processing.
```

**「on event processing」**——按事件处理时刷。被监控表没有事件，心跳消息本身不算事件，
所以不刷。同一条日志的后半句就是它给的建议。

**弯路二：加 heartbeat 前必须先开 Kafka topic ACL，否则 task 直接 FAILED。**

```
TopicAuthorizationException: Not authorized to access topics: [__debezium-heartbeat.ecommerce_cdc]
ConnectException: Unrecoverable exception from producer send callback
→ task FAILED → 槽 active=false → 连流都断了，比原来更糟
```

心跳走**独立的 `__debezium-heartbeat.<topic.prefix>` topic**，不在业务前缀的 ACL 覆盖范围内。
两个容易搞错的前提：

- **principal 是 `User:cdc-connect`，不是 `User:ecommerce_app`**（后者是业务服务用的）
- **`auto.create.topics.enable=false`**，topic 不会自动创建，必须先手工建

正确顺序（本集群实测通过）：

```bash
B=10.10.21.172:9092; CC=/etc/kafka/admin.properties   # pigsty-admin，SASL_SSL
/opt/kafka/bin/kafka-topics.sh --bootstrap-server $B --command-config $CC \
  --create --topic __debezium-heartbeat.ecommerce_cdc --partitions 1 --replication-factor 1
/opt/kafka/bin/kafka-acls.sh --bootstrap-server $B --command-config $CC \
  --add --allow-principal User:cdc-connect --operation Write --operation Describe \
  --topic __debezium-heartbeat. --resource-pattern-type prefixed
```

> 若只想解决 WAL 增长、不要心跳消息，**可以完全跳过 heartbeat 和这套 ACL**，
> 只设 `lsn.flush.mode=connector_and_driver` 即可——这是本次真正起作用的那一项。
> 另一条省 ACL 的路子是设 `topic.heartbeat.prefix`，让心跳 topic 落进已有业务前缀。

**操作注意**

- Kafka Connect 的 `PUT /connectors/<name>/config` 是**整体替换**：必须先 GET 全量、
  改完再 PUT 回去，只 PUT 一个键会清空其余配置。
- 回滚：PUT 去掉该键 + `POST /connectors/<name>/tasks/0/restart`，20 秒内恢复。
- 查这个版本支持哪些配置项，别猜，直接问：
  `PUT /connector-plugins/io.debezium.connector.postgresql.PostgresConnector/config/validate`

**遗留（已知，未改）**

- **`PostgresReplicationLag` 修好之后仍会永远 firing。** 规则是
  `pg:ins:lag_bytes > 1MB or pg:ins:lag_seconds > 1s`，而 keepalive flush 的周期本就是
  ~10 秒，`lag_seconds` 永远 > 1。这是**物理 HA 阈值套在逻辑 CDC 槽上**的类别错误
  （本集群 `pg-meta` 是单节点，压根没有物理副本）。正解是把逻辑槽排除出这两条规则，
  另加一条真正有意义的「逻辑槽滞留 > 2 GB」告警。
- `restart_lsn` 侧的 240 MB 滞留要等 checkpoint 回收，不会立刻归零；判断是否修好看
  `confirmed` 差值是否为 0，不看 `retained`。
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
