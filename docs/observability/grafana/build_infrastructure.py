"""生成「基础设施 · 节点与依赖」并输出 Grafana API 请求体。

    python3 build_infrastructure.py > infrastructure.json

指标族与可用性(设计见 ../面板设计.md §5):
    P0(在收): system_*(hostmetrics)、pgxpool_* / db_client_*(otelpgx)、
              rpc_server_*(只做「服务在不在」)、Loki 日志
    P1(占位): otelcol_*(collector 自采,2026-08-12 配置已改等部署)、
              kafka_* / kafka_connect_*(Strimzi JMX exporter,同上)
    P1 指标名按 collector 版本 / JMX rules 预写,部署后按 面板设计.md §7 清单核对。

已知盲区(不是本看板能补的,记在 TODO.md「可观测性与测试」):
1. 无 k8s 对象/容器级指标(pod 重启、副本数、容器内存)—— 需要 kubelet_stats /
   k8s_cluster receiver,基数敏感,单独一轮做(P2)。
2. Loki 的 k8s 标签是坏的(值是字面量 ".pod_name"),所以日志按 pod 下钻不了,
   只能按 detected_level 聚合。根因见 TODO.md。
3. Go runtime 区块已移到 APM 盘(按 $service 看);本盘不再借 config-center 的数据。
"""
from common import (LOKI, PROM, cpu_used_ratio, dash_link, dump, fs_used_ratio,
                    inodes_used_ratio, logs, mem_used_ratio, pool_saturation, prom_stat,
                    prom_t, reset_ids, row, steps, table, ts, zero_filled)

# 模板变量过滤片段。All 时 Grafana 把 $node 展开成正则 ".*",所以这里恒定可用。
NODE = 'k8s_node_name=~"$node"'
SVC = 'service_name=~"$service",service_name!="config-service"'
ECOMMERCE_SERVICE = 'service_name!="config-service"'

reset_ids()
panels = []
y = 0

# ───── Row 1 概览 ─────
panels.append(row("概览", y)); y += 1
panels.append(prom_stat("上报指标的节点数", 'count(count by (k8s_node_name) (system_cpu_utilization_ratio))',
    0, y, w=4, unit="none",
    thresholds=steps(("red", None), ("green", 3)),
    desc="正常值 3。旧版阈值是 ≥2(当时以为 collector 不调度 node1),2026-08-06 实测\n"
         "DaemonSet 已 3/3、node1/2/3 各 32 条 system 序列 —— 掉任何一台都该红"))
panels.append(prom_stat("节点 CPU 最高", f"max({cpu_used_ratio()})", 4, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.75), ("red", 0.9))))
panels.append(prom_stat("节点内存最高", f"max({mem_used_ratio()})", 8, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9))))
panels.append(prom_stat("节点磁盘最高", f"max({fs_used_ratio()})", 12, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9))))
panels.append(prom_stat("DB 连接池饱和度最高", f"max({pool_saturation(ECOMMERCE_SERVICE)})", 16, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.7), ("red", 0.9))))
panels.append(prom_stat("在报指标的服务数", 'count(count by (service_name) (rpc_server_duration_milliseconds_count{service_name!="config-service"}))',
    20, y, w=4, unit="none",
    desc="按 rpc_server_* 判活。只统计「近期有过调用」的服务,空闲服务不计入"))
y += 4

# ───── Row 2 节点资源 ─────
panels.append(row("节点资源(host_metrics)", y)); y += 1
panels.append(ts("CPU 利用率", [
    prom_t(cpu_used_ratio(NODE), "{{k8s_node_name}}"),
], 0, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.9)),
    desc="非 idle 时间占比,先按核汇总再对核取平均。直接 sum 会得到核数倍的数字"))
panels.append(ts("内存利用率", [
    prom_t(mem_used_ratio(NODE), "{{k8s_node_name}}"),
], 8, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.9))))
panels.append(ts("内存构成", [
    prom_t('system_memory_usage_bytes{k8s_node_name=~"$node",state!="free"}', "{{k8s_node_name}} {{state}}"),
], 16, y, w=8, unit="bytes", stack=True,
    desc="used / cached / buffered / slab。cached 高是正常的,不代表内存紧张"))
y += 8
panels.append(ts("文件系统使用率", [
    prom_t(fs_used_ratio(NODE), "{{k8s_node_name}} {{mountpoint}}"),
], 0, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.9)),
    desc="仅 ext4/xfs,已排除 /var/lib/kubelet/** 的 PVC bind mount(那是每个带 PVC 的 Pod 一个挂载点,\n"
         "且底下还是同一块盘,重复统计)。改配置前写进 VM 的那批僵尸序列要等保留期过才会消失"))
