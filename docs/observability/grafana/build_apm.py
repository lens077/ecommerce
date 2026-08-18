"""生成「应用 APM · 服务详情」并输出 Grafana API 请求体。

    python3 build_apm.py > apm.json

对标 ARMS「应用详情」页,设计与口径见 ../面板设计.md §4(裁剪逻辑见 §8)。
排障动线:R1 全服务锁定嫌疑 → 选 $service 从上往下看是哪层 → 明细跳 Jaeger。

数据可用性(2026-08-12):
  P0(现在就有数): R1-R3(rpc_server_*)、R5(pgxpool_*/db_client_* postgresql)、
                   R8(http_client_*)
  P1(部署后才有数,面板先占位): R4 Go runtime(go_*,backend 本次埋点)、
                   R6 Redis(db_client_* redis,redisotel-native)、
                   R7 网关(http_server_*,gateway 本次补 meter)
  P1 指标名按对应版本源码预写,部署后必须按 面板设计.md §7 清单逐族核对。
"""
from common import (CLIENT_FAULT_CODES, ECOMMERCE, PROM, RPC_BUCKET, RPC_COUNT,
                    SERVER_FAULT_CODES, dash_link, dump, jaeger_link, prom_t,
                    reset_ids, row, rpc_quantile, steps, svc_error_ratio, table,
                    ts, zero_filled)

reset_ids()
panels = []
y = 0

# $service 单选(不含 All):这张盘的 R2-R6 是「一个服务的体检报告」,多选会把
# 不同服务的 method 曲线混进一张图,反而看不清。跨服务对比在 R1。
SVC = 'service_name="$service"'


def _rate(metric, extra=""):
    inner = ",".join(f for f in (ECOMMERCE, extra) if f)
    return f"rate({metric}{{{inner}}}[$__rate_interval])"


# ───── Row 1 全服务 RED(不选 $service 也能用,是这张盘的「入口」) ─────
panels.append(row("全服务 RED —— 先在这里锁定嫌疑服务,再用上方 $service 下钻", y)); y += 1
panels.append(ts("请求率 by 服务", [
    prom_t(f"sum by (service_name) ({_rate(RPC_COUNT)})", "{{service_name}}"),
], 0, y, w=8, unit="reqps"))
panels.append(ts("服务侧错误率 by 服务", [
    prom_t(svc_error_ratio(), "{{service_name}}"),
], 8, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.05)),
    desc="只统计服务侧错误码(口径见 面板设计.md §1.1),客户端异常不在内。\n"
         "payment 恒 100% 是预期:5 个 RPC 全是 Unimplemented 桩,红着提醒它没实现"))
panels.append(ts("P95 by 服务", [
    prom_t(rpc_quantile(0.95), "{{service_name}}"),
], 16, y, w=8, unit="ms"))
y += 8
panels.append(table("服务侧错误率 Top(时间范围内)",
    f"topk(10, {svc_error_ratio()})",
    0, y, w=12, h=6, unit="percentunit"))
panels.append(table("最慢方法 Top(P95,时间范围内)",
    f'topk(10, histogram_quantile(0.95, sum by (le, service_name, rpc_method) (increase({RPC_BUCKET}{{{ECOMMERCE}}}[$__range]))))',
    12, y, w=12, h=6, unit="ms",
    desc="从业务盘挪过来的:服务健康类面板统一归本盘,业务盘只留红绿灯"))
y += 6

# ───── Row 2 $service RED 详情 ─────
panels.append(row("[$service] RED 详情", y)); y += 1
panels.append(ts("QPS by 方法", [
    prom_t(f"sum by (rpc_method) ({_rate(RPC_COUNT, SVC)})", "{{rpc_method}}"),
], 0, y, w=8, unit="reqps",
    desc="rpc_method 是 proto 定死的有界集合,不会有基数问题"))
panels.append(ts("延迟分位数(整服务)", [
    prom_t(rpc_quantile(0.50, by="service_name", extra=SVC), "P50"),
    prom_t(rpc_quantile(0.95, by="service_name", extra=SVC), "P95", "B"),
    prom_t(rpc_quantile(0.99, by="service_name", extra=SVC), "P99", "C"),
], 8, y, w=8, unit="ms",
    desc="「慢」只看分位数,没有「慢调用次数」(面板设计.md §1.2)。\n"
         "P99 单独恶化查慢查询/GC/锁;整体抬升查依赖 —— 明细用右上角 Jaeger 链接"))
