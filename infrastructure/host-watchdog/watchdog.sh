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
: "${STATE_FILE:=/var/lib/host-watchdog/state}"

PROBLEMS=""
COUNT=0
add() {
    PROBLEMS="${PROBLEMS}$1
"
    COUNT=$((COUNT + 1))
}

[ "$STATE_FILE" = /dev/null ] || mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null
[ -e "$STATE_FILE" ] || : > "$STATE_FILE" 2>/dev/null

prev_restarts() { awk -v k="$1" '$1==k {print $2}' "$STATE_FILE" 2>/dev/null | tail -1; }

# ---------- 1. 容器 ----------
NEW_STATE=""
for c in $WATCH; do
    if ! docker inspect "$c" >/dev/null 2>&1; then
        add "容器不存在: $c"
        continue
    fi
    state=$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null)
    restarts=$(docker inspect "$c" --format '{{.RestartCount}}' 2>/dev/null)
    health=$(docker inspect "$c" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' 2>/dev/null)
    NEW_STATE="${NEW_STATE}${c} ${restarts}
"
    case "$state" in
        running)    ;;
        restarting) add "容器崩溃循环: $c (restart=$restarts)" ;;
        *)          add "容器未运行: $c (状态=$state)" ;;
    esac
    [ "$health" = "unhealthy" ] && add "容器 unhealthy: $c"

    # 重启计数增长 = 悄悄崩过又被拉起。状态仍是 running，只有计数能暴露。
    old=$(prev_restarts "$c")
    if [ -n "$old" ] && [ -n "$restarts" ] && [ "$restarts" -gt "$old" ] 2>/dev/null; then
        add "容器重启过: $c ($old → $restarts)"
    fi
done
[ "$STATE_FILE" = /dev/null ] || printf '%s' "$NEW_STATE" > "$STATE_FILE" 2>/dev/null

# ---------- 2. systemd 单元 ----------
for u in $SYSTEMD_UNITS; do
    if ! systemctl is-active --quiet "$u" 2>/dev/null; then
        # 只取第一行:单元不存在时 systemctl 既打印 inactive 又返回非零,
        # 直接用 `|| echo unknown` 会把两者拼成两行塞进告警正文。
        st=$(systemctl is-active "$u" 2>/dev/null | head -1)
        [ -z "$st" ] && st="unknown"
        add "systemd 单元非 active: $u ($st)"
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
    [ "$name" = "$item" ] && { add "HTTP_CHECKS 格式错误(应为 名字=URL): $item"; continue; }

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

    if [ -n "$expect" ]; then
        ok=""
        # 逗号分隔（见上方说明：不能用空格）
        for want in $(printf '%s' "$expect" | tr ',' ' '); do
            case "$code" in "$want"*) ok=1; break ;; esac
        done
        [ -n "$ok" ] || {
            if [ "$code" = "000" ]; then add "HTTP 探测无响应: $name ($url)"
            else add "HTTP 探测异常: $name ($url) → $code (期望 $expect)"; fi
        }
        continue
    fi

    case "$code" in
        2??|3??) ;;
        000)     add "HTTP 探测无响应: $name ($url)" ;;
        *)       add "HTTP 探测异常: $name ($url) → $code" ;;
    esac
done

# ---------- 4. Pangolin 隧道站点 ----------
# 只读打开，不加锁、不写 WAL，不干扰正在运行的 pangolin。
if [ -n "$PANGOLIN_DB" ]; then
    if [ -r "$PANGOLIN_DB" ]; then
        offline=$(python3 - "$PANGOLIN_DB" <<'PY' 2>/dev/null
import sqlite3, sys
try:
    con = sqlite3.connect("file:%s?mode=ro" % sys.argv[1], uri=True, timeout=5)
    rows = con.execute("SELECT name, type FROM sites WHERE online != 1").fetchall()
    print(";".join("%s(%s)" % (n, t) for n, t in rows))
except Exception as e:
    print("DBERR:%s" % e)
PY
)
        case "$offline" in
            DBERR:*) add "Pangolin 数据库读取失败: ${offline#DBERR:}" ;;
            "")      ;;
            *)       add "Pangolin 站点离线: $offline" ;;
        esac
    else
        add "Pangolin 数据库不可读: $PANGOLIN_DB"
    fi
fi

# ---------- 5. 磁盘 ----------
for p in $DISK_PATHS; do
    used=$(df --output=pcent "$p" 2>/dev/null | tail -1 | tr -dc '0-9')
    [ -z "$used" ] && used=$(df -P "$p" 2>/dev/null | awk 'NR==2{print $5}' | tr -dc '0-9')
    if [ -n "$used" ] && [ "$used" -ge "$DISK_WARN_PCT" ] 2>/dev/null; then
        add "磁盘水位 ${used}% (阈值 ${DISK_WARN_PCT}%) on $p"
    fi
done

# ---------- 告警 ----------
if [ "$COUNT" -gt 0 ]; then
    echo "[host-watchdog:$HOST_LABEL] 发现 $COUNT 个问题:"
    printf '%s' "$PROBLEMS"
    if [ -n "$NTFY_URL" ] && [ -n "$NTFY_TOPIC" ]; then
        if [ -n "$NTFY_TOKEN" ]; then
            curl -fsS --max-time 10 -H "Authorization: Bearer $NTFY_TOKEN" \
                -H "Title: $HOST_LABEL 巡检发现 $COUNT 个问题" \
                -H "Priority: 4" -H "Tags: rotating_light" \
                -d "$PROBLEMS" "${NTFY_URL%/}/${NTFY_TOPIC}" >/dev/null \
                || echo "[host-watchdog] ntfy 推送失败" >&2
        else
            curl -fsS --max-time 10 \
                -H "Title: $HOST_LABEL 巡检发现 $COUNT 个问题" \
                -H "Priority: 4" -H "Tags: rotating_light" \
                -d "$PROBLEMS" "${NTFY_URL%/}/${NTFY_TOPIC}" >/dev/null \
                || echo "[host-watchdog] ntfy 推送失败" >&2
        fi
    fi
    # 有问题时主动让死人开关也转红，避免「巡检在跑但一直有问题」被当成正常
    [ -n "$HC_PING_URL" ] && curl -fsS --max-time 10 "${HC_PING_URL%/}/fail" >/dev/null 2>&1
    exit 1
fi

echo "[host-watchdog:$HOST_LABEL] OK — 全部检查项正常"
[ -n "$HC_PING_URL" ] && curl -fsS --max-time 10 "$HC_PING_URL" >/dev/null 2>&1
exit 0