panels.append(ts("inode 使用率", [
    prom_t(inodes_used_ratio(NODE), "{{k8s_node_name}} {{mountpoint}}"),
], 8, y, w=8, unit="percentunit", percent=True,
    desc="磁盘还有空间但 inode 用尽也会写不进去,是容易被忽略的一类满盘"))
panels.append(ts("磁盘吞吐", [
    prom_t('sum by (k8s_node_name, direction) (rate(system_disk_io_bytes_total{k8s_node_name=~"$node",device=~"sd[a-z]"}[$__rate_interval]))',
           "{{k8s_node_name}} {{direction}}"),
], 16, y, w=8, unit="Bps",
    desc='device 只取整盘 sd[a-z]。不过滤会把 sda 和 sda1..sda4 一起算进来,吞吐翻一倍'))
y += 8
panels.append(ts("磁盘 IO 等待队列", [
    prom_t('sum by (k8s_node_name, device) (system_disk_pending_operations{k8s_node_name=~"$node",device=~"sd[a-z]"})',
           "{{k8s_node_name}} {{device}}"),
], 0, y, w=8, unit="none", desc="持续 >0 说明磁盘是瓶颈"))
panels.append(ts("网络吞吐", [
    prom_t('sum by (k8s_node_name, direction) (rate(system_network_io_bytes_total{k8s_node_name=~"$node"}[$__rate_interval]))',
           "{{k8s_node_name}} {{direction}}"),
], 8, y, w=8, unit="Bps", desc="device 已在采集侧限定为物理网卡(Cilium 的 lxc* veth 被排除,否则基数随 Pod 生命周期无限长)"))
panels.append(ts("网络错误与丢包", [
    prom_t('sum by (k8s_node_name, direction) (rate(system_network_errors_total{k8s_node_name=~"$node"}[$__rate_interval]))', "{{k8s_node_name}} {{direction}} 错误"),
    prom_t('sum by (k8s_node_name, direction) (rate(system_network_dropped_total{k8s_node_name=~"$node"}[$__rate_interval]))', "{{k8s_node_name}} {{direction}} 丢包", "B"),
], 16, y, w=8, unit="pps", desc="非零就该查。丢包常常比时延更早暴露网络问题"))
y += 8

# ───── Row 3 数据库依赖 ─────
panels.append(row("数据库依赖(pgxpool / otelpgx)", y)); y += 1
panels.append(ts("连接池饱和度", [
    prom_t(pool_saturation(SVC), "{{service_name}}"),
], 0, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.9)),
    desc="acquired / max。原看板这里用的是 pgxpool_total_conns / pgxpool_acquired_conns,\n"
         "这两个指标名不存在(otelpgx 导出的是 *_connections),所以一直是空图。\n"
         "独立 config-center 已从本仓指标范围排除，其资源指标请到配置中心 System 页面查看"))
panels.append(ts("连接池构成", [
    prom_t(f'pgxpool_acquired_connections{{{SVC}}}', "{{service_name}} 已占用"),
    prom_t(f'pgxpool_idle_connections{{{SVC}}}', "{{service_name}} 空闲", "B"),
    prom_t(f'pgxpool_total_connections{{{SVC}}}', "{{service_name}} 总数", "C"),
    prom_t(f'pgxpool_max_connections{{{SVC}}}', "{{service_name}} 上限", "D"),
], 8, y, w=8, unit="none"))
panels.append(ts("空池等待", [
    prom_t(f'sum by (service_name) (rate(pgxpool_empty_acquire_total{{{SVC}}}[$__rate_interval]))', "{{service_name}} 次/秒"),
], 16, y, w=8, unit="none",
    desc="池子被抽空、请求只能排队的频率。这才是「池不够用」的真信号 —— \n"
         "光看 acquired 贴着 max 可能只是稳态,而这个一涨就是真的在等"))
y += 8
panels.append(ts("空池平均等待时长", [
    prom_t(f'rate(pgxpool_empty_acquire_wait_time_nanoseconds_total{{{SVC}}}[$__rate_interval])'
           f' / clamp_min(rate(pgxpool_empty_acquire_total{{{SVC}}}[$__rate_interval]), 1)',
           "{{service_name}}"),
], 0, y, w=8, unit="ns",
    desc="clamp_min 防零除:没有空池等待时分母为 0,不夹住会画出 +Inf"))
# db_client_* 是 semconv 共用名:otelpgx 与 redisotel 都在写,必须按 db_system_name
# 区分(面板设计.md §1.5),否则 Redis 埋点上线当天这两张图会混入微秒级样本。
_PG_ONLY = f'{SVC},db_system_name="postgresql"'
panels.append(ts("DB 操作 P95(分类型)", [
    prom_t(f'histogram_quantile(0.95, sum by (le, pgx_operation_type) (rate(db_client_operation_duration_seconds_bucket{{{_PG_ONLY}}}[$__rate_interval])))',
           "{{pgx_operation_type}}"),
], 8, y, w=8, unit="s",
    desc="acquire / connect / prepare / query 四类分开看:acquire 慢是池不够,query 慢是 SQL 或库的问题,两者处置完全不同"))
