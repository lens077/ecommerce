# 告警与通知接入手册（vmalert / Gatus → ntfy）

> 通知出口统一收敛到 **ntfy**（`ntfy.apikv.com`，经 Pangolin 分发到手机端）。
> 本文是**可执行接入手册**：三条链路的边界、Gatus 通知中文化、K8s 指标口径与验收方法。
> 服务端部署与运维（node3）见 [`../INFRASTRUCTURE-OPERATIONS.md`](../INFRASTRUCTURE-OPERATIONS.md)；
> 前端错误那条链路见 [`error-monitoring.md`](error-monitoring.md)；整体观测架构见 [`OBSERVABILITY.md`](OBSERVABILITY.md)。

## 1. 三条链路（先读，别接错）

| 链路 | 触发源 | 中间件 | 到 ntfy 的方式 |
|---|---|---|---|
| **A 指标/规则** | vmalert（node3，规则在 `/infra/rules/*.yml`） | Alertmanager → webhook | `pigsty-alert-ntfy.py` 桥（systemd `pigsty-alert-audit`） |
| **B 黑盒探测** | Gatus（node3 容器，探公网入口与 origin 端口） | 无 | Gatus `custom` provider 直接 POST ntfy JSON |
| **C 前端错误** | Bugsink New Issue | 无 | Bugsink webhook（见 [`error-monitoring.md`](error-monitoring.md)） |

**三条链路共用同一个 topic**。这是刻意的（一个手机订阅看全部），但代价是**噪音会叠加**——
任何一条链路的慢性告警都会淹没另外两条的急性信号。加规则前先读 §6。

链路 A 与 B 都不经过 K8s：告警栈整体在 node3，与业务集群故障域隔离（[TECH.md](../TECH.md) §7.1）。
集群侧**只有采集器**，没有任何告警组件。

## 2. 链路 A：vmalert → Alertmanager → ntfy 桥

### 2.1 组件与位置

| 组件 | 位置 | 关键参数 |
|---|---|---|
| vmalert | node3 systemd `vmalert` | `-rule=/infra/rules/*.yml`、`-evaluationInterval=10s`、`-httpListenAddr=:8880`、`-notifier.url=http://127.0.0.1:9059` |
| Alertmanager | node3 systemd `alertmanager`，监听 `:9059` | 配置 `/etc/alertmanager.yml` |
| ntfy 桥 | node3 systemd `pigsty-alert-audit` | `/usr/local/libexec/pigsty-alert-ntfy.py`，环境变量在 `/etc/infra-alerts/ntfy.env` |

### 2.2 Alertmanager 路由

```yaml
route:
  receiver: 'local-audit'
  group_by: ['alertname']
  group_wait: 30s          # 新告警组攒 30s 再发第一条
  group_interval: 5m       # 同组有新成员时的最小更新间隔
  repeat_interval: 1h      # 已发过且仍未恢复的告警，多久原样重发一次
```

`repeat_interval` 是**唠叨间隔**，与「多快发现问题」无关——第一条通知永远受 `group_wait` 控制。
它唯一影响的是「同一个未修复的告警每天重播几次」。开发阶段设 1h（2026-08-29 由 4h 调整），
代价是慢性告警的重复条数翻 4 倍；真正减少通知量只能靠修问题本身。

### 2.3 桥的行为

桥把 Alertmanager 的 webhook 载荷转成 ntfy 消息：

| 输入 | 输出 |
|---|---|
| `severity` ∈ {crit, critical} | ntfy `Priority: 5` |
| 其他 severity | `Priority: 4` |
| `status: resolved` | `Priority: 3`，`Tags: white_check_mark` |
| 其余 | `Tags: rotating_light` |

**标题走 HTTP `Title:` 头，因此桥对它做了 RFC 2047 编码**（`email.header.Header(...).encode()`）。
这条约束在链路 B 里换了另一种解法，见 §3.2。

### 2.4 规则文件

规则真相源是 node3 的 `/infra/rules/*.yml`。除 `ecommerce-security.yml` 外全部是 Pigsty 自带的
基础设施规则（node / pgsql / pgbouncer / redis / kafka / mysql / etcd / minio）。

〔实测 2026-08-29：19 个规则组、869 条规则，其中**没有任何一条覆盖 Kubernetes**〕

复验：

```bash
ssh node3 "curl -s http://127.0.0.1:8880/api/v1/rules" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']['groups']; print(len(d), sum(len(g['rules']) for g in d))"
```

