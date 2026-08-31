# 交接：清理 3 条慢性 WARN 告警（修根因 > 调 repeat > 改阈值）

Status: ready-for-agent

> 交接自 2026-08-31 会话（阶段 0 收官 + ntfy 链路验收的后续）。本文档自足：
> 新会话不需要翻聊天记录，但**动手前必读**本仓 `AGENTS.md` 硬规则与
> [`context/team/alerting-signal-hygiene.md`](../../context/team/alerting-signal-hygiene.md)。

## 为什么做这件事

node3 Alertmanager 的 `local-audit` receiver 背后是**审计 + ntfy 双职桥**，
每小时把所有活跃告警推到用户手机（链路 2026-08-31 已 canary 验收，手机实收）。
现挂着的慢性告警 = 每小时垃圾推送，会逼人静音 topic——静音后真事故也没了。
纪律：**修根因 > 调 repeat_interval > 改阈值**；⛔ 禁止靠删规则/静音/扩大放行「变绿」。

## 环境速查（实测 2026-08-31）

| 事实 | 值 |
|---|---|
| node3 | `ssh node3`（root）；Pigsty v4.5.0 观测机 + **dev 集群唯一 PG 数据面** |
| Alertmanager / vmalert / VM | node3 `127.0.0.1:9059` / `:8880` / `:8428` |
| ntfy 桥 | systemd `pigsty-alert-audit.service`——⚠️ **unit 名叫 audit，实跑 `/usr/local/libexec/pigsty-alert-ntfy.py`**（旧文件 `pigsty-alert-audit.py` 是弃用残留，别被骗）；env `/etc/infra-alerts/ntfy.env`；审计日志 `journalctl -u pigsty-alert-audit` |
| 规则双写纪律 | Pigsty source `/root/pigsty-deploy/files/victoria/rules/<f>.yml` 与产物 `/infra/rules/<f>.yml` **必须同改**（SHA 一致），改后 `/usr/bin/vmalert -dryRun -rule=<产物>` 再 `systemctl reload vmalert`。Pigsty 自带规则（pgsql.yml/node.yml）同理先确认模板位置再动 |
| 集群 | 本机 kubectl 已配；节点 root@192.168.3.101-103；Cilium 1.20.1 + Hubble |
| 验收查询 | `curl -s 127.0.0.1:9059/api/v2/alerts?active=true`（node3 上）；ntfy 消息核对：token 在 node1 `docker exec ntfy-ntfy-1 ntfy token list`（cat 用户只读），`curl -H "Authorization: Bearer <tk>" "https://ntfy.apikv.com/<topic>/json?poll=1&since=1h"`，topic 名见 `/etc/infra-alerts/ntfy.env` |

## 当前活跃快照〔实测 2026-08-31〕

```
EcommerceNetworkPolicyDeniedBurst | warning | network-security | since 08-31 12:57  ← 今天重新触发,进行中
PostgresReplicationLag            | WARN    | pgsql            | since 08-29 21:01
NodeMemSwapped                    | WARN    | node             | since 08-28 17:29
AlertFiringTooLong ×2             | warning | observability    | ← 元告警,随上面根因清除自动消
```

（`K8sClusterMetricsMissing` 慢性 critical 已于 08-31 随点号→下划线规则迁移清除，勿重复处理。）

## 三条逐个：已知事实与排查入口

### 1. EcommerceNetworkPolicyDeniedBurst（建议先做——是进行中的真实丢包）

- 规则：`/infra/rules/ecommerce-security.yml`，
  `expr: sum(increase(hubble_drop_total{reason="POLICY_DENIED"}[5m])) > 20`。
  ⚠️ **该规则缺 `for:`**——本身违反告警卫生（一波动就红），顺手补上（如 `for: 5m`），双写。
- 取证：先按 VM 查 `hubble_drop_total` 按 label 分组定位 src/dst identity/port；
  再进集群 cilium agent `hubble observe --verdict DROPPED --last 100` 拿真实流。
