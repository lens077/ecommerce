"""生成告警规则 ConfigMap 并输出到 stdout(K8s JSON,kubectl apply 直接吃)。

    python3 build_alerts.py > alerts/ecommerce-alerts-configmap.json
    kubectl -n observability apply -f alerts/ecommerce-alerts-configmap.json

落地机制:Grafana helm values 里 sidecar.alerts 已开(label: grafana_alert),
sidecar 只扫 Grafana 自己所在的 namespace —— 所以 ConfigMap 必须落在 observability。
data 里嵌的是 Grafana alerting provisioning 文件;内容用 JSON 序列化(JSON 是 YAML
的子集,Grafana 的 YAML 解析器照读),这样本脚本不需要 pyyaml 依赖。

规则清单与阈值依据见 ../面板设计.md §6。设计要点:
- severity 只有 critical / warning 两级:critical = 用户已经受伤,将来接飞书只路由它;
  warning = 预警,留在 UI。(通知渠道当前不配,先在 Grafana UI 里看。)
- noDataState 默认 OK:错误类指标零事件时序列不存在,NoData 恰好等于「没有错误」——
  这是零填充问题在告警侧的对偶。唯一例外 A11(上报节点数):数据没了本身就是事故,
  noDataState=Alerting。
- payment 从 A1 排除:5 个 RPC 全是 Unimplemented 桩,不排除的话 A1 永远挂着,
  真告警会淹死在里面。面板上它照常恒红(那是暴露);等 payment 有真实现后删掉排除。
- uid 稳定(手写 slug):provisioning 按 uid 幂等覆盖,重复 apply 是更新不是新建。
"""
import json
import os

from common import svc_error_ratio, rpc_quantile, zero_filled, ECOMMERCE

PROM_UID = os.getenv("GRAFANA_DS_PROM", "P4169E866C3094E38")

W = "5m"  # 告警默认 rate 窗口(Grafana alerting 不展开 $__rate_interval)


def alert(uid, title, expr, threshold, for_, severity, summary,
          op="gt", no_data="OK", window_s=900):
    """一条规则 = A(instant PromQL) → B(reduce last) → C(threshold)。

    C 吃 reduce 后的值,告警消息里能看到当前数值(过滤式 expr>bool 看不到)。
    """
    return {
        "uid": uid,
        "title": title,
        "condition": "C",
        "data": [
            {"refId": "A",
             "relativeTimeRange": {"from": window_s, "to": 0},
             "datasourceUid": PROM_UID,
             "model": {"expr": expr, "instant": True, "refId": "A"}},
            {"refId": "B", "datasourceUid": "__expr__",
             "model": {"type": "reduce", "expression": "A", "reducer": "last", "refId": "B"}},
            {"refId": "C", "datasourceUid": "__expr__",
             "model": {"type": "threshold", "expression": "B", "refId": "C",
                       "conditions": [{"evaluator": {"type": op, "params": [threshold]}}]}},
        ],
        "noDataState": no_data,
        "execErrState": "Error",
        "for": for_,
        "labels": {"severity": severity},
        "annotations": {"summary": summary},
    }


RPC = "rpc_server_duration_milliseconds_count"

# ── 服务层(RED) ────────────────────────────────────────────────────────────
svc_rules = [
    alert("ecom-a01-error-rate", "A1 服务侧错误率 > 5%",
          svc_error_ratio(extra='service_name!="payment-service"', window=W),
          0.05, "5m", "critical",
          "服务 {{ $labels.service_name }} 服务侧错误率超 5%。去 APM 盘 R3 看错误码分布,明细跳 Jaeger。"
          "(payment 已排除:全是 Unimplemented 桩,有真实现后删掉排除)"),
    alert("ecom-a02-p99", "A2 P99 延迟 > 1s",
          rpc_quantile(0.99, window=W),
          1000, "10m", "critical",
          "服务 {{ $labels.service_name }} P99 超 1s(指标单位 ms)。先看 APM R4 runtime 与 R5 DB,再用 trace 下钻。"),
    alert("ecom-a03-no-traffic", "A3 服务无流量(曾有流量)",
          f"(sum by (service_name) (rate({RPC}{{{ECOMMERCE}}}[1h] offset 1h)) > 0)"
          f" unless (sum by (service_name) (rate({RPC}{{{ECOMMERCE}}}[10m])) > 0)",
          0, "10m", "critical",
          "服务 {{ $labels.service_name }} 一小时前有流量、现在完全没有。查部署/网关路由/Consul 注册。"),
    alert("ecom-a04-goroutine-growth", "A4 goroutine 持续增长",
          "(deriv(go_goroutine_count[30m]) > 0.05) and (go_goroutine_count > 500)",
          0, "30m", "warning",
          "服务 {{ $labels.service_name }} goroutine 数持续上涨(>0.05/s 且已超 500)。泄漏嫌疑,对照最近发版。"),
]

