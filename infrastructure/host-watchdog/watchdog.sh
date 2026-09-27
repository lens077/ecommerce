#!/usr/bin/env bash
# host-watchdog —— 主机侧巡检，补黑盒探针（Gatus）结构上探不到的那几层。
#
# 分工：
#   Gatus        从外部走公网 DNS/TLS 探「入口通不通」        —— 外部视角
#   host-watchdog 在机器内部看「进程/单元/隧道/磁盘还在不在」 —— 内部视角
#
# 为什么需要它：黑盒探针只会发 HTTP 请求。容器崩溃循环、容器退出后不拉起、
# systemd 单元 failed、隧道站点掉线、磁盘将满——这些要么没有公网入口可探，
# 要么在探针眼里仍然是 200。实测标本见 context/team/host-watchdog.md。
#
# 全部检查项都是**按需启用**：没配的变量直接跳过，因此同一份脚本可以直接放到
# 任意一台主机（node1/node2/node3 或任何跑业务容器的机器）上用。
#
# 兼容性：只用 POSIX 与 Bash 3.2 可用的语法。刻意不用数组累加问题列表——
# `set -u` 下展开空数组在 Bash 3.2 会 unbound variable，见 context/team/shell-scripting.md。
set -uo pipefail

CONF="${WATCHDOG_CONF:-/etc/host-watchdog/watchdog.env}"
# shellcheck disable=SC1090
[ -r "$CONF" ] && . "$CONF"

: "${HOST_LABEL:=$(hostname -s 2>/dev/null || echo host)}"

# ---- 告警出口（复用项目既有的 ntfy 通道，不引入新告警系统）----
: "${NTFY_URL:=}"
: "${NTFY_TOPIC:=}"
: "${NTFY_TOKEN:=}"
: "${HC_PING_URL:=}"        # 可选 Healthchecks 死人开关；留空则跳过

# ---- 检查项，全部按需启用 ----
: "${WATCH:=}"              # 容器名，空格分隔
: "${SYSTEMD_UNITS:=}"      # systemd 单元名，空格分隔
: "${HTTP_CHECKS:=}"        # "名字=URL" 列表，空格分隔；期望 2xx/3xx
: "${PANGOLIN_DB:=}"        # 填了才检查 Pangolin 隧道站点在线状态
: "${DISK_PATHS:=/}"        # 空格分隔的挂载点
: "${DISK_WARN_PCT:=85}"
: "${DISK_CRIT_PCT:=95}"
: "${STATE_FILE:=/var/lib/host-watchdog/state}"
: "${NOTIFY_STATE_FILE:=/var/lib/host-watchdog/incidents.json}"
: "${NOTIFY_HELPER:=/usr/local/lib/host-watchdog/notify.py}"
: "${WATCHDOG_MODE:=production}"
: "${NTFY_TICKET_TOPIC:=}"
: "${NTFY_TEST_TOPIC:=}"
: "${NOTIFY_HOLD_SECONDS:=600}"
: "${NOTIFY_RECOVER_SECONDS:=300}"
: "${PANGOLIN_IGNORE_SITES=mac}" # 精确名称，不按 type=newt 忽略生产隧道

# 测试必须显式隔离 topic 和两类状态；不发生产 Healthchecks ping。
if [ "$WATCHDOG_MODE" = test ]; then
    WATCHDOG_PRODUCTION_RESTART_STATE="$STATE_FILE"
    export WATCHDOG_PRODUCTION_RESTART_STATE
    : "${WATCHDOG_TEST_STATE_DIR:=/var/lib/host-watchdog-test}"
    : "${NOTIFY_TEST_STATE_FILE:=$WATCHDOG_TEST_STATE_DIR/incidents.json}"
    TEST_RESTART_STATE="$WATCHDOG_TEST_STATE_DIR/restarts"
    if [ "$TEST_RESTART_STATE" = "$STATE_FILE" ]; then
        echo '[host-watchdog] test restart state must be isolated' >&2; exit 2
    fi
    STATE_FILE="$TEST_RESTART_STATE"
    HC_PING_URL=""
fi
export HOST_LABEL NTFY_URL NTFY_TOPIC NTFY_TICKET_TOPIC NTFY_TEST_TOPIC NTFY_TOKEN
export STATE_FILE WATCHDOG_MODE NOTIFY_STATE_FILE NOTIFY_HOLD_SECONDS NOTIFY_RECOVER_SECONDS
export PANGOLIN_DB PANGOLIN_IGNORE_SITES
[ -z "${NOTIFY_TEST_STATE_FILE:-}" ] || export NOTIFY_TEST_STATE_FILE
python3 "$NOTIFY_HELPER" --validate || exit 2

