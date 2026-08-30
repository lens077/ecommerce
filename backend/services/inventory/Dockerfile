ARG GO_IMAGE=golang:1.27.0-alpine3.24
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS compile

ARG TARGETOS=linux
ARG TARGETARCH
ARG SERVICE
ARG VERSION=dev
ARG GOPROXY=https://goproxy.cn,direct
ARG CGOENABLED=0

WORKDIR /build

# 挂载依赖缓存
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download -x

# 微服务代码
COPY services/${SERVICE}/ ./services/${SERVICE}/

# 微服务依赖的公共包
COPY api/ ./api/
COPY constants/ ./constants/
# backend/pkg 是跨服务共享包(gorse 客户端等)。product/behavior 直接 import 它,
# 少这一行它们在容器里编译不过 —— behavior 因此从来没有产出过镜像。
# 十份 Dockerfile 保持逐字一致,不按用没用到分叉。
COPY pkg/ ./pkg/

# 编译代码，进入具体的服务目录或指定完整的包路径
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    GOOS=$TARGETOS GOARCH=$TARGETARCH CGO_ENABLED=$CGOENABLED \
    # 在根目录运行 build，但指向对应微服务的 main.go
    go build -ldflags="-s -w -X main.Version=$VERSION" \
    -o /app/service ./services/${SERVICE}/cmd/server && \
    chmod +x /app/service

# 最终镜像部分
FROM alpine:3.24 AS final

# 安装必要的依赖。
# apk upgrade 是 Trivy 门禁要求的:基础镜像 tag 刷新滞后于 alpine 仓库的安全更新,
# 2026-08-29 实测 alpine:3.24 内置 libcrypto3/libssl3 3.5.7-r0,而仓库已有修复了
# CVE-2026-14456 的 3.5.8-r0。不 upgrade 会被签名前扫描直接拦下。
RUN apk upgrade --no-cache && apk add --no-cache libc6-compat

# 创建非root用户
RUN addgroup -g 1000 appuser && adduser -u 1000 -G appuser -D appuser
WORKDIR /app

# 复制可执行文件
COPY --from=compile --chown=appuser:appuser /app/service /app/

# 切换到非root用户
USER appuser

# 设置环境变量
ENV CONFIG_PATH=/app/configs/config.yaml

# 运行微服务的命令
ENTRYPOINT ["/app/service"]
