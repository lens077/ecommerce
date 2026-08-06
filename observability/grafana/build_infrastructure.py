"""生成「基础设施 · 节点与依赖」并输出 Grafana API 请求体。

    python3 build_infrastructure.py > infrastructure.json

只用**当前 VM 里真实存在**的指标族(2026-08 实测,共 5 族 57 个指标名):
    system_*                collector host_metrics(cpu/memory/disk/network/filesystem)
    pgxpool_*               otelpgx RecordStats
    db_client_operation_*   otelpgx
    process_* / process_runtime_go_*   仅 config-service(见 Row 4 说明)
    rpc_server_*            otelconnect(业务盘已用,这里只做「服务在不在」)

已知盲区(都不是本看板能补的,记在 TODO.md「可观测性与测试」):
1. 采集管道自身健康(otelcol_*)不在 VM 里 —— 只在每个 collector pod 的 :8888,
   没有任何东西采集它。要 collector 加 prometheus receiver 自采。
   这是本看板最大的缺口:现在无法回答「遥测有没有在半路丢」。
2. 无 k8s 对象/容器级指标(pod 重启、副本数、容器内存)—— 需要 kubelet_stats /
   k8s_cluster receiver,基数敏感,单独一轮做。
3. node1(control-plane)没有主机指标 —— collector DaemonSet 不调度到那儿
   (desired=2),要覆盖得加 toleration。
4. Loki 的 k8s 标签是坏的(值是字面量 ".pod_name"),所以日志按 pod 下钻不了,
   只能按 detected_level 聚合。根因见 TODO.md。
"""
from common import (LOKI, PROM, cpu_used_ratio, dash_link, dump, fs_used_ratio,
                    inodes_used_ratio, logs, mem_used_ratio, pool_saturation, prom_stat,
                    prom_t, reset_ids, row, steps, table, ts)

# 模板变量过滤片段。All 时 Grafana 把 $node 展开成正则 ".*",所以这里恒定可用。
NODE = 'k8s_node_name=~"$node"'
SVC = 'service_name=~"$service"'

reset_ids()
panels = []
y = 0

# ───── Row 1 概览 ─────
panels.append(row("概览", y)); y += 1
panels.append(prom_stat("上报指标的节点数", 'count(count by (k8s_node_name) (system_cpu_utilization_ratio))',
    0, y, w=4, unit="none",
    thresholds=steps(("red", None), ("green", 2)),
    desc="集群共 3 个节点,但 node1 是 control-plane、collector DaemonSet 不调度过去,所以正常值是 2"))
panels.append(prom_stat("节点 CPU 最高", f"max({cpu_used_ratio()})", 4, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.75), ("red", 0.9))))
panels.append(prom_stat("节点内存最高", f"max({mem_used_ratio()})", 8, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9))))
panels.append(prom_stat("节点磁盘最高", f"max({fs_used_ratio()})", 12, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9))))
panels.append(prom_stat("DB 连接池饱和度最高", f"max({pool_saturation()})", 16, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.7), ("red", 0.9))))
panels.append(prom_stat("在报指标的服务数", 'count(count by (service_name) (rpc_server_duration_milliseconds_count))',
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
         "这两个指标名不存在(otelpgx 导出的是 *_connections),所以一直是空图"))
panels.append(ts("连接池构成", [
    prom_t('pgxpool_acquired_connections{service_name=~"$service"}', "{{service_name}} 已占用"),
    prom_t('pgxpool_idle_connections{service_name=~"$service"}', "{{service_name}} 空闲", "B"),
    prom_t('pgxpool_total_connections{service_name=~"$service"}', "{{service_name}} 总数", "C"),
    prom_t('pgxpool_max_connections{service_name=~"$service"}', "{{service_name}} 上限", "D"),
], 8, y, w=8, unit="none"))
panels.append(ts("空池等待", [
    prom_t('sum by (service_name) (rate(pgxpool_empty_acquire_total{service_name=~"$service"}[$__rate_interval]))', "{{service_name}} 次/秒"),
], 16, y, w=8, unit="none",
    desc="池子被抽空、请求只能排队的频率。这才是「池不够用」的真信号 —— \n"
         "光看 acquired 贴着 max 可能只是稳态,而这个一涨就是真的在等"))
