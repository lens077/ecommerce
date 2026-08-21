# 默认值
VERSION ?= dev
GOIMAGE ?= golang:1.26.5-alpine3.24
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
# 本地服务注册使用的 Consul 地址（consul.dev.test 从宿主机不通）
CONSUL_ADDR_LOCAL ?= 192.168.3.120:8500
CART_SOURCE_CONFIG ?= configs/source.dev.yaml

.PHONY: k8s-dev
k8s-dev:
	kubectl apply -f deploy/dev

.PHONY: k8s-prod
k8s-prod:
	kubectl apply -f deploy/prod

# Cart 通过独立 config-center SDK 读取本地 selector，只允许 config_center；
# Consul 仅用于本服务注册发现。

.PHONY: dev
dev:
	SERVICE_NAME="cart-service" \
	CONSUL_ENABLED=true \
	CONFIG_SOURCE_FILE=$(CART_SOURCE_CONFIG) \
	CONSUL_ADDR=$(CONSUL_ADDR_LOCAL) \
	CONSUL_SCHEME=http \
	CONSUL_INSECURE_SKIP_VERIFY=true \
	go run cmd/server/main.go

.PHONY: dev-file
dev-file:
	env -u CONFIG_SOURCE_FILE \
	CONFIG_SOURCE=file \
	CONFIG_FILE=configs/dev.yml \
	go run cmd/server/main.go

.PHONY: test
test:
	go test -short -coverprofile=coverage.out ./...

.PHONY: sqlc
sqlc:
	sqlc generate

.PHONY: api
api:
	cd ../../ && buf generate --template buf.gen.yaml --path api
	cd ../../ && buf generate --template buf.gen.ts.yaml --path api

.PHONY: generate
generate:
	cd ../../ && buf generate --template buf.gen.yaml --path api
	cd ../../ && buf generate --template buf.gen.ts.yaml --path api

.PHONY: conf
conf:
	cd ../../ && buf generate --template buf.gen.yaml --path services/cart/internal/conf

.PHONY: docker-build
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