_db_err = f'sum by (service_name) (rate(db_client_operation_errors_total{{{_PG_ONLY}}}[$__rate_interval]))'
_db_all = f'sum by (service_name) (rate(db_client_operation_duration_seconds_count{{{_PG_ONLY}}}[$__rate_interval]))'
panels.append(ts("DB 错误率", [
    prom_t(f"{zero_filled(_db_err, _db_all)} / {_db_all}", "{{service_name}}"),
], 16, y, w=8, unit="percentunit", percent=True, thresholds=steps(("green", None), ("red", 0.01)),
    desc="错误/操作总量(比率)。旧版少除了分母,画的是错误/秒 —— 1 err/s 混在\n"
         "10000 ops/s 里也飘红(评审已列),本版修正。零事件序列不存在,分子用总量乘 0 兜底"))
y += 8

# ───── Row 4 遥测管道健康(otelcol_*,P1:collector 自采部署后有数) ─────
# 「监控监控系统」:collector 挂了/丢数据时,所有别的图都会安静地变好看 ——
# 这一行是唯一能拆穿它的。指标名按 collector 版本预写,部署后核对(§7 清单)。
panels.append(row("遥测管道健康(otelcol 自采,2026-08-12 上线)", y)); y += 1
# send_failed 是事件型指标,健康时整条序列不存在 —— 用同族恒发的 sent 做零填充
# 锚点,否则健康时空图看起来像自采坏了。(部署后实测核对:sent/accepted/refused
# 都在,send_failed 不在 = 从没失败过,名字形态与 sent 同族。)
def _exp_fail(kind):
    # 锚点必须同族:span 失败率拿 sent_spans 兜底(jaeger 只发 span,拿 metric
    # points 做锚会漏掉它,victoriametrics 反而被补上一条无意义的 span 0 线)。
    fail = f'sum by (exporter) (rate(otelcol_exporter_send_failed_{kind}_total[$__rate_interval]))'
    sent = f'sum by (exporter) (rate(otelcol_exporter_sent_{kind}_total[$__rate_interval]))'
    return zero_filled(fail, sent)


panels.append(ts("导出失败(遥测正在丢)", [
    prom_t(_exp_fail("metric_points"), "{{exporter}} 指标点"),
    prom_t(_exp_fail("spans"), "{{exporter}} span", "B"),
    prom_t(_exp_fail("log_records"), "{{exporter}} 日志", "C"),
], 0, y, w=8, unit="none",
    thresholds=steps(("green", None), ("red", 1)),
    desc="非零 = VM / Jaeger / Loki 某个后端收不进去。此时面板上的「一切正常」不可信"))
panels.append(ts("导出队列水位", [
    prom_t('otelcol_exporter_queue_size', "{{exporter}} ({{k8s_node_name}})"),
], 8, y, w=8, unit="none",
    desc="持续增长 = 后端写入跟不上,涨满开始丢(配合左图看)"))
# 预写的 otelcol_processor_refused_* 实测不存在:memory_limiter 拒收反映在
# receiver 层的 otelcol_receiver_refused_*(2026-08-12 部署后核对改正)。
_recv_ok = 'sum by (receiver) (rate(otelcol_receiver_accepted_metric_points_total[$__rate_interval]))'
panels.append(ts("receiver 拒收(memory_limiter 生效中)", [
    prom_t(zero_filled('sum by (receiver) (rate(otelcol_receiver_refused_metric_points_total[$__rate_interval]))', _recv_ok), "{{receiver}} 指标点"),
    prom_t(zero_filled('sum by (receiver) (rate(otelcol_receiver_refused_log_records_total[$__rate_interval]))', _recv_ok), "{{receiver}} 日志", "B"),
], 16, y, w=8, unit="none",
    desc="collector 内存顶到 limit_mib 后从入口开始拒收 —— 出现即调 limit 或查数据量突增"))
y += 8

