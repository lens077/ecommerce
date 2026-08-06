# Grafana 看板

两张看板,JSON 都是脚本产物 —— **改看板要改脚本再重新生成,不要直接编辑 JSON**,
也不要在 Grafana UI 里改完就算完(下次生成会覆盖)。

| 脚本 | 产物 | uid | 内容 |
|---|---|---|---|
| `build_business_overview.py` | `business-overview.json` | `ecommerce-overview` | 业务北极星、趋势、漏斗、服务健康(RPC)、Web Vitals,末尾一行基础设施红绿灯 |
| `build_infrastructure.py` | `infrastructure.json` | `ecommerce-infrastructure` | 节点资源、数据库依赖、Go 运行时、服务在线与日志 |
| `common.py` | — | — | 数据源、面板构造器、共用 PromQL |

两张盘通过标题栏右上角的按钮互跳,`keepTime=true` —— 在业务盘看到某个时刻有尖峰,
点进基础设施还停在同一个时间窗。

## 生成与导入

```bash
cd observability/grafana
python3 build_business_overview.py > business-overview.json
python3 build_infrastructure.py    > infrastructure.json

# 导入(密码在集群 secret 里)
GU=$(kubectl -n observability get secret grafana -o jsonpath='{.data.admin-user}' | base64 -d)
GP=$(kubectl -n observability get secret grafana -o jsonpath='{.data.admin-password}' | base64 -d)
kubectl -n observability port-forward svc/grafana 13000:80 &
for f in business-overview.json infrastructure.json; do
  curl -s -u "$GU:$GP" -X POST http://localhost:13000/api/dashboards/db \
    -H 'Content-Type: application/json' --data-binary "@$f"
done
```

请求体里已经带了 `overwrite: true`,重复导入是覆盖而不是新建。

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

## 未实现 / 当前无数据(不是看板的问题)

看板上这些面板会是空的,原因在采集侧而不是查询侧:

1. **网关 HTTP 指标** —— `gateway/` 下没有任何 meter,`http_server_*` 从未存在。
   要看「网关→上游耗时」得先给网关加 metrics 中间件。
2. **采集管道自身健康(`otelcol_*`)** —— 只在每个 collector pod 的 `:8888`,
   没有任何东西把它采进 VM。这是基础设施盘最大的缺口:现在无法回答
   「遥测有没有在半路丢」。补法是 collector 加 `prometheus` receiver 自采。
3. **Go 运行时** —— 只有 `config-service` 在报(它自己实现了 `internal/pkg/sysstat`),
   11 个电商服务都没埋。另外实测发现 config-service 的 `process_*` 在 2026-08-06
   12:52 之后就停了,而同进程的 `pgxpool_*` 仍在上报 —— 是 sysstat 那侧的问题,
   不是导出链路,且 config-center 没装 OTel ErrorHandler 所以没有任何日志。
4. **Web Vitals** —— behavior 侧六个指标(LCP/CLS/INP/FCP/TTFB/long_task)+
   `frontend.api.duration` 都已实现;当前无数据是因为 behavior 服务没起、
   前端也没在跑。历史上只有 LCP / INP 出过数(来自 `/e2e`、`/e2e-gw` 两个测试页)。
5. **行为漏斗** —— `behaviors.events` 表已建但没数据(tracker 未接线),所以漏斗
   用 RPC 调用量近似,口径已写在面板标题里。
6. **k8s 对象/容器级指标** —— 无 kube-state-metrics、无 cAdvisor,`metrics-server`
   只服务 HPA。「pod 重启几次 / 副本齐不齐 / 哪个容器吃内存」现在查不了。
7. **node1(control-plane)没有主机指标** —— collector DaemonSet 只有 2 个副本,
   不调度到 control-plane。所以节点面板只覆盖 node2 / node3。
8. **日志按 pod 下钻不了** —— fluent-bit 的 `Label_keys` 用了 `$k8s.pod_name`,
   而字段被 `Nested_under`+`Add_prefix` 拍平成了**名字里带点的扁平 key**,
   record accessor 把 `.` 当嵌套分隔符,取不到就把剩余部分原样输出,
   于是 `k8s__pod_name` 的值是字面量 `".pod_name"`。正确写法是 `$['k8s.pod_name']`。

以上 2 / 6 / 8 记在仓库根 `TODO.md`。

## 验证方式

改完脚本后,除了看 Grafana 渲染,建议把每条 PromQL 拿去 VM 实跑一遍 —— 空图有两种
成因(语法错 / 真没数据),混在一起会让人误判。本次两张盘 56 条 Prometheus 查询
全部语法通过,业务盘 7 条有数据、基础设施盘 26 条有数据,其余空图成因见上。