panels.append(ts("P95 by 方法", [
    prom_t(rpc_quantile(0.95, by="rpc_method", extra=SVC), "{{rpc_method}}"),
], 16, y, w=8, unit="ms"))
y += 8

# ───── Row 3 $service 错误分析(对标 ARMS 错误分析+异常分析) ─────
panels.append(row("[$service] 错误分析 —— 服务侧错误进 SLO,客户端异常只观察", y)); y += 1
_err_srv = (f'sum by (rpc_method, rpc_connect_rpc_error_code) '
            f'(rate({RPC_COUNT}{{{SVC},rpc_connect_rpc_error_code=~"{SERVER_FAULT_CODES}"}}[$__rate_interval]))')
_err_cli = (f'sum by (rpc_method, rpc_connect_rpc_error_code) '
            f'(rate({RPC_COUNT}{{{SVC},rpc_connect_rpc_error_code=~"{CLIENT_FAULT_CODES}"}}[$__rate_interval]))')
panels.append(ts("服务侧错误 by 方法+错误码", [
    prom_t(_err_srv, "{{rpc_method}} {{rpc_connect_rpc_error_code}}"),
], 0, y, w=8, unit="reqps",
    desc="健康时这张图为空是正常的(错误序列只在出错后才存在)。\n"
         "unknown = 未包装的普通 error(CodeOf(nil) 语义);panic 被 recover 后是 internal"))
panels.append(ts("服务侧错误率(整服务)", [
    prom_t(svc_error_ratio(extra=SVC), "错误率"),
], 8, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.05))))
panels.append(ts("客户端异常 by 错误码(不进 SLO)", [
    prom_t(_err_cli, "{{rpc_method}} {{rpc_connect_rpc_error_code}}"),
], 16, y, w=8, unit="reqps",
    desc="invalid_argument 突增 = 前端契约破坏或恶意流量;unauthenticated 突增 = 鉴权链路问题。\n"
         "都不算服务的错,但值得看见"))
y += 8

# ───── Row 4 $service Go runtime(P1:backend 埋点部署后有数) ─────
panels.append(row("[$service] Go runtime —— P1:等 runtime 埋点发版;对标 ARMS 的 JVM/FullGC 区", y)); y += 1
panels.append(ts("goroutine 数", [
    prom_t(f'go_goroutine_count{{{SVC}}}', "goroutines"),
], 0, y, w=6, unit="none",
    desc="Go 服务最重要的单一健康指标(OBSERVABILITY.md §3.2)。\n"
         "持续增长 = 泄漏/Channel 阻塞,对照最近发版"))
panels.append(ts("堆内存 vs GC 目标", [
    prom_t(f'go_memory_used_bytes{{{SVC}}}', "used"),
    prom_t(f'go_memory_gc_goal_bytes{{{SVC}}}', "gc goal", "B"),
    prom_t(f'go_memory_limit_bytes{{{SVC}}}', "gomemlimit", "C"),
], 6, y, w=6, unit="bytes",
    desc="used 贴着 goal = GC 频繁;贴着 limit = 快 OOM"))
panels.append(ts("堆分配速率", [
    prom_t(f'rate(go_memory_allocated_bytes_total{{{SVC}}}[$__rate_interval])', "alloc/s"),
], 12, y, w=6, unit="Bps",
    desc="分配速率陡增 → GC 压力的源头,先于延迟恶化出现"))
panels.append(ts("调度延迟 P99(GC 暂停的替代信号)", [
    prom_t(f'histogram_quantile(0.99, sum by (le) (rate(go_schedule_duration_seconds_bucket{{{SVC}}}[$__rate_interval])))', "P99"),
], 18, y, w=6, unit="s",
    desc="goroutine 就绪→实际运行的等待。runtime v0.70 没有 GC pause 指标,\n"
         "GC STW 和 CPU 饱和都会先在这里冒头(接口变慢不一定是 DB —— 先排除这里)"))
y += 8

