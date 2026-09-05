# BASE_IMAGE 可按本地网络覆盖（如 docker.m.daocloud.io/library/node:22-bookworm-slim）；
# CI（GitHub Actions）网络干净，用默认值。
ARG BASE_IMAGE=node:22-bookworm-slim

FROM ${BASE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
COPY package.json ./
RUN npm install -g "$(node -p 'require("./package.json").packageManager')"

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/consumer-next/package.json apps/consumer-next/package.json
# --ignore-scripts 是硬要求：workspace 根 prepare(vp config) 要装 git 钩子，slim 镜像无 git 必炸；
# 本 app 构建不依赖任何 postinstall（buf 生成物随源码 COPY）。2026-08-28 实测教训。
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @ecommerce/consumer-next...

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/consumer-next/node_modules ./apps/consumer-next/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/consumer-next apps/consumer-next
RUN pnpm --filter @ecommerce/consumer-next build

FROM ${BASE_IMAGE} AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3004

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/consumer-next/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/consumer-next/.next/static ./apps/consumer-next/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/consumer-next/public ./apps/consumer-next/public

USER nextjs
WORKDIR /app/apps/consumer-next
EXPOSE 3004
CMD ["node", "server.js"]