# ── 依赖层(USE) ────────────────────────────────────────────────────────────
_pg = 'db_system_name="postgresql"'
_db_err = f"sum by (service_name) (rate(db_client_operation_errors_total{{{ECOMMERCE},{_pg}}}[{W}]))"
_db_all = f"sum by (service_name) (rate(db_client_operation_duration_seconds_count{{{ECOMMERCE},{_pg}}}[{W}]))"
_gw = "http_server_request_duration_seconds_count"
_gw_5xx = f'sum(rate({_gw}{{http_response_status_code=~"5.."}}[{W}]))'
_gw_all = f"sum(rate({_gw}[{W}]))"
dep_rules = [
    alert("ecom-a05-pool-wait", "A5 pgx 空池等待出现",
          f"sum by (service_name) (rate(pgxpool_empty_acquire_total{{{ECOMMERCE}}}[{W}]))",
          0, "5m", "warning",
          "服务 {{ $labels.service_name }} 出现连接池空池等待。慢查询占坑或池配小 —— 池耗尽先于数据库挂。"),
    alert("ecom-a06-db-error-rate", "A6 DB 操作错误率 > 1%",
          f"{zero_filled(_db_err, _db_all)} / {_db_all}",
          0.01, "5m", "critical",
          "服务 {{ $labels.service_name }} 的 PG 操作错误率超 1%。查 PG 与到 pg-dev 的网络/TLS。"),
    alert("ecom-a07-redis-errors", "A7 Redis 客户端错误出现",
          f"sum by (service_name) (rate(redis_client_errors_total{{{ECOMMERCE}}}[{W}]))",
          0, "5m", "warning",
          "服务 {{ $labels.service_name }} 出现 Redis 客户端错误。查 Dragonfly 连通性;"
          "若同时 DB QPS 上涨 = 缓存击穿正在发生。"),
    alert("ecom-a08-gateway-5xx", "A8 网关 5xx 比率 > 1%",
          f"{zero_filled(_gw_5xx, _gw_all)} / {_gw_all}",
          0.01, "5m", "critical",
          "网关入口 5xx 超 1%(用户已受伤)。APM R1 锁定下游服务;全绿则问题在网关自身。"),
]

