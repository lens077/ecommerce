# 默认值
VERSION ?= dev

# 全部 10 个微服务。payment 之前不在列(NewPaymentRepo 还注释着、镜像编译不过),
# 现在 repo 层是显式返回 Unimplemented 的桩,编译与启动都正常,已补回。
#
# ⚠️ 这份清单必须与 .service-matrix.yaml 的 services 段逐字一致 ——
# 真相源是 matrix,这里是它的副本。不用 yq 直接派生是因为 yq 不是本机必备
# (CI runner 才有),make 不该因为缺一个工具就跑不动。
# 漂移由 backend/structcheck 的 TestDeploymentListsMatchMatrix 在 CI 里拦住。
#
# 历史教训:config 曾留在这份清单里(它已随配置中心拆去独立仓库、deploy/ 目录已删),
# 而扇出循环写的是 `|| exit 1` —— 于是 make k8s-pre-all 每次都在 config 处中断,
# 排在它后面的 payment 永远 apply 不到,报错还长得像普通的 kubectl 报错。
# 现在清单已修正,扇出也改成「收集失败再汇总退出」,见下面各 *-all 目标。
SERVICES ?= user search product order inventory cart merchant address behavior payment

# consul kv 导入导出用的地址。命令行可覆盖: make consul-kv-export CONSUL_ADDR=consul.dev.test
CONSUL_ADDR ?= 192.168.3.120:8500

# 本机 OTLP 凭据(仓库外, 0600): ~/.config/apikv/otel.mk 定义并 export
# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<token>。
# 缺文件时静默跳过 —— CI 与他人 clone 不受影响, 只是不带鉴权头。
-include $(HOME)/.config/apikv/otel.mk

.PHONY: consul-kv-export
consul-kv-export:
	consul kv export -http-addr=$(CONSUL_ADDR) ecommerce/ > infrastructure/consul/consul-kv.json

.PHONY: consul-kv-import
consul-kv-import:
	cat infrastructure/consul/consul-kv.json | consul kv import -http-addr=$(CONSUL_ADDR) -

.PHONY: test
test:
	go test -short -coverprofile=coverage.out ./...

# 静态检查的基线棘轮(前后端一起跑)。存量由 .lint-baseline/ 冻结,只拦本次新增。
# 存量被修好后 check 会要求刷新基线 —— 基线只许变少,不许留免罪符。
.PHONY: lint-baseline
lint-baseline:
	cd .. && scripts/lint-baseline.sh check

.PHONY: lint-baseline-snapshot
lint-baseline-snapshot:
	cd .. && scripts/lint-baseline.sh snapshot

.PHONY: sqlc
sqlc:
	sqlc generate

# ── 数据库迁移与种子（goose 以库形态内嵌在 tools/dbmigrate，无外部 CLI 依赖）────
# 常用: make migrate-up / migrate-status / seed;单服务: make migrate-up MIGRATE_SVC=cart
# DSN 优先级: DB_URI > DB_SOURCE > 本地默认(127.0.0.1:15432/ecommerce)。
# 首次接管已手工建过表的存量库(如集群 CNPG): make migrate-baseline。
# 详见 tools/dbmigrate/README.md;迁移写法纪律(expand-contract)见 docs/DEVOPS.md。
MIGRATE_SVC ?= all

.PHONY: migrate-up migrate-status migrate-version migrate-down migrate-down-to migrate-baseline migrate-create seed seed-down
migrate-up:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) up

migrate-status:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) status

migrate-version:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) version

migrate-down:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) down

# 用法: make migrate-down-to MIGRATE_SVC=cart V=0
migrate-down-to:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) down-to $(V)

migrate-baseline:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) baseline

# 用法: make migrate-create MIGRATE_SVC=cart NAME=add_coupon_column
migrate-create:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) create $(NAME)

seed:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) seed

seed-down:
	go run ./tools/dbmigrate -svc $(MIGRATE_SVC) seed-down

# 集群 CNPG 全量建表(重建场景一键; 2026-08-21 真库实测): 临时 LB 直连 pg-main。
# 空库: make migrate-cnpg-up SEED=1;接管存量库: make migrate-cnpg-up CMD=baseline。
# 详见 tools/dbmigrate/README.md「集群重建全量建表」。
.PHONY: migrate-cnpg-up
migrate-cnpg-up:
	./tools/dbmigrate/cnpg-up.sh