# ───── Row 5 $service DB(PostgreSQL / pgxpool) ─────
panels.append(row("[$service] DB(PostgreSQL)—— acquire 慢是池不够,query 慢是 SQL 的事", y)); y += 1
panels.append(ts("连接池饱和度与等待", [
    prom_t(f'pgxpool_acquired_connections{{{SVC}}} / pgxpool_max_connections{{{SVC}}}', "饱和度"),
    prom_t(f'sum (rate(pgxpool_empty_acquire_total{{{SVC}}}[$__rate_interval]))', "空池等待 次/s", "B"),
], 0, y, w=8, unit="none",
    thresholds=steps(("green", None), ("red", 0.9)),
    desc="「很多故障不是数据库挂了,是池子满了」—— 空池等待一出现就是真信号,\n"
         "饱和度贴 90% 可能只是稳态"))
_PG = 'db_system_name="postgresql"'
panels.append(ts("DB 操作 P95(分类型)", [
    prom_t(f'histogram_quantile(0.95, sum by (le, pgx_operation_type) (rate(db_client_operation_duration_seconds_bucket{{{SVC},{_PG}}}[$__rate_interval])))',
           "{{pgx_operation_type}}"),
], 8, y, w=8, unit="s",
    desc="必须带 db_system_name 过滤:redisotel 上线后同名指标里混着 Redis 的微秒级样本,\n"
         "裸聚合会画出一条假「优化」(面板设计.md §1.5)"))
_db_err = f'sum (rate(db_client_operation_errors_total{{{SVC},{_PG}}}[$__rate_interval]))'
_db_all = f'sum (rate(db_client_operation_duration_seconds_count{{{SVC},{_PG}}}[$__rate_interval]))'
panels.append(ts("DB 错误率", [
    prom_t(f"{zero_filled(_db_err, _db_all)} / {_db_all}", "错误率"),
], 16, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.01)),
    desc="错误/操作总量(比率)。旧盘画成了错误/秒,1 err/s 混在 10000 ops/s 里也飘红,已修"))
y += 8

# ───── Row 6 $service Redis / Dragonfly(P1:redisotel 部署后有数) ─────
panels.append(row("[$service] Redis(Dragonfly)—— P1:等 redisotel 发版;命中率需服务端指标(P2)", y)); y += 1
_RD = 'db_system_name="redis"'
panels.append(ts("命令 QPS by 操作", [
    prom_t(f'sum by (db_operation_name) (rate(db_client_operation_duration_seconds_count{{{SVC},{_RD}}}[$__rate_interval]))',
           "{{db_operation_name}}"),
], 0, y, w=6, unit="reqps"))
panels.append(ts("命令 P99", [
    prom_t(f'histogram_quantile(0.99, sum by (le) (rate(db_client_operation_duration_seconds_bucket{{{SVC},{_RD}}}[$__rate_interval])))', "P99"),
], 6, y, w=6, unit="s",
    desc="Dragonfly 走 TLS(dragonfly.dev.test:443),网络在这条曲线里 —— \n"
         "缓存比 DB 慢的话缓存就失去意义了,这条线应远低于 R5 的 query P95"))
panels.append(ts("连接池", [
    prom_t(f'db_client_connection_count{{{SVC},{_RD}}}', "{{state}}"),
    prom_t(f'db_client_connection_pending_requests{{{SVC},{_RD}}}', "等待中", "B"),
], 12, y, w=6, unit="none",
    desc="pending 持续 >0 = 池不够或命令太慢(与 R5 空池等待同一逻辑)"))
_rd_err = f'sum (rate(redis_client_errors_total{{{SVC}}}[$__rate_interval]))'
_rd_all = f'sum (rate(db_client_operation_duration_seconds_count{{{SVC},{_RD}}}[$__rate_interval]))'
panels.append(ts("Redis 客户端错误", [
    prom_t(zero_filled(_rd_err, _rd_all), "错误/s"),
], 18, y, w=6, unit="none",
    desc="经典联动:这里错误↑ 或超时↑,同时 R5 的 DB QPS↑ = 缓存击穿正在发生。\n"
         "命中率维度客户端埋点给不了,等 Dragonfly 服务端 /metrics(P2)"))
y += 8

