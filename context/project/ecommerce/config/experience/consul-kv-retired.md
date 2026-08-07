---
name: consul-kv-retired
layer: project/ecommerce/config
description: Consul KV no longer stores service Bootstrap configuration
---

# Consul KV Bootstrap Has Been Retired

As of 2026-08-08, the `ecommerce/<service>/<environment>.yml` Consul KV
entries have been deliberately deleted. Config Center is the sole Bootstrap
source for every business service. Consul remains only for service discovery
and registration.

Do not restore `CONFIG_SOURCE=consul`, `CONSUL_PATH`, a Consul Bootstrap
reader, or a fallback path. A missing Config Center selector, invalid machine
token, or absent `bootstrap.yaml` must fail startup clearly rather than load
stale configuration.

## Selector volume ownership

All ten service images run as UID/GID `1000`. A Secret volume declared with
`defaultMode: 0400` but without a Pod `fsGroup` remains `root:root`, so the
process fails before contacting Config Center with `permission denied`. Keep
the Secret declaration at `0400`, and set `runAsUser`, `runAsGroup`, and
`fsGroup` to `1000` plus `fsGroupChangePolicy: OnRootMismatch`. Kubelet then
grants the runtime group read access without making the machine-token selector
world-readable.
