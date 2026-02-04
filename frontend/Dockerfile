# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=22.19.0
ARG PNPM_VERSION=10.20.0

################################################################################
# Use node image for base image for all stages.
FROM node:${NODE_VERSION}-alpine as base

# Set working directory for all build stages.
WORKDIR /usr/src/app

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

################################################################################
# Create a stage for installing production dependecies.
FROM base as deps

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.local/share/pnpm/store to speed up subsequent builds.
# Leverage bind mounts to package.json and pnpm-lock.yaml to avoid having to copy them
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --prod --frozen-lockfile

################################################################################
# Create a stage for building the application.
FROM deps as build

# Download additional development dependencies before building, as some projects require
# "devDependencies" to be installed to build. If you don't need this, remove this step.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the source files into the image.
COPY . .
# Run the build script.
RUN pnpm build

################################################################################
# Final stage: Use Caddy to serve the built static assets for a minimal image.
# We switch to caddy:alpine to drastically reduce the final image size.
FROM caddy:alpine as final

# 1. Caddy Configuration for Single Page Application (SPA)
# 创建一个 Caddyfile，监听 80 端口，并配置 try_files 以支持 SPA 路由。
RUN cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
    root * /usr/share/caddy

    # 开启 gzip 压缩，优化前端加载
    encode gzip

    # ---- API 反向代理配置 ----
    # 匹配所有以 /api 开头的请求
    handle /api/* {
        # 剥离 /api 前缀 (例如 /api/user -> /user)
        # 如果你的网关本身就需要 /api 前缀，则去掉这一行
        uri strip_prefix /api

        # 反向代理到环境变量指定的网关地址
        reverse_proxy {$GATEWAY_URL:http://localhost:8080} {
            # 传递原始 Host 头，或者根据网关需求修改
            header_up Host {upstream_hostport}
            header_up X-Real-IP {remote_host}
        }
    }

    # ---- 前端静态资源配置 ----
    # 如果不是 /api 请求，则视为静态资源请求
    handle {
        try_files {path} /index.html
        file_server
    }

    header {
        Strict-Transport-Security max-age=31536000;
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
    }
}
EOF

# 2. Copy the built static assets from the build stage into Caddy's default web root.
# Caddy 默认以非 root 用户 (caddy) 运行，因此我们使用 --chown 确保权限正确。
COPY --from=build --chown=caddy:caddy /usr/src/app/dist /usr/share/caddy