- 已知嫌疑（按先后验证）：①08-31 当天 control-tower-gateway 新 RS 曾 CrashLoop
  （用户另一会话在迭代网关 0.2.5/pre 配置，其 Pod 反复重建可能撞 default-deny）；
  ②新增负载的漏放行：`ces-audit` CronJob（ns ces-audit，出站 apiserver + metrics.apikv.com）、
  otel-node DaemonSet；③CES 陈旧余波（对账已自动化：VM 指标 `ces_stale_entries` 应为 0，
  若非 0 按 [`context/team/cilium-datapath-ops.md`](../../context/team/cilium-datapath-ops.md) 第二节处理）。
- 修法边界：给**具体身份**补最小 CNP 放行；⛔ 不许扩大 CIDR、不许动 `ecommerce-api-default-deny` 兜底。

### 2. PostgresReplicationLag（⚠️ 唯一带硬约束的一条）

- 规则：Pigsty 自带 `/infra/rules/pgsql.yml:1532`，
  `expr: pg:ins:lag_bytes > 1048576 or pg:ins:lag_seconds > 1`，for 1m。
- **硬约束（用户明示）：PG 侧只取证，任何写操作/拓扑变更/重启前必须先上报用户拿窗口**——
  这台 PG 是 dev 集群 10 个服务的现役数据面，与阶段 1 交易正确性开发并行进行中。
- 取证入口（全只读）：VM 查 `pg:ins:lag_seconds`/`pg:ins:lag_bytes` 带 label 看是哪个 ins；
  node3 上 `patronictl -c /pg/bin/patroni.yml list`（或 Pigsty 等价命令）看拓扑；
  `psql -c "select * from pg_stat_replication"`、`pg_replication_slots`（悬空 slot 是常见根因：
  离线 replica/退役 CDC 的 slot 会让 lag 无限涨——本仓 events/experience 有
  `debezium-idle-slot-wal-retention.md` 专讲此坑，先读）。
- 可能结论分支：a) 悬空 slot → 上报后删 slot（写操作，要窗口）；b) 真 replica 落后 → 查网络/负载；
  c) 单机根本无 replica 而规则误判 → 修规则表达式（双写）。

### 3. NodeMemSwapped（大概率是「陈旧 swap」假慢性）

- 规则：Pigsty 自带 `/infra/rules/node.yml:839`，`expr: node:ins:swap_usage > 0.01`，for 5m。
- 背景：node3 仅 7.25GiB RAM，扛 Victoria 三件套 + PG + Kafka + ES(limit 2G) + Bugsink 等；
  08-28 起 swap 被用过后**换出页不会自动换回**，指标就永远 >1%——典型假慢性。
- 取证：`free -h`、`vmstat 1 5`（si/so 是否持续非零）、
  `for f in /proc/*/status; do awk "/VmSwap|Name/" $f; done | paste - - | sort -k4 -h | tail`
  找 swap 大户；判断是「历史残留」还是「持续换页」。
- 修法分支：a) 历史残留且内存余量足 → 挑空闲窗口 `swapoff -a && swapon -a`
  （⚠️ 先确认 `MemAvailable` > 当前 SwapUsed，否则会 OOM；node3 上任何服务重启都影响观测面，
  动手前上报）；b) 持续换页 → 根因是内存超卖，列裁减/加内存选项上报用户，别只调阈值；
  c) 若判定 1% 阈值对这台机就是不合理 → 最后手段按 Pigsty 双写改阈值并写明理由。

## 完成判据

1. Alertmanager `active=true` 中上述三条 + 关联 `AlertFiringTooLong` 全部消失，
   或个别条目留有「处理中/已上报待窗口」的明确标注；
2. 每条修复有 ntfy `[RESOLVED]` 推送或 journal 记录佐证；
3. 观察 ≥2 个 repeat 周期（2h）无复燃；
4. 所有规则改动 Pigsty source/产物 SHA 一致、dry-run 绿。

## 收尾账务（不可跳过）

- 更新 [`docs/todo/统一可观测性体系.md`](../../docs/todo/统一可观测性体系.md) P1
  「Alertmanager 慢性活跃告警清理」条目（关闭或改注），**同步 `TODO.md` 分类计数**
  （计数口径 = 分类文件顶层 `- [ ]` 实数）；改 docs 后跑 `scripts/verify-context.sh` 必须绿；
  集群/主机数字一律带「实测 YYYY-MM-DD」（live-facts 门禁）。
- 踩到模式性坑沉淀进 `context/`；凭据只写位置不写值；
  `git commit` 需用户明示授权，Conventional Commits。
