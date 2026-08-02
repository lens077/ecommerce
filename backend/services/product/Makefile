# 默认值
VERSION ?= dev
GOIMAGE ?= golang:1.26.1-alpine3.22
GOOS ?= linux
GOARCH ?= amd64
CGOENABLED ?= 0

# 动态变量
SERVICE = $(shell basename $$PWD)
DOCKER_IMAGE=connect/$(SERVICE):$(VERSION)
REPOSITORY = sumery/$(SERVICE)
REGISTER = ccr.ccs.tencentyun.com
ARM64=linux/arm64
AMD64=linux/amd64
# 本地 make dev/pre 直连集群 Consul KV 读配置。
# consul.app.com(192.168.3.110) 从宿主机访问会超时,所以默认写成可达的 IP;
# 需要走域名时命令行覆盖即可: make dev CONSUL_KV_ADDR=consul.app.com
CONSUL_KV_ADDR ?= 192.168.3.112:8500

.PHONY: k8s-dev
k8s-dev:
	kubectl apply -f deploy/dev

.PHONY: k8s-prod
k8s-prod:
	kubectl apply -f deploy/prod

# 配置数据源二选一,CONFIG_SOURCE 决定;两种情况下 Consul 都照常做服务注册/发现。
# make dev      -> Consul KV(默认,与历史一致)
# make dev-cc   -> 配置中心 config-service

.PHONY: dev
dev:
	SERVICE_NAME="product-service" \
	CONSUL_ENABLED=true \
	CONSUL_ADDR=$(CONSUL_KV_ADDR) \
	CONSUL_PATH=ecommerce/product/dev.yml \
	CONSUL_SCHEME=http \
	CONSUL_INSECURE_SKIP_VERIFY=true \
	go run cmd/server/main.go

.PHONY: dev-cc
dev-cc:
	SERVICE_NAME="product-service" \
	CONSUL_ENABLED=true \
	CONFIG_SOURCE=configcenter \
	CONFIG_CENTER_ADDR=http://127.0.0.1:30010 \
	CONFIG_CENTER_NAMESPACE=product \
	CONFIG_CENTER_ENV=dev \
	CONFIG_CENTER_KEY=bootstrap.yaml \
	go run cmd/server/main.go

.PHONY: test
test:
	go test -short -coverprofile=coverage.out ./...

.PHONY: sqlc
sqlc:
	sqlc generate

.PHONY: api
api:
	# 切换到backend目录运行buf命令，确保proto文件路径在context directory内
	cd ../../ && buf generate --template buf.gen.yaml --path api
	cd ../../ && buf generate --template buf.gen.ts.yaml --path api

.PHONY: generate
generate:
	# 切换到backend目录运行buf命令，确保proto文件路径在context directory内
	cd ../../ && buf generate --template buf.gen.yaml --path api
	cd ../../ && buf generate --template buf.gen.ts.yaml --path api

.PHONY: conf
conf:
	# 切换到backend目录运行buf命令，确保proto文件路径在context directory内
	cd ../../ && buf generate --template buf.gen.yaml --path services/product/internal/conf

.PHONY: docker-build
# 使用 docker 构建镜像
docker-build:
	@echo "构建的微服务: $(SERVICE)"
	@echo "系统: $(GOOS) | CPU架构: $(GOARCH)"
	@echo "镜像名: $(REPOSITORY):$(VERSION)"
	cd ../.. && docker build . \
	  -f ./services/$(SERVICE)/Dockerfile \
	  --progress=plain \
	  -t ecommerce/$(SERVICE):$(VERSION) \
	  --build-arg SERVICE=$(SERVICE) \
	  --build-arg CGOENABLED=$(CGOENABLED) \
	  --build-arg GO_IMAGE=$(GOIMAGE) \
	  --build-arg VERSION=$(VERSION) \
	  --platform $(GOOS)/$(GOARCH)

# 使用方式: make docker-push SERVICE=微服务名
.PHONY: docker-push
docker-push:
	@echo "使用方式: make docker-push SERVICE=微服务名"
	@echo "OS: $(GOOS) | ARCH: $(GOARCH)"
	@echo "Docker image: $(REPOSITORY):$(VERSION)"
	docker tag ecommerce/$(SERVICE):$(VERSION) $(REGISTER)/$(REPOSITORY):$(VERSION)
	docker push $(REGISTER)/$(REPOSITORY):$(VERSION)

.PHONY: docker-deploy
docker-deploy:
	@echo "使用方式: make docker-deploy SERVICE=微服务名"
	@echo "SERVICE=$(SERVICE)"
	make docker-build SERVICE=$(SERVICE)
	@echo "SERVICE=$(SERVICE)"
	make docker-push SERVICE=$(SERVICE)

.PHONY: docker-deployx
# 使用 docker 构建多平台架构镜像
docker-deployx:
	@echo "构建的微服务: $(SERVICE)"
	@echo "平台1: $(ARM64)"
	@echo "平台2: $(AMD64)"
	@echo "镜像名: $(REPOSITORY):$(VERSION)"
	cd ../.. && docker buildx build . \
	  -f ./services/$(SERVICE)/Dockerfile \
	  --progress=plain \
	  -t $(REGISTER)/$(REPOSITORY):$(VERSION) \
	  --build-arg SERVICE=$(SERVICE) \
	  --build-arg CGOENABLED=$(CGOENABLED) \
	  --build-arg GO_IMAGE=$(GOIMAGE) \
	  --build-arg VERSION=$(VERSION) \
	  --platform $(ARM64),$(AMD64) \
	  --push \
	  --cache-from type=registry,ref=$(REGISTER)/$(REPOSITORY):cache \
	  --cache-to type=registry,ref=$(REGISTER)/$(REPOSITORY):cache,mode=max

.PHONY: docker-run
docker-run:
	docker compose up -d
