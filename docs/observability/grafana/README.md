# Grafana 看板与告警

三张看板 + 一份告警规则,JSON 都是脚本产物 —— **改看板/告警要改脚本再重新生成,
不要直接编辑 JSON**,也不要在 Grafana UI 里改完就算完(下次生成会覆盖)。
体系设计与口径的真相源在 `../面板设计.md`,本文只管生成与部署。

| 脚本 | 产物 | uid | 内容 |
|---|---|---|---|
| `build_business_overview.py` | `business-overview.json` | `ecommerce-overview` | 业务北极星、趋势、漏斗、Web Vitals,末尾一行服务+基础设施红绿灯 |
| `build_apm.py` | `apm.json` | `ecommerce-apm` | 应用 APM:全服务 RED + `$service` 详情(错误分析 / Go runtime / DB / Redis / 网关 / 出站依赖) |
| `build_infrastructure.py` | `infrastructure.json` | `ecommerce-infrastructure` | 节点资源、数据库依赖、遥测管道健康、Kafka、日志 |
| `build_alerts.py` | `alerts/ecommerce-alerts-configmap.json` | — | 17 条告警规则(Grafana unified alerting,severity 两级) |
| `common.py` | — | — | 数据源、面板构造器、口径常量(错误码集合/零填充)、共用 PromQL |

三张盘通过标题栏右上角的按钮互跳,`keepTime=true` —— 在业务盘看到某个时刻有尖峰,
点进 APM / 基础设施还停在同一个时间窗。排障动线:业务盘红绿灯 → APM 锁定服务与
层级 → 明细跳 Jaeger(`http://jaeger-ui.app.com`,内网域直达;换环境用
`JAEGER_UI_BASE` 环境变量重新生成)。

## 生成与导入

```bash
cd docs/observability/grafana
python3 build_business_overview.py > business-overview.json
python3 build_apm.py               > apm.json
python3 build_infrastructure.py    > infrastructure.json
python3 build_alerts.py            > alerts/ecommerce-alerts-configmap.json

# 看板导入(密码在集群 secret 里)
GU=$(kubectl -n observability get secret grafana -o jsonpath='{.data.admin-user}' | base64 -d)
GP=$(kubectl -n observability get secret grafana -o jsonpath='{.data.admin-password}' | base64 -d)
kubectl -n observability port-forward svc/grafana 13000:80 &
for f in business-overview.json apm.json infrastructure.json; do
  curl -s -u "$GU:$GP" -X POST http://localhost:13000/api/dashboards/db \
    -H 'Content-Type: application/json' --data-binary "@$f"
done

# 告警部署:sidecar(label: grafana_alert)只扫 Grafana 所在 namespace,
# 所以 ConfigMap 落在 observability;apply 后约 1 分钟内生效,幂等(uid 稳定)。
kubectl -n observability apply -f alerts/ecommerce-alerts-configmap.json
```

请求体里已经带了 `overwrite: true`,重复导入是覆盖而不是新建。
告警当前**不配通知渠道**,只在 Grafana UI(Alerting → Alert rules)里看;
将来接飞书 webhook 时只路由 `severity=critical`(决策记录见 `../面板设计.md` §6)。

数据源 UID 硬编码在 `common.py`,与 2026-08 的实例一致;换实例或重建数据源时用
环境变量覆盖,不必改代码:

```bash
GRAFANA_DS_PROM=xxx GRAFANA_DS_PG=yyy GRAFANA_DS_LOKI=zzz python3 build_infrastructure.py
```

## 修正记录(相对 cloud-native-deploy 的 build_ecommerce_overview.py)

本目录的业务盘搬自 `cloud-native-deploy/grafana/dashboards/build_ecommerce_overview.py`。
搬过来时把**指标名与真实上报对了一遍**(逐条拿 VM 的 `/api/v1/label/__name__/values`
和 `/api/v1/query` 验证,不是看代码猜),修了五处:

| 原来 | 问题 | 现在 |
|---|---|---|
| 错误率 `sum(rate(m{code!=""}))/sum(rate(m))` | `rpc_connect_rpc_error_code` 只挂在**出错的序列**上,零错误时分子一条序列都没有,相除得空集而不是 0 —— **服务健康时图一片空白,看起来像看板坏了** | 用分母乘 0 兜底,见下「零填充」 |
| `pgxpool_total_conns` / `pgxpool_acquired_conns` | **指标名不存在**,面板一直是空图。otelpgx 导出的是 `*_connections` | 移到基础设施盘,用 `pgxpool_total_connections` / `pgxpool_acquired_connections` |
| `web_vitals_cls_milliseconds_bucket` | CLS 在 behavior 侧的 `unit` 是 `"1"` 不是 `"ms"`,OTLP→VM 的后缀是 `_ratio` | `web_vitals_cls_ratio_bucket` |
| `http_server_request_duration_seconds_bucket` | **整个指标族不存在**:网关没有任何 meter,只有 tracing 中间件 | 面板删除(见下「未实现」) |
| 文件系统使用率没有 mountpoint 过滤 | 会画出 8 条 `/var/lib/kubelet/pods/**` 的 PVC bind mount(每个带 PVC 的 Pod 一个,底下还是同一块盘) | 只留 ext4/xfs 且排除 `/var/lib/kubelet/**`;分母改用 `sum without(state)`,原来的 `used+free` 漏了 `reserved` |
| 订单数 / GMV / 客单价读 `orders.order_main` | `order_main` 是按商家拆出的子订单；一次用户结算会被重复计数，客单价被拆低 | 改读一次结算一个记录的 `orders.order_group`；子订单状态和支付完成率仍读 `order_main` |