PROBLEMS=""
RECORDS=""
COUNT=0
# key/scope/object/status/severity/detail/first-check；完整观测显式包含健康对象。
record() {
    local row
    row=$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s' "$1" "$2" "$3" "$4" "$5" "$6" "$7")
    RECORDS="${RECORDS}${row}
"
    if [ "$4" = fail ]; then
        PROBLEMS="${PROBLEMS}$3: $6
"
        COUNT=$((COUNT + 1))
    fi
}

if [ "$STATE_FILE" != /dev/null ]; then
    mkdir -p "$(dirname "$STATE_FILE")" || exit 2
fi

prev_restarts() { awk -v k="$1" '$1==k {print $2}' "$STATE_FILE" 2>/dev/null | tail -1; }

# ---------- 1. 容器 ----------
NEW_STATE=""
DOCKER_AVAILABLE=1
if [ -n "$WATCH" ] && ! command -v docker >/dev/null 2>&1; then
    DOCKER_AVAILABLE=0
fi
for c in $WATCH; do
    if [ "$DOCKER_AVAILABLE" -eq 0 ]; then
        record "docker:$c" docker "$c" fail page '主机没有 docker 命令' '检查 Docker 安装与 PATH'
        continue
    fi
    if ! docker inspect "$c" >/dev/null 2>&1; then
        record "docker:$c" docker "$c" fail page '容器不存在或 Docker 不可用' "docker inspect $c"
        continue
    fi
    state=$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null)
    restarts=$(docker inspect "$c" --format '{{.RestartCount}}' 2>/dev/null)
    health=$(docker inspect "$c" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' 2>/dev/null)
    NEW_STATE="${NEW_STATE}${c} ${restarts}
"
    status=ok
    detail='容器运行且未报告 unhealthy'
    case "$state" in
        running) ;;
        *) status=fail; detail="容器未运行（状态=$state）" ;;
    esac
    if [ "$health" = unhealthy ]; then status=fail; detail="容器 unhealthy（状态=$state）"; fi
    record "docker:$c" docker "$c" "$status" page "$detail" "docker inspect $c"

    # 10 分钟内恢复的重启只保留诊断，不独立形成手机事件。
    old=$(prev_restarts "$c")
    if [ -n "$old" ] && [ -n "$restarts" ] && [ "$restarts" -gt "$old" ] 2>/dev/null; then
        echo "[host-watchdog:$HOST_LABEL] 诊断：容器重启过 $c ($old → $restarts)"
    fi
done
if [ "$STATE_FILE" != /dev/null ]; then
    umask 077
    restart_tmp=$(mktemp "${STATE_FILE}.XXXXXX") || exit 2
    printf '%s' "$NEW_STATE" > "$restart_tmp" && mv -f "$restart_tmp" "$STATE_FILE" || exit 2
fi

# ---------- 2. systemd 单元 ----------
for u in $SYSTEMD_UNITS; do
    if systemctl is-active --quiet "$u" 2>/dev/null; then
        record "systemd:$u" systemd "$u" ok page '单元 active' "systemctl status $u"
    else
        # 只取第一行，避免 inactive + fallback 被拼成两行。
        st=$(systemctl is-active "$u" 2>/dev/null | head -1)
        [ -z "$st" ] && st="unknown"
        record "systemd:$u" systemd "$u" fail page "单元非 active（$st）" "systemctl status $u"
    fi
done

