# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.6.0

# 基础层：安装 pnpm
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

# 依赖层：利用 Docker 层缓存，仅复制包管理文件
FROM base AS deps

# 复制 workspace 配置和锁文件
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
# 如果有根 package.json 也需要复制（你的仓库根目录下没有，但如果有的话加上）
# COPY package.json ./

# 复制所有 workspace 成员的 package.json，必须保持目录结构！
COPY apps/consumer/package.json apps/consumer/
COPY packages/api/package.json packages/api/
COPY packages/configs/package.json packages/configs/
COPY packages/constants/package.json packages/constants/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/

# 安装所有依赖（本地包会被链接，二进制依赖允许执行安装脚本）
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 构建层：复制所有源码并构建
FROM deps AS build

# 复制所有包的源码（确保目录结构与 package.json 所在位置一致）
COPY apps/consumer/ apps/consumer/
COPY packages/api/ packages/api/
COPY packages/configs/ packages/configs/
COPY packages/constants/ packages/constants/
COPY packages/ui/ packages/ui/
COPY packages/utils/ packages/utils/

# 如果仓库根目录有 tsconfig、vite 配置等被 consumer 引用，也需要复制
# 这里假设 consumer 自己有 tsconfig.json，如果构建依赖根配置，请按需添加
# COPY tsconfig.base.json? ./

WORKDIR /usr/src/app/apps/consumer
RUN pnpm build

# 运行层：Caddy 提供静态文件服务
FROM caddy:alpine AS final

# 配置 Caddy（可根据需求调整，以下为示例）
RUN cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
    root * /usr/share/caddy
    encode gzip

    handle /api/* {
        uri strip_prefix /api
        reverse_proxy {$GATEWAY_URL:http://localhost:8080} {
            header_up Host {upstream_hostport}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_addr}
        }
    }

    handle {
        try_files {path} /index.html
        file_server
    }

    header {
        Strict-Transport-Security max-age=31536000;
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    }
}
EOF

# 复制构建产物
COPY --from=build /usr/src/app/apps/consumer/dist /usr/share/caddy

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--watch"]