# ───── Row 5 Kafka(Strimzi JMX,P1:metricsConfig 部署后有数) ─────
# broker 曾 OOMKill 41 次、Connect 重启 484 次,当时只能 kubectl describe —— 这一行
# 就是为了下次别再盲修。Connect task failed 现在就该是红的(CDC 自 2026-06-09 未跑通),
# 这是暴露不是误报;修好 CDC 后随首个 consumer 再上 lag 面板(P2,硬规则)。
panels.append(row("Kafka(Strimzi)—— P1:等 metricsConfig 上线;task failed 红着是当前事实", y)); y += 1
panels.append(ts("Connect connector/task 状态", [
    prom_t('kafka_connect_connector_status', "{{connector}} {{status}}"),
    prom_t('kafka_connect_connector_task_status', "{{connector}}/task-{{task}} {{status}}", "B"),
], 0, y, w=8, unit="none",
    desc="值恒为 1,看的是 status 标签(running/failed/paused)。failed 序列出现即异常;\n"
         "postgres-source-connector 当前预期是 failed(CDC 配置错,见 TODO)"))
panels.append(ts("broker 消息与字节速率", [
    prom_t('rate(kafka_server_brokertopicmetrics_messagesin_total[$__rate_interval])', "消息/s"),
    prom_t('rate(kafka_server_brokertopicmetrics_bytesin_total[$__rate_interval])', "写入 B/s", "B"),
    prom_t('rate(kafka_server_brokertopicmetrics_bytesout_total[$__rate_interval])', "读出 B/s", "C"),
], 8, y, w=8, unit="none",
    desc="CDC 没跑通之前这里应接近 0;跑通后基线 = 6 张白名单表的变更速率"))
panels.append(ts("broker 健康", [
    prom_t('kafka_server_replicamanager_underreplicatedpartitions', "欠副本分区"),
    prom_t('kafka_server_kafkarequesthandlerpool_requesthandleravgidle_percent', "请求线程空闲比", "B"),
], 16, y, w=8, unit="none",
    desc="单 broker 集群欠副本应恒 0;空闲比 <0.3 = broker 过载。\n"
         "JMX javaagent 约占 50-100Mi 堆外内存,broker limit 1Gi,部署后盯一眼 RSS"))
y += 8

# ───── Row 6 服务与日志 ─────
panels.append(row("服务在线与基础设施日志", y)); y += 1
panels.append(table("各服务请求量(时间范围内)",
    f'sort_desc(sum by (service_name) (increase(rpc_server_duration_milliseconds_count{{{ECOMMERCE_SERVICE}}}[$__range])))',
    0, y, w=8, h=8, unit="none", hide_regex="Time",
    desc="没出现在这里的服务 = 时间范围内没有被调用过(可能没启动,也可能只是空闲)"))
panels.append(ts("日志速率(按级别)", [
    {"refId": "A", "datasource": LOKI,
     "expr": 'sum by (detected_level) (rate({service_name=~".+",service_name!="config-service"}[$__auto]))',
     "legendFormat": "{{detected_level}}"},
], 8, y, w=8, unit="none", datasource=LOKI,
    desc="error/warn 陡增通常比任何指标都先反映故障"))
panels.append(logs("错误与告警日志", '{service_name=~".+",service_name!="config-service"} | detected_level=~"error|warn"', 16, y, w=8, h=8,
    desc="按 pod / namespace 下钻现在做不到:fluent-bit 的 Label_keys 写法有误,\n"
         "k8s__pod_name 等标签的值是字面量 \".pod_name\"。详见 TODO.md"))

print(dump(
    uid="ecommerce-infrastructure",
    title="基础设施 · 节点与依赖",
    panels=panels,
    links=[dash_link("业务大盘", "ecommerce-overview", "ecommerce-overview", icon="apps"),
           dash_link("应用 APM", "ecommerce-apm", "apm", icon="bolt")],
    templating=[
        {"name": "node", "label": "节点", "type": "query", "datasource": PROM,
         "query": {"query": "label_values(system_cpu_utilization_ratio, k8s_node_name)", "refId": "v"},
         "includeAll": True, "multi": True, "current": {"text": ["All"], "value": ["$__all"]},
         "refresh": 2},
        {"name": "service", "label": "服务", "type": "query", "datasource": PROM,
         "query": {"query": "label_values(pgxpool_max_connections{service_name!=\"config-service\"}, service_name)", "refId": "v"},
         "includeAll": True, "multi": True, "current": {"text": ["All"], "value": ["$__all"]},
         "refresh": 2},
    ],
    time_from="now-6h",
    # 刷新 1m → 5m。基础设施指标没有 1 分钟粒度的决策价值,而这张盘里那条
    # `{service_name=~".+"}` 的 Loki 查询要扫全部 stream(实测单次 3h 范围扫 87MB /
    # 7.7 万行)—— loki 是 SingleBinary 部署、内存上限 1Gi,1 分钟一次地打它并不划算。
    # 5m 把这类查询的压力降到 1/5,代价是图上最多晚 5 分钟,对排查节点/DB 够用。
    refresh="5m",
    tags=["ecommerce", "infrastructure", "generated"],
    message="generated: 节点(host_metrics) + DB(pgxpool/otelpgx) + 日志(Loki)",
))
