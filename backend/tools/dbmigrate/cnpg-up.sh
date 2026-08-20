#!/usr/bin/env bash
# 对集群 CNPG(pg-main)执行全量迁移 —— 2026-08-21 真库实测路径固化。
#   make migrate-cnpg-up                     # 空库重建: up(+SEED=1 时种子)
#   make migrate-cnpg-up CMD=baseline        # 接管手工建过表的存量库(只登记不执行)
#   make migrate-cnpg-up CMD=status          # 查看
# 连接方式 = 临时 LoadBalancer 直连 pg-main(Cilium LB 池自动分配 VIP):
#   - kubectl port-forward 对 PG 连续建连场景不稳定(实测起来即死), 不用;
#   - 经 pg-passthrough-gateway 的 VIP 走 TLS-SNI 路由, 用 IP 连会被拒(必须 pg.dev.test
#     域名), 脚本场景不折腾 DNS, 直挂临时 svc 最稳。用完即删, 不留常驻入口。
set -Eeuo pipefail
NS=postgresql
DB_NAME=${DB_NAME:-ecommerce}
CMD=${CMD:-up}
SVC=${MIGRATE_SVC:-all}
cleanup() { kubectl -n $NS delete svc pg-main-migrate-tmp --ignore-not-found >/dev/null 2>&1 || true; }
trap cleanup EXIT
kubectl -n $NS apply -f - <<'YAML' >/dev/null
apiVersion: v1
kind: Service
metadata: { name: pg-main-migrate-tmp, namespace: postgresql }
spec:
  type: LoadBalancer
  selector: { cnpg.io/cluster: pg-main, cnpg.io/instanceRole: primary }
  ports: [{ port: 5432, targetPort: 5432 }]
YAML
VIP=""
for _ in $(seq 1 20); do
  VIP=$(kubectl -n $NS get svc pg-main-migrate-tmp -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
  [[ -n $VIP ]] && break; sleep 2
done
[[ -n $VIP ]] || { echo "临时 LB 未拿到 VIP(检查 Cilium LB 池)"; exit 1; }
PW=$(kubectl -n $NS get secret pg-main-app -o jsonpath='{.data.password}' | base64 -d)
export DB_URI="postgres://app:${PW}@${VIP}:5432/${DB_NAME}?sslmode=require"
echo "== dbmigrate $CMD → $DB_NAME @ $VIP (svc=$SVC)"
go run ./tools/dbmigrate -svc "$SVC" "$CMD"
if [[ "$CMD" == "up" && "${SEED:-0}" == "1" ]]; then
  go run ./tools/dbmigrate -svc "$SVC" seed
fi
