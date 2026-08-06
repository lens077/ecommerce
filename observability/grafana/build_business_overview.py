"""生成「电商大盘 · 业务与系统」并输出 Grafana API 请求体。

    python3 build_business_overview.py > business-overview.json

数据源分工:
- Postgres  业务真相源:orders.order_main / cart.cart_item
            (behaviors.events 表已建但没数据:tracker 未接线,所以漏斗用 RPC 近似)
- VM        rpc_server_*(otelconnect)、web_vitals_*(behavior TelemetryService)、
            system_*(collector host_metrics)、pgxpool_*(otelpgx)
- Loki      结构化日志(detected_level / web_vital / slow_frontend_api)

本文件搬自 cloud-native-deploy 仓库的 build_ecommerce_overview.py,并修掉了四处
与真实指标名/口径不符的地方,详见 README.md 的「修正记录」。
基础设施明细已拆到 build_infrastructure.py,这里只留一行红绿灯 + 跳转按钮。
"""
from common import (PG, PROM, bargauge, cpu_used_ratio, dash_link, dump, fs_used_ratio,
                    logs, mem_used_ratio, pg_stat, pg_t, piechart, pool_saturation,
                    prom_stat, prom_t, reset_ids, row, steps, table, ts, zero_filled)

reset_ids()
panels = []
y = 0

# ───── Row 1 业务北极星 ─────
panels.append(row("业务北极星(时间范围内)", y)); y += 1
panels.append(pg_stat("订单数", "SELECT count(*) FROM orders.order_main WHERE $__timeFilter(created_at)", 0, y,
                      desc="orders.order_main 落库数"))
panels.append(pg_stat("GMV(应付)", "SELECT coalesce(sum(pay_amount),0) FROM orders.order_main WHERE $__timeFilter(created_at)", 4, y,
                      unit="currencyCNY", desc="sum(pay_amount)。金额列是 numeric,汇总在库内做"))
panels.append(pg_stat("客单价", "SELECT coalesce(avg(pay_amount),0) FROM orders.order_main WHERE $__timeFilter(created_at)", 8, y,
                      unit="currencyCNY"))
panels.append(pg_stat("加购条目数", "SELECT count(*) FROM cart.cart_item WHERE $__timeFilter(created_at)", 12, y,
                      desc="cart.cart_item 新增行数(同 SKU 累加数量不产生新行,口径偏保守)"))
panels.append(pg_stat("加购→下单转化率",
    "SELECT count(DISTINCT o.user_id)::float / nullif((SELECT count(DISTINCT user_id) FROM cart.cart_item WHERE $__timeFilter(created_at)),0) FROM orders.order_main o WHERE $__timeFilter(o.created_at)",
    16, y, unit="percentunit",
    thresholds=steps(("red", None), ("yellow", 0.1), ("green", 0.3)),
    desc="下单用户数 / 加购用户数(用户去重口径,不是订单/条目比)"))
panels.append(pg_stat("支付完成率",
    "SELECT count(*) FILTER (WHERE paid_at IS NOT NULL)::float / nullif(count(*),0) FROM orders.order_main WHERE $__timeFilter(created_at)",
    20, y, unit="percentunit",
    thresholds=steps(("red", None), ("yellow", 0.5), ("green", 0.8)),
    desc="paid_at 非空 / 订单数。payment 服务 5 个 RPC 全是桩(显式返回 Unimplemented),当前恒为 0 是预期"))
y += 4

# ───── Row 2 业务趋势 ─────
panels.append(row("业务趋势", y)); y += 1
panels.append(ts("加购 vs 下单(按天)", [
    pg_t("SELECT $__timeGroup(created_at,'1d') AS time, count(*) AS \"加购条目\" FROM cart.cart_item WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1", "A"),
    pg_t("SELECT $__timeGroup(created_at,'1d') AS time, count(*) AS \"订单\" FROM orders.order_main WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1", "B"),
], 0, y, w=10, datasource=PG))
panels.append(ts("GMV(按天)", [
    pg_t("SELECT $__timeGroup(created_at,'1d') AS time, sum(pay_amount) AS \"GMV\" FROM orders.order_main WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1"),
], 10, y, w=6, unit="currencyCNY", datasource=PG))
panels.append(piechart("订单状态分布",
    "SELECT order_status::text AS metric, count(*) AS n FROM orders.order_main WHERE $__timeFilter(created_at) GROUP BY 1",
    16, y, w=8, desc="order_main.order_status"))
