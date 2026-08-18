"""Grafana 看板生成的公共部分:数据源、面板构造器、导出。

两个看板(business-overview / infrastructure)共用这里的一切,避免面板样式在
两份脚本里各自漂移 —— 看板是给人一眼看的东西,样式不一致本身就是噪音。

数据源 UID 取自实测的 Grafana 实例,可用环境变量覆盖(换实例/重建数据源时
不必改代码):
    GRAFANA_DS_PROM / GRAFANA_DS_PG / GRAFANA_DS_LOKI
"""
import json
import os

PROM = {"type": "prometheus", "uid": os.getenv("GRAFANA_DS_PROM", "P4169E866C3094E38")}
PG = {"type": "grafana-postgresql-datasource", "uid": os.getenv("GRAFANA_DS_PG", "cfqdftoswcn40a")}
LOKI = {"type": "loki", "uid": os.getenv("GRAFANA_DS_LOKI", "afqdfiefq0o3kf")}

_id = [0]


def nid():
    _id[0] += 1
    return _id[0]


def reset_ids():
    """每个看板从 1 开始编号,否则两份脚本在同一进程里跑会串号。"""
    _id[0] = 0


def gp(x, y, w, h):
    return {"x": x, "y": y, "w": w, "h": h}


def row(title, y):
    return {"id": nid(), "type": "row", "title": title, "gridPos": gp(0, y, 24, 1), "collapsed": False}


def steps(*pairs):
    """阈值台阶。第一段的 value 必须是 None(Grafana 用它表示 -inf)。

    用法:steps(("green", None), ("yellow", 0.8), ("red", 0.9))
    """
    return {"mode": "absolute", "steps": [{"color": c, "value": v} for c, v in pairs]}


def pg_stat(title, sql, x, y, w=4, h=4, unit="none", thresholds=None, desc="", decimals=None):
    p = {
        "id": nid(), "type": "stat", "title": title, "description": desc,
        "datasource": PG, "gridPos": gp(x, y, w, h),
        "targets": [{"refId": "A", "datasource": PG, "rawSql": sql, "format": "table"}],
        "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "value",
                    "graphMode": "none", "textMode": "auto"},
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
    }
    if thresholds:
        p["fieldConfig"]["defaults"]["thresholds"] = thresholds
    if decimals is not None:
        p["fieldConfig"]["defaults"]["decimals"] = decimals
    return p


def prom_stat(title, expr, x, y, w=4, h=4, unit="ms", thresholds=None, desc="", links=None):
    p = {
        "id": nid(), "type": "stat", "title": title, "description": desc,
        "datasource": PROM, "gridPos": gp(x, y, w, h),
        "targets": [{"refId": "A", "datasource": PROM, "expr": expr, "instant": True}],
        "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "value",
                    "graphMode": "none"},
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
    }
    if thresholds:
        p["fieldConfig"]["defaults"]["thresholds"] = thresholds
    if links:
        p["fieldConfig"]["defaults"]["links"] = links
    return p


def ts(title, targets, x, y, w=12, h=8, unit="none", datasource=PROM, desc="",
       percent=False, thresholds=None, stack=False, decimals=None):
    p = {
        "id": nid(), "type": "timeseries", "title": title, "description": desc,
        "datasource": datasource, "gridPos": gp(x, y, w, h),
        "targets": targets,
        "options": {"legend": {"displayMode": "list", "placement": "bottom"},
                    "tooltip": {"mode": "multi", "sort": "desc"}},
        "fieldConfig": {"defaults": {"unit": unit, "custom": {"lineWidth": 2, "fillOpacity": 8,
                        "showPoints": "never", "spanNulls": True}}, "overrides": []},
    }
    if percent:
        p["fieldConfig"]["defaults"]["max"] = 1
        p["fieldConfig"]["defaults"]["min"] = 0
    if thresholds:
        p["fieldConfig"]["defaults"]["thresholds"] = thresholds
        p["fieldConfig"]["defaults"]["custom"]["thresholdsStyle"] = {"mode": "dashed"}
    if stack:
        p["fieldConfig"]["defaults"]["custom"]["stacking"] = {"mode": "normal", "group": "A"}
    if decimals is not None:
        p["fieldConfig"]["defaults"]["decimals"] = decimals
    return p


def prom_t(expr, legend, refid="A"):
    return {"refId": refid, "datasource": PROM, "expr": expr, "legendFormat": legend}


def pg_t(sql, refid="A"):
    return {"refId": refid, "datasource": PG, "rawSql": sql, "format": "time_series"}


def loki_t(expr, refid="A"):
    return {"refId": refid, "datasource": LOKI, "expr": expr}


def logs(title, expr, x, y, w=12, h=8, desc=""):
    return {
        "id": nid(), "type": "logs", "title": title, "description": desc,
        "datasource": LOKI, "gridPos": gp(x, y, w, h),
        "targets": [{"refId": "A", "datasource": LOKI, "expr": expr}],
        "options": {"showTime": True, "wrapLogMessage": True, "enableLogDetails": True,
                    "sortOrder": "Descending"},
    }


