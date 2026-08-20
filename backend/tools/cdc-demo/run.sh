#!/usr/bin/env bash
# CDC 链路一键端到端演示：
#   compose 起 PG/NATS/Meili → 迁移+种子 → 起 relay 与 indexer → 跑 cdc-demo 校验 → 汇报
# 兼容 macOS Bash 3.2（见 context/team/shell-scripting.md）：不用关联数组/mapfile。
set -euo pipefail

cd "$(dirname "$0")/../.."   # → backend/

DSN="postgres://postgres:postgres@127.0.0.1:15432/ecommerce?sslmode=disable"
KEEP="${KEEP:-0}"            # KEEP=1 结束后保留 compose 环境
RELAY_PID=""
INDEXER_PID=""

cleanup() {
  rc=$?
  [ -n "$RELAY_PID" ] && kill "$RELAY_PID" 2>/dev/null || true
  [ -n "$INDEXER_PID" ] && kill "$INDEXER_PID" 2>/dev/null || true
  if [ "$KEEP" != "1" ]; then
    docker compose -f tools/cdc-demo/compose.yaml down -v >/dev/null 2>&1 || true
  else
    echo "== KEEP=1：compose 环境保留（tools/cdc-demo/compose.yaml）"
  fi
  exit $rc
}
trap cleanup EXIT INT TERM

echo "== ① 拉起 PG/NATS/Meilisearch（宿主侧探活）"
docker compose -f tools/cdc-demo/compose.yaml up -d

wait_http() { # url name service
  for _ in $(seq 1 60); do
    curl -sf "$1" >/dev/null 2>&1 && echo "   $2 就绪" && return 0
    sleep 1
  done
  echo "❌ $2 未就绪"; docker compose -f tools/cdc-demo/compose.yaml logs --tail=20 "$3" || true; return 1
}
for _ in $(seq 1 60); do
  docker compose -f tools/cdc-demo/compose.yaml exec -T postgres pg_isready -U postgres -d ecommerce >/dev/null 2>&1 && echo "   postgres 就绪" && break
  sleep 1
done
wait_http "http://127.0.0.1:18222/healthz" "nats" nats
wait_http "http://127.0.0.1:17700/health" "meilisearch" meilisearch

echo "== ② 迁移 + 种子（product）"
go run ./tools/dbmigrate -svc product -dsn "$DSN" up
go run ./tools/dbmigrate -svc product -dsn "$DSN" seed

echo "== ③ 启动 outbox-relay 与 search-indexer（预编译，kill 才能真正杀掉进程本体——"
echo "     go run 的子进程收不到发给包装进程的信号，实测残留过孤儿进程）"
BIN_DIR="$(mktemp -d)"
go build -o "$BIN_DIR/outbox-relay" ./tools/outbox-relay
go build -o "$BIN_DIR/search-indexer" ./tools/search-indexer
"$BIN_DIR/outbox-relay" -dsn "$DSN" -table products.outbox &
RELAY_PID=$!
MEILI_MASTER_KEY=cdc-demo-master-key "$BIN_DIR/search-indexer" -dsn "$DSN" &
INDEXER_PID=$!
sleep 1

echo "== ③b 先全量重建一次（种子数据进索引，验证 index swap 路径）"
MEILI_MASTER_KEY=cdc-demo-master-key "$BIN_DIR/search-indexer" -dsn "$DSN" -mode reindex

echo "== ④ 端到端校验（同事务 outbox → relay → JetStream → indexer → Meili）"
go run ./tools/cdc-demo -dsn "$DSN"

echo "== ⑤ 顺手验证：种子商品也可搜（全量重建路径）"
curl -sf -H 'Authorization: Bearer cdc-demo-master-key' \
  -H 'Content-Type: application/json' \
  -X POST 'http://127.0.0.1:17700/indexes/products/search' \
  -d '{"q":"iPhone","limit":3}' | head -c 400; echo
echo "== 全部通过 ✅"
