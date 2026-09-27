#!/usr/bin/env bash
# host-watchdog 一键安装。幂等，可重复执行。
#
#   ./install.sh <ssh-host>                 # 安装/升级到远端主机
#   ./install.sh <ssh-host> --dry-run       # 只打印将执行的动作，不改远端
#   DRY_RUN=1 ./install.sh <ssh-host>       # 同上
#
# 凭据不走这个脚本:安装后在目标机手写 /etc/host-watchdog/watchdog.env(0400)。
# 仓库里只出现主机名和路径,不出现 token——见 AGENTS.md 硬规则 4。
#
# 兼容 macOS Bash 3.2:可选参数用「始终非空的数组 + 条件追加」,
# 不做可能为空的数组展开。见 context/team/shell-scripting.md。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${1:-}"
DRY_RUN="${DRY_RUN:-}"
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1

if [ -z "$HOST" ]; then
    echo "用法: $0 <ssh-host> [--dry-run]" >&2
    exit 2
fi

ssh_cmd=(ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST")

run_remote() {
    if [ -n "$DRY_RUN" ]; then
        echo "  [dry-run] ssh $HOST: $1"
    else
        "${ssh_cmd[@]}" "$1"
    fi
}

copy_to() {
    if [ -n "$DRY_RUN" ]; then
        echo "  [dry-run] scp $1 → $HOST:$2"
    else
        scp -q "$1" "$HOST:$2"
    fi
}

echo "==> 目标主机: $HOST${DRY_RUN:+  (dry-run)}"

echo "==> 1/4 前置检查"
if [ -z "$DRY_RUN" ]; then
    # 2026-09-24 旧 node3 重装为 dockerless 的 k3 后，WATCH 为空、只监控 systemd/HTTP/磁盘；
    # 强制要求 Docker 会让本来支持「按需启用」的脚本无法安装到 K8s 节点。
    "${ssh_cmd[@]}" 'command -v python3 >/dev/null || { echo "缺少 python3(Pangolin 站点检查需要)" >&2; exit 1; }
                     command -v systemctl >/dev/null || { echo "缺少 systemd" >&2; exit 1; }
                     echo "  python3 / systemd 就绪(Docker 仅在 WATCH 非空时需要)"'
else
    echo "  [dry-run] 检查 python3 / systemd(Docker 仅在 WATCH 非空时需要)"
fi

echo "==> 2/4 安装脚本与 systemd 单元"
copy_to "$SCRIPT_DIR/watchdog.sh" /tmp/host-watchdog.sh
copy_to "$SCRIPT_DIR/notify.py" /tmp/host-watchdog-notify.py
copy_to "$SCRIPT_DIR/host-watchdog.service" /tmp/host-watchdog.service
copy_to "$SCRIPT_DIR/host-watchdog.timer" /tmp/host-watchdog.timer
run_remote 'install -d -m 0755 /usr/local/lib/host-watchdog
            install -m 0644 /tmp/host-watchdog-notify.py /usr/local/lib/host-watchdog/notify.py
            install -m 0755 /tmp/host-watchdog.sh /usr/local/bin/host-watchdog
            install -m 0644 /tmp/host-watchdog.service /etc/systemd/system/host-watchdog.service
            install -m 0644 /tmp/host-watchdog.timer /etc/systemd/system/host-watchdog.timer
            rm -f /tmp/host-watchdog.sh /tmp/host-watchdog-notify.py /tmp/host-watchdog.service /tmp/host-watchdog.timer
            mkdir -p /etc/host-watchdog
            install -d -m 0700 /var/lib/host-watchdog /var/lib/host-watchdog-test
            echo "  已安装 host-watchdog / notify.py 与 systemd 单元"'

echo "==> 3/4 配置文件"
run_remote 'if [ -f /etc/host-watchdog/watchdog.env ]; then
              echo "  /etc/host-watchdog/watchdog.env 已存在,保留不覆盖"
            else
              umask 077
              cat > /etc/host-watchdog/watchdog.env <<EOF
# 巡检对象:留空的检查项直接跳过
WATCH=""
SYSTEMD_UNITS=""
HTTP_CHECKS=""
PANGOLIN_DB=""
PANGOLIN_IGNORE_SITES="mac"
DISK_PATHS="/"
DISK_WARN_PCT=85
DISK_CRIT_PCT=95

# 告警出口(复用项目既有 ntfy 通道)
NTFY_URL=""
NTFY_TOPIC=""
NTFY_TICKET_TOPIC=""
NTFY_TEST_TOPIC=""
NTFY_TOKEN=""
HC_PING_URL=""
# 生产默认；不要把 test 持久写进定时器配置
WATCHDOG_MODE="production"
NOTIFY_HOLD_SECONDS=600
NOTIFY_RECOVER_SECONDS=300
NOTIFY_STATE_FILE="/var/lib/host-watchdog/incidents.json"
EOF
              chmod 0400 /etc/host-watchdog/watchdog.env
              echo "  已生成模板 /etc/host-watchdog/watchdog.env(0400),需手工填写"
            fi'

echo "==> 4/4 启用定时器"
run_remote 'systemctl daemon-reload
            systemctl enable --now host-watchdog.timer
            systemctl list-timers host-watchdog.timer --no-pager --no-legend'

cat <<EOF

完成。接下来:
  1. 在 $HOST 上填写 /etc/host-watchdog/watchdog.env（Docker 主机配置 WATCH；systemd-only 主机保持 WATCH 为空）
  2. 立即跑一次:      ssh $HOST 'systemctl start host-watchdog.service; journalctl -u host-watchdog -n 20 --no-pager'
  3. 升级已有配置时，手工补齐 NTFY_TICKET_TOPIC / NTFY_TEST_TOPIC，安装器不会覆盖或回显凭据。
  4. 获测试授权后，按 README 的 WATCHDOG_MODE=test 隔离步骤验证 firing → 静默 → resolved。
     不改生产 WATCH，不用生产 topic，不删除生产 incidents.json 来制造测试。
EOF
