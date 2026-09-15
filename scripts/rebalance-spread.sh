#!/usr/bin/env bash
# 受控重平衡 ecommerce Pod 分布（TODO 阶段 0 第 1 项的固化脚本）。
#
# 做什么：skew>1 时按序 rollout restart 单副本业务 Deployment，让硬 spread 把新 Pod
# 调度到少载节点；另外检查 preferred 反亲和的双副本应用（consumer-next）两副本是否挤在同一节点，
# 是则 rollout restart 它一次让调度器重新分开（2026-09-15 起它的反亲和是软约束，spread 计数平衡
# 不代表它的两副本分开了）。skew<=1 且无同节点双副本时直接退出不动集群。
# 为什么不装 Descheduler：docs/TECH.md §7.3 定稿——一次性受控 rollout 比常驻 eviction
# 控制器更可控。
# 硬纪律（2026-08-30 事故换来的）：批量重启前必须 CEP/CES 对账，陈旧 CES 会把批量重启
# 引爆成全后端 CrashLoop。病理见 context/team/cilium-datapath-ops.md 第二节。
#
# 用法：scripts/rebalance-spread.sh          # 实际执行
#       scripts/rebalance-spread.sh --check  # 只看当前 skew 与 CES 状态，不动集群
# 兼容 macOS Bash 3.2（无 mapfile/关联数组/timeout）。
set -euo pipefail

NS=ecommerce
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_ONLY="${1:-}"

dist() {
  kubectl get pods -n "$NS" -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.spec.nodeName}{"\n"}{end}' \
    | sort | uniq -c
}

skew() {
  dist | awk '{c[NR]=$1} END{max=0;min=999999;for(i in c){if(c[i]>max)max=c[i];if(c[i]<min)min=c[i]};print max-min}'
}

# preferred 反亲和的双副本应用：Running 副本落在几个不同节点上。返回 1 表示全挤在一个节点。
SOFT_ANTI_AFFINITY_APPS="consumer-next"
distinct_nodes() { # distinct_nodes <app label>
  kubectl get pods -n "$NS" -l "app=$1" -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.spec.nodeName}{"\n"}{end}' \
    | sort -u | grep -c .
}
colocated_apps() {
  for app in $SOFT_ANTI_AFFINITY_APPS; do
    running=$(kubectl get pods -n "$NS" -l "app=$app" -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.metadata.name}{"\n"}{end}' | grep -c .)
    [ "$running" -ge 2 ] && [ "$(distinct_nodes "$app")" -le 1 ] && echo "$app"
  done
  return 0
}

echo "== 当前分布："
dist
echo "== skew=$(skew)"

echo "== CEP/CES 一致性预检（陈旧则拒绝重平衡）"
if ! python3 "$ROOT/infrastructure/ces-audit/ces_audit.py" --metrics-url ''; then
  echo "❌ 存在陈旧 CES——先按 context/team/cilium-datapath-ops.md 第二节删除陈旧 CES，再重跑本脚本" >&2
  exit 1
fi

COLOCATED="$(colocated_apps)"
if [ -n "$COLOCATED" ]; then
  echo "== 双副本挤在同一节点：$COLOCATED"
fi

if [ "$(skew)" -le 1 ] && [ -z "$COLOCATED" ]; then
  echo "✅ skew<=1 且双副本应用已分开，无需操作"
  exit 0
fi

if [ "$CHECK_ONLY" = "--check" ]; then
  [ "$(skew)" -gt 1 ] && echo "⚠️ skew>1，需要重平衡（--check 模式，不执行）"
  [ -n "$COLOCATED" ] && echo "⚠️ $COLOCATED 两副本同节点，需要重启分开（--check 模式，不执行）"
  exit 2
fi

FAILED=0
# 双副本同节点：restart 一次。maxSurge 0 / maxUnavailable 1 会先缩掉一个旧副本再补新副本，
# 新副本按 preferred 反亲和优先落到没有同伴的节点——前提是硬 spread 允许，不允许时会仍然同节点，下面终态会报出来。
# 先分开双副本——同节点本身就贡献了 skew，分开后往往不用再动单副本服务
if [ "$FAILED" -eq 0 ]; then
  for app in $(colocated_apps); do
    echo "-- restart deploy/${app}（两副本同节点）"
    kubectl rollout restart -n "$NS" "deploy/$app" >/dev/null
    if ! kubectl rollout status -n "$NS" "deploy/$app" --timeout=180s >/dev/null 2>&1; then
      echo "❌ ${app} 未在 180s 内就绪——人工介入" >&2
      FAILED=1
    fi
  done
fi

if [ "$FAILED" -eq 0 ] && [ "$(skew)" -gt 1 ]; then
echo "== 开始按序重启单副本 Deployment（跳过多副本 consumer-next / control-tower-gateway）"
for d in $(kubectl get deploy -n "$NS" -o name | grep -vE 'consumer-next|control-tower-gateway'); do
  [ "$(skew)" -le 1 ] && { echo "== skew 已<=1，提前收工"; break; }
  echo "-- restart $d"
  kubectl rollout restart -n "$NS" "$d" >/dev/null
  if ! kubectl rollout status -n "$NS" "$d" --timeout=180s >/dev/null 2>&1; then
    echo "❌ $d 未在 180s 内就绪——停止后续重启，人工介入（先查 CrashLoop 与 CES）" >&2
    FAILED=1
    break
  fi
done
fi

echo "== 终态分布："
dist
echo "== skew=$(skew)"
kubectl get deploy -n "$NS" --no-headers | awk '{split($2,a,"/"); if(a[1]!=a[2]) print "NOT-READY:",$1,$2}'

STILL="$(colocated_apps)"
if [ "$FAILED" -ne 0 ] || [ "$(skew)" -gt 1 ] || [ -n "$STILL" ]; then
  echo "❌ 重平衡未完成（skew=$(skew)${STILL:+；仍同节点：$STILL}——硬 spread 可能不允许分开，等其它 Pod 回平后重跑）" >&2
  exit 1
fi
echo "✅ 重平衡完成，全部 Ready、skew<=1、双副本应用已分开"
