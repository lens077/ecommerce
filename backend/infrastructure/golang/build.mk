REPOSITORY = sumery/golang
REGISTER = ccr.ccs.tencentyun.com
ARM64=linux/arm64
AMD64=linux/amd64
VERSION=1.25.1

.PHONY: docker-deployx
# 使用 docker 构建多平台架构镜像
docker-deployx:
	@echo "构建的微服务: $(SERVICE)"
	@echo "平台1: $(ARM64)"
	@echo "平台2: $(AMD64)"
	@echo "镜像名: $(REPOSITORY):$(VERSION)"
	docker buildx build . \
	  -f ./Dockerfile \
	  --progress=plain \
	  -t $(REGISTER)/$(REPOSITORY):$(VERSION) \
	  --platform $(ARM64),$(AMD64) \
	  --push \
	  --cache-from type=registry,ref=$(REGISTER)/$(REPOSITORY):cache \
	  --cache-to type=registry,ref=$(REGISTER)/$(REPOSITORY):cache,mode=max
