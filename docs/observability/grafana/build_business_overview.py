"""生成「电商大盘 · 业务与系统」并输出 Grafana API 请求体。

    python3 build_business_overview.py > business-overview.json

数据源分工:
- Postgres  业务真相源:orders.order_group / orders.order_main / cart.cart_item
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
                    prom_stat, prom_t, reset_ids, row, steps, svc_error_ratio, ts)

reset_ids()
panels = []
y = 0

# Config Center 是独立基础设施，不能混入电商业务服务的指标与日志。
ECOMMERCE_SERVICE = 'service_name!="config-service"'

# ───── Row 1 业务北极星 ─────
panels.append(row("业务北极星(时间范围内)", y)); y += 1
panels.append(pg_stat("订单数", "SELECT count(*) FROM orders.order_group WHERE $__timeFilter(created_at)", 0, y,
                      desc="orders.order_group：一次用户结算，多商家拆单只算一单"))
panels.append(pg_stat("GMV(应付)", "SELECT coalesce(sum(pay_amount),0) FROM orders.order_group WHERE $__timeFilter(created_at)", 4, y,
                      unit="currencyCNY", decimals=2,
                      desc="订单组实付总额。金额列是 numeric，汇总在库内做；包含尚未支付订单"))
panels.append(pg_stat("客单价", "SELECT coalesce(avg(pay_amount),0) FROM orders.order_group WHERE $__timeFilter(created_at)", 8, y,
                      unit="currencyCNY", decimals=2,
                      desc="订单组平均实付金额：按用户一次结算计算，不按商家子订单拆分"))
panels.append(pg_stat("加购条目数", "SELECT count(*) FROM cart.cart_item WHERE $__timeFilter(created_at)", 12, y,
                      desc="cart.cart_item 新增行数(同 SKU 累加数量不产生新行,口径偏保守)"))
panels.append(pg_stat("加购→下单转化率",
    "SELECT count(DISTINCT o.user_id)::float / nullif((SELECT count(DISTINCT user_id) FROM cart.cart_item WHERE $__timeFilter(created_at)),0) FROM orders.order_group o WHERE $__timeFilter(o.created_at)",
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
panels.append(ts("加购 vs 下单(按天，订单组)", [
    pg_t("SELECT $__timeGroup(created_at,'1d') AS time, count(*) AS \"加购条目\" FROM cart.cart_item WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1", "A"),
    pg_t("SELECT $__timeGroup(created_at,'1d') AS time, count(*) AS \"订单\" FROM orders.order_group WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1", "B"),
], 0, y, w=10, datasource=PG))
panels.append(ts("GMV(按天)", [
    pg_t("SELECT $__timeGroup(created_at,'1d') AS time, sum(pay_amount) AS \"GMV\" FROM orders.order_group WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1"),
], 10, y, w=6, unit="currencyCNY", datasource=PG, decimals=2))
panels.append(piechart("订单状态分布",
    "SELECT order_status::text AS metric, count(*) AS n FROM orders.order_main WHERE $__timeFilter(created_at) GROUP BY 1",
    16, y, w=8, desc="商家子订单状态（order_main）；订单组没有独立状态字段"))
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

# 服务健康(RPC)整行已移到 APM 盘(ecommerce-apm)R1:服务健康类图统一归 APM,
# 本盘只留 Row 6 红绿灯 —— 两张盘不重复画同一批图。错误率口径也随迁升级:
# 旧版「error_code 非空即错误」会把 not_found 等客户端异常算进错误率,
# APM 盘按 面板设计.md §1.1 只算服务侧错误码。

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

# ───── Row 6 服务与基础设施(红绿灯,细节在另两张看板) ─────
# 只留「有没有问题」,不留「问题是什么」—— 服务的事去 APM 盘,资源的事去基础设施盘。
# 这样业务盘不会被底层细节冲淡,也不和另两张盘重复画同样的图。
INFRA_LINK = [{"title": "查看基础设施明细", "url": "/d/ecommerce-infrastructure/infrastructure?$__url_time_range"}]
APM_LINK = [{"title": "查看应用 APM", "url": "/d/ecommerce-apm/apm?$__url_time_range"}]
panels.append(row("服务与基础设施(红绿灯 —— 明细见右上角「应用 APM」「基础设施」按钮)", y)); y += 1
panels.append(prom_stat("服务侧错误率最高", f"max({svc_error_ratio()})", 0, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.01), ("red", 0.05)), links=APM_LINK,
    desc="全部服务里错误率最高的那个(服务侧口径,面板设计.md §1.1)。\n"
         "payment 未实现前这里恒红 —— 点进 APM 盘 R1 的 Top 表看是不是只有它"))
panels.append(prom_stat("在报服务数", 'count(count by (service_name) (rpc_server_duration_milliseconds_count{service_name!="config-service"}))',
    4, y, w=4, unit="none", links=APM_LINK,
    desc="按 rpc_server_* 判活,只统计「近期有过调用」的;数字异常低先查网关和 Consul"))
panels.append(prom_stat("节点 CPU 最高", f"max({cpu_used_ratio()})", 8, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.75), ("red", 0.9)), links=INFRA_LINK,
    desc="所有上报节点(3 台)里最忙的那台"))
panels.append(prom_stat("节点内存最高", f"max({mem_used_ratio()})", 12, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9)), links=INFRA_LINK))
panels.append(prom_stat("节点磁盘最高", f"max({fs_used_ratio()})", 16, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.8), ("red", 0.9)), links=INFRA_LINK,
    desc="仅真实文件系统(ext4/xfs),已排除 kubelet 的 PVC bind mount"))
panels.append(prom_stat("DB 连接池饱和度最高", f"max({pool_saturation(ECOMMERCE_SERVICE)})", 20, y, w=4, unit="percentunit",
    thresholds=steps(("green", None), ("yellow", 0.7), ("red", 0.9)), links=INFRA_LINK,
    desc="acquired / max。服务未启动时无数据"))

print(dump(
    uid="ecommerce-overview",
    title="电商大盘 · 业务与系统",
    panels=panels,
    links=[dash_link("应用 APM", "ecommerce-apm", "apm", icon="bolt"),
           dash_link("基础设施", "ecommerce-infrastructure", "infrastructure", icon="cloud")],
    # $service 变量随服务健康行一起迁去了 APM 盘;本盘所有查询都是全局口径,
    # 留一个不起作用的下拉框只会误导。
    templating=[],
    time_from="now-90d",
    message="generated: 业务(PG) + RPC/Vitals(VM) + 日志(Loki);基础设施明细见 ecommerce-infrastructure",
))