# ───── Row 7 网关入口(P1:gateway meter 部署后有数;不分 $service) ─────
panels.append(row("网关入口(全局,不随 $service 变化)—— P1:等 gateway 发版", y)); y += 1
_GW = 'http_server_request_duration_seconds'
panels.append(ts("入口 QPS by 状态段", [
    prom_t(f'sum by (http_response_status_code) (rate({_GW}_count[$__rate_interval]))',
           "{{http_response_status_code}}"),
], 0, y, w=8, unit="reqps",
    desc="用户视角的总入口。otelhttp 不带 URL 路径标签(高基数保护),按状态码看"))
_gw_5xx = f'sum (rate({_GW}_count{{http_response_status_code=~"5.."}}[$__rate_interval]))'
_gw_all = f'sum (rate({_GW}_count[$__rate_interval]))'
panels.append(ts("入口 5xx 比率", [
    prom_t(f"{zero_filled(_gw_5xx, _gw_all)} / {_gw_all}", "5xx 比率"),
], 8, y, w=8, unit="percentunit", percent=True,
    thresholds=steps(("green", None), ("red", 0.01)),
    desc="这里红了但 R1 各服务都绿 = 问题在网关自身(路由/鉴权/熔断),\n"
         "注意网关 tracing 曾把后端 5xx 记成 span OK(评审已列,metrics 口径不受影响)"))
panels.append(ts("入口延迟", [
    prom_t(f'histogram_quantile(0.95, sum by (le) (rate({_GW}_bucket[$__rate_interval])))', "P95"),
    prom_t(f'histogram_quantile(0.99, sum by (le) (rate({_GW}_bucket[$__rate_interval])))', "P99", "B"),
], 16, y, w=8, unit="s",
    desc="与 R2 的服务端分位数的差值 ≈ 网关自身开销(鉴权/RBAC/路由)"))
y += 8

# ───── Row 8 $service 出站依赖(http client) ─────
panels.append(row("[$service] 出站 HTTP 依赖(ES / gorse / casdoor / 支付渠道等)", y)); y += 1
panels.append(ts("出站 P95 by 目标", [
    prom_t(f'histogram_quantile(0.95, sum by (le, server_address) (rate(http_client_request_duration_seconds_bucket{{{SVC}}}[$__rate_interval])))',
           "{{server_address}}"),
], 0, y, w=12, unit="s",
    desc="对标 ARMS「应用依赖服务」。server_address 是配置里的域名,有界。\n"
         "依赖不可用先于业务报错出现(OBSERVABILITY.md §3.3)"))
panels.append(ts("出站 QPS by 目标", [
    prom_t(f'sum by (server_address) (rate(http_client_request_duration_seconds_count{{{SVC}}}[$__rate_interval]))',
           "{{server_address}}"),
], 12, y, w=12, unit="reqps",
    desc="服务间不直调(经网关),所以这里只有外部依赖;真出现服务间 connect 直调时\n"
         "加 rpc_client_* 区块(otelconnect 客户端拦截器自动生效)"))

print(dump(
    uid="ecommerce-apm",
    title="应用 APM · 服务详情",
    panels=panels,
    links=[
        dash_link("业务大盘", "ecommerce-overview", "ecommerce-overview", icon="apps"),
        dash_link("基础设施", "ecommerce-infrastructure", "infrastructure", icon="cloud"),
        # Jaeger 明细入口:面板管聚合,明细(慢请求瀑布/SQL 语句/错误堆栈)去 Jaeger。
        {**jaeger_link(service="$service"), "type": "link", "icon": "external link",
         "tooltip": "跳转 Jaeger 查当前服务的 trace 明细", "keepTime": False,
         "asDropdown": False, "includeVars": False, "tags": []},
    ],
    templating=[{
        "name": "service", "label": "服务", "type": "query", "datasource": PROM,
        "query": {"query": 'label_values(rpc_server_duration_milliseconds_count{service_name!="config-service"}, service_name)', "refId": "v"},
        # 单选:R2-R6 是单服务体检报告,多选把不同服务的 method 曲线混一图反而看不清
        "includeAll": False, "multi": False, "refresh": 2,
    }],
    time_from="now-3h",
    refresh="1m",
    tags=["ecommerce", "apm", "generated"],
    message="generated: 应用 APM(RED + runtime + DB + Redis + 网关 + 出站依赖)",
))