⚠️ **Pigsty 自带规则是按 HA 集群写的，本集群 `pg-meta` 是单节点**（`pg_seq: 1` primary，
replica/offline 两行在 `pigsty.yml` 里是注释掉的）。因此 `PostgresReplicationLag` /
`PostgresReplicationBreak` 这类规则会挂到**逻辑复制槽**（Debezium CDC）上，用物理复制的阈值
去判断 CDC 的滞后——是类别错配。遇到它们报警时先分清是物理副本还是逻辑槽：

```bash
ssh node3 "sudo -u postgres psql -tAc \"select slot_name, slot_type, plugin, active from pg_replication_slots\""
```

⚠️ 但**别急着把这类告警判成误报**：2026-08-29 这条告警指向的是一个真实缺陷——Debezium 未配
`heartbeat.interval.ms`，空闲库上位点永久冻结、WAL 无限滞留，最终会触发
`max_slot_wal_keep_size` 使槽作废并被迫全量重快照。判据与修法见
[`context/project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md`](../../context/project/ecommerce/events/experience/debezium-idle-slot-wal-retention.md)。

## 3. 链路 B：Gatus → ntfy（中文通知）

### 3.1 为什么不能用 Gatus 内置的 `ntfy` provider

内置 provider 的文案**硬编码在 Go 源码里**（`"An alert for X has been triggered due to having
failed N time(s) in a row"`），配置里没有任何参数能改成中文。`description` 字段虽然是用户可控的，
但它前面那句 `"with the following description: "` 仍是英文。

