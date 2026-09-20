#!/usr/bin/env bash
# Umami(网站分析)的部署/重部入口。幂等：重复执行是更新而非报错。
#
# 为什么在本仓而不在 kubernetes 仓：k8s 清单是 kubernetes 仓 components/umami 的（第三方组件
# 归集群仓），但**前端埋点配置在本仓**。这个脚本把两边串起来——部署组件、建站点、取回
# websiteId，最后告诉你该往哪两个前端写什么变量。
#
# 三个动作（UMAMI_ACTION）：
#   deploy   默认。在集群节点上跑 components/umami/install.sh，等就绪。
#   verify   只验证：Pod 就绪、heartbeat 200、tracker 脚本可取、库里表数与事件数。
#   website  登录面板，确保 shop 站点存在，打印 websiteId 与要写的前端变量。
#
# 用法：
#   scripts/deploy-umami.sh                         # 部署 + 验证 + 打印 websiteId
#   UMAMI_ACTION=verify scripts/deploy-umami.sh     # 只体检，不改集群
#   UMAMI_ACTION=website scripts/deploy-umami.sh    # 只取 websiteId
#
# 前置：
#   - node3 Pigsty 上库/角色 umami 已建好，public schema 属主是库主（PG 15+ 必须）
#   - OpenBao secret/k8s/<集群>/umami 已 seed（app-secret/two-factor-key/database-url）
#   两者的做法见 kubernetes 仓 components/umami/README.md
set -Eeuo pipefail

ACTION="${UMAMI_ACTION:-deploy}"
NS="${UMAMI_NAMESPACE:-ops}"
K8S_REPO="${K8S_REPO:-$HOME/lens077/kubernetes}"
NODE="${UMAMI_INSTALL_NODE:-node4}"        # 控制面节点：它的 config.env 才有正确的 CLUSTER_NAME
PGHOST_ALIAS="${UMAMI_PG_SSH_ALIAS:-node3}" # Pigsty 所在机（与 k8s worker node3 是同一台，两个 IP）
LOCAL_PORT="${UMAMI_LOCAL_PORT:-18300}"
SITE_DOMAIN="${UMAMI_SITE_DOMAIN:-shop.apikv.com}"
SITE_NAME="${UMAMI_SITE_NAME:-灯市 shop}"
ADMIN_USER="${UMAMI_ADMIN_USER:-admin}"
# 口令不落仓库（AGENTS.md 硬规则 4）。只有 website 动作需要它，所以这里不设默认值、
# 也不在启动时强制——deploy/verify 不登录面板，缺口令照样能跑。缺失的报错在 api_token()。
# 全新未改密实例用的是 umami 官方初始口令，值见上游文档，不在本仓复述。
ADMIN_PASS="${UMAMI_ADMIN_PASSWORD:-}"

