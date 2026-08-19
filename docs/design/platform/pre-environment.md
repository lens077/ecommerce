# Pre 环境基础设施接入清单（实测）

> 2026-08-08 用 kubectl + curl/openssl 对集群逐项实测的结果，作为编写/修正各服务
> `pre.yml`（KV `ecommerce/{svc}/pre.yml`）时的接入真相。证书体系与网关形态的参考实现在
> `cloud-native-deploy/cert-manager/public-web-gw/`。**再次核实以实测为准**——本仓已两次
> 遇到「配置在骗人」（VPA PROVIDED≠生效、consul 反注册被静默钳制）。
>
> 证书链：`selfSigned ClusterIssuer` → `global-root-ca`（cert-manager ns）→
> `global-ca-issuer`（CA ClusterIssuer）→ 各证书。泛域名 `global-default-tls`
> （CN=dev.test, SAN=*.dev.test）挂在共享网关 https listener。

## 网关

| 网关 | ns | IP | listener | 证书 |
|---|---|---|---|---|
| cilium-gateway | default | 192.168.3.110 | http:80（明文）+ https:443（Terminate） | global-default-tls |
| dragonfly-gateway | dragonfly | 192.168.3.114 | TLS:443（**Terminate**）+ TLSRoute | dragonfly-gateway-tls-secret |

Cilium **没有 TCPRoute CRD**（`kubectl get tcproute` 报无此资源）；**TLSRoute 可用**且
dragonfly 在用。GRPCRoute 有 CRD 无实例。`kube-system/cilium-ingress`（192.168.3.108）
是闲置 LB——集群里没有任何 Ingress 资源。

## 各基础设施接入方式（除 ecommerce / config-center）

| 组件 | ns | 集群内地址 | 对外入口 | TLS 现状 |
|---|---|---|---|---|
| Postgres | postgres | postgres-postgresql.postgres.svc:5432 | LB **192.168.3.109**:5432（L4） | ✅ **原生 TLS**（bitnami `POSTGRESQL_ENABLE_TLS`，证书 cert-manager `postgres-gateway-tls`，客户端 verify-ca 挂 `postgres-root-ca`）|
| Dragonfly | dragonfly | dragonfly.dragonfly.svc:6379 | 网关 **192.168.3.114**:443（TLSRoute）；另有**死 LB** default/dragonfly 192.168.3.113（无 endpoint） | 集群内 ✅ 原生 TLS（`--tls`，挂 dragonfly-gateway-tls-secret，客户端 skip_verify）；**网关路径 ❌ 实测不通**：listener 是 Terminate，解密后明文转给只收 TLS 的后端——握手成功但 redis PING 无响应 |
| Kafka | kafka | my-cluster-kafka-bootstrap.kafka.svc:9092（明文）/ **9093（TLS）** | **无外部入口**（Strimzi 两个 listener 都是 internal） | 集群内二选一，9093 TLS 现成但没人用 |
| Elasticsearch | elastic-stack | elasticsearch-es-http:9200 | es.dev.test → **http(80) 明文** | ❌ ECK 的 HTTP 层 TLS **被主动关闭**（`tls-disabled=true`）|
| Kibana | elastic-stack | …-kb-http:5601 | kibana.dev.test → http(80) | ❌ 明文 |
| Consul | consul | consul-expose-servers.consul.svc:8500 | LB **192.168.3.112**:8500/8300/8301/8502 + consul-ui LB **192.168.3.111**:80 + consul.dev.test → http(80) | ❌ 全明文：**8501/HTTPS 未启用**，gossip `encrypted=false` |
| OTel Collector | observability | otel-collector.observability:4318（明文，pre.yml 在用） | LB **192.168.3.117**:4317/4318 明文 + **otlp-http.dev.test → https(443)** ✅ | 网关终止 TLS，后端集群内明文；**唯一挂 https listener 的基础设施路由** |
| Jaeger | observability | jaeger:16686/4318 | jaeger-ui/jaeger-http.dev.test → http(80) | ❌ 明文 |
| Grafana | observability | grafana:80 | grafana.dev.test → http(80) | ❌ 明文 |
| Loki | loki | loki-gateway.loki.svc:80 / loki:3100 | 无路由无 LB（仅集群内） | ❌ 明文 |
| VictoriaMetrics | victoriametrics | vm-single-…-server:8428 | vm.dev.test → http(80) | ❌ 明文 |
| MinIO（集群内） | minio | minio-service:9000/9090 | minio-api.dev.test / minio.dev.test → http(80) | ❌ 明文；**且 pre.yml 实际用的不是它**（见下） |
| Seata | seata | seata-server:8091 | seata.dev.test → http(80) | ❌ 明文 |
| ArgoCD | argocd | argocd-server:80 | argocd-server.dev.test → http(80) | ❌ 网关侧明文 |
| Casdoor（集群外） | — | — | **apikv.com:8000 = node1，公网明文 HTTP** | ❌ OAuth 流量走公网 http |
| MinIO（node2，集群外） | — | — | `https://minio.apikv.com`（443）→ Pangolin/Traefik → newt 隧道 → node2 `127.0.0.1:9000`；9000/9001 均已绑回环 | ✅ TLS（Traefik 终止，ZeroSSL `*.apikv.com`，**2026-10-27 到期**，2026-08-19 落地） |
| gorse（node2，集群外） | — | — | `https://gorse.apikv.com` → 同上 → `127.0.0.1:8088`；8086/8088 均已绑回环。**当前服务停机**（Redis 依赖断，见 TODO.md） | ✅ TLS；暂由 Pangolin SSO 保护，恢复后改用 gorse 自带 `api_key` |