所以中文化的唯一路径是换成 **`custom` provider**——它开放 URL、method、headers 和 body，
用 [ntfy 的 JSON 发布格式](https://docs.ntfy.sh/publish/)直接投递。

### 3.2 为什么用 JSON body 而不是 HTTP 头

ntfy 的标题走 `Title:` 请求头，而 HTTP 头按 RFC 7230 只能是 ASCII，中文必须做 RFC 2047 编码
（链路 A 的桥就是这么处理的）。Gatus 的 `custom` provider **不会替你编码**，中文标题走头必然乱码。

改用 JSON 发布格式后（POST 到 ntfy 根地址、topic 放进 body），整个 body 是 UTF-8，
标题和正文都能直接写中文。

### 3.3 现行配置

配置文件 `/data/gatus/config.yaml`（容器挂载到 `/config/config.yaml`）：

```yaml
alerting:
  custom:
    url: ${NTFY_URL}
    method: POST
    headers:
      Authorization: Bearer ${NTFY_TOKEN}
      Content-Type: application/json
    body: |
      {
        "topic": "${NTFY_TOPIC}",
        "title": "[ALERT_TRIGGERED_OR_RESOLVED] [ENDPOINT_GROUP]/[ENDPOINT_NAME]",
        "message": "端点：[ENDPOINT_NAME]\n分组：[ENDPOINT_GROUP]\n地址：[ENDPOINT_URL]\n说明：[ALERT_DESCRIPTION]\n检查项：[RESULT_CONDITIONS]\n错误：[RESULT_ERRORS]",
        "priority": 4,
        "click": "https://ntfy.apikv.com"
      }
    placeholders:
      ALERT_TRIGGERED_OR_RESOLVED:
        TRIGGERED: "🔴 故障"
        RESOLVED: "✅ 恢复"
    default-alert:
      description: 健康检查连续失败
      failure-threshold: 2
      success-threshold: 2
      send-on-resolved: true
```

端点侧一律 `alerts: - type: custom`。

`${NTFY_URL}` / `${NTFY_TOPIC}` / `${NTFY_TOKEN}` 由容器环境变量注入（**凭据不入仓库**，
AGENTS.md 硬规则 4），Gatus 在解析 YAML 前做整文件展开，所以在 `body` 块里同样生效。

### 3.4 可用占位符

`custom` provider 在 `url` 和 `body` 中支持（[官方清单](https://gatus.io/docs/alerting-custom)）：

| 占位符 | 来源 |
|---|---|
| `[ENDPOINT_NAME]` / `[ENDPOINT_GROUP]` / `[ENDPOINT_URL]` | `endpoints[]` 对应字段 |
| `[ALERT_DESCRIPTION]` | `endpoints[].alerts[].description`（未设则取 `default-alert.description`） |
| `[RESULT_ERRORS]` / `[RESULT_CONDITIONS]` | 本次健康评估结果 |
| `[ALERT_TRIGGERED_OR_RESOLVED]` | 默认 `TRIGGERED`/`RESOLVED`，可用 `placeholders` 覆盖 |

⚠️ **占位符是裸字符串替换，Gatus 不做 JSON 转义。** `[RESULT_ERRORS]` 若含双引号会破坏 JSON body，
表现是通知发不出去（Gatus 记错误日志，监控本身不受影响）。Go 的 net/http 错误串实践中不含引号，
当前接受这个风险；真出问题就把该占位符从 body 里去掉。

⚠️ 一个占位符只能有一个值，所以**不能**同时用 `[ALERT_TRIGGERED_OR_RESOLVED]` 喂中文标题和
ntfy tags。现行做法是把 emoji 直接写进 `placeholders` 的取值里。

## 4. K8s 指标口径（写规则前必读）

### 4.1 不需要 kube-state-metrics

集群侧的 otel collector（`opentelemetry` namespace）**已启用 `k8s_cluster` receiver 并接进
metrics pipeline**，它原生产出 Pod/容器/Deployment/Node 级指标，经 OTLP 送到 node3 的
VictoriaMetrics。**不要为了写重启告警去装 kube-state-metrics。**

复验：

```bash
kubectl get cm -n opentelemetry -o yaml | grep -A2 'k8s_cluster'   # receiver 是否启用
ssh node3 "curl -s http://127.0.0.1:8428/api/v1/query --data-urlencode 'query=sum by (receiver) (otelcol_receiver_accepted_metric_points)'"
```

### 4.2 ⚠️ 指标命名口径变过一次——写查询前必须现查

**当前是下划线**（`k8s_container_restarts`、label `k8s_namespace_name`）：

```promql
sum by (k8s_namespace_name, k8s_pod_name) (
  increase(k8s_container_restarts[15m])
) > 3
```

**但这个口径变过。** node3 的 VictoriaMetrics 启动参数带
`-opentelemetry.usePrometheusNaming=true`〔实测 2026-09-01，VM 2.24.0〕，
它把 OTel 的点号命名转成 Prometheus 下划线命名；该 flag 打开之前，
指标与 label 保留 OTel 原生点号（`k8s.container.restarts`），必须写成
`{__name__="k8s.container.restarts"}`、`by ("k8s.namespace.name")`。

**本章最大的坑不是「用哪种写法」，而是两种写错的方式都「查不到数据且不报错」。**
按错误口径搜会一无所获，极易误判成「没有采集」——2026-09-01 就有一条 Gatus 检查
因沿用旧口径而长期红，被当成「K8s 指标断流」排查，实际采集链路一直正常。

所以纪律是：**写规则或探针前先跑一次清单查询确认当前口径**，不要凭记忆，也不要凭本文档：

```bash
ssh node3 "curl -s http://127.0.0.1:8428/api/v1/label/__name__/values" \
  | python3 -c "import json,sys; v=json.load(sys.stdin)['data']; \
      print('下划线:', len([n for n in v if n.startswith('k8s_')]), \
            '点号:', len([n for n in v if n.startswith('k8s.')]))"
```

〔实测 2026-09-01：下划线 27 个、点号 0 个。覆盖 container / pod / deployment /
daemonset / statefulset / job / cronjob / replicaset / node / namespace〕

改这个 flag 等于一次**静默的破坏性变更**：所有已有规则、仪表盘和探针会在不报任何错的
情况下同时失效。要改就必须同一批把消费方全改掉，并逐条复验「先在 VM 查到 series 再改写」。

### 4.3 采集器是单点

`k8s_cluster` 由集群内**单副本** Deployment `otel-opentelemetry-collector` 提供。它一挂，
所有 K8s 指标停止上报，而**基于这些指标的告警会安静地变成「无数据」而不是「报警」**
——PromQL 里没有数据的表达式不会 firing。

所以任何 K8s 规则集都必须配一条对称的存在性兜底（现有 `HubbleFlowTelemetryMissing` 是同类先例）：

```promql
absent(k8s_container_restarts) == 1
```

⚠️ 这条兜底本身也受 §4.2 的命名口径影响：口径改了而它没跟着改，它会**永远 firing**
（因为按旧名字确实 absent），反而先把自己变成慢性红。

## 5. 容量与资源约束

告警栈整体跑在 node3（该机内存 7.4 GB）。观测栈原本是这台机器上**唯一一组没有内存上限的服务**，
2026-08-29 起通过 systemd drop-in（`/etc/systemd/system/<svc>.service.d/memory.conf`）加上了
`MemoryHigh`（软，触发回收）+ `MemoryMax`（硬，兜底）：

| 服务 | MemoryHigh | MemoryMax |
|---|---|---|
| `vmetrics` | 768M | 1G |
| `grafana-server` | 448M | 640M |
| `vlogs` | 256M | 384M |
| `vtraces` | 192M | 320M |
| `vmalert` | 160M | 256M |
| `alertmanager` | 96M | 160M |

取值约为当时实测用量的 1.5~2 倍。`daemon-reload` 即热生效，**不需要重启服务**。

⚠️ **设上限不释放内存**，它只防未来的无节制增长。node3 的即时内存压力要从占用大户入手
（复验 `ssh node3 'ps -eo rss,args --sort=-rss | head'`），而不是继续压观测栈。

## 6. 加规则前必读：告警信号卫生

**方法论真相源是 [`context/team/alerting-signal-hygiene.md`](../../context/team/alerting-signal-hygiene.md)**
（慢性 firing 等于没有告警、降噪优先级、「健康检查绿但功能已死」的探针设计判据）。
本节只列落到这两条链路上的操作约定，不复述结论：

1. **每条规则都要设 `for:`**。链路 A 现存的 `EcommerceNetworkPolicyDeniedBurst` 与
   `PostgresReplicationBreak` 都是 `for` 缺省（后者在 Pigsty 原文件里被显式注释掉），
   一有波动就 firing——这是它们变成背景噪音的直接机制。
2. **加新规则前先清掉存量 firing**（`curl -s http://127.0.0.1:8880/api/v1/alerts`）。
   往一个已经在响的渠道里加规则，新规则出生即被淹没。
3. **链路 B 的 `failure-threshold` 就是 Gatus 的 `for`**。默认 2 次（配合 `interval`
   决定实际延迟），黑盒探测抖动多，不要设成 1——自毁探针除外。
4. 建议加一条元规则：`ALERTS{alertstate="firing"}` 持续超过数小时即告警。
   一条长期未处理的告警已经失去信号价值，这件事本身该被发现。

## 7. 验收方法

### 7.1 链路 A（vmalert → ntfy）

```bash
ssh node3 "curl -s http://127.0.0.1:8880/api/v1/alerts"        # 当前 firing 的告警
ssh node3 "journalctl -u pigsty-alert-audit --since '24 hours ago' -o cat | grep -c alertname"   # 24h 推送条数
```

### 7.2 链路 B（Gatus → ntfy）

真实端到端验证的做法是加一个**必定失败的自毁探针**，确认收到通知后立刻删除：

```yaml
  - name: alert-i18n-canary
    group: canary
    url: http://127.0.0.1:1/
    interval: 30s
    alerts:
      - type: custom
        failure-threshold: 1
        send-on-resolved: false
        description: 中文告警链路自检（验证后删除）
    conditions:
      - "[STATUS] == 200"
```

`docker restart gatus` 后看日志出现 `handleAlertsToTrigger ... has been TRIGGERED`
且**无后续错误**即为通过，然后把该端点删掉再重启。

⚠️ **不要用 `poll=1&since=` 查 ntfy 历史来验证**：本站 ntfy 未开启消息缓存，查不到属正常，
不代表投递失败。

**环境变量展开的反证法**：若 `${NTFY_TOPIC}` 未展开，JSON 里就是字面量 `${NTFY_TOPIC}`，
含 `$ { }` 不符合 ntfy 主题名规则，ntfy 必返 400、Gatus 必记错误日志。
**Gatus 日志无错误 ⇒ 主题名合法 ⇒ 变量确实展开了。**

### 7.3 回退

Gatus 配置每次改动前自动留备份：

```bash
ssh node3 "ls -t /data/gatus/config.yaml.bak-*"
ssh node3 "cp /data/gatus/config.yaml.bak-<戳> /data/gatus/config.yaml && docker restart gatus"
```

Alertmanager 同理（`/etc/alertmanager.yml.bak-*`），改完 `systemctl reload alertmanager`。

## 8. 已知缺口

- **K8s 维度规则尚未编写**。采集、传输、存储、告警、通知五段都已就绪（§4），
  缺的只有 `/infra/rules/` 下的规则文件本身。建议至少覆盖：容器重启激增、容器长期未就绪、
  Deployment 副本不足、Node NotReady，外加 §4.3 的 `absent()` 兜底。
- **规则文件不在版本控制里**。node3 的 `/infra/rules/*.yml` 是裸文件，`ecommerce-security.yml`
  也一样。Tetragon 的做法可以参照：部署资产在 `~/lens077/kubernetes/`，策略真相源在仓库的
  `infrastructure/` 下（[TECH.md](../TECH.md) B 表运行时安全行）。
- **服务注册数没有告警**。Consul 注册数少于 `.service-matrix.yaml` 声明的服务数时无人知晓；
  2026-08-29 有服务因启动瞬间 DNS 失败而永久未注册，K8s 侧一切正常，靠人工比对才发现
  （见 [`../../context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md`](../../context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md)）。
- **告警未分级路由**。所有 severity 共用一个 topic，手机端无法把 critical 与 warning 分开
  处理。拆 topic 需要 Alertmanager 加 sub-route + 桥支持按 severity 选 topic。