def bargauge(title, targets, x, y, w=8, h=8, unit="none", datasource=PROM, desc=""):
    return {
        "id": nid(), "type": "bargauge", "title": title, "description": desc,
        "datasource": datasource, "gridPos": gp(x, y, w, h),
        "targets": targets,
        "options": {"orientation": "horizontal", "displayMode": "gradient",
                    "reduceOptions": {"calcs": ["lastNotNull"]}},
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
    }


def piechart(title, sql, x, y, w=8, h=8, desc=""):
    return {
        "id": nid(), "type": "piechart", "title": title, "description": desc,
        "datasource": PG, "gridPos": gp(x, y, w, h),
        "targets": [{"refId": "A", "datasource": PG, "rawSql": sql, "format": "table"}],
        "options": {"pieType": "donut", "legend": {"displayMode": "table", "placement": "right",
                    "values": ["value"]},
                    "reduceOptions": {"values": True, "fields": "/^n$/"}},
    }


def table(title, expr, x, y, w=12, h=7, unit="none", hide_regex="Time|le", desc=""):
    return {
        "id": nid(), "type": "table", "title": title, "description": desc,
        "datasource": PROM, "gridPos": gp(x, y, w, h),
        "targets": [{"refId": "A", "datasource": PROM, "instant": True, "format": "table",
                     "expr": expr}],
        "options": {"sortBy": [{"displayName": "Value", "desc": True}]},
        "fieldConfig": {"defaults": {"unit": unit},
                        "overrides": [{"matcher": {"id": "byRegexp", "options": hide_regex},
                                       "properties": [{"id": "custom.hidden", "value": True}]}]},
    }


# ── 看板间跳转 ────────────────────────────────────────────────────────────
# keepTime=True 是重点:在业务盘看到 14:05 有个尖峰,点过去必须还停在同一个
# 时间窗,否则等于重新查一遍,跳转就没意义了。
def dash_link(title, uid, slug, icon="apps"):
    return {
        "type": "link", "title": title, "icon": icon,
        "url": f"/d/{uid}/{slug}",
        "tooltip": f"跳转到「{title}」(保持当前时间范围)",
        "keepTime": True, "targetBlank": False, "asDropdown": False,
        "includeVars": False, "tags": [],
    }


# ── 口径常量(定义见 ../面板设计.md §1,改动需过评审) ──────────────────────

# 全部查询排除 config-service:与独立仓 config-center 撞名,按名过滤出的是混合值。
# 电商服务未设 service_namespace(2026-08-12 实测),所以只能按名排除。
ECOMMERCE = 'service_name!="config-service"'

# connect 错误码两类划分(面板设计.md §1.1)。只有服务侧进错误率/SLO/告警;
# 客户端侧单独观察。成功请求没有 rpc_connect_rpc_error_code 标签(实测口径,
# OBSERVABILITY.md 说的「已修为 ok」只落在日志侧,metrics 不是)。
SERVER_FAULT_CODES = "unknown|internal|unavailable|deadline_exceeded|resource_exhausted|data_loss|unimplemented"
CLIENT_FAULT_CODES = "invalid_argument|not_found|already_exists|permission_denied|unauthenticated|failed_precondition|out_of_range|canceled|aborted"

RPC_COUNT = "rpc_server_duration_milliseconds_count"
RPC_BUCKET = "rpc_server_duration_milliseconds_bucket"


def svc_error_ratio(extra="", by="service_name", window="$__rate_interval"):
    """服务侧错误率(比率,零填充)。业务盘红绿灯、APM 盘、告警共用同一口径。

    payment 全部 RPC 是 Unimplemented 桩,按此口径恒 100% —— 是暴露不是误报
    (面板保留;告警侧单独排除,见 build_alerts.py)。
    window:面板用默认的 $__rate_interval;告警里 Grafana 不展开 dashboard 变量,
    必须传固定窗口(如 "5m")。
    """
    code_filter = f'rpc_connect_rpc_error_code=~"{SERVER_FAULT_CODES}"'
    err = f"sum by ({by}) (rate({_sel(RPC_COUNT, code_filter, ECOMMERCE, extra)}[{window}]))"
    total = f"sum by ({by}) (rate({_sel(RPC_COUNT, ECOMMERCE, extra)}[{window}]))"
    return f"{zero_filled(err, total)} / {total}"


def rpc_quantile(q, by="service_name", extra="", window="$__rate_interval"):
    """RPC 延迟分位数。「慢」的唯一口径 —— 没有「慢调用次数」这种东西(§1.2)。"""
    sel = _sel(RPC_BUCKET, ECOMMERCE, extra)
    return f"histogram_quantile({q}, sum by (le, {by}) (rate({sel}[{window}])))"


# Jaeger 跳转。jaeger-ui.dev.test 是本地内网域(与 pg-dev/dragonfly/es 同模式),
# 浏览器直达,不需要 port-forward;换环境用环境变量覆盖。注意不带尾斜杠,
# 下面拼 /search 时不会出现 //。
JAEGER_BASE = os.getenv("JAEGER_UI_BASE", "http://jaeger-ui.dev.test")