# ── 基础设施与遥测管道 ──────────────────────────────────────────────────────
_fs = 'type=~"ext4|xfs",mountpoint!~"/var/lib/kubelet/.*"'
infra_rules = [
    alert("ecom-a09-node-cpu", "A9a 节点 CPU > 85%",
          'avg by (k8s_node_name) (sum by (k8s_node_name, cpu) (system_cpu_utilization_ratio{state!="idle"}))',
          0.85, "15m", "warning",
          "节点 {{ $labels.k8s_node_name }} CPU 超 85% 持续 15 分钟。基础设施盘 R2 看趋势,查 top pod。"),
    alert("ecom-a09b-node-mem", "A9b 节点内存 > 90%",
          'system_memory_utilization_ratio{state="used"}',
          0.90, "15m", "warning",
          "节点 {{ $labels.k8s_node_name }} 内存超 90%。node3 的 requests 本就 99%,优先怀疑它。"),
    alert("ecom-a10-disk", "A10a 磁盘使用率 > 85%",
          f'system_filesystem_usage_bytes{{state="used",{_fs}}} / ignoring(state) sum without(state) (system_filesystem_usage_bytes{{{_fs}}})',
          0.85, "30m", "critical",
          "节点 {{ $labels.k8s_node_name }} {{ $labels.mountpoint }} 磁盘超 85%。存储钉 node3,涨满会带崩 PG/VM/Loki。"),
    alert("ecom-a10b-inode", "A10b inode 使用率 > 80%",
          f'system_filesystem_inodes_usage{{state="used",{_fs}}} / ignoring(state) sum without(state) (system_filesystem_inodes_usage{{{_fs}}})',
          0.80, "30m", "critical",
          "节点 {{ $labels.k8s_node_name }} inode 超 80% —— 磁盘有空间但写不进去的那种满。"),
    # 2026-08 集群重建后只有 2 个节点,阈值随之从 3 调到 2。
    # no_data 原为 Alerting(「数据没了本身就是事故」),但新集群的 collector 尚未
    # 接 hostmetrics,该指标从未存在过 —— Alerting 会让它布上即永久 firing。
    # 暂降为 OK;collector 接上主机指标后改回 Alerting(见 TODO 可观测性条目)。
    alert("ecom-a11-nodes-reporting", "A11 上报节点数 < 2",
          "count(count by (k8s_node_name) (system_cpu_utilization_ratio))",
          2, "10m", "critical",
          "上报主机指标的节点少于 2。collector 掉实例或节点失联 —— 此时其他图的『正常』不可信。",
          op="lt", no_data="OK"),
    # 这里的 or vector(0) 与 common.zero_filled 的禁令不冲突:三个 sum() 都没有
    # by 分组,两侧都是无标签单值,VM 和 Prometheus 行为一致;禁的是带分组的场景。
    alert("ecom-a12-otelcol-export-fail", "A12 collector 导出失败",
          f"(sum(rate(otelcol_exporter_send_failed_metric_points_total[{W}])) or vector(0))"
          f" + (sum(rate(otelcol_exporter_send_failed_spans_total[{W}])) or vector(0))"
          f" + (sum(rate(otelcol_exporter_send_failed_log_records_total[{W}])) or vector(0))",
          0, "10m", "critical",
          "collector 往 VM/Jaeger/Loki 导出失败 —— 遥测正在丢,面板上的平静不可信。基础设施盘 R4。"),
    alert("ecom-a13-connect-task-failed", "A13 Kafka Connect task failed",
          'sum(kafka_connect_connector_task_status{status="failed"})',
          0, "5m", "warning",
          "Kafka Connect 有 task 处于 failed。当前(CDC 未修)本条预期常驻触发 —— 它就是那个待办的提醒器。"),
    alert("ecom-a14-under-replicated", "A14 Kafka 欠副本分区 > 0",
          "kafka_server_replicamanager_underreplicatedpartitions",
          0, "5m", "warning",
          "单 broker 集群欠副本应恒 0,非零说明 broker 内部异常。"),
    alert("ecom-a15-lcp", "A15 前端 LCP P75 > 4s",
          "histogram_quantile(0.75, sum by (le) (rate(web_vitals_lcp_milliseconds_bucket[30m])))",
          4000, "30m", "warning",
          "前端 LCP P75 超 4s(Google 'poor' 线)。业务盘 R4 按页面拆,attribution 明细在 behavior 日志。"),
]

provisioning = {
    "apiVersion": 1,
    "groups": [
        {"orgId": 1, "name": "ecommerce-service", "folder": "ecommerce",
         "interval": "1m", "rules": svc_rules},
        {"orgId": 1, "name": "ecommerce-dependency", "folder": "ecommerce",
         "interval": "1m", "rules": dep_rules},
        {"orgId": 1, "name": "ecommerce-infra", "folder": "ecommerce",
         "interval": "1m", "rules": infra_rules},
    ],
}

configmap = {
    "apiVersion": "v1",
    "kind": "ConfigMap",
    "metadata": {
        "name": "ecommerce-grafana-alerts",
        "namespace": "observability",
        # sidecar.alerts.label(见 grafana helm values);labelValue 未设,存在即可
        "labels": {"grafana_alert": "1", "app": "ecommerce-observability"},
    },
    "data": {
        # 扩展名 .yaml 但内容是 JSON —— JSON 是 YAML 子集,Grafana 照读,
        # 本脚本因此不需要 pyyaml。
        "ecommerce-alerts.yaml": json.dumps(provisioning, ensure_ascii=False, indent=2),
    },
}

print(json.dumps(configmap, ensure_ascii=False, indent=2))
