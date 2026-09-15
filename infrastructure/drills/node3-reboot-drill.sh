#!/usr/bin/env bash
# node3 受控重启演练：发起 reboot，轮询恢复，按时间线记录每个组件恢复时刻。
# 用法：bash infrastructure/drills/node3-reboot-drill.sh | tee /tmp/node3-reboot-drill.log（需 ssh 别名 node3 免密 sudo）
# 报告：docs/reports/2026-09-06-node3-reboot-drill.md
set -uo pipefail
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 node3)
log() { printf '[%s +%4ds] %s\n' "$(date +%T)" "$(( $(date +%s) - T0 ))" "$*"; }
rs() { "${SSH[@]}" "$@" 2>&1 | grep -vE 'perl: warning|LANG|LC_|are supported|Falling back|Please check|LANGUAGE'; }

T0=$(date +%s)
log "issuing reboot"
"${SSH[@]}" 'sudo systemctl reboot' >/dev/null 2>&1 || true

# 1. 等 SSH 断开再恢复
for _ in $(seq 1 30); do "${SSH[@]}" true >/dev/null 2>&1 || break; sleep 2; done
log "ssh down"
for _ in $(seq 1 120); do "${SSH[@]}" true >/dev/null 2>&1 && break; sleep 5; done
"${SSH[@]}" true >/dev/null 2>&1 || { log "FATAL: ssh not back after 10min"; exit 1; }
log "ssh up; uptime since: $(rs 'uptime -s')"
log "addresses: $(rs 'ip -4 -o addr show dev ens160 | awk "{print \$4}" | tr "\n" " "')"

# 2. 逐组件等待 active
wait_unit() { local u=$1 max=${2:-60}; for _ in $(seq 1 "$max"); do s=$(rs "systemctl is-active $u"); [ "$s" = active ] && { log "unit $u active"; return 0; }; sleep 5; done; log "unit $u NOT active ($s) after $((max*5))s"; return 1; }
for u in patroni redis-ms-1-6379 redis-ms-1-6380 docker vmetrics vmalert alertmanager; do wait_unit "$u" 60; done  # kafka/cdc-connect-exporter/kafka_exporter 2026-09-15 已随 CDC 链迁入 k8s 删除

# 3. Patroni leader + PG 可写
for _ in $(seq 1 60); do r=$(rs 'sudo patronictl -c /etc/patroni/patroni.yml list 2>/dev/null | grep -E "Leader" | grep -c running'); [ "$r" = 1 ] && break; sleep 5; done; log "patroni leader running: $r"
for _ in $(seq 1 60); do r=$(rs 'sudo -u postgres psql -d ecommerce -At -c "select 1" 2>/dev/null | head -n1'); [ "$r" = 1 ] && break; sleep 5; done; log "postgres accepting queries: $r"
log "slot after reboot: $(rs 'sudo -u postgres psql -d ecommerce -At -F"|" -c "SELECT slot_name, active FROM pg_replication_slots;" 2>/dev/null | grep -v Time | tr "\n" " "')"

# 4. Redis
log "redis ping: $(rs 'redis-cli -p 6379 -a "$(sudo grep -m1 -oE "^requirepass .*" /etc/redis/redis-ms-1-6379.conf 2>/dev/null | cut -d" " -f2)" --no-auth-warning ping 2>/dev/null || echo n/a')"

# 5. CDC 链（2026-09-15 起 Connect/Kafka/ES 在 k8s；node3 重启后只需确认复制槽被 k8s Debezium 重新接上）
for _ in $(seq 1 30); do r=$(rs 'sudo -u postgres psql -d ecommerce -At -c "SELECT active FROM pg_replication_slots WHERE slot_name='"'"'ecommerce_cdc'"'"';" 2>/dev/null | head -n1'); [ "$r" = t ] && break; sleep 5; done; log "slot ecommerce_cdc active: ${r:-missing}"
for _ in $(seq 1 30); do r=$(kubectl -n kafka get kafkaconnector -o jsonpath='{range .items[*]}{.status.connectorStatus.connector.state}/{.status.connectorStatus.tasks[0].state} {end}' 2>/dev/null); [ "$r" = "RUNNING/RUNNING RUNNING/RUNNING " ] && break; sleep 5; done; log "k8s connectors (source, sink): ${r:-n/a}"

# 6. alerts seen during outage
log "alertmanager cdc alerts now: $(rs 'curl -fsS "http://127.0.0.1:9059/api/v2/alerts?filter=category%3D%22cdc%22" | python3 -c "import json,sys; print([(a[\"labels\"][\"alertname\"],a[\"status\"][\"state\"]) for a in json.load(sys.stdin)])"')"
log "node3 side done"