# ---------- 3. 本机 HTTP 健康端点 ----------
# 给跑在这台机器上的业务服务用：探本地回环，不经公网，能区分「服务死了」和「入口断了」。
#
# 三种写法（2026-09-01 起支持后两种，起因见下）：
#   name=URL                     普通探测
#   name=URL|host:port:ip        带 --resolve：用域名走 TLS（证书能校验），但连本地 IP
#   name=URL|host:port:ip|CODES  再指定期望状态码，**逗号分隔**如 "200,403"
#
# ⚠️ CODES 必须用逗号而不是空格：整个 HTTP_CHECKS 是按空格分词的，
# 写成 "200 403" 会被拆成两个 item，每轮多出两条「格式错误」误报（实测踩过）。
#
# 为什么需要 --resolve：node2 的 Harbor/MinIO 是 TLS-only，直接探
# https://127.0.0.1:port 会因证书 CN 不匹配返回 000（curl 不带 -k），
# 变成一条永久误报；改探公网域名又会绕出去经 Pangolin，就不再是「本机探测」。
# --resolve 让域名解析到本地 IP：TLS 校验按域名过，流量不出机器，两个目标同时满足。
# 不用 -k 是有意的——跳过证书校验会连带放过「证书过期」这类真故障。
for item in $HTTP_CHECKS; do
    name="${item%%=*}"
    rest="${item#*=}"
    [ "$name" = "$item" ] && {
        record "http:$name" host "$name" fail page 'HTTP_CHECKS 格式错误' '检查 名字=URL 与逗号分隔状态码'
        continue
    }

    url="${rest%%|*}"
    resolve=""
    expect=""
    if [ "$rest" != "$url" ]; then
        tail_="${rest#*|}"
        resolve="${tail_%%|*}"
        [ "$tail_" != "$resolve" ] && expect="${tail_#*|}"
    fi

    if [ -n "$resolve" ]; then
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$resolve" "$url" 2>/dev/null)
    else
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null)
    fi

    ok=""
    if [ -n "$expect" ]; then
        # 逗号分隔（见上方说明：不能用空格）
        for want in $(printf '%s' "$expect" | tr ',' ' '); do
            case "$code" in "$want"*) ok=1; break ;; esac
        done
    else
        case "$code" in 2??|3??) ok=1 ;; esac
    fi
    if [ -n "$ok" ]; then
        record "http:$name" host "$name" ok page 'HTTP 检查正常' '检查本机服务健康端点'
    else
        # 不把 URL/query 带入通知，避免凭据或长参数进入手机正文。
        record "http:$name" host "$name" fail page "HTTP 探测异常（状态=${code:-000}）" '检查本机服务、监听端口与 TLS 证书'
    fi
done

# ---------- 4. Pangolin 隧道站点 ----------
# 只读连接；按 siteId 生成稳定 key，逐站点输出健康/失败以支持恢复。
if [ -n "$PANGOLIN_DB" ]; then
    if site_records=$(python3 "$NOTIFY_HELPER" --pangolin); then
        record pangolin:database host Pangolin数据库 ok page '数据库读取正常' '检查 Pangolin 数据库访问'
        while IFS="$(printf '\t')" read -r key scope object status severity detail first_check; do
            [ -z "$key" ] || record "$key" "$scope" "$object" "$status" "$severity" "$detail" "$first_check"
        done <<< "$site_records"
    else
        record pangolin:database host Pangolin数据库 fail page '数据库不可读或查询失败' '检查 Pangolin 数据库访问'
    fi
fi

# ---------- 5. 磁盘 ----------
for p in $DISK_PATHS; do
    used=$(df --output=pcent "$p" 2>/dev/null | tail -1 | tr -dc '0-9')
    [ -z "$used" ] && used=$(df -P "$p" 2>/dev/null | awk 'NR==2{print $5}' | tr -dc '0-9')
    if [ -z "$used" ]; then
        record "disk-read:$p" host "$p" fail ticket '磁盘水位读取失败' "df -h $p"
        record "disk:$p" host "$p" unknown ticket '磁盘水位未知' "df -h $p"
        record "disk-critical:$p" host "$p" unknown page '磁盘水位未知' "df -h $p"
        continue
    fi
    record "disk-read:$p" host "$p" ok ticket '磁盘水位可读取' "df -h $p"
    if [ "$used" -ge "$DISK_WARN_PCT" ] 2>/dev/null; then
        record "disk:$p" host "$p" fail ticket "磁盘水位 ${used}%（阈值 ${DISK_WARN_PCT}%）" "df -h $p；检查容量增长来源"
    else
        record "disk:$p" host "$p" ok ticket '磁盘水位正常' "df -h $p"
    fi
    if [ "$used" -ge "$DISK_CRIT_PCT" ] 2>/dev/null; then
        record "disk-critical:$p" host "$p" fail page "磁盘接近耗尽 ${used}%（阈值 ${DISK_CRIT_PCT}%）" "df -h $p；优先确认写入空间"
    else
        record "disk-critical:$p" host "$p" ok page '磁盘未达到耗尽阈值' "df -h $p"
    fi
done

# ---------- 告警 ----------
# 完整观测交给持久化状态机；发布失败返回 2，不能伪装为已发送。
printf '%s' "$RECORDS" | python3 "$NOTIFY_HELPER" || exit 2
# 死人开关只证明检测器完成扫描；业务失败通过各自 incident 发送。
[ -n "$HC_PING_URL" ] && curl -fsS --max-time 10 "$HC_PING_URL" >/dev/null 2>&1
if [ "$COUNT" -gt 0 ]; then
    echo "[host-watchdog:$HOST_LABEL] 发现 $COUNT 个问题（通知按持续时间与退避处理）:"
    printf '%s' "$PROBLEMS"
    exit 1
fi

echo "[host-watchdog:$HOST_LABEL] OK — 全部检查项正常"
exit 0