y += 8

# ───── Row 3 行为漏斗(RPC 近似) ─────
panels.append(row("行为漏斗 —— RPC 调用近似(behaviors.events 为空:tracker 未接线,接上后换真漏斗)", y)); y += 1
panels.append(bargauge("浏览 → 加购 → 下单(调用量,时间范围内)", [
    prom_t('sum(increase(rpc_server_duration_milliseconds_count{rpc_method="GetProductDetail"}[$__range]))', "浏览商详", "A"),
    prom_t('sum(increase(rpc_server_duration_milliseconds_count{rpc_method="AddProductToCart"}[$__range]))', "加购", "B"),
    prom_t('sum(increase(rpc_server_duration_milliseconds_count{rpc_method="CreateOrder"}[$__range]))', "下单", "C"),
], 0, y, w=12, desc="以服务端 RPC 计数近似,含重试/失败调用;真实转化以上方 Postgres 口径为准"))
panels.append(ts("漏斗各环节调用率", [
    prom_t('sum(rate(rpc_server_duration_milliseconds_count{rpc_method=~"GetProductDetail|AddProductToCart|CreateOrder|GetCart"}[$__rate_interval])) by (rpc_method)', "{{rpc_method}}"),
], 12, y, w=12, unit="reqps"))
y += 8

# ───── Row 4 服务健康 ─────
panels.append(row("服务健康(RPC)", y)); y += 1
panels.append(ts("请求率 by 服务", [
    prom_t('sum(rate(rpc_server_duration_milliseconds_count{service_name=~"$service"}[$__rate_interval])) by (service_name)', "{{service_name}}"),
], 0, y, w=8, unit="reqps"))
_RPC = "rpc_server_duration_milliseconds_count"
_rpc_err = f'sum by (service_name) (rate({_RPC}{{service_name=~"$service",rpc_connect_rpc_error_code!=""}}[$__rate_interval]))'
_rpc_all = f'sum by (service_name) (rate({_RPC}{{service_name=~"$service"}}[$__rate_interval]))'
panels.append(ts("错误率 by 服务", [
    prom_t(f"{zero_filled(_rpc_err, _rpc_all)} / {_rpc_all}", "{{service_name}}"),
], 8, y, w=8, unit="percentunit", percent=True,
    desc="rpc_connect_rpc_error_code 非空即错误,分母为全部调用。\n"
         "该标签只在出错的序列上存在,所以分子用总量乘 0 兜底 —— 否则服务健康时"
         "整张图是空的,看起来像看板坏了而不是「没有错误」"))
panels.append(ts("P95 时延 by 服务", [
    prom_t('histogram_quantile(0.95, sum(rate(rpc_server_duration_milliseconds_bucket{service_name=~"$service"}[$__rate_interval])) by (le, service_name))', "{{service_name}}"),
], 16, y, w=8, unit="ms"))
y += 8
panels.append(table("最慢方法 Top(P95,时间范围内)",
    'topk(10, histogram_quantile(0.95, sum(increase(rpc_server_duration_milliseconds_bucket[$__range])) by (le, service_name, rpc_method)))',
    0, y, w=12, h=7, unit="ms"))
panels.append(logs("错误日志(全服务)", '{service_name=~".+"} | detected_level=~"error|warn" |~ "(?i)error|fail|panic"', 12, y, w=12, h=7))
y += 7

# ───── Row 5 前端体验(Web Vitals) ─────
panels.append(row("前端体验(Web Vitals RUM)", y)); y += 1
# 指标名要跟 behavior 侧 vitalInstruments 的 unit 对上:
# unit="ms" → <name>_milliseconds_*;CLS 的 unit 是 "1" → <name>_ratio_*。
# 原版把 CLS 也写成 _milliseconds_ 是错的(见 README 修正记录)。
vitals = [
    ("LCP P75", "web_vitals_lcp_milliseconds", 2500, 4000, "ms"),
    ("INP P75", "web_vitals_inp_milliseconds", 200, 500, "ms"),
    ("CLS P75", "web_vitals_cls_ratio", 0.1, 0.25, "none"),
    ("FCP P75", "web_vitals_fcp_milliseconds", 1800, 3000, "ms"),
    ("TTFB P75", "web_vitals_ttfb_milliseconds", 800, 1800, "ms"),
]
x = 0
for title, base, good, poor, unit in vitals:
    panels.append(prom_stat(title,
        f'histogram_quantile(0.75, sum(increase({base}_bucket[$__range])) by (le))',
        x, y, w=4, unit=unit,
        # Web Vitals 及格线(Google 标准):good / needs-improvement / poor
        thresholds=steps(("green", None), ("yellow", good), ("red", poor)),
        desc=f"及格线 {good} / 差 {poor}"))
    x += 4