info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m ✔\033[0m %s\n' "$*"; }
warn() { printf '\033[33m !\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m ✘\033[0m %s\n' "$*" >&2; exit 1; }

command -v kubectl >/dev/null || die "需要 kubectl"

pf_pid=""
cleanup() { [[ -n $pf_pid ]] && kill "$pf_pid" 2>/dev/null || true; }
trap cleanup EXIT

# 打开到 Service 的 port-forward 并等它真的能用。
# 不直接 curl 公网域名：那条路要经 Pangolin，网关侧的问题会被误判成应用故障。
port_forward() {
  kubectl -n "$NS" port-forward "svc/umami" "${LOCAL_PORT}:3000" >/tmp/umami-pf.log 2>&1 &
  pf_pid=$!
  local i
  for i in $(seq 1 20); do
    sleep 1
    curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${LOCAL_PORT}/api/heartbeat" && return 0
  done
  die "port-forward 起不来，看 /tmp/umami-pf.log"
}

api_token() {
  local t
  [[ -n $ADMIN_PASS ]] || die "需要面板口令：UMAMI_ADMIN_PASSWORD=<值> scripts/deploy-umami.sh"
  t=$(curl -s --max-time 15 -X POST "http://127.0.0.1:${LOCAL_PORT}/api/auth/login" \
        -H 'Content-Type: application/json' \
        -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null) || true
  [[ -n $t ]] || die "登录失败：UMAMI_ADMIN_PASSWORD 的值不对"
  printf '%s' "$t"
}

do_deploy() {
  [[ -d $K8S_REPO/components/umami ]] || die "找不到 $K8S_REPO/components/umami（用 K8S_REPO 指定 kubernetes 仓）"
  info "同步组件到 $NODE 并安装"
  # 组件脚本要在节点上跑：本机 bootstrap/config.env 的 CLUSTER_NAME 可能与目标集群不符，
  # 渲染出的 OpenBao 路径会指向另一个集群前缀，ESO 报 "Secret does not exist"（实测踩过）。
  rsync -az "$K8S_REPO/components/umami/" "$NODE:/root/kubernetes/components/umami/"
  ssh "$NODE" 'cd /root/kubernetes && ADDON_UMAMI=true bash components/umami/install.sh'

  info "等待就绪（首装要跑 26 个 Prisma migration，可能几分钟）"
  kubectl -n "$NS" rollout status deploy/umami --timeout=900s
  ok "deploy/umami 已就绪"
}

do_verify() {
  info "Pod 状态"
  kubectl -n "$NS" get pods -l app.kubernetes.io/name=umami -o wide

  local restarts
  restarts=$(kubectl -n "$NS" get pods -l app.kubernetes.io/name=umami \
             -o jsonpath='{.items[0].status.containerStatuses[0].restartCount}' 2>/dev/null || echo "?")
  [[ $restarts == 0 ]] && ok "无重启" || warn "重启 $restarts 次——首装期迁移超时属已知，其余要查 describe"

  port_forward
  local code size
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${LOCAL_PORT}/api/heartbeat")
  [[ $code == 200 ]] && ok "heartbeat 200" || die "heartbeat $code"

  size=$(curl -s -o /dev/null -w '%{size_download}' --max-time 10 "http://127.0.0.1:${LOCAL_PORT}/s.js")
  [[ ${size:-0} -gt 1000 ]] && ok "tracker /s.js 可取（${size} bytes）" || die "tracker 脚本异常（${size} bytes）"

  info "数据库侧（集群外 Pigsty，经 ssh ${PGHOST_ALIAS}）"
  ssh "$PGHOST_ALIAS" "export LC_ALL=C LANG=C; su - postgres -c \"psql -d umami -tAc \\\"select
      (select count(*) from information_schema.tables where table_schema='public') as tables,
      (select count(*) from website) as websites,
      (select count(*) from website_event) as events\\\"\"" 2>/dev/null \
    | grep -E '^[0-9]+\|' | awk -F'|' '{printf "    表 %s 张 / 站点 %s 个 / 事件 %s 条\n",$1,$2,$3}' \
    || warn "读不到数据库（ssh ${PGHOST_ALIAS} 不通？）"
}

do_website() {
  port_forward
  local token id
  token=$(api_token)

  # 幂等：同域名已存在就复用，不重复建（重复建会产生两个 websiteId，前端埋错就白采）
  id=$(curl -s --max-time 15 -H "Authorization: Bearer $token" \
        "http://127.0.0.1:${LOCAL_PORT}/api/websites" \
      | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows=d.get('data',d) if isinstance(d,dict) else d
for w in (rows if isinstance(rows,list) else []):
    if w.get('domain')=='${SITE_DOMAIN}':
        print(w['id']); break
" 2>/dev/null) || true

  if [[ -n $id ]]; then
    ok "站点已存在：$SITE_DOMAIN"
  else
    id=$(curl -s --max-time 20 -X POST "http://127.0.0.1:${LOCAL_PORT}/api/websites" \
          -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
          -d "{\"name\":\"${SITE_NAME}\",\"domain\":\"${SITE_DOMAIN}\"}" \
        | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null) || true
    [[ -n $id ]] || die "建站点失败"
    ok "站点已创建：$SITE_DOMAIN"
  fi

  local url="https://umami.apikv.com/s.js"
  cat <<EOF

  websiteId: $id

  前端构建期变量（两个应用各一套，缺任一即完全不加载 tracker）：

    apps/consumer（Vite，chart frontend）
      VITE_UMAMI_SCRIPT_URL=$url
      VITE_UMAMI_WEBSITE_ID=$id

    apps/consumer-next（Next.js）
      NEXT_PUBLIC_UMAMI_SCRIPT_URL=$url
      NEXT_PUBLIC_UMAMI_WEBSITE_ID=$id

  注意：是**构建期**内联，改值要重新构建镜像，改 Deployment 的 env 不生效。
EOF
}

case "$ACTION" in
  deploy)  do_deploy; do_verify; do_website ;;
  verify)  do_verify ;;
  website) do_website ;;
  *) die "未知 UMAMI_ACTION=${ACTION}（deploy|verify|website）" ;;
esac
