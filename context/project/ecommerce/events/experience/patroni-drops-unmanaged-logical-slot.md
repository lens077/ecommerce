---
name: patroni-drops-unmanaged-logical-slot
module: events
description: Patroni 在 PostgreSQL 重启/重载时会删除未在 DCS `slots:` 声明的逻辑复制槽，Debezium 自建的 ecommerce_cdc 槽因此三次被删（09-01/09-03/09-04），source task FAILED 而 connector 级仍 RUNNING；正解是把槽声明为 Patroni 永久逻辑槽，并按 task 级状态、槽存在性、Sink lag 三类信号告警，而不是看容器健康
---

# PG 一重启，CDC 复制槽就没了

**症状**

PostgreSQL（node3 Pigsty/Patroni）每次重启之后，搜索 CDC 链静默停摆：

```
docker ps            cdc-connect   Up 30 hours (healthy)
connector            ecommerce-postgres-source   RUNNING
task 0               FAILED
pg_replication_slots (0 rows)
```

task trace 是 `The connector is trying to read change stream starting at PostgresOffsetContext [... lsn=LSN{0/EB001E70} ...], but this is no longer available on the server. Reconfigure the connector to use a snapshot mode when needed.`——Debezium 记着旧位点，服务器上却已经没有那个槽。

同一形态出现三次：2026-09-01（PG 重启）、2026-09-03（PG 重启）、2026-09-04 19:22（node3 整机重启恢复）。前两次都当成「重启后偶发」处理掉了，第三次才查到日志。

**关键陷阱**

1. **删槽的是 Patroni，不是 PostgreSQL，也不是 Debezium。** `/pg/log/patroni/*.log` 里明明白白：

   ```
   INFO: Trying to drop unknown replication slot 'ecommerce_cdc'
   INFO: Dropped replication slot 'ecommerce_cdc'
   WARNING: Logical replication slots that might be unsafe to use after promote: {'ecommerce_cdc'}
   ```

   Patroni 4.x 把「不在 DCS `slots:` 里、也不是成员物理槽」的槽视为 unknown，在重新加载槽列表时（进程启动、PG 重启）直接删除。平时不删，所以槽能活好几天，只在重启那一刻消失——正好和「重启后偶发」的错误直觉吻合。

2. **connector 级 RUNNING 掩盖 task 级 FAILED。** 容器健康检查只探 REST 端口，`/connectors/<name>/status` 顶层 `connector.state` 也仍是 RUNNING；只有 `tasks[].state` 是 FAILED。任何只看容器或 connector 级的检查都会说链路健康。这是本仓第四个「全绿但死了」案例（前三个见文末）。

3. **重启 task 修不好。** 槽没了，旧 offset 指向的 WAL 位点不存在，`restart` 只会再次 FAILED。必须走 RUNBOOK §6.3：停 Source → 暂停 Sink → 删 source offset →（槽已不存在则无需删）→ resume 触发 initial snapshot。

4. **重做 snapshot 不产生 tombstone。** 故障期间如果 PG 有删除，ES 里的旧文档不会被 snapshot 清掉，必须先建新物理索引再切 alias（RUNBOOK §6.3 第 8 步）。本次三例都实测「故障后零写入」（`max(updated_at)` 早于故障时刻、7 行不变），所以省掉了第 5/8 步——这是有证据的例外，不是常规。

**根因**

Debezium 用 `slot.name=ecommerce_cdc` 自建槽，而 Patroni DCS 动态配置里没有对应的 `slots:` 声明。Patroni 认为该槽不属于它管理，在重新加载槽列表时把它当垃圾清掉。

**修复（2026-09-06 实测有效）**

把槽声明为 Patroni 永久逻辑槽——Patroni 不再删它，且槽缺失时会主动重建：

```bash
patronictl -c /etc/patroni/patroni.yml edit-config --force \
  -s "slots.ecommerce_cdc.type=logical" \
  -s "slots.ecommerce_cdc.database=ecommerce" \
  -s "slots.ecommerce_cdc.plugin=pgoutput"
```

写入后几秒内 `pg_replication_slots` 就出现了 Patroni 创建的 `ecommerce_cdc`（inactive），Debezium resume 后接管为 active，snapshot 7 张表完成后进入 streaming，真实增量 1.3s 到达 ES。随后的 node3 受控重启演练验证了槽是否跨重启存活（结果见 `docs/reports/`）。

不选 `ignore_slots` 的原因：它只让 Patroni「视而不见」，槽丢了不会补；`slots` 声明则同时解决删除与缺失。

**告警（同日落地，node3 `/infra/rules/ecommerce-cdc.yml`）**

只看三类真相，不看容器健康：

| 信号 | 来源 | 告警 |
|---|---|---|
| Connect task 状态（按 task） | `cdc-connect-exporter`（拉 REST `/connectors?expand=status`，127.0.0.1:9405） | `CdcConnectorTaskNotRunning`（2m，critical） |
| 复制槽存在/活跃/滞留 WAL | pg_exporter `pg_slot_*{slot_name="ecommerce_cdc"}` | `CdcReplicationSlotMissing`（absent 2m）、`CdcReplicationSlotInactive`（5m）、`CdcSlotWalRetentionHigh/Critical`、`CdcSlotInvalidated` |
| Sink 积压 | kafka_exporter `kafka_consumergroup_lag{consumergroup="connect-ecommerce-elasticsearch-sink"}` | `CdcSinkLagStuck`（>0 持续 10m）、`CdcSinkLagCritical`（30m） |

触发测试：暂停 Source 后 ~3 分钟 `CdcConnectorTaskNotRunning` firing 并到达 Alertmanager，resume 后 1 分钟内解除。源文件与安装脚本在 pipeline 仓 `deploy/docker-node3/monitoring/`。

**排查捷径**

```bash
# 1. 先看 task 级，不看 connector 级
curl -s 127.0.0.1:8083/connectors/ecommerce-postgres-source/status | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["connector"]["state"], [t["state"] for t in d["tasks"]])'
# 2. 槽还在不在
sudo -u postgres psql -d ecommerce -c "SELECT slot_name, active, confirmed_flush_lsn FROM pg_replication_slots;"
# 3. 谁删的
sudo grep -h "replication slot" /pg/log/patroni/*.log | tail
# 4. 声明还在不在
sudo patronictl -c /etc/patroni/patroni.yml show-config | grep -A4 '^slots:'
```

**相关**

- 位点不推进撑爆 WAL：[debezium-idle-slot-wal-retention.md](debezium-idle-slot-wal-retention.md)
- 恢复手顺：pipeline 仓 `deploy/docker-node3/RUNBOOK.md` §6.3、§7
- 「配置在骗人」系列：[`context/team/alerting-signal-hygiene.md`](../../../../team/alerting-signal-hygiene.md)
