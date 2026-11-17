#!/bin/sh
# Trae 托管一键部署：consumer（静态 SPA）与 consumer-next（Next.js SSR）。
#
# 每次部署前先执行 CLI 的 check 做登录/项目权限校验；未通过直接退出，不上传任何内容。
#
# 用法（在 frontend/ 目录下）：
#   make deploy-trae-check          # 只检查部署权限
#   make deploy-trae-consumer       # 构建 + 部署 consumer
#   make deploy-trae-consumer-next  # 准备远端构建包 + 部署 consumer-next
#   make deploy-trae                # 依次部署两个站点
#
# 可覆盖的环境变量：
#   TRAE_DEPLOY_HOME          Trae 部署技能目录（默认取 ~/.trae-cn 下已安装的最新版本）
#   CONSUMER_SITE_NAME        consumer 站点名（默认 ecommerce-consumer）
#   CONSUMER_NEXT_SITE_NAME   consumer-next 站点名（默认 ecommerce-consumer-next）
#   CONSUMER_NEXT_GATEWAY_URL consumer-next 运行期网关（默认 https://gateway.apikv.com）
#   SITE_ACCESS_POLICY        新建站点时的可见性（默认 public）
set -eu

FRONTEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

TRAE_DEPLOY_HOME=${TRAE_DEPLOY_HOME:-}
if [ -z "$TRAE_DEPLOY_HOME" ]; then
  TRAE_DEPLOY_HOME=$(ls -d "$HOME"/.trae-cn/plugins/trae-remote-official/deployment/*/skills/deployment 2>/dev/null | sort -V | tail -n 1 || true)
fi
if [ -z "$TRAE_DEPLOY_HOME" ] || [ ! -f "$TRAE_DEPLOY_HOME/scripts/trae-deploy" ]; then
  echo "找不到 Trae 部署 CLI：请安装 trae-remote-official:deployment 插件，或用 TRAE_DEPLOY_HOME 指向 skills/deployment 目录" >&2
  exit 1
fi

run_cli() {
  sh "$TRAE_DEPLOY_HOME/scripts/trae-deploy" "$@"
}

# 解析 CLI 的 JSON：$1 为以 d（data）和 arg（可选参数）求值的表达式，结果写到 stdout。
json_data() {
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        console.error("CLI 返回了无法解析的内容");
        process.exit(1);
      }
      if (!result.ok) {
        const error = result.error || {};
        console.error("CLI 失败：" + (error.code || "UNKNOWN") + " " + (error.message || ""));
        process.exit(1);
      }
      const d = result.data;
      const value = new Function("d", "arg", "return (" + process.argv[1] + ");")(d, process.argv[2]);
      process.stdout.write(value === undefined || value === null ? "" : String(value));
    });
  ' "$1" "${2:-}"
}

# 部署权限/登录检查（只读，不产生站点或部署）
check_access() {
  echo "== 检查部署权限 ==" >&2
  check_out=$(run_cli check) || {
    echo "部署权限检查失败：请按 CLI 提示登录或申请当前项目访问权限后重试" >&2
    exit 1
  }
  printf '%s' "$check_out" | json_data 'd.status' >/dev/null || exit 1
  check_scope=$(printf '%s' "$check_out" | json_data 'd.user_scope')
  echo "权限检查通过（scope=${check_scope:-default}）" >&2
}

# 按站点名查找，不存在则创建；成功时向 stdout 输出站点 ID
find_or_create_site() {
  site_name=$1
  site_description=$2
  list_page=1
  while :; do
    list_out=$(run_cli sites list --page-no "$list_page" --page-size 50) || exit 1
    site_id=$(printf '%s' "$list_out" | json_data '((d.items || []).find((item) => item.display_name === arg) || {}).deploy_target_id' "$site_name")
    if [ -n "$site_id" ]; then
      printf '%s' "$site_id"
      return 0
    fi
    list_total_pages=$(printf '%s' "$list_out" | json_data 'd.total_pages')
    if [ "$list_page" -ge "${list_total_pages:-1}" ]; then
      break
    fi
    list_page=$((list_page + 1))
  done
  echo "站点 $site_name 不存在，按 $SITE_ACCESS_POLICY 新建" >&2
  create_out=$(run_cli sites create --name "$site_name" --description "$site_description" --access-policy "$SITE_ACCESS_POLICY") || exit 1
  printf '%s' "$create_out" | json_data 'd.deploy_target_id'
}

# 有进行中的部署时直接失败，避免并发覆盖
ensure_no_active_deployment() {
  guard_site_id=$1
  guard_out=$(run_cli deployments list --site-id "$guard_site_id" --page-size 50) || exit 1
  guard_active=$(printf '%s' "$guard_out" | json_data '((d.items || []).filter((item) => [9, 10, 11].indexOf(item.status) === -1)).length')
  if [ "${guard_active:-0}" != "0" ]; then
    echo "站点 $guard_site_id 还有进行中的部署，请等待结束或先取消后再执行" >&2
    exit 1
  fi
}

# 提交部署并等待终态；成功时向 stderr 打印访问地址
deploy_and_wait() {
  target_site_id=$1
  deploy_title=$2
  deploy_description=$3
  deploy_type=$4
  source_dir=$5
  execution_config=$6
  create_out=$(run_cli deployments create \
    --site-id "$target_site_id" \
    --title "$deploy_title" \
    --description "$deploy_description" \
    --type "$deploy_type" \
    --source-dir "$source_dir" \
    --execution-config "$execution_config" \
    --app-tags "${TRAE_APP_TAGS:-134}") || exit 1
  deployment_id=$(printf '%s' "$create_out" | json_data 'd.deployment_id')
  echo "部署已提交：$deployment_id" >&2
  if ! wait_out=$(run_cli deployments wait --deployment-id "$deployment_id" --timeout-seconds 1800); then
    echo "部署失败或超时：$deployment_id" >&2
    echo "查看日志：sh \"$TRAE_DEPLOY_HOME/scripts/trae-deploy\" logs build --deployment-id $deployment_id" >&2
    return 1
  fi
  wait_domain=$(printf '%s' "$wait_out" | json_data 'd.deployment.resource_data.domain')
  echo "部署成功：https://$wait_domain" >&2
}

# consumer：本地构建 dist，超过静态站文件上限时自动改走大静态适配器
deploy_consumer() {
  check_access
  command -v pnpm >/dev/null 2>&1 || { echo "缺少 pnpm" >&2; exit 1; }
  echo "== 构建 consumer（pnpm --filter @ecommerce/consumer build）==" >&2
  (cd "$FRONTEND_DIR" && pnpm --filter @ecommerce/consumer build)

  consumer_tmp=$(mktemp -d "${TMPDIR:-/tmp}/trae-deploy-consumer.XXXXXX")
  consumer_adapter_dir=
  trap 'rm -rf "$consumer_tmp"; if [ -n "${consumer_adapter_dir:-}" ]; then rm -rf "$consumer_adapter_dir"; fi' EXIT

  mkdir -p "$consumer_tmp/public"
  cp -R "$FRONTEND_DIR/apps/consumer/dist/." "$consumer_tmp/public/"
  consumer_file_count=$(find "$consumer_tmp/public" -type f | wc -l | tr -d ' ')
  echo "静态产物：$consumer_file_count 个文件" >&2

  if [ "$consumer_file_count" -gt 99 ]; then
    adapter_out=$(node "$TRAE_DEPLOY_HOME/scripts/prepare-static-function.mjs" --source-dir "$consumer_tmp") || exit 1
    consumer_source_dir=$(printf '%s' "$adapter_out" | json_data 'd.source_dir')
    consumer_execution_config=$(printf '%s' "$adapter_out" | json_data 'd.execution_config')
    consumer_deploy_type=$(printf '%s' "$adapter_out" | json_data 'd.deploy_type')
    consumer_adapter_dir=$consumer_source_dir
  else
    consumer_source_dir=$consumer_tmp
    consumer_execution_config=$consumer_tmp/execution-config.json
    printf '{}\n' > "$consumer_execution_config"
    consumer_deploy_type=static-web
  fi

  consumer_site_id=$(find_or_create_site "${CONSUMER_SITE_NAME:-ecommerce-consumer}" "ecommerce monorepo, frontend/apps/consumer: Vite SPA consumer storefront (React + TanStack Router + MUI); dist/ served by a Node static adapter.")
  ensure_no_active_deployment "$consumer_site_id"
  deploy_and_wait "$consumer_site_id" "consumer 一键部署" "Deploy frontend/apps/consumer (Vite SPA, built dist/) via make deploy-trae-consumer." "$consumer_deploy_type" "$consumer_source_dir" "$consumer_execution_config"

  rm -rf "$consumer_tmp"
  if [ -n "$consumer_adapter_dir" ]; then
    rm -rf "$consumer_adapter_dir"
  fi
  trap - EXIT
}

# consumer-next：准备最小 workspace 包，远端 nodejs20 构建 Next standalone 产物
deploy_consumer_next() {
  check_access
  command -v rsync >/dev/null 2>&1 || { echo "缺少 rsync" >&2; exit 1; }
  echo "== 准备 consumer-next 远端构建包 ==" >&2

  next_tmp=$(mktemp -d "${TMPDIR:-/tmp}/trae-deploy-next.XXXXXX")
  trap 'rm -rf "$next_tmp"' EXIT

  cp "$FRONTEND_DIR/package.json" "$FRONTEND_DIR/pnpm-workspace.yaml" "$FRONTEND_DIR/pnpm-lock.yaml" "$next_tmp/"
  mkdir -p "$next_tmp/apps" "$next_tmp/packages"
  rsync -a --exclude node_modules --exclude .next --exclude dist --exclude '.env*' --exclude tsconfig.tsbuildinfo \
    "$FRONTEND_DIR/apps/consumer-next/" "$next_tmp/apps/consumer-next/"
  rsync -a --exclude node_modules "$FRONTEND_DIR/packages/lantern/" "$next_tmp/packages/lantern/"

  cat > "$next_tmp/build.sh" <<'BUILD'
#!/bin/sh
set -eu

export NPM_CONFIG_REGISTRY='https://registry.npmjs.org/'

npm i -g pnpm@12.21.0
pnpm install --frozen-lockfile --ignore-scripts --filter @ecommerce/consumer-next...
CI_LOW_MEMORY=1 pnpm --filter @ecommerce/consumer-next build

mkdir -p dist
cp -R apps/consumer-next/.next/standalone/. dist/
mkdir -p dist/apps/consumer-next/.next
cp -R apps/consumer-next/.next/static dist/apps/consumer-next/.next/static
if [ -d apps/consumer-next/public ]; then
  cp -R apps/consumer-next/public dist/apps/consumer-next/public
fi
cp run.sh dist/run.sh
chmod 755 dist/run.sh
BUILD
  chmod 755 "$next_tmp/build.sh"

  cat > "$next_tmp/run.sh" <<'RUN'
#!/bin/sh
set -eu
exec node apps/consumer-next/server.js
RUN
  chmod 755 "$next_tmp/run.sh"

  cat > "$next_tmp/execution-config.json" <<CONFIG
{
  "schema_version": 1,
  "build": {
    "runtime_key": "nodejs20",
    "build_script": "build.sh",
    "output_dir": "dist",
    "environment": {},
    "timeout_seconds": 3600
  },
  "runtime": {
    "runtime_key": "nodejs20",
    "start_script": "run.sh",
    "port": 8000,
    "environment": {
      "PORT": "8000",
      "CONSUMER_NEXT_GATEWAY_URL": "${CONSUMER_NEXT_GATEWAY_URL:-https://gateway.apikv.com}"
    }
  }
}
CONFIG

  next_site_id=$(find_or_create_site "${CONSUMER_NEXT_SITE_NAME:-ecommerce-consumer-next}" "ecommerce monorepo, frontend/apps/consumer-next: Next.js 16 App Router SSR consumer storefront (route handler /api/* proxy, zh locale pages); standalone build on nodejs20.")
  ensure_no_active_deployment "$next_site_id"
  deploy_and_wait "$next_site_id" "consumer-next 一键部署" "Remote nodejs20 build of frontend/apps/consumer-next (Next.js App Router, standalone, workspace dep @ecommerce/lantern) via make deploy-trae-consumer-next." function-web "$next_tmp" "$next_tmp/execution-config.json"

  rm -rf "$next_tmp"
  trap - EXIT
}

case "${1:-}" in
  check)
    check_access
    ;;
  consumer)
    deploy_consumer
    ;;
  consumer-next)
    deploy_consumer_next
    ;;
  all)
    deploy_consumer
    deploy_consumer_next
    ;;
  *)
    echo "用法: $0 <check|consumer|consumer-next|all>" >&2
    exit 2
    ;;
esac
