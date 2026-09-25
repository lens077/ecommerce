ARG GO_IMAGE=golang:1.27.0-alpine3.24
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS compile
ARG TARGETOS=linux
ARG TARGETARCH
ARG GOPROXY=https://proxy.golang.org|https://goproxy.io,direct
WORKDIR /build
COPY go.mod go.sum ./
COPY tools/dbmigrate/ ./tools/dbmigrate/
COPY services/ ./services/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    GOOS=$TARGETOS GOARCH=$TARGETARCH CGO_ENABLED=0 \
    go build -trimpath -ldflags="-s -w" -o /dbmigrate ./tools/dbmigrate \
    && go mod verify
# Only committed versioned migrations enter the release payload: no configs,
# sample seeds, generated clients, or administrative tooling in the final image.
RUN set -eu; for dir in services/*/internal/data/migrations; do \
    mkdir -p "/payload/$dir"; cp "$dir"/*.sql "/payload/$dir/"; done

FROM scratch
ARG VERSION=dev
ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/lens077/ecommerce" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$VCS_REF"
COPY --from=compile /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=compile /dbmigrate /app/dbmigrate
COPY --from=compile /payload/services /app/services
USER 1000:1000
WORKDIR /app
ENTRYPOINT ["/app/dbmigrate"]
CMD ["-base=/app/services", "-svc=all", "-require-dsn", "up"]