def jaeger_link(title="在 Jaeger 里查明细", service="${service}", tags=""):
    url = f"{JAEGER_BASE}/search?service={service}&lookback=3h&limit=50"
    if tags:
        url += f"&tags={tags}"
    return {"title": title, "url": url, "targetBlank": True}


# ── 共用 PromQL ───────────────────────────────────────────────────────────
# 业务盘的「红绿灯」和基础设施盘的明细必须算同一个数,所以表达式只在这里写一份。

# 文件系统:必须排掉 /var/lib/kubelet/**。collector 已在采集侧 exclude,但改配置
# 之前写进 VM 的那批 PVC 挂载点序列还在索引里(要等保留期过),不过滤会有一堆
# 僵尸曲线混进来。分母用 sum without(state) 而不是 used+free —— filesystem 的
# state 有三个值(used/free/reserved),漏掉 reserved 会把使用率算高。
def zero_filled(numerator, anchor):
    """给「零事件时整条序列都不存在」的分子补 0。

    这类指标的标签只在异常路径上出现(otelconnect 的 rpc_connect_rpc_error_code
    只挂在出错的序列上;otelpgx 的 db_client_operation_errors_total 在没出错过的
    服务上压根没有序列)。直接相除或直接画,健康时得到的是**空图** —— 而空图看
    起来像看板坏了,不像「一切正常」。这是实测踩到的:服务明明健康,错误率图一片
    空白,第一反应是查询写错了。

    做法:用 anchor(总量,一定存在)乘 0 兜底。or 的语义是「取 A,A 里缺的分组
    用 B 补」,所以每个有流量的分组都会得到 0。

    注意这里刻意**不用** `or on() vector(0)`:它在 VictoriaMetrics 上能出结果
    (VM 把无标签的单序列当标量广播到右侧每个分组),但在 Prometheus 里无标签的
    左操作数匹配不上带 service_name 的右操作数,结果仍然是空。按分组乘 0 两边都对。

    另一个有意的性质:完全没有流量的服务不会被补 0,仍然不出现在图上 ——
    不该给一个没跑起来的服务画一条 0% 让人误以为它健康。
    """
    return f"({numerator} or {anchor} * 0)"


def _sel(metric, *filters):
    """拼选择器。filters 里的空串会被丢掉,免得拼出 `{,foo="bar"}`。"""
    inner = ",".join(f for f in filters if f)
    return f"{metric}{{{inner}}}" if inner else metric


# 文件系统:必须排掉 /var/lib/kubelet/**。collector 已在采集侧 exclude,但改配置
# 之前写进 VM 的那批 PVC 挂载点序列还在索引里(要等保留期过),不过滤会有一堆
# 僵尸曲线混进来。分母用 sum without(state) 而不是 used+free —— filesystem 的
# state 有三个值(used/free/reserved),漏掉 reserved 会把使用率算高。
FS_REAL = 'type=~"ext4|xfs",mountpoint!~"/var/lib/kubelet/.*"'


def fs_used_ratio(extra=""):
    used = _sel("system_filesystem_usage_bytes", 'state="used"', FS_REAL, extra)
    total = _sel("system_filesystem_usage_bytes", FS_REAL, extra)
    return f"{used} / ignoring(state) sum without(state) ({total})"


def inodes_used_ratio(extra=""):
    used = _sel("system_filesystem_inodes_usage", 'state="used"', FS_REAL, extra)
    total = _sel("system_filesystem_inodes_usage", FS_REAL, extra)
    return f"{used} / ignoring(state) sum without(state) ({total})"


# CPU:state 有 idle/user/system/wait/... 8 个值。先按核汇总非 idle 的占比,
# 再对核取平均 —— 直接 sum 会得到「核数倍」的数字。
def cpu_used_ratio(extra=""):
    sel = _sel("system_cpu_utilization_ratio", 'state!="idle"', extra)
    return f"avg by (k8s_node_name) (sum by (k8s_node_name, cpu) ({sel}))"


# 内存:state="used" 本身已经是比例,直接取。
def mem_used_ratio(extra=""):
    return _sel("system_memory_utilization_ratio", 'state="used"', extra)


# 连接池饱和度。两个指标的标签集完全一致(含 service_instance_id),所以能直接相除,
# 且天然按副本对齐 —— 多副本不会被聚成一条。
def pool_saturation(extra=""):
    return (f'{_sel("pgxpool_acquired_connections", extra)}'
            f' / {_sel("pgxpool_max_connections", extra)}')


def dump(uid, title, panels, links=None, templating=None, time_from="now-6h",
         refresh="1m", tags=None, message=""):
    """输出 Grafana /api/dashboards/db 接受的请求体。"""
    return json.dumps({
        "dashboard": {
            "uid": uid,
            "title": title,
            "tags": tags or ["ecommerce", "generated"],
            "timezone": "browser",
            "time": {"from": time_from, "to": "now"},
            "refresh": refresh,
            "links": links or [],
            "templating": {"list": templating or []},
            "panels": panels,
            "schemaVersion": 39,
            "editable": True,
        },
        "folderUid": "",
        "overwrite": True,
        "message": message,
    }, ensure_ascii=False)