### 零填充(`common.py` 的 `zero_filled()`)

「零事件时整条序列都不存在」的指标不能直接画,也不能直接做分子 —— 健康时会得到
空图,而空图看起来像看板坏了,不像「一切正常」。写法:

```promql
(sum by (service_name) (rate(错误[$i])) or sum by (service_name) (rate(总量[$i])) * 0)
  / sum by (service_name) (rate(总量[$i]))
```

**刻意不用 `or on() vector(0)`**:实测它在 VictoriaMetrics 上能出结果(VM 会把无
标签的单序列当标量广播到右侧每个分组),但 Prometheus 不做这个广播 —— 无标签的左
操作数匹配不上带 `service_name` 的右操作数,结果仍然是空,换个后端就又坏了。按分组
乘 0 两边都对。

有一个有意的性质:**只给分母里存在的分组补 0**。完全没有流量的服务仍然不出现在图
上 —— 不该给一个没跑起来的服务画一条 0% 让人以为它健康。

判断某个面板要不要零填充,标准是「该指标是否覆盖分母里的**每一个**分组」,而不是
「它有没有序列」。按后者筛会漏 —— `db_client_operation_errors_total` 有 1 条序列
(config-service),看着像正常,但 cart 做了 51 次 DB 操作、零错误,它在这个面板里
就是不存在的。已按此标准核过:`system_network_errors_total` / `dropped_total`
(hostmetrics 恒发,2 节点 × 2 方向 4 条全在)、`pgxpool_empty_acquire_total` /
`canceled_acquires_total`(RecordStats 恒发,覆盖全部上报服务)都**不需要**兜底。

顺带:原文件里「host_metrics 目前只开了 filesystem scraper」的说明已过期 ——
cpu / memory / disk / network 都已开,所以基础设施盘才做得起来。

## 待部署(P1)与当前无数据

**P1 —— 采集改动已做、等部署,部署后按 `../面板设计.md` §7 清单逐族核对指标名**:

1. **Go runtime(`go_*`)** —— backend `otel.go` 基线已加 runtime instrumentation
   (2026-08-12,10 服务分发),随下次发版生效 → APM 盘 R4;
2. **Redis(`db_client_*{db_system_name="redis"}` / `redis_client_errors_total`)**
   —— 9 个 `buildRedis` 已装配 redisotel-native → APM 盘 R6;
3. **网关(`http_server_request_duration_seconds_*`)** —— 网关此前有 otelhttp
   handler 但没有 MeterProvider(指标挂在 noop 上),`middleware/tracing` 已补
   → APM 盘 R7;
4. **采集管道自身健康(`otelcol_*`)** —— collector 已加 `prometheus/internal`
   receiver 自采 8888(兄弟仓配置),`kubectl -n observability apply` 生效
   → 基础设施盘 R4;
5. **Kafka(`kafka_server_*` / `kafka_connect_*`)** —— Strimzi metricsConfig 与
   collector `prometheus/kafka` receiver 已配(兄弟仓 + 本仓 kafka-connect),
   broker patch 会滚动重启 → 基础设施盘 R5。

**当前无数据(采集侧原因,面板正常)**:

1. **Web Vitals** —— 指标链路已通,无数据是前端近期没人访问(30 天窗口有历史数据);
2. **行为漏斗** —— `behaviors.events` 表没数据(tracker 未接线),漏斗用 RPC 近似;
3. **RPC 类曲线在空闲时段为空** —— dev 环境没有持续流量,rate 窗口内无样本即空图,
   有调用即出线(序列 14 天窗口内可查到);
4. **k8s 对象/容器级指标(P2)** —— 无 kube-state-metrics/cAdvisor,单独一轮做;
5. **日志按 pod 下钻不了** —— fluent-bit 的 `Label_keys` 用了 `$k8s.pod_name`,
   而字段被拍平成名字里带点的扁平 key,`k8s__pod_name` 的值是字面量 `".pod_name"`。
   正确写法是 `$['k8s.pod_name']`(待修,记在 TODO.md);
6. **配置中心属于独立基础设施** —— 全部查询排除 `service_name="config-service"`,
   其运行时视图去配置中心自己的 System 页面看。

## 验证方式

改完脚本后,除了看 Grafana 渲染,把每条 PromQL 拿去 VM 实跑一遍 —— 空图有两种
成因(语法错 / 真没数据),混在一起会让人误判。2026-08-12 重构后三张盘 + 17 条
告警共 109 条 Prometheus 查询全部语法通过、40 条当场有数据,空图成因均已归入上节
两类;P1 部署后要再跑一遍核对预写的指标名。