# backend/buf.yaml 的模块根是整个 backend；不限制路径会把 10 份同包名 conf.proto 和
# 各服务遗留的 third_party 副本一起装入同一 image，导致重复符号。api 目标只生成公开契约。
# TS 插件由 frontend 根 workspace 固定版本，避免依赖用户机器上的全局 npm 包。
PROTOC_GEN_ES_DIR ?= $(abspath ../frontend/node_modules/.bin)

# OpenAPI（Swagger）生成器。版本必须与 buf.gen.openapi.yaml 头注释里钉住的
# v0.19.1 一致 —— 插件升级会改变 protovalidate 约束在 schema 里的映射方式，
# 本地与 CI 用不同版本会得到不一致的 spec。
PROTOC_GEN_OPENAPI ?= protoc-gen-connect-openapi

# ── api 生成：Go / OpenAPI / TS 三条产物链互不阻塞 ────────────────────
# 历史教训（2026-10-18）：原先 api 是一条直线，protoc-gen-es 缺失时（frontend 没跑
# pnpm install）第一行就 abort，排在后面的 Go 与 OpenAPI 产物一个都生成不出来 ——
# 表现就是「make api 没用」，而屏幕上看不出文档其实被饿死了。
# 现在拆成三个子目标，沿用本 Makefile 通行的「收集失败再汇总退出」（见 conf /
# docker-build-all）：任意一条工具链缺失不再饿死其它产物，最后统一汇总。
.PHONY: api api-go api-openapi api-ts
api:
	@fail=""; \
	for t in api-go api-openapi api-ts; do \
	  echo "===== $$t ====="; \
	  $(MAKE) $$t || fail="$$fail $$t"; \
	done; \
	if [ -n "$$fail" ]; then echo "❌ 生成失败的步骤:$$fail"; exit 1; fi; \
	if [ ! -x "$(PROTOC_GEN_ES_DIR)/protoc-gen-es" ]; then \
	  echo "✅ Go / OpenAPI 已生成；TS stub 因缺 protoc-gen-es 被跳过（见上）"; \
	else \
	  echo "✅ Go / OpenAPI / TS 产物均已生成"; \
	fi

# buf.gen.yaml → api/<svc>/v1/{*.pb.go,*.connect.go}
.PHONY: api-go
api-go:
	@command -v protoc-gen-go >/dev/null 2>&1 || { \
		echo "缺少 protoc-gen-go；安装：go install google.golang.org/protobuf/cmd/protoc-gen-go@latest" >&2; \
		exit 1; \
	}
	@command -v protoc-gen-connect-go >/dev/null 2>&1 || { \
		echo "缺少 protoc-gen-connect-go；安装：go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest" >&2; \
		exit 1; \
	}
	buf generate --template buf.gen.yaml --path api

