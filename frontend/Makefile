# 默认值
VERSION ?= dev

# 动态变量
SERVICE = $(shell basename $$PWD)
DOCKER_IMAGE=ecommerce/$(SERVICE):$(VERSION)
REPOSITORY = sumery/frontend
REGISTER = ccr.ccs.tencentyun.com
ARM64=linux/arm64
AMD64=linux/amd64

.PHONY: next-dev
next-dev:
	pnpm dev:consumer-next

.PHONY: docker-deploy
docker-deploy:
	@echo "使用方式: make docker-deploy SERVICE=微服务名"
	@echo "SERVICE=$(SERVICE)"
	make docker-build SERVICE=$(SERVICE)
	@echo "SERVICE=$(SERVICE)"
	make docker-push SERVICE=$(SERVICE)

.PHONY: consumer-deployx
# 使用 docker 构建多平台架构镜像
consumer-deployx:
	@echo "构建的微服务: $(SERVICE)"
	@echo "平台1: $(ARM64)"
	@echo "平台2: $(AMD64)"
	@echo "镜像名: $(REPOSITORY):$(VERSION)"
	docker buildx build . \
	  -f apps/consumer/Dockerfile \
	  --progress=plain \
	  -t $(REGISTER)/$(REPOSITORY):$(VERSION) \
	  --build-arg SERVICE=$(SERVICE) \
	  --build-arg VERSION=$(VERSION) \
	  --platform $(ARM64),$(AMD64) \
	  --push \
	  --cache-from type=registry,ref=$(REGISTER)/$(REPOSITORY):cache \
	  --cache-to type=registry,ref=$(REGISTER)/$(REPOSITORY):cache,mode=max

.PHONY: docker-run
docker-run:
	docker compose up -d

# ---- EdgeOne Pages 部署（consumer 消费者端 → 线上 production）----
#
# consumer 是静态 SPA，构建产物 apps/consumer/dist **直传** EdgeOne Pages（中国站），
# 不走云端构建：monorepo + vp 工具链（buf 生成物、workspace 提升）在云端构建农场不可靠，
# 本地构建后直传最稳。CI 自动部署见 .github/workflows/edgeone-pages.yml。
#
# 用法（在 frontend/ 目录下）：
#   export EDGEONE_TOKEN=<EdgeOne Pages API Token>   # 中国站控制台 → API Token 生成
#   make deploy-edgeone            # 构建 + 部署，一步到位
#   make deploy-edgeone-dist       # 只部署已有 dist（跳过构建）
#
# Token 只从环境变量读，**不要**写进仓库或 Makefile（AGENTS.md 硬规则 4）。
# 可调变量：EDGEONE_PROJECT / EDGEONE_SITE / EDGEONE_AREA / EDGEONE_CLI。

EDGEONE_PROJECT ?= ecommerce-consumer
EDGEONE_SITE ?= china
EDGEONE_AREA ?= global
EDGEONE_CLI ?= edgeone

.PHONY: consumer-build deploy-edgeone deploy-edgeone-dist

# 构建 consumer 生产产物到 apps/consumer/dist（等价 pnpm --filter @ecommerce/consumer build）
consumer-build:
	pnpm --filter @ecommerce/consumer build

# 只部署已有产物，不重新构建
deploy-edgeone-dist:
	@test -d apps/consumer/dist || { \
		echo "apps/consumer/dist 不存在：先执行 make consumer-build（或 pnpm --filter @ecommerce/consumer build）" >&2; \
		exit 1; \
	}
	@test -n "$(EDGEONE_TOKEN)" || { \
		echo "缺少 EDGEONE_TOKEN：先 export EDGEONE_TOKEN=<EdgeOne Pages API Token>（中国站控制台 → API Token 生成）" >&2; \
		exit 1; \
	}
	@command -v $(EDGEONE_CLI) >/dev/null 2>&1 || { \
		echo "未找到 $(EDGEONE_CLI)：先 npm install -g edgeone，或用 EDGEONE_CLI=<绝对路径> 覆盖" >&2; \
		exit 1; \
	}
	$(EDGEONE_CLI) login --site $(EDGEONE_SITE) --token "$(EDGEONE_TOKEN)"
	$(EDGEONE_CLI) makers deploy apps/consumer/dist -n $(EDGEONE_PROJECT) -a $(EDGEONE_AREA)

# 构建 + 部署
deploy-edgeone: consumer-build deploy-edgeone-dist

# ---- EdgeOne Pages 部署（consumer-next Next.js SSR → 线上 production）----
#
# consumer-next 与 consumer 的部署机制不同：consumer 是静态 SPA，可本地构建后直传；
# consumer-next 是 Next.js SSR，需要 Node 运行时，EdgeOne 的 `makers deploy` 直传型项目
# 不识别 SSR（已实测：建项目成功、部署步 Failed）。因此 consumer-next 走 EdgeOne Git 集成的
# 云端构建：在控制台把本仓库连到 Pages 项目（根目录 frontend），push 即自动构建部署。
# 本地 `make` 只负责构建校验与产出制品，真正的上线由 Git push / 控制台重新部署触发。
#
# 用法（在 frontend/ 目录下）：
#   make consumer-next-build     # 仅本地构建（EDGEONE_BUILD=1，关闭 standalone）
#   make deploy-edgeone-next    # 本地构建 + 打印手动上线指引（push / 控制台 redeploy）
#
# 云端构建配置见 apps/consumer-next/edgeone.json（EdgeOne 项目根目录必须指向该应用目录，否则框架识别失败）；
# 运行时环境变量 CONSUMER_NEXT_GATEWAY_URL（公网网关地址）
# 需在 EdgeOne 控制台项目设置中配置，不要写进仓库。

EDGEONE_NEXT_PROJECT ?= ecommerce-consumer-next

.PHONY: consumer-next-build deploy-edgeone-next

# 本地构建 consumer-next 生产产物（等价 pnpm --filter @ecommerce/consumer-next build）
consumer-next-build:
	EDGEONE_BUILD=1 pnpm --filter @ecommerce/consumer-next build

# 本地构建 + 手动上线指引（SSR 不走 CLI 直传，上线由 EdgeOne Git 集成完成）
deploy-edgeone-next: consumer-next-build
	@echo ""
	@echo "本地构建已完成（apps/consumer-next/.next）。consumer-next 是 Next.js SSR，"
	@echo "EdgeOne 的 CLI 直传型项目不支持 SSR 运行时，故不能像 consumer 那样直接上传。"
	@echo "请择一完成上线："
	@echo "  1) git push 到 main  → EdgeOne Git 集成自动云端构建并部署；"
	@echo "  2) 在 EdgeOne 控制台对 $(EDGEONE_NEXT_PROJECT) 项目点「重新部署」。"
	@echo "（运行时环境变量 CONSUMER_NEXT_GATEWAY_URL 需已在控制台填入公网网关地址）"
