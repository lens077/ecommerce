#!/bin/bash
# 收窄 Docker 已发布端口的来源。由 docker-port-guard.service 在开机与 docker 启动后执行。
#
# ── 为什么不能用宿主端口写规则（实测 2026-09-01 踩过）────────────────────────
# Docker 的 DNAT 发生在 filter 之前，进到 DOCKER-USER 时目的地址/端口已被改写：
#     61246 -> 172.22.0.2:6379      52288 -> 172.19.0.2:5432
# 所以规则必须匹配**改写之后**的「容器 IP + 容器端口」。
# 第一版按 `--dport 61246` 写，六条规则计数**全是 0**，外部主机照样连得上——
# 一条看起来正确、实则从不生效的死规则。判据：`iptables -L DOCKER-USER -v -n`
# 的 pkts 必须随真实流量增长，为 0 就是没接上。
#
# ── 为什么动态解析容器 IP ────────────────────────────────────────────────
# 容器重建后 IP 可能变，写死会让规则失配（同样是静默失效）。
# 注意本机 docker 的 `-f '{{.NetworkSettings.IPAddress}}'` 取不到值（bridge 网络下
# 该字段为空），`{{.NetworkSettings.Networks}}` 又只打印 Go map 指针，
# 因此这里用 python 解析 JSON——实测是唯一稳定的取法。
set -uo pipefail

container_ip() {
  docker inspect "$1" 2>/dev/null | python3 -c '
import sys, json
try:
    nets = json.load(sys.stdin)[0]["NetworkSettings"]["Networks"]
    print(list(nets.values())[0]["IPAddress"])
except Exception:
    pass
' 2>/dev/null
}

guard() {  # guard <容器名> <容器内端口> <允许来源...>
  local name="$1" cport="$2"; shift 2
  local ip; ip="$(container_ip "$name")"
  if [ -z "$ip" ]; then
    echo "skip ${name}: 容器未运行或取不到 IP"
    return 0
  fi
  local src
  for src in "$@"; do
    iptables -A DOCKER-USER -p tcp -d "$ip" --dport "$cport" -s "$src" -j RETURN
  done
  iptables -A DOCKER-USER -p tcp -d "$ip" --dport "$cport" -j DROP
  echo "guarded ${name} (${ip}:${cport}) <- $*"
}

# 每次全量重建，避免重复叠加
iptables -F DOCKER-USER 2>/dev/null || true

# 允许来源说明：
#   node2    node2 —— gorse 所在机器（两个库的真实消费者）
#   <operator-egress-cidr> 运维出口段
#   172.16.0.0/12    Docker 网桥段 —— Casdoor 经 172.18.0.1 连 PG 走的就是这条
#
# 历史（已解除）：Casdoor 曾配 host=apikv.com **绕公网**连回本机，源地址呈现为 node1
# 自己的公网 IP node1，当时必须为此放行公网 IP，否则收窄即断 SSO。
# 2026-09-01 已改为 host=172.18.0.1，该放行项随之去掉。

# redis_gorse 61246 -> 容器 6379。实测消费者只有 node2 的 gorse。
guard redis 6379 node2 <operator-egress-cidr> 172.16.0.0/12

# postgres_gorse 52288 -> 容器 5432。消费者是 gorse(node2) + Casdoor(经 172.18.0.1)。
guard postgres 5432 node2 <operator-egress-cidr> 172.16.0.0/12
