# 默认值
VERSION ?= dev

# 全部微服务。payment 暂不在列:internal/data 里 NewPaymentRepo 还是注释状态,镜像编译不过。
SERVICES ?= user search product order inventory cart merchant address config

# consul kv 导入导出用的地址。命令行可覆盖: make consul-kv-export CONSUL_ADDR=consul.app.com
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

# 镜像构建统一在各服务目录下做:Dockerfile 只有 services/<svc>/Dockerfile 一份,
# 这里不重复实现,只做「对所有服务跑一遍」的扇出。
# 单个服务请用: cd services/<svc> && make docker-build | docker-deploy | docker-deployx

.PHONY: docker-build-all
# 逐个服务本地单架构构建(不推送)
docker-build-all:
	@for s in $(SERVICES); do \
	  echo "===== docker-build $$s ====="; \
	  $(MAKE) -C services/$$s docker-build VERSION=$(VERSION) || exit 1; \
	done

.PHONY: docker-deployx-all
# 逐个服务多架构构建并推送到镜像仓库(会覆盖远端同名 tag)
docker-deployx-all:
	@echo "即将构建并推送 tag=$(VERSION) 的镜像: $(SERVICES)"
	@for s in $(SERVICES); do \
	  echo "===== docker-deployx $$s ====="; \
	  $(MAKE) -C services/$$s docker-deployx VERSION=$(VERSION) || exit 1; \
	done

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

.PHONY: k8s-dev-all
k8s-dev-all:
	@for s in $(SERVICES); do kubectl apply -f services/$$s/deploy/dev || exit 1; done

.PHONY: k8s-prod-all
k8s-prod-all:
	@for s in $(SERVICES); do kubectl apply -f services/$$s/deploy/prod || exit 1; done
