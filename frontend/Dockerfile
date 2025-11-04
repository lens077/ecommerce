FROM node:24-alpine AS builder

WORKDIR /web
COPY . /web

# 设置 CI 环境变量以避免交互式提示
ENV CI=true

# 添加国内源加速下载
RUN npm config set registry https://registry.npmmirror.com

# 安装 pnpm
RUN npm install pnpm -g

# 验证 pnpm 安装
RUN pnpm -v

# 安装依赖
RUN pnpm install --frozen-lockfile

# 打包
RUN pnpm build

# 使用 Node.js 运行 SSR 应用
FROM node:24-alpine AS runtime

WORKDIR /app

# 复制 package.json 和 lockfile
COPY package.json pnpm-lock.yaml* ./

# 仅安装生产依赖
RUN npm config set registry https://registry.npmmirror.com && \
    npm install pnpm -g && \
    pnpm install --prod --frozen-lockfile

# 复制构建输出
COPY --from=builder /web/.output /app/.output

# 创建非 root 用户
RUN addgroup appuser && \
    adduser -G appuser -D appuser

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 3000

# 运行应用
CMD ["node", ".output/server/index.mjs"]
