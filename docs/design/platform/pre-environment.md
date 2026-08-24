# Pre 环境基础设施接入清单（实测）

> 2026-08-08 首次盘点，2026-08-24 在三节点重建集群上复核 CNPG、共享网关和 Dragonfly
> 入口。该清单用于编写和修正服务配置；**再次核实以实测为准**——网关资源显示 Accepted
> 仍不能代替宿主网协议握手和业务查询。
>
> 证书链：`selfSigned ClusterIssuer` → `global-root-ca`（cert-manager ns）→
> `global-ca-issuer`（CA ClusterIssuer）→ 各证书。泛域名 `global-default-tls`
> （CN=dev.test, SAN=*.dev.test）挂在共享网关 https listener。

## 网关

| 网关 | ns | IP | listener | 证书 |
|---|---|---|---|---|
| cilium-gateway | default | 192.168.3.121 | http:80 + https:443（Terminate） | global-default-tls |
| dragonfly-gateway | dragonfly | 192.168.3.122 | TCP:6380（后端原生 TLS） | 网关不终结 TLS |
| pg-passthrough-gateway | postgresql | 192.168.3.132 | TLS:5432（Passthrough） | CNPG `pg-main-server` |

Gateway API v1.6 的 TCPRoute 与 TLSRoute v1 CRD 均已安装。Dragonfly 使用 TCPRoute；CNPG
使用按 `pg.dev.test` SNI 分流的 TLSRoute。两条路径都由后端终结 TLS，Gateway 不持有
数据库或缓存的私钥。

## 各基础设施接入方式（除 ecommerce / config-center）

| 组件 | ns | 集群内地址 | 对外入口 | TLS 现状 |
|---|---|---|---|---|
| Postgres（CNPG） | postgresql | pg-main-rw.postgresql.svc:5432 | TLSRoute **192.168.3.132**:5432，SNI `pg.dev.test` | ✅ CNPG 原生 TLS；宿主网实测 `verify-full` + direct TLS negotiation，`pg_stat_ssl.ssl=true`、TLSv1.3 |
| Dragonfly | dragonfly | dragonfly.dragonfly.svc:6379 | TCPRoute **192.168.3.122**:6380 | ✅ 后端原生 TLS；网关只做 L4 透传 |
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
| Casdoor（集群外） | — | — | **apikv.com:8000 = 114.132.233.129，公网明文 HTTP** | ❌ OAuth 流量走公网 http |
| MinIO（node2，集群外） | — | — | `https://minio.apikv.com`（443）→ Pangolin/Traefik → newt 隧道 → node2 `127.0.0.1:9000`；9000/9001 均已绑回环 | ✅ TLS（Traefik 终止，ZeroSSL `*.apikv.com`，**2026-10-27 到期**，2026-08-19 落地） |
| gorse（node2，集群外） | — | — | `https://gorse.apikv.com` → 同上 → `127.0.0.1:8088`；8086/8088 均已绑回环。`Ready:true` | ✅ TLS + gorse 自带鉴权（`api_key` 401 实测生效，Dashboard 302→`/login`） |

## 实测记录（2026-08-08）

- CNPG 安装器自动创建 `postgresql/pg-passthrough-gateway` 和 `TLSRoute/pg-main`；Gateway
  `Programmed=True`，Route `Accepted=True`、`ResolvedRefs=True`。
- 从宿主网直连 `192.168.3.132:5432`，以 SNI `pg.dev.test`、CNPG CA、`verify-full` 和 direct
  TLS negotiation 完成 app 用户查询；`pg_stat_ssl` 返回 `ssl=true`、`TLSv1.3`。
- `openssl s_client -verify_hostname pg.dev.test -verify_return_error` 经相同 VIP 验证通过。
- Dragonfly 当前入口为 `192.168.3.122:6380` 的 TCPRoute，旧的 `.113/.114` 记录已废止。

## 已知幽灵配置（写 pre/prod 配置时别照抄）

1. `backend/services/*/deploy/prod/` 的 `CONSUL_ADDR=consul-server.consul.svc:8501` + `CONSUL_SCHEME=https`
   —— consul 根本没开 8501/TLS，prod 清单照这个起不来。
2. cart `pre.yml` 的三个 OTel exporter `tls.insecure_skip_verify` 不一致（false/true/false），
   而端点是集群内明文 4318——需统一并核对 exporter 实际行为。

## 通往「每个基础设施都 TLS」的路径（按代价排序）

1. **一行改动一批**：12 条挂在 `sectionName: http` 的 HTTPRoute 改挂 `https`（80 明文 listener 保留与否另议）——
   grafana/vm/kibana/es/kafka-ui/minio×2/jaeger×2/seata/consul-ui/argocd 立刻获得网关终止的 TLS。
2. **Dragonfly 已收敛**：`192.168.3.122:6380` 通过 TCPRoute 透传到后端原生 TLS。
3. **CNPG 已收敛**：`192.168.3.132:5432` 通过 TLSRoute 按 SNI `pg.dev.test` 透传；安装器自动
   创建并等待路由就绪。Kafka 9093 等其他原生 TLS 组件仍可按同一模式接入。
4. **公网明文最优先**：casdoor（OAuth code/token）仍走公网 http，风险级别高于所有集群内明文。
   node2（8.138.194.254）的 minio 与 gorse 已于 2026-08-19 全部收敛：改走 node1 的 Pangolin
   隧道，本机端口全绑回环。**注意该机不能自行配域名证书**——`apikv.com` 未在阿里云备案，
   域名直连必被 ICP 拦截（`Server: Beaver`），这是走隧道而非就地上 TLS 的根本原因。
