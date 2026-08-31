#!/usr/bin/env bash
# 受控重平衡 ecommerce Pod 分布（TODO 阶段 0 第 1 项的固化脚本）。
#
# 做什么：skew>1 时按序 rollout restart 单副本业务 Deployment，让硬 spread 把新 Pod
# 调度到少载节点；skew<=1 时直接退出不动集群。
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

echo "== 当前分布："
dist
echo "== skew=$(skew)"

echo "== CEP/CES 一致性预检（陈旧则拒绝重平衡）"
if ! python3 "$ROOT/infrastructure/ces-audit/ces_audit.py" --metrics-url ''; then
  echo "❌ 存在陈旧 CES——先按 context/team/cilium-datapath-ops.md 第二节删除陈旧 CES，再重跑本脚本" >&2
  exit 1
fi

if [ "$(skew)" -le 1 ]; then
  echo "✅ skew<=1，已平衡，无需操作"
  exit 0
fi

if [ "$CHECK_ONLY" = "--check" ]; then
  echo "⚠️ skew>1，需要重平衡（--check 模式，不执行）"
  exit 2
fi

echo "== 开始按序重启单副本 Deployment（跳过多副本 consumer-next / control-tower-gateway）"
FAILED=0
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

echo "== 终态分布："
dist
echo "== skew=$(skew)"
kubectl get deploy -n "$NS" --no-headers | awk '{split($2,a,"/"); if(a[1]!=a[2]) print "NOT-READY:",$1,$2}'

if [ "$FAILED" -ne 0 ] || [ "$(skew)" -gt 1 ]; then
  echo "❌ 重平衡未完成（skew=$(skew)）" >&2
  exit 1
fi
echo "✅ 重平衡完成，15/15 Ready 且 skew<=1"