panels.append(prom_stat("长任务次数", 'sum(increase(web_vitals_long_task_milliseconds_count[$__range]))', 20, y, w=4, unit="none",
    thresholds=steps(("green", None), ("yellow", 10), ("red", 50))))
y += 4
panels.append(ts("LCP P75 by 页面", [
    prom_t('histogram_quantile(0.75, sum(rate(web_vitals_lcp_milliseconds_bucket[$__rate_interval])) by (le, page))', "{{page}}"),
], 0, y, w=8, unit="ms", desc="page 是路由模式不是 URL(基数纪律)"))
panels.append(ts("前端观测的接口耗时 P95", [
    prom_t('histogram_quantile(0.95, sum(rate(frontend_api_duration_milliseconds_bucket[$__rate_interval])) by (le))', "P95"),
    prom_t('histogram_quantile(0.50, sum(rate(frontend_api_duration_milliseconds_bucket[$__rate_interval])) by (le))', "P50", "B"),
], 8, y, w=8, unit="ms", desc="Resource Timing 口径(含排队/DNS/TCP),与服务端 P95 的差值≈网络+网关"))
panels.append(logs("慢接口与性能明细(带归因)", '{service_name="behavior-service"} |~ "web_vital|slow_frontend_api"', 16, y, w=8, h=8,
    desc="attribution 字段:LCP 的元素 selector / INP 的交互目标 / 长任务的容器"))
y += 8

# ───── Row 6 基础设施(红绿灯,细节在另一张看板) ─────
# 只留「有没有问题」,不留「问题是什么」—— 后者点右上角按钮或下面任一格进
# 「基础设施」看板。这样业务盘不会被底层细节冲淡,也不和另一张盘重复画同样的图。
INFRA_LINK = [{"title": "查看基础设施明细", "url": "/d/ecommerce-infrastructure/infrastructure?$__url_time_range"}]
panels.append(row("基础设施(概览 —— 明细见右上角「基础设施」按钮)", y)); y += 1
panels.append(prom_stat("节点 CPU 最高", f"max({cpu_used_ratio()})", 0, y, w=6, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.75), ("red", 0.9)), links=INFRA_LINK,
    desc="所有上报节点里最忙的那台。注意 node1(control-plane)不在其中:collector DaemonSet 不调度到那儿"))
panels.append(prom_stat("节点内存最高", f"max({mem_used_ratio()})", 6, y, w=6, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9)), links=INFRA_LINK))
panels.append(prom_stat("节点磁盘最高", f"max({fs_used_ratio()})", 12, y, w=6, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9)), links=INFRA_LINK,
    desc="仅真实文件系统(ext4/xfs),已排除 kubelet 的 PVC bind mount"))
panels.append(prom_stat("DB 连接池饱和度最高", f"max({pool_saturation()})", 18, y, w=6, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.7), ("red", 0.9)), links=INFRA_LINK,
    desc="acquired / max。服务未启动时无数据"))

print(dump(
    uid="ecommerce-overview",
    title="电商大盘 · 业务与系统",
    panels=panels,
    links=[dash_link("基础设施", "ecommerce-infrastructure", "infrastructure", icon="cloud")],
    templating=[{
        "name": "service", "label": "服务", "type": "query", "datasource": PROM,
        "query": {"query": "label_values(rpc_server_duration_milliseconds_count, service_name)", "refId": "v"},
        "includeAll": True, "multi": True, "current": {"text": ["All"], "value": ["$__all"]},
        "refresh": 2,
    }],
    time_from="now-90d",
    message="generated: 业务(PG) + RPC/Vitals(VM) + 日志(Loki);基础设施明细见 ecommerce-infrastructure",
))