# buf.gen.openapi.yaml → api/<svc>/v1/<name>.openapi.json（OpenAPI 3.1，Connect 形态）
# 产物与 .pb.go 并列、随代码提交 —— proto 改动和文档改动落在同一个 diff 里可审。
#
# 末尾顺手刷新 openapi/specs.json（文档页面顶栏的清单）。刻意不引 python/yq：
# 纯 ls/sort 就够，理由同 SERVICES 那段「make 不该因为缺一个工具跑不动」。
# 新增一个 api/<svc>/v1/*.proto 后这里不需要改，for 循环自己会发现。
#
# ⚠️ 产出是 **OpenAPI 3.1**，Swagger UI 不支持它（其版本校验只接受
#    `swagger: "2.0"` 与 `openapi: 3.0.n`），故渲染器不用 Swagger UI，详见
#    openapi/index.html 头注释。想换回 Swagger UI 就得先把 spec 转成 3.0。
.PHONY: api-openapi
api-openapi:
	@command -v $(PROTOC_GEN_OPENAPI) >/dev/null 2>&1 || { \
		echo "缺少 $(PROTOC_GEN_OPENAPI)；安装：go install github.com/sudorandom/protoc-gen-connect-openapi@v0.19.1" >&2; \
		exit 1; \
	}
	buf generate --template buf.gen.openapi.yaml --path api
	@{ \
	  echo "["; \
	  sep=""; \
	  for f in $$(cd api && ls */v1/*.openapi.json | sort); do \
	    printf '%s{"name": "api/%s", "url": "../api/%s"}' "$$sep" "$$f" "$$f"; \
	    sep=","; \
	  done; \
	  echo; echo "]"; \
	} > openapi/specs.json
	@echo "✅ OpenAPI spec 已生成：$$(ls api/*/v1/*.openapi.json | wc -l | tr -d ' ') 份 + openapi/specs.json"

# buf.gen.ts.yaml → frontend 消费的 TS stub。
# ⚠️ 与其它两条不同：缺 protoc-gen-es 时**降级为警告跳过**，不让整个 api 目标红掉
# （理由：它是 frontend 的工具链，缺它不该拦住后端契约与文档的生成）。
# 代价是 TS stub 会停留在旧版本 —— 所以这里必须明说，不能默默跳过。
.PHONY: api-ts
api-ts:
	@if [ ! -x "$(PROTOC_GEN_ES_DIR)/protoc-gen-es" ]; then \
		echo "⚠️  跳过 TS stub 生成：$(PROTOC_GEN_ES_DIR)/protoc-gen-es 不存在" >&2; \
		echo "   需要先装前端依赖：cd ../frontend && pnpm install" >&2; \
		echo "   跳过的后果：frontend 的 TS stub 不会随本次 proto 改动更新 —— 提交前请确认。" >&2; \
		exit 0; \
	fi; \
	PATH="$(PROTOC_GEN_ES_DIR):$$PATH" buf generate --template buf.gen.ts.yaml --path api

# 起本地静态服务打开 API 文档。
# ⚠️ 必须经 HTTP：直接双击 openapi/index.html（file://）时浏览器会以 CORS 为由
#    拒绝读取本地 spec，页面白屏且只在控制台报错。
# 没有 python3 时等价替代：npx serve -l $(APIDOCS_PORT) backend
#
# 端口被占时给一句人话，而不是甩一段 socket traceback：
# 常见原因是上次没退干净（或另一个 worktree 里还挂着一个）。先确认那个实例服务的是
# 不是同一份文件 —— 是就直接用，不是就先杀掉再跑。
APIDOCS_PORT ?= 8081
.PHONY: apidocs
apidocs:
	@python3 -c "import socket,sys; sys.exit(1 if socket.socket().connect_ex(('127.0.0.1', $(APIDOCS_PORT)))==0 else 0)" || { \
		echo "⚠️  端口 $(APIDOCS_PORT) 已被占用，起不来服务。"; \
		echo "   已有一个实例在跑？若它服务的是同一份文件，直接打开 http://localhost:$(APIDOCS_PORT)/openapi/index.html 即可。"; \
		echo "   不是同一份就先结束它：lsof -ti :$(APIDOCS_PORT) | xargs kill"; \
		echo "   或者换个端口：make apidocs APIDOCS_PORT=8082"; \
		exit 1; \
	}
	@echo "API 文档 → http://localhost:$(APIDOCS_PORT)/openapi/index.html"
	python3 -m http.server $(APIDOCS_PORT) --bind 127.0.0.1

.PHONY: generate
generate:
	buf generate --template buf.gen.yaml
	buf generate --template buf.gen.ts.yaml

.PHONY: conf
conf:
	@fail=""; \
	for s in $(SERVICES); do \
	  echo "===== conf $$s ====="; \
	  buf generate --template buf.gen.yaml \
	    --path services/$$s/internal/conf/v1/conf.proto || fail="$$fail $$s"; \
	done; \
	if [ -n "$$fail" ]; then echo "❌ conf 生成失败:$$fail"; exit 1; fi; \
	echo "✅ 全部 $(words $(SERVICES)) 个服务的配置 protobuf 已生成"

# ── 配置 JSON Schema(IDE 对 configs/*.yml 的高亮/补全/校验)──────────
# 从各服务 internal/conf/v1/conf.proto 的 Bootstrap 生成自包含 JSON Schema 到
# services/<svc>/configs/bootstrap.schema.json(protovalidate 的 in/required
# 会分别变成 enum/required)。IDEA 侧的文件映射在 .idea/jsonSchemas.xml(被
# gitignore):首次 clone 后该文件不存在,重跑一次映射生成或手动在
# Settings → JSON Schema Mappings 里指到各服务的 bootstrap.schema.json。
# 改了 conf.proto 要重跑本目标,schema 与 conf.pb.go 一样随代码提交。
#
# 后处理:google.protobuf.Duration 生成的是 format:"duration"(ISO 8601,
# 形如 PT5S),但配置加载走 mapstructure + time.ParseDuration,实际写法是
# Go 风格 "5s"/"1m30s" —— 替换成 Go duration 正则,否则 IDE 把合法配置标红。
.PHONY: conf-schema
conf-schema:
	@fail=""; \
	for s in $(SERVICES); do \
	  echo "===== conf-schema $$s ====="; \
	  tmp=$$(mktemp -d) && \
	  buf generate --template buf.gen.jsonschema.yaml \
	    --path services/$$s/internal/conf/v1/conf.proto -o $$tmp && \
	  sed 's#"format": "duration",#"pattern": "^-?([0-9]+([.][0-9]+)?(ns|us|µs|ms|s|m|h))+$$",#' \
	    $$tmp/conf.v1.Bootstrap.schema.bundle.json > services/$$s/configs/bootstrap.schema.json \
	    || fail="$$fail $$s"; \
	  rm -rf $$tmp; \
	done; \
	if [ -n "$$fail" ]; then echo "❌ schema 生成失败:$$fail"; exit 1; fi; \
	echo "✅ 全部 $(words $(SERVICES)) 个服务的 bootstrap.schema.json 已生成"

# 镜像构建统一在各服务目录下做:Dockerfile 只有 services/<svc>/Dockerfile 一份,
# 这里不重复实现,只做「对所有服务跑一遍」的扇出。
# 单个服务请用: cd services/<svc> && make docker-build | docker-deploy | docker-deployx

.PHONY: docker-build-all
# 逐个服务本地单架构构建(不推送)
docker-build-all:
	@fail=""; \
	for s in $(SERVICES); do \
	  echo "===== docker-build $$s ====="; \
	  $(MAKE) -C services/$$s docker-build VERSION=$(VERSION) || fail="$$fail $$s"; \
	done; \
	if [ -n "$$fail" ]; then echo "❌ 构建失败的服务:$$fail"; exit 1; fi; \
	echo "✅ 全部 $(words $(SERVICES)) 个服务构建完成"

.PHONY: docker-deployx-all
# 逐个服务多架构构建并推送到镜像仓库(会覆盖远端同名 tag)
docker-deployx-all:
	@echo "即将构建并推送 tag=$(VERSION) 的镜像: $(SERVICES)"
	@fail=""; \
	for s in $(SERVICES); do \
	  echo "===== docker-deployx $$s ====="; \
	  $(MAKE) -C services/$$s docker-deployx VERSION=$(VERSION) || fail="$$fail $$s"; \
	done; \
	if [ -n "$$fail" ]; then echo "❌ 构建/推送失败的服务:$$fail"; exit 1; fi; \
	echo "✅ 全部 $(words $(SERVICES)) 个服务已推送 tag=$(VERSION)"

.PHONY: compose-up
# 一把拉起全部服务,环境变量与各服务的 make dev 一致
compose-up:
	docker network inspect ecommerce >/dev/null 2>&1 || docker network create ecommerce
	docker compose up -d

.PHONY: compose-down
compose-down:
	docker compose down

.PHONY: compose-logs
compose-logs:
	docker compose logs -f --tail=100

# ── 部署入口 ────────────────────────────────────────────────────────
# 两条路径、同一套集群对象(2026-09-06 起,由仓库根 scripts/verify-deploy-parity.sh 强制等价):
#   make deploy        渲染 helm/ 并 apply —— 给 helm / ArgoCD 使用者
#   make k8s-pre-all   逐服务 kubectl apply -k backend/services/<svc>/deploy/base —— 给 kubectl 使用者
#   make k8s-prod-all  同上,overlays/prod(只钉 prod 镜像),需显式 KUBE_CONTEXT
#   环境差异只在 overlays/prod(裸侧)与 helm/values-prod.yaml(helm 侧),base / values.yaml 即 pre 基线
# 两者建的是同名同 ns 的资源,先后跑、混着跑都收敛到一样的状态,不会再出现两套并存。
# 共享的 SA / CiliumNetworkPolicy / ExternalSecret 只在 helm/files/ 有一份,裸路径经
# scripts/render-zero-trust.sh 从同一处渲染。
# 底层是仓库根的 scripts/deploy-k8s.sh:先补齐集群里那些不在 Git 的前置状态
# (namespace / tcr-pull-secret / pg-ca-cert),再交付。
DEPLOY_SCRIPT = ../scripts/deploy-k8s.sh

.PHONY: deploy
# 渲染 helm/ 并 apply 全部工作负载。先看会动什么: make deploy DRY_RUN=1
# 只部分服务: make deploy SERVICES="cart order"
deploy:
	@cd .. && scripts/harness-scars.sh --quiet
	@DRY_RUN="$(DRY_RUN)" SERVICES="$(SERVICES_OVERRIDE)" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  $(DEPLOY_SCRIPT)

.PHONY: un-deploy
# 按 deploy 使用的同一份 helm 清单卸载全部工作负载;保留 namespace 与前置 Secret。
# 先看会删什么: make un-deploy DRY_RUN=1
# KUBE_CONTEXT=ecommerce: 指的是 kubeconfig 中名为 ecommerce 的集群上下文,并不是 Kubernetes namespace。
# 只有 kubectl config get-contexts 中确实存在该名称时才需要传它
un-deploy:
	@DEPLOY_ACTION=delete DRY_RUN="$(DRY_RUN)" SERVICES="" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  $(DEPLOY_SCRIPT)

.PHONY: deploy-argocd
# 只补前置状态并 apply ArgoCD 清单,集群状态交给 ArgoCD 拉
deploy-argocd:
	@DEPLOY_MODE=argocd DRY_RUN="$(DRY_RUN)" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  $(DEPLOY_SCRIPT)

.PHONY: deploy-parity
# 两份真相源是否仍等价(改了 helm/ 或 deploy/ 任一侧后必跑;按 dev / pre 逐环境比)
deploy-parity:
	@cd .. && scripts/verify-deploy-parity.sh

.PHONY: deploy-status
deploy-status:
	kubectl get pods,svc -n ecommerce
	@echo "--- ArgoCD:"
	@kubectl get application -n argocd 2>/dev/null || echo "(无 ArgoCD 或无权限)"
	@cd .. && scripts/harness-scars.sh

# 软门禁伤疤面板:把三处被放行的存量问题(lint 基线 / 部署覆盖例外 / 同构漂移基线)
# 集中显形。永远退出 0,是显形工具不是门禁。
.PHONY: scars
scars:
	@cd .. && scripts/harness-scars.sh

# 裸 manifest 路径(kustomize:pre = deploy/base,prod = deploy/overlays/prod)。与 make deploy 建的是同一套资源,
# ArgoCD 若在自动同步,它会把这里 apply 的内容按 helm/ 再同步一遍——因为两边等价,结果是 no-op。
# 环境只有 pre / prod(2026-09-15 起;dev 集群已删除,dev 层与局域网直连一并移除)。
# 别再造一份没人 apply 的目录(2026-09-06 删掉的旧 deploy/prod 就是这么烂掉的)。
#
# 先 dry-run 看一眼会动什么: make k8s-pre-all KUBECTL_ARGS=--dry-run=server
KUBECTL_ARGS ?=
POSTGRES_EGRESS_CIDR ?=
POSTGRES_SSH_ALIAS ?= node1
# 后端服务之外、同属这套集群对象的裸 manifest(VPA 与两个前端)。
# 这份清单与 scripts/verify-deploy-parity.sh 的 raw_sources 一致,少一条那边就会多出「只有 helm 有」。
K8S_EXTRA_MANIFESTS ?= ../application-vpa.yml
K8S_FRONTEND_OVERLAYS ?= $(if $(filter prod,$(K8S_ENV)),../frontend/apps/consumer/deploy/overlays/prod ../frontend/apps/consumer-next/deploy/overlays/prod,../frontend/apps/consumer/deploy/pre ../frontend/apps/consumer-next/deploy/base)
# pre 直接 apply base;prod 走 overlays/prod
K8S_DIR = $(if $(filter prod,$(K8S_ENV)),overlays/prod,base)
KUBE_CONTEXT ?=
KUBECTL = kubectl $(if $(KUBE_CONTEXT),--context $(KUBE_CONTEXT),)

.PHONY: k8s-prod-all
k8s-prod-all:
	@test -n "$(KUBE_CONTEXT)" || { echo "prod requires explicit KUBE_CONTEXT" >&2; exit 1; }
	@$(MAKE) k8s-apply-all K8S_ENV=prod K8S_FRONTEND_OVERLAYS="../frontend/apps/consumer/deploy/overlays/prod ../frontend/apps/consumer-next/deploy/overlays/prod"

.PHONY: k8s-pre-all
k8s-pre-all:
	@$(MAKE) k8s-apply-all K8S_ENV=pre

# 内部目标:按 K8S_ENV 扇出。缺目录与 apply 失败分开统计,
# 都不中断循环 —— 一个服务坏掉不该让后面的服务全部漏掉
.PHONY: k8s-apply-all
k8s-apply-all:
	@test -z "$(NAMESPACE)" -o "$(NAMESPACE)" = ecommerce || { echo "raw manifests target ecommerce; refusing a different migration namespace" >&2; exit 1; }
	@if [ "$(K8S_ENV)" = prod ] && [ -z "$(KUBE_CONTEXT)" ]; then echo "prod requires explicit KUBE_CONTEXT" >&2; exit 1; fi
	@case "$(strip $(KUBECTL_ARGS))" in ""|--dry-run=server|--dry-run=client|"--dry-run server"|"--dry-run client") ;; *) echo "KUBECTL_ARGS must be empty or a single client/server dry-run option" >&2; exit 1 ;; esac
	@DEPLOY_ENV="$(K8S_ENV)" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  DRY_RUN="$(strip $(KUBECTL_ARGS))" bash ../scripts/deploy-db-migrations.sh
	@tmp=$$(mktemp "$${TMPDIR:-/tmp}/ecommerce-zero-trust.XXXXXX"); \
	trap 'rm -f "$$tmp"' EXIT; \
	echo "===== render and apply shared zero-trust + otel-auth (helm/files) ====="; \
	POSTGRES_EGRESS_CIDR="$(POSTGRES_EGRESS_CIDR)" POSTGRES_SSH_ALIAS="$(POSTGRES_SSH_ALIAS)" \
	  DEPLOY_ENV="$(K8S_ENV)" ../scripts/render-zero-trust.sh > "$$tmp" || exit 1; \
	$(KUBECTL) apply $(KUBECTL_ARGS) -f "$$tmp" || exit 1; \
	fail=""; missing=""; \
	for s in $(SERVICES); do \
	  dir=services/$$s/deploy/$(K8S_DIR); \
	  if [ ! -f $$dir/kustomization.yaml ]; then missing="$$missing $$s"; continue; fi; \
	  echo "===== kubectl apply -k $$s ($(K8S_DIR)) ====="; \
	  $(KUBECTL) apply $(KUBECTL_ARGS) -k $$dir || fail="$$fail $$s"; \
	done; \
	for extra in $(K8S_EXTRA_MANIFESTS); do \
	  echo "===== kubectl apply $$extra ====="; \
	  $(KUBECTL) apply $(KUBECTL_ARGS) -f "$$extra" || fail="$$fail $$extra"; \
	done; \
	for overlay in $(K8S_FRONTEND_OVERLAYS); do \
	  $(KUBECTL) apply $(KUBECTL_ARGS) -k "$$overlay" || fail="$$fail $$overlay"; \
	done; \
	rc=0; \
	if [ -n "$$missing" ]; then echo "❌ 缺 deploy/$(K8S_DIR)/kustomization.yaml:$$missing"; rc=1; fi; \
	if [ -n "$$fail" ]; then echo "❌ apply 失败:$$fail"; rc=1; fi; \
	if [ $$rc -eq 0 ]; then echo "✅ 全部 $(words $(SERVICES)) 个服务已 apply 到 $(K8S_ENV)"; fi; \
	exit $$rc
