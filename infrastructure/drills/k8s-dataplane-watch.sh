#!/usr/bin/env bash
# 数据面演练期间每 15s 采样 k8s 侧：不可用 Deployment、CrashLoop Pod、search 深健康；连续 4 次全绿或 18 分钟后退出。
# 用法：bash infrastructure/drills/k8s-dataplane-watch.sh | tee /tmp/k8s-drill-watch.log（与 node3-reboot-drill.sh 并行）
set -uo pipefail
T0=$(date +%s)
green=0
for _ in $(seq 1 72); do
  ts="[$(date +%T) +$(( $(date +%s) - T0 ))s]"
  bad=$(kubectl get deployments -A -o json 2>/dev/null | python3 -c '
import json,sys
items=json.load(sys.stdin)["items"]
bad=[i["metadata"]["namespace"]+"/"+i["metadata"]["name"] for i in items if i["spec"].get("replicas",1)!=i.get("status",{}).get("availableReplicas",0)]
print(f"{len(items)-len(bad)}/{len(items)} " + " ".join(bad))')
  crash=$(kubectl get pods -A --no-headers 2>/dev/null | awk '$4 ~ /CrashLoopBackOff|Error/ {print $1"/"$2"("$4")"}' | tr '\n' ' ')
  pod=$(kubectl -n ecommerce get pod -l app=ecommerce-search -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  h=$(kubectl -n ecommerce exec "$pod" -- wget -qO- -T 4 http://127.0.0.1:30002/healthz 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print("healthy" if d.get("healthy") else "UNHEALTHY:"+json.dumps(d.get("details")))' 2>/dev/null || echo "probe-failed")
  echo "$ts deployments=$bad crash=[$crash] search=$h"
  if [[ $bad == *"/"* && $bad != *" "* && -z $crash && $h == healthy ]]; then green=$((green+1)); else green=0; fi
  # 全绿判定：bad 字段没有 namespace 列表（形如 "49/49 "）
  case "$bad" in *"/"*" "*[a-z]*) green=0;; esac
  [[ $green -ge 4 ]] && { echo "$ts stable green x4"; break; }
  sleep 15
done
