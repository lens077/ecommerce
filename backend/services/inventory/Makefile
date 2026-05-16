# 默认值
VERSION ?= dev
GOIMAGE ?= golang:1.26.1-alpine3.22
GOOS ?= linux
GOARCH ?= arm64
CGOENABLED ?= 0

# 动态变量
SERVICE = $(shell basename $$PWD)
DOCKER_IMAGE=connect/$(SERVICE):$(VERSION)
REPOSITORY = sumery/$(SERVICE)
REGISTER = docker.io
ARM64=linux/arm64
AMD64=linux/amd64
CONSUL_ADDR=consul.sumery.com

.PHONY: k8s-dev
k8s-dev:
	kubectl apply -f deploy/dev

.PHONY: k8s-prod
k8s-prod:
	kubectl apply -f deploy/prod

.PHONY: dev
dev:
	CONSUL_ENABLED=false \
	CONSUL_ADDR=$(CONSUL_ADDR) \
	CONSUL_PATH=ecommerce/inventory/dev.yml \
	CONSUL_SCHEME=https \
	CONSUL_INSECURE_SKIP_VERIFY=true \
	go run cmd/server/main.go

.PHONY: prod
prod:
	CONSUL_ENABLED=true \
	CONSUL_ADDR=$(CONSUL_ADDR) \
	CONSUL_PATH=ecommerce/inventory/prod.yml \
	CONSUL_SCHEME=https \
	CONSUL_INSECURE_SKIP_VERIFY=true \
	go run cmd/server/main.go

.PHONY: pre
pre:
	CONSUL_ENABLED=true \
	CONSUL_ADDR=$(CONSUL_ADDR) \
	CONSUL_PATH=ecommerce/inventory/pre.yaml \
	CONSUL_SCHEME=https \
	CONSUL_INSECURE_SKIP_VERIFY=true \
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
	cd ../../ && buf generate --template buf.gen.yaml --path services/inventory/internal/conf

.PHONY: docker-build
docker-build:
	@echo "构建的微服务: $(SERVICE)"
	@echo "系统: $(GOOS) | CPU架构: $(GOARCH)"
	@echo "镜像名: $(REPOSITORY):$(VERSION)"
	cd ../.. && docker build . \
	  -f ./services/$(SERVICE)/Dockerfile \
	  --progress=plain \
	  -t ecommerce/$(SERVICE):dev \
	  --build-arg SERVICE=$(SERVICE) \
	  --build-arg CGOENABLED=0 \
	  --build-arg GOIMAGE=golang:1.26.1-alpine3.22 \
	  --build-arg GOOS=linux \
	  --build-arg GOARCH=amd64 \
	  --build-arg VERSION=dev \
	  --platform linux/amd64

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
	  --build-arg GOIMAGE=$(GOIMAGE) \
	  --build-arg VERSION=$(VERSION) \
	  --platform $(ARM64),$(AMD64) \
	  --push \
	  --cache-from type=registry,ref=$(REGISTER)/$(REPOSITORY):cache \
	  --cache-to type=registry,ref=$(REGISTER)/$(REPOSITORY):cache,mode=max

.PHONY: docker-run
docker-run:
	docker compose up -d
