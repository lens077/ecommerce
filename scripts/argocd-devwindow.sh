#!/usr/bin/env bash
# argocd-devwindow.sh — 开发时段临时关掉 ArgoCD 自动同步。
#
# 为什么需要这个脚本:
# `okteto up` 的做法是直接改集群里的 Deployment(换镜像 + 换 command),
# 而 ArgoCD 的 selfHeal 会把这种「漂移」同步回去 —— 你的开发容器会被无声干掉,
# 表现是敲着敲着 shell 断了,极难往 ArgoCD 身上想。
#
# 为什么用 AppProject 的 syncWindows 而不是别的办法:
#   - 改 Application 的 syncPolicy:它由 ApplicationSet 生成,控制器会改回去;
#   - 改 ApplicationSet 模板:能生效(它由 kubectl apply 管,不自愈),但会让集群
#     与 argocd-app.yml 长期漂移,下次谁 apply 一下就恢复了,开关不可靠;
#   - AppProject 的 syncWindows 是 ArgoCD **为这件事设计**的机制,且 AppProject
#     同样不由自己纳管,不存在自愈冲突。deny 窗口只挡自动同步,
#     manualSync=true 保留手工 sync 的能力(需要时仍可显式推一次)。
#
# 用法:
#   scripts/argocd-devwindow.sh off      # 开发前:关自动同步
#   scripts/argocd-devwindow.sh on       # 开发后:恢复
#   scripts/argocd-devwindow.sh status   # 现在是什么状态
#
# ⚠️ 关掉期间集群不会自动跟随 Git。开发结束务必 `on`,否则 GitOps 静默失效,
#    下一次部署"为什么没生效"会白排查半天。

set -euo pipefail

PROJECT="${ARGOCD_PROJECT:-ecommerce}"
NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"

# 本脚本管理的那一条窗口的指纹。识别靠形状而非注释 ——
# SyncWindow 没有 label/annotation 可挂,只能靠字段组合认领自己的那条。
# schedule 每分钟触发 + duration 24h = 永远处于激活状态(ArgoCD 的惯用写法)。
DEV_WINDOW_JSON='{
  "kind": "deny",
  "schedule": "* * * * *",
  "duration": "24h",
  "applications": ["*"],
  "manualSync": true,
  "timeZone": "Asia/Shanghai"
}'

die() { echo "❌ $*" >&2; exit 1; }

command -v kubectl >/dev/null || die "找不到 kubectl"
command -v jq >/dev/null      || die "找不到 jq"

kubectl get appproject "$PROJECT" -n "$NAMESPACE" >/dev/null 2>&1 \
  || die "AppProject $PROJECT (ns=$NAMESPACE) 不存在。先 kubectl apply -f argocd-proj.yml"

# 当前 syncWindows(不存在时给 [],避免下游 jq 收到 null)
current_windows() {
  kubectl get appproject "$PROJECT" -n "$NAMESPACE" -o json \
    | jq -c '.spec.syncWindows // []'
}

# 判断某条窗口是不是本脚本管理的那条
is_dev_window_filter='.kind == "deny" and .schedule == "* * * * *" and .duration == "24h" and (.applications // []) == ["*"]'

has_dev_window() {
  [ "$(current_windows | jq "[.[] | select($is_dev_window_filter)] | length")" -gt 0 ]
}

# Application 侧的自动同步状态(给 status 用) —— 即使窗口开着,
# 也要让人看见 automated 本身是不是配上了,两者是独立的两层。
app_automated_state() {
  local out
  out=$(kubectl get application -n "$NAMESPACE" -o json 2>/dev/null \
    | jq -r '.items[] | select(.spec.project == "'"$PROJECT"'")
             | "\(.metadata.name)\tselfHeal=\(.spec.syncPolicy.automated.selfHeal // "off")\tprune=\(.spec.syncPolicy.automated.prune // "off")\tsync=\(.status.sync.status // "?")"')
  [ -n "$out" ] && printf '%s\n' "$out" || echo "(该 project 下没有 Application)"
}

cmd_off() {
  if has_dev_window; then
    echo "ℹ️  开发窗口已经是关闭自动同步的状态,无需重复操作"
    cmd_status
    return 0
  fi

  # 保留用户自己配的其它窗口,只追加我们这条
  local existing merged
  existing=$(current_windows)
  merged=$(printf '%s' "$existing" | jq -c ". + [$DEV_WINDOW_JSON]")

  kubectl patch appproject "$PROJECT" -n "$NAMESPACE" --type=merge \
    -p "{\"spec\":{\"syncWindows\":$merged}}" >/dev/null

  echo "✅ 已加 deny 窗口:自动同步暂停(手工 sync 仍可用)"
  echo "   开发结束记得跑: scripts/argocd-devwindow.sh on"
  cmd_status
}

cmd_on() {
  if ! has_dev_window; then
    echo "ℹ️  没有本脚本管理的开发窗口,自动同步未被它拦住"
    cmd_status
    return 0
  fi

  local kept
  kept=$(current_windows | jq -c "[.[] | select($is_dev_window_filter | not)]")

  if [ "$kept" = "[]" ]; then
    # 整个字段删掉,而不是留一个空数组 —— 空数组和「没有窗口」在 ArgoCD 里语义相同,
    # 但留着会让 `kubectl get -o yaml` 出现噪音字段,下次 diff 时误以为有配置
    kubectl patch appproject "$PROJECT" -n "$NAMESPACE" --type=json \
      -p '[{"op":"remove","path":"/spec/syncWindows"}]' >/dev/null
  else
    kubectl patch appproject "$PROJECT" -n "$NAMESPACE" --type=merge \
      -p "{\"spec\":{\"syncWindows\":$kept}}" >/dev/null
  fi

  echo "✅ 已移除开发窗口:自动同步恢复(取决于 Application 自身的 automated 配置,见下)"
  cmd_status
}

cmd_status() {
  echo "--- AppProject $PROJECT 的 syncWindows ---"
  local windows
  windows=$(current_windows)
  if [ "$windows" = "[]" ]; then
    echo "  (无窗口)"
  else
    printf '%s' "$windows" | jq -r '.[] | "  kind=\(.kind) schedule=\"\(.schedule)\" duration=\(.duration) apps=\(.applications // []) manualSync=\(.manualSync // false)"'
  fi

  if has_dev_window; then
    echo "  → 状态:🟡 自动同步【已暂停】(本脚本的开发窗口生效中)"
  else
    echo "  → 状态:🟢 本脚本未拦截"
  fi

  echo "--- 该 project 下 Application 的 automated 配置 ---"
  app_automated_state | sed 's/^/  /'
}

case "${1:-status}" in
  off)    cmd_off ;;
  on)     cmd_on ;;
  status) cmd_status ;;
  *)      die "用法: $0 {off|on|status}" ;;
esac
