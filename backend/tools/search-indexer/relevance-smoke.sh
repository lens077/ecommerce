#!/usr/bin/env bash
# 对已运行的 Search RPC 执行 dev 商品相关性验收；调用前先建立 service port-forward。
set -Eeuo pipefail

SEARCH_URL=${SEARCH_URL:-http://127.0.0.1:18002}
RPC_PATH=/search.v1.SearchService/Search

search() {
  query=$1
  payload=$(jq -cn --arg name "$query" '{name:$name}')
  curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    -H 'Connect-Protocol-Version: 1' \
    --data-binary "$payload" \
    "${SEARCH_URL}${RPC_PATH}"
}

while IFS='|' read -r query expected; do
  response=$(search "$query")
  got=$(printf '%s' "$response" | jq -r '.products[0].spuCode // ""')
  if [[ "$got" != "$expected" ]]; then
    printf 'FAIL query=%s expected=%s got=%s\n' "$query" "$expected" "${got:-<none>}" >&2
    exit 1
  fi
  printf '%s' "$response" | jq -e '.products | length > 0 and all(.[]; .status == "online")' >/dev/null
  hits=$(printf '%s' "$response" | jq -r '.products | length')
  printf 'PASS query=%s top1=%s hits=%s\n' "$query" "$got" "$hits"
done <<'CASES'
降噪|sony-wh-1000xm5
咖啡|delonghi-nespresso
修护|estee-lauder-anr
无线鼠标|logitech-mx-master-3s
跑鞋|nike-air-zoom-pegasus-41
快速充电|apple-20w-adapter
iphone-15-pro|iphone-15-pro
Nespreso|delonghi-nespresso
CASES

phone=$(search iphone-15-pro)
printf '%s' "$phone" | jq -e '.products[0].price == 8999 and .products[0].quantity > 0' >/dev/null
printf 'PASS projection price=%s sale_count=%s\n' \
  "$(printf '%s' "$phone" | jq -r '.products[0].price')" \
  "$(printf '%s' "$phone" | jq -r '.products[0].quantity')"
