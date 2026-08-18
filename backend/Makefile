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
# 而扇出循环写的是 `|| exit 1` —— 于是 make k8s-dev-all 每次都在 config 处中断,
# 排在它后面的 payment 永远 apply 不到,报错还长得像普通的 kubectl 报错。
# 现在清单已修正,扇出也改成「收集失败再汇总退出」,见下面各 *-all 目标。
SERVICES ?= user search product order inventory cart merchant address behavior payment

# consul kv 导入导出用的地址。命令行可覆盖: make consul-kv-export CONSUL_ADDR=consul.dev.test
CONSUL_ADDR ?= 192.168.3.112:8500

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

.PHONY: api
api:
	buf generate --template buf.gen.yaml
	buf generate --template buf.gen.ts.yaml

.PHONY: generate
generate:
	buf generate --template buf.gen.yaml
	buf generate --template buf.gen.ts.yaml

.PHONY: conf
conf:
	buf generate --template buf.gen.yaml

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

# ── 便捷部署（推荐入口）─────────────────────────────────────────────
# 底层是仓库根的 scripts/deploy-k8s.sh:先补齐集群里那些不在 Git 的前置状态
# (namespace / tcr-pull-secret / pg-ca-cert),再走权威路径交付。
# 与下面 k8s-*-all 的区别:这里用 helm/ 那份真相源(和 ArgoCD 同一份),
# 下面那两个用各服务的裸 manifest,是应急路径。
DEPLOY_SCRIPT = ../scripts/deploy-k8s.sh

.PHONY: deploy
# 渲染 helm/ 并 apply 全部服务。先看会动什么: make deploy DRY_RUN=1
# 只部分服务: make deploy SERVICES="cart order"
deploy:
	@cd .. && scripts/harness-scars.sh --quiet
	@DRY_RUN="$(DRY_RUN)" SERVICES="$(SERVICES_OVERRIDE)" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  $(DEPLOY_SCRIPT)

.PHONY: un-deploy
# 按 deploy 使用的同一份 helm 清单卸载全部微服务；保留 namespace 与前置 Secret。
# 先看会删什么: make un-deploy DRY_RUN=1
# KUBE_CONTEXT=ecommerce: 指的是 kubeconfig 中名为 ecommerce 的集群上下文，并不是 Kubernetes namespace。
# 只有 kubectl config get-contexts 中确实存在该名称时才需要传它
un-deploy:
	@DEPLOY_ACTION=delete DRY_RUN="$(DRY_RUN)" SERVICES="" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  $(DEPLOY_SCRIPT)

.PHONY: deploy-argocd
# 只补前置状态并 apply ArgoCD 清单,集群状态交给 ArgoCD 拉
deploy-argocd:
	@DEPLOY_MODE=argocd DRY_RUN="$(DRY_RUN)" KUBE_CONTEXT="$(KUBE_CONTEXT)" \
	  $(DEPLOY_SCRIPT)

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

# ⚠️ 这两个目标与 ArgoCD 互斥。裸 manifest 建的是 ecommerce-<svc>-deploy,
# ArgoCD 从 helm/ 建的是 <svc>,两套名字不冲突所以会**同时活着**,而且都用同一个
# SERVICE_NAME 注册进 Consul —— 网关会把流量轮询到两份不同镜像的实例上。
# 集群的权威路径是 helm/ + ArgoCD;这两个目标只在 ArgoCD 不可用时应急手工用。
#
# 先 dry-run 看一眼会动什么: make k8s-dev-all KUBECTL_ARGS=--dry-run=server
KUBECTL_ARGS ?=

.PHONY: k8s-dev-all
k8s-dev-all:
	@$(MAKE) k8s-apply-all K8S_ENV=dev

.PHONY: k8s-prod-all
k8s-prod-all:
	@$(MAKE) k8s-apply-all K8S_ENV=prod

# 内部目标:按 K8S_ENV 扇出。缺目录与 apply 失败分开统计,
# 都不中断循环 —— 一个服务坏掉不该让后面的服务全部漏掉
.PHONY: k8s-apply-all
k8s-apply-all:
	@fail=""; missing=""; \
	for s in $(SERVICES); do \
	  if [ ! -d services/$$s/deploy/$(K8S_ENV) ]; then missing="$$missing $$s"; continue; fi; \
	  echo "===== kubectl apply $$s ($(K8S_ENV)) ====="; \
	  kubectl apply $(KUBECTL_ARGS) -f services/$$s/deploy/$(K8S_ENV) || fail="$$fail $$s"; \
	done; \
	rc=0; \
	if [ -n "$$missing" ]; then echo "❌ 缺 deploy/$(K8S_ENV) 目录:$$missing"; rc=1; fi; \
	if [ -n "$$fail" ]; then echo "❌ apply 失败:$$fail"; rc=1; fi; \
	if [ $$rc -eq 0 ]; then echo "✅ 全部 $(words $(SERVICES)) 个服务已 apply 到 $(K8S_ENV)"; fi; \
	exit $$rc
