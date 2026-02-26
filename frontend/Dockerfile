# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# ARGs for version control
ARG NODE_VERSION=22.19.0
ARG PNPM_VERSION=10.20.0

# Base image with Node.js and pnpm
FROM node:${NODE_VERSION}-alpine as base

WORKDIR /usr/src/app

# Install pnpm globally
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

# Stage for installing production dependencies
FROM base as deps

# Install only production dependencies
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

# Stage for building the application
FROM deps as build

# Install all dependencies (including dev dependencies) for building
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# Copy the entire source code
COPY . .

# Build the application
RUN pnpm build

# Final stage: Use Caddy to serve the built static assets
FROM caddy:alpine as final

# Configure Caddy with optimized settings
RUN cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
    root * /usr/share/caddy
    encode gzip

    # API reverse proxy configuration
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy {$GATEWAY_URL:http://localhost:8080} {
            header_up Host {upstream_hostport}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_addr}
        }
    }

    # Static file serving with SPA support
    handle {
        try_files {path} /index.html
        file_server
    }

    # Security headers
    header {
        Strict-Transport-Security max-age=31536000;
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        Content-Security-Policy "default-src 'self'; img-src 'self' data:;"
    }
}
EOF

# Copy the built static assets (with correct permissions)
COPY --from=build --chown=caddy:caddy /usr/src/app/dist /usr/share/caddy

# Set the default command for the container
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--watch"]