## 实测记录（2026-08-08）

- `http://{grafana,vm,kibana,argocd-server,consul}.dev.test`（Host 头打 192.168.3.110:80）→ 302/200/301 全通；
  同域名打 https:443 → **404**（未挂 https listener）；对照组 `https://otlp-http.dev.test/v1/traces` → 200。
- `openssl s_client 192.168.3.114:443 SNI=dragonfly.dev.test` 握手成功（issuer=my-global-root-ca），
  但 TLS 内发 `PING` 2 分钟无响应 → 网关→后端断。
- `nc 192.168.3.113 6379` 拒绝 → default/dragonfly LB 无后端（deploy 在 dragonfly ns，default 只剩 svc 残留）。
- dragonfly pod 57 天重启 32 次（最近一次 ~7h 前），排障时留意。

## 已知幽灵配置（写 pre/prod 配置时别照抄）

1. `backend/services/*/deploy/prod/` 的 `CONSUL_ADDR=consul-server.consul.svc:8501` + `CONSUL_SCHEME=https`
   —— consul 根本没开 8501/TLS，prod 清单照这个起不来。
2. cart `pre.yml` 的三个 OTel exporter `tls.insecure_skip_verify` 不一致（false/true/false），
   而端点是集群内明文 4318——需统一并核对 exporter 实际行为。
3. `.service-matrix.yaml` externals 的 `redis: dragonfly.dev.test:443` 走的是上面那条**实测不通**的网关路径
   （集群内 `dragonfly.dragonfly.svc:6379` 不受影响）。

## 通往「每个基础设施都 TLS」的路径（按代价排序）

1. **一行改动一批**：12 条挂在 `sectionName: http` 的 HTTPRoute 改挂 `https`（80 明文 listener 保留与否另议）——
   grafana/vm/kibana/es/kafka-ui/minio×2/jaeger×2/seata/consul-ui/argocd 立刻获得网关终止的 TLS。
2. **修 dragonfly 网关路径**：listener `Terminate` → `Passthrough`（后端已有证书与 `--tls`，SNI 路由即可端到端 TLS；
   `public-web-gw/05-public-web-passthrough-gateway.yml` 就是这个形态）。
3. **TCP 类不必退化到 L4**：凡客户端支持 TLS+SNI 的都能走 TLSRoute Passthrough——kafka 9093（TLS listener 现成，
   证书是 Strimzi 自己的 CA）、postgres（`public-web-gw/06-tls-route.yml` 的 pg-dev-route 示例写了但从未 apply；
   现状 LB+原生 TLS 也算达标）。真正只能 L4 明文的只剩「客户端不做 TLS」的场景。
4. **公网明文最优先**：casdoor（OAuth code/token）仍走公网 http，风险级别高于所有集群内明文。
   node2（node2）的 minio 与 gorse 已于 2026-08-19 全部收敛：改走 node1 的 Pangolin
   隧道，本机端口全绑回环。**注意该机不能自行配域名证书**——`apikv.com` 未在阿里云备案，
   域名直连必被 ICP 拦截（`Server: Beaver`），这是走隧道而非就地上 TLS 的根本原因。