y += 8
panels.append(ts("空池平均等待时长", [
    prom_t('rate(pgxpool_empty_acquire_wait_time_nanoseconds_total{service_name=~"$service"}[$__rate_interval])'
           ' / clamp_min(rate(pgxpool_empty_acquire_total{service_name=~"$service"}[$__rate_interval]), 1)',
           "{{service_name}}"),
], 0, y, w=8, unit="ns",
    desc="clamp_min 防零除:没有空池等待时分母为 0,不夹住会画出 +Inf"))
panels.append(ts("DB 操作 P95(分类型)", [
    prom_t('histogram_quantile(0.95, sum by (le, pgx_operation_type) (rate(db_client_operation_duration_seconds_bucket{service_name=~"$service"}[$__rate_interval])))',
           "{{pgx_operation_type}}"),
], 8, y, w=8, unit="s",
    desc="acquire / connect / prepare / query 四类分开看:acquire 慢是池不够,query 慢是 SQL 或库的问题,两者处置完全不同"))
panels.append(ts("DB 错误率", [
    prom_t('sum by (service_name) (rate(db_client_operation_errors_total{service_name=~"$service"}[$__rate_interval]))', "{{service_name}}"),
], 16, y, w=8, unit="none", thresholds=steps(("green", None), ("red", 0.1))))
y += 8

# ───── Row 4 Go 运行时 ─────
panels.append(row("Go 运行时 —— 目前只有 config-service 在报(其余服务未接 sysstat,见 TODO)", y)); y += 1
panels.append(ts("goroutine 数", [
    prom_t('process_runtime_go_goroutines', "{{service_name}}"),
], 0, y, w=8, unit="none",
    desc="只有 config-service 有:它自己实现了 internal/pkg/sysstat。\n"
         "11 个电商服务都没有 runtime 指标,所以这张图上不会出现它们 —— 不是没数据,是没埋"))
panels.append(ts("Go 堆占用", [
    prom_t('process_runtime_go_heap_usage_bytes', "{{service_name}}"),
], 8, y, w=8, unit="bytes"))
panels.append(ts("进程 CPU / 内存", [
    prom_t('process_cpu_utilization_ratio', "{{service_name}} CPU"),
    prom_t('process_memory_usage_bytes / clamp_min(process_memory_limit_bytes, 1)', "{{service_name}} 内存占比", "B"),
], 16, y, w=8, unit="percentunit"))
y += 8

# ───── Row 5 服务与日志 ─────
panels.append(row("服务在线与基础设施日志", y)); y += 1
panels.append(table("各服务请求量(时间范围内)",
    'sort_desc(sum by (service_name) (increase(rpc_server_duration_milliseconds_count[$__range])))',
    0, y, w=8, h=8, unit="none", hide_regex="Time",
    desc="没出现在这里的服务 = 时间范围内没有被调用过(可能没启动,也可能只是空闲)"))
panels.append(ts("日志速率(按级别)", [
    {"refId": "A", "datasource": LOKI,
     "expr": 'sum by (detected_level) (rate({service_name=~".+"}[$__auto]))',
     "legendFormat": "{{detected_level}}"},
], 8, y, w=8, unit="none", datasource=LOKI,
    desc="error/warn 陡增通常比任何指标都先反映故障"))
panels.append(logs("错误与告警日志", '{service_name=~".+"} | detected_level=~"error|warn"', 16, y, w=8, h=8,
    desc="按 pod / namespace 下钻现在做不到:fluent-bit 的 Label_keys 写法有误,\n"
         "k8s__pod_name 等标签的值是字面量 \".pod_name\"。详见 TODO.md"))

print(dump(
    uid="ecommerce-infrastructure",
    title="基础设施 · 节点与依赖",
    panels=panels,
    links=[dash_link("业务大盘", "ecommerce-overview", "ecommerce-overview", icon="apps")],
    templating=[
        {"name": "node", "label": "节点", "type": "query", "datasource": PROM,
         "query": {"query": "label_values(system_cpu_utilization_ratio, k8s_node_name)", "refId": "v"},
         "includeAll": True, "multi": True, "current": {"text": ["All"], "value": ["$__all"]},
         "refresh": 2},
        {"name": "service", "label": "服务", "type": "query", "datasource": PROM,
         "query": {"query": "label_values(pgxpool_max_connections, service_name)", "refId": "v"},
         "includeAll": True, "multi": True, "current": {"text": ["All"], "value": ["$__all"]},
         "refresh": 2},
    ],
    time_from="now-6h",
    tags=["ecommerce", "infrastructure", "generated"],
    message="generated: 节点(host_metrics) + DB(pgxpool/otelpgx) + Go 运行时 + 日志(Loki)",
))
