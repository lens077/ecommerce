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
# 根 package.json 必须一起拷：pnpm 要靠它解析 workspace 与 catalog: 版本。
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# 复制所有 workspace 成员的 package.json，必须保持目录结构！
# ⚠️ 必须覆盖 consumer 的**全部** workspace 依赖（对照
#    `jq -r '.dependencies+.devDependencies|to_entries[]|select(.value|startswith("workspace"))' apps/consumer/package.json`）。
#    此前漏了 i18n/perf/tauri 三个 —— 症状是构建到 `pnpm build` 才炸，
#    而 vite 的错误聚合会把真实原因吞掉，只剩一句 `plugin threw an error`。
#    ⚠️ 还要算上**传递**的 workspace 依赖：consumer 自己不依赖 tracker，
#    但 perf 依赖它（perf → @ecommerce/tracker）。只看 consumer 的 package.json
#    会漏掉这一层，症状与直接漏拷一模一样，极难往"传递依赖"上想。
COPY apps/consumer/package.json apps/consumer/
COPY packages/api/package.json packages/api/
COPY packages/configs/package.json packages/configs/
COPY packages/constants/package.json packages/constants/
COPY packages/i18n/package.json packages/i18n/
COPY packages/perf/package.json packages/perf/
COPY packages/tauri/package.json packages/tauri/
COPY packages/tracker/package.json packages/tracker/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/

# 安装所有依赖（本地包会被链接，二进制依赖允许执行安装脚本）
#
# 根 package.json 的 `prepare: vp config` 会装 git 钩子（把仓库的 core.hooksPath
# 指到 frontend/.vite-hooks/_）。镜像里没有 git，它会直接
# `prepare: git command not found` 让整个 install 失败。
#
# 跳过钩子安装，而不是：
#   - 装 git —— 构建镜像里根本不需要 git 钩子，为满足一个用不上的副作用装包；
#   - --ignore-scripts —— 会连带跳过 rolldown/oxc 这类原生依赖的 postinstall。
#
# ⚠️ 环境变量 VP_GIT_HOOKS=0 在这里**不管用**（实测）：vp config 在读它之前
#    就已经去调 git 了，照样 `prepare: git command not found`。
#    必须用命令行开关，所以直接把 prepare 覆盖成带 --no-hooks 的形式。
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm pkg set scripts.prepare="vp config --no-hooks" && \
    pnpm install --frozen-lockfile

# 构建层：复制所有源码并构建
FROM deps AS build

# 复制所有包的源码（确保目录结构与 package.json 所在位置一致）
COPY apps/consumer/ apps/consumer/
COPY packages/api/ packages/api/
COPY packages/configs/ packages/configs/
COPY packages/constants/ packages/constants/
COPY packages/i18n/ packages/i18n/
COPY packages/perf/ packages/perf/
COPY packages/tauri/ packages/tauri/
COPY packages/tracker/ packages/tracker/
COPY packages/ui/ packages/ui/
COPY packages/utils/ packages/utils/

# 根配置**确实被引用**：各包 tsconfig 都 `extends: ../../tsconfig.json`，
# vite-plus 也读根 vite.config.ts。缺了同样是在 pnpm build 阶段才炸。
COPY tsconfig.json vite.config.ts ./

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
        # ⚠️ 不能用 DENY：静默续期的最后一跳是 Casdoor 把 iframe **重定向回我们自己的
        # /callback**，DENY 会把这一跳也拒掉（iframe 变成 chrome-error），
        # postMessage 发不出来 → 续期超时 → 每次刷新都要重新登录。
        # SAMEORIGIN 仍然挡住第三方站点嵌我们（防点击劫持的目的不变），
        # 只放行同源自嵌。CSP 的 frame-ancestors 是更现代的等价物，两者同时给以兼容老浏览器。
        X-Frame-Options SAMEORIGIN
        X-Content-Type-Options nosniff
        # ⚠️ connect-src / frame-src 必须显式列出，不能只靠 default-src 'self'：
        #   - connect-src：PKCE 要 fetch 到 Casdoor 换令牌，业务请求要打网关，
        #     两者都是跨源；漏了的话浏览器直接拦下，控制台报 CSP 违规而不是网络错误，
        #     很容易被当成"接口挂了"。
        #   - frame-src 必须**同时**含 'self' 与 Casdoor：iframe 先加载 Casdoor 的
        #     prompt=none 授权页，Casdoor 认完会把 iframe **重定向回我们自己的
        #     /callback**（带 code），那一跳同样受 frame-src 管。只放行 Casdoor 的话
        #     iframe 卡在回跳这步、postMessage 发不出来，续期超时 ——
        #     表现为"每次刷新都要重新登录"，而控制台那条 CSP 违规写的是被拦的是
        #     shop 自己的 URL，很容易看反方向（Playwright 实测踩过）。
        #   - img-src 要放行 cdn.casbin.org：Casdoor 用户的默认头像在那儿。
        #   - font-src 'self' data:：MUI 把图标字体内联成 base64 data: URI，
        #     只有 default-src 'self' 时会被全部拦掉（Playwright 实测抓到 5 条违规）。
        #     页面看着"渲染正常"但图标是空的 —— 不看控制台根本发现不了。
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.casbin.org; font-src 'self' data:; connect-src 'self' https://casdoor.apikv.com https://gateway.apikv.com; frame-src 'self' https://casdoor.apikv.com; frame-ancestors 'self';"
    }
}
EOF

# 复制构建产物
COPY --from=build /usr/src/app/apps/consumer/dist /usr/share/caddy

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--watch"]
