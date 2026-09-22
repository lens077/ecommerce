---
name: local-env
layer: team
description: 本地开发机与集群连哪套基础设施：活地址、配置来源、解析与信任链，以及会白排查半天的几个坑
---

# 本地开发环境约定

> **本文只回答「现在往哪连」**，不记建设过程。凭据一律不入库（只写主机名和端口）。
> 一次性的搭建/迁移实录见 docs/progress-archive/node3-migration-20260824.md，
> 别把它搬回来。
>
> **地址会漂。** 下面每张表都标了核对日期；超过日期就按「§ 自助核对」重跑一遍命令，
> 不要直接相信本文。核对完请顺手更新日期。

## 活地址（2026-09-15 实测）

集群只有一套：node3 / node4 / node5（全部 amd64、Ubuntu 26.04），Cilium Gateway VIP 在 `10.10.31.0/24`。
原 `192.168.3.x` 那套 dev 集群已于 2026-09-15 前删除，本文不再记录它。

**本机 Mac 不在机房 LAN 时走 remote-dev**（Pangolin resource → 新建的集群 newt site → K8s Gateway 或 L4 service）；
机房 LAN 开发机才直连 VIP 并用 `*.dev.test`。两条路解决的是不同问题，别混：

| 路 | 解决什么 | 在哪生效 | 实测 2026-09-15 |
|---|---|---|---|
| remote-dev（Pangolin 资源） | **L3 可达**：Mac 到不了 `10.10.31.x` VIP，把 HTTP 与 raw TCP（Dragonfly、PG、Kafka）经公网域名穿出来 | 任何能上公网的机器 | 旧 `redis-dev:30005` 资源待迁移；新 Dragonfly TCPRoute 为 `10.10.31.242:6379`，需先在 Pangolin 建资源后再做 TLS 握手验证 |
| `*.dev.test` split DNS（`/etc/resolver/dev.test → 10.0.0.1` dnsmasq） | **通配解析**：`/etc/hosts` 不支持 `*.dev.test`，dnsmasq 应答整个后缀到 VIP | 只有机房 LAN（`10.0.0.1` 与 VIP 都在那边） | 本机 `10.0.0.1` 不可达，`shop.dev.test` 解析为空——这条路在机房外是死的，属预期 |

Mac 上 launchd 跑的 `newt`（`net.pangolin.newt`）是 **Pangolin 站点连接器**，把本机 `127.0.0.1` 的服务暴露给 Pangolin 用，
不给 Mac 增加任何到 `10.10.x` 的路由；它连不上集群是正常的，不要拿它排查 remote-dev。

| 组件 | remote-dev（Mac 默认） | 机房 LAN | 从 Pod 连 | 备注 |
|---|---|---|---|---|
| 共享网关 | 经 Pangolin 公网域名（`shop.apikv.com` / `gateway.apikv.com` …） | `10.10.31.240:80/443` | 同左 | Cilium Gateway；HTTPRoute 按 hostname 接入，`*.dev.test` 与 `*.apikv.com` 挂在同一条路由上 |
| Consul（**仅注册发现**） | `https://consul-dev.apikv.com`（SSO 关闭，Host/SNI 保留 `consul.dev.test`） | `10.10.31.241:8500` | `consul-server.consul.svc:8500` | 已开 ACL，必须带 token，见下 |
| Dragonfly | 新 Pangolin resource 待建（后端 `10.10.31.242:6379`，TCPRoute，TLS-only + AUTH） | `10.10.31.242:6379` | `dragonfly.dragonfly.svc:6379` | TLS-only + AUTH；CA 在 Secret `dragonfly-tls` |
| PostgreSQL（业务库 + config schema） | 新 Pangolin resource 待建（后端 `10.10.31.241:5432`，TLSRoute，SNI `pg.dev.test`） | `10.10.31.241:5432` | `pg-main-rw.postgresql.svc:5432` | CNPG `pg-main`，TLS passthrough，`sslmode=verify-ca`/`verify-full` 按证书配置 |
| Config Center | — | — | `config-center.config-center.svc:30010` | Web `https://config.apikv.com`，API `https://config-api.apikv.com`；跑的是 control-tower 镜像，ns 名是遗留标签 |
| Casdoor | `https://casdoor.apikv.com` | 同左 | 同左 | 集群外的外部服务 |
| Elasticsearch | `kubectl -n elasticsearch port-forward svc/elasticsearch 9200:9200` | 同左 | `elasticsearch.elasticsearch.svc.cluster.local:9200` | 2026-09-15 起在集群内，仅 ClusterIP；search 只读 alias `ecommerce_catalog_products`，API key 存 `ecommerce/search-k8s-api-key` |
| Kafka | `kubectl -n kafka port-forward svc/my-cluster-kafka-bootstrap 9092:9092` | 同左 | `my-cluster-kafka-bootstrap.kafka.svc:9092` | 集群内 Strimzi 单节点，仅内部 listener；Pangolin TCP resource 尚未建立，领域事件 producer/consumer 仍为零 |
| 观测后端 | `https://metrics.dev.test` 等新集群 HTTPRoute（Pangolin resource 待迁移） | `10.10.31.240` | 对应集群 ClusterIP | VM/VL/VT/vmalert/Alertmanager/Grafana 已回集群内，旧 node3 域名退役 |
| OTLP 入口 | 集群内 `otel-opentelemetry-collector.opentelemetry.svc:4317/4318` | 同左 | 同左 | 公网 OTLP 入口未接线，不要复用旧 node3 endpoint |

配置生成：`bash tools/config-center-harvest.sh --env dev --strategy remote-dev`（`dev` 默认即 `remote-dev`；LAN 机器用 `--strategy gateway`）。
本地服务默认不注册 Consul；需要注册时在对应服务目录运行 `make dev-consul`，并提供 `CONSUL_HTTP_TOKEN`。

### 基础设施主机

| 节点 | 角色 | 内网 IP | 备注 |
|---|---|---|---|
| k1 | control-plane + workload | `10.10.21.161` | 旧 node4，control-plane 污点已摘除 |
| k2 | worker | `10.10.21.162` | 旧 node5 |
| k3 | worker | `10.10.21.163` | 旧 node3；Pigsty PG 与观测后端已随重装退役 |

**旧 node3 的 Pigsty / 观测后端已退役**：旧主机已重装为 `k3`，不要再探 `node3:5432`、
`10.10.21.172` 或 `node3-*.apikv.com`。当前 PostgreSQL/CNPG 与观测后端均在集群内；公网访问统一经过
Pangolin 新建的集群 site 和 HTTP/TLS/TCPRoute。凭据不入库。

## 配置加载：Config Center 是唯一来源

服务启动读 `configs/source.dev.yaml`（被 gitignore）里的 selector 自举，再从 Config Center 拉
`<service>/<env>/bootstrap.yaml`。selector 缺失、token 无效或 key 不存在 → **直接启动失败**。
没有 KV 回退（Consul KV 已退役，见
[`consul-kv-retired.md`](../project/ecommerce/config/experience/consul-kv-retired.md)）。

Config Center 现有两个环境：`dev` 给本机 `make dev`（remote-dev），`pre` 给集群（selector Secret
`ecommerce-config-source-pre`，10 个服务，`DEPLOYMENT_MODE=pre`）〔实测 2026-09-15〕。部署清单只有 pre / prod 两层，
prod 暂沿用 pre 的 Config Center 环境（见 `docs/PRODUCTION-RELEASE.md`）。

⚠️ **配置缺子块不会报错，功能会被静默关掉**：mapstructure 没开 `ErrorUnused`，多余键不报错，
缺失键生成 nil-safe getter。判据与复盘见
[`consul-kv-missing-key-silent-disable.md`](../project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md)。

### Consul 必须带 token（2026-08-18 起开了 ACL）

`default_policy=deny`，8500 暴露在局域网，不开等于任何人可注销别人的服务。只影响注册发现。

- **环境变量是 `CONSUL_HTTP_TOKEN`，不是 `CONSUL_TOKEN`**。`backend/constants/env.go` 里的
  `EnvConsulToken = "CONSUL_TOKEN"` 是个没人读的声明；`registry/consul.go` 不设 `api.Config.Token`，
  由 `api.NewClient` 回落到 `CONSUL_HTTP_TOKEN`。零改码，导出即可：

  ```bash
  export CONSUL_HTTP_TOKEN=$(kubectl -n consul get secret consul-ecommerce-token \
    -o jsonpath='{.data.CONSUL_HTTP_TOKEN}' | base64 -d)
  ```

- **不带 token 的症状不是报错而是查不到**：写 403，读返回 200 但被 ACL 过滤成空
  （`/v1/catalog/services` → `{}`）。「注册看似成功、网关就是路由不到」先查 token。
- 该 token 的 policy 是 `service_prefix "" = write` + `node_prefix "" = read`，**不含 KV**（读 KV 403 属预期）。

### ⚠️ 本机 `make dev` 连不上库

`backend/services/*/configs/dev.yml` 里写的是集群内 svc 域名（`pg-main-rw.postgresql.svc`、
`dragonfly.dragonfly.svc`、`otel-opentelemetry-collector.opentelemetry.svc:4318`），Mac 上解析不了；
Mac 应通过 `remote-dev` 的 Pangolin 资源获取公网地址，不要把集群 Service DNS 写进本机配置。两条出路：

1. 用上表 remote-dev 那列的地址覆盖（PG/Dragonfly/Kafka 的 Pangolin 资源域名；当前 Dragonfly/PG/Kafka 资源待建立）——`tools/config-center-harvest.sh --strategy remote-dev` 就是干这个的；
2. 走内环开发，在集群身份下跑代码 —— [okteto-inner-loop.md](okteto-inner-loop.md)。


## `*.dev.test` 解析与 TLS 信任

**只有机房 LAN 开发机需要**；remote-dev 走公网域名，不需要 `/etc/hosts` 和 split DNS。LAN 机器**不跑任何 DNS 服务**，`/etc/hosts` 直接写死到集群 LoadBalancer IP。判据是规模：
域名个位数且多为常驻基础设施名，通配收益抵不过多养一个 DNS 服务的故障面（2026-08-28 复盘结论）。
代价是不支持通配、每台开发机各配一次；换来零依赖、集群 DNS 故障不影响解析、不被浏览器 DoH 绕过。

`.test` 是 RFC 6761 保留的测试域，公网不解析（2026-08-18 从 `app.com` 迁来——旧域名是真实注册域名，
公网会解析到无关 IP，这正是换掉它的原因）。

网关证书由集群自签根 CA `my-global-root-ca` 签发，已导入 Mac 系统钥匙串，`curl https://` 无需 `-k`。
换机器要重新导入：

```bash
kubectl get secret global-root-ca-secret -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > /tmp/global-root-ca.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/global-root-ca.crt
```

### ⚠️ 集群重建 → 根 CA 会换 → 本机信任库要同步换

根 CA 是 cert-manager 在集群里生成的（`cert-manager/global-root-ca-secret`），**集群重建就是一张新 CA**，
但 Subject 还叫 `my-global-root-ca`。本机钥匙串里那张旧的不会自己失效，浏览器按 issuer 名字找到它、
拿旧公钥去验新签名，于是：

- **判据**：Firefox `SEC_ERROR_BAD_SIGNATURE`（「对等端的证书有一个无效的签名」）；Safari/Chrome 表现为
  「证书不受信任」。`curl` 报 `unable to get local issuer certificate` 或直接 OK（取决于它读哪份 bundle），
  所以**别用 curl 通不通来判断浏览器会不会红**。
- **确认**：比对 SKI / 指纹，同名不同 SKI 就是它——

```bash
# 集群现行根 CA 的 SKI 与指纹
kubectl get cm global-root-ca -n ecommerce -o jsonpath='{.data.ca\.crt}' > /tmp/cluster-ca.pem
openssl x509 -in /tmp/cluster-ca.pem -noout -dates -fingerprint -sha256 -ext subjectKeyIdentifier
# 本机钥匙串里那张
security find-certificate -c my-global-root-ca -p /Library/Keychains/System.keychain \
  | openssl x509 -noout -dates -fingerprint -sha256 -ext subjectKeyIdentifier
# 网关叶证书的 AKI 应等于集群根 CA 的 SKI；用集群 CA 验叶证书应 OK——OK 就说明问题只在本机
echo | openssl s_client -connect 10.10.31.240:443 -servername shop.dev.test 2>/dev/null \
  | openssl x509 -noout -ext authorityKeyIdentifier
```

- **修法**：按 SHA-1 精确删旧的再装新的（同名证书不止一张时 `delete-certificate -c` 会删错）：

```bash
OLD_SHA1=$(security find-certificate -c my-global-root-ca -Z /Library/Keychains/System.keychain | awk '/SHA-1/{print $NF}')
sudo security delete-certificate -Z "$OLD_SHA1" /Library/Keychains/System.keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/cluster-ca.pem
```

  Firefox 若 `security.enterprise_roots.enabled=true`（macOS 默认）重启即生效；若当初手动导入过
  Firefox 自己的证书库，要在「设置 → 证书 → 证书颁发机构」删旧导新。

- **实付学费（2026-09-06）**：集群 08-16 重建、CA 08-21 重生成，钥匙串里仍是 08-17 那张（SKI `B0:99…` vs
  集群 `BD:AE…`）。之前没暴露是因为 `http://shop.dev.test` 直接 404 没人走到 https；补上 80→443 跳转
  后第一次打开就红。**重建集群的 checklist 要含「换本机根 CA」这一步**，不要等浏览器报错才想起来。

### 局域网直连已移除（2026-09-15）

原来每个后端服务 `deploy/overlays/dev/` 里的 `httproute.yaml` + `cnp-direct.yaml`（`<svc>.dev.test` 绕过 control-tower 网关直达 Service）
随 dev 层一并从清单删除，helm 侧 `directAccess` 模板也删了。调后端一律经网关：`https://gateway.apikv.com`（LAN：`gateway.dev.test`）。
线上残留的 10 条 `ecommerce-<svc>-direct` HTTPRoute 已于 2026-09-15 删除（`ecommerce` ns 从未有过 CNP，prod 的 zero-trust 是关着的）；
`cart-api.apikv.com` / `search.apikv.com` 这两个 Pangolin 资源在网关侧已无路由，代码零引用，可在 Pangolin 里一并删掉。
删除后 `helm template … -f values-prod.yaml | kubectl diff` 零输出，仓库 prod 渲染与线上无漂移〔实测 2026-09-15〕。

### 新增一个 `*.dev.test` 域名

1. 建 HTTPRoute（hostnames 写新域名，`parentRefs` 挂 `default/cilium-gateway` 的 `sectionName: https`）；
2. 在 `/etc/hosts` 对应 IP 那行追加域名，然后：

```bash
sudo sh -c 'echo "10.10.31.240  <name>.dev.test" >> /etc/hosts'   # 机房 LAN 开发机；remote-dev 不需要
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
curl -sk -o /dev/null -w '%{http_code}\n' https://<name>.dev.test/  # 业务路由只挂 443
```

### Cilium LB VIP〔实测 2026-09-15〕

| VIP | 对象 |
|---|---|
| `10.10.31.240` | `default/cilium-gateway-cilium-gateway`（80/443，所有 HTTPRoute） |
| `10.10.31.241` | `consul/consul-expose-servers`（8500/8301/8300/8502） |
| `10.10.31.241` | `postgresql/cilium-gateway-pg-passthrough-gateway`（5432） |
| `10.10.31.242` | `dragonfly/cilium-gateway-dragonfly-gateway`（6379） |

## 可观测：数据往哪流（2026-09-22 核对）

观测存储已回到集群内：VM/VL/VT/vmalert/Alertmanager/Grafana/OTel/Vector 均由 k1/k2/k3 承载。
旧 node3 Pigsty 和 `node3-*` OTLP/观测入口已退役；公网 UI 通过 Pangolin `k8s-cluster` site 访问。

| 来源 | 通路 | 配置在哪 |
|---|---|---|
| 业务服务 + 网关的 trace/metric/log | 集群内 `otel-opentelemetry-collector.opentelemetry.svc:4317/4318` → VM/VL/VT | Config Center 各服务 `observability.{trace,metric,log}.endpoint` |
| 集群自身指标与事件 | OTel Collector → 集群内 VictoriaMetrics | kubernetes `components/opentelemetry/` |
| 容器日志 | Vector DaemonSet → 集群内 VictoriaLogs | kubernetes `components/vector/values.yaml` |

应用 OTLP 不再经 Pangolin 写入，公网 OTLP 入口未接线；不要把旧 `node3-otlp.apikv.com` 写回 Config Center。

**OTLP 鉴权边界**：集群内 Collector 只接受集群网络路径；公网写入必须另做 Bearer 鉴权和 Pangolin 受限 resource，当前不开放。
三个身份的 token 真相源在 Vault/OpenBao 体系，当前 OpenBao 尚未作为恢复前置启用：

| 身份 | 谁在用 | 怎么拿到 |
|---|---|---|
| `mac_default` | 本机 `make dev` 的 10 服务 | `~/.config/apikv/otel.mk`（0600，仓库外），服务 Makefile `-include` |
| `k8s_ecommerce` | 集群里的 10 服务 | ESO → Secret `otel-auth` → env |
| `gateway` | control-tower gateway | 同上，`OTEL_EXPORTER_OTLP_HEADERS_GATEWAY` 键 |

- **值的格式是 `Authorization=Bearer%20<token>`——空格必须写 `%20`**（按 W3C baggage 规则解码），
  真空格会被截断。应用代码零改动，三个 exporter 原生认 `OTEL_EXPORTER_OTLP_HEADERS`。
- k8s 的 env 写了 `optional: true`：Secret 未就绪时退回匿名，而匿名会被判 401 ——
  **表现是遥测静默丢失，不是服务挂掉**。集群回线后先确认 `otel-auth` 已 Synced，判据：
  `kubectl get secret otel-auth -n ecommerce -o jsonpath='{.data.OTEL_EXPORTER_OTLP_HEADERS}' | base64 -d | wc -c`
  应约 **87**，只有 23 说明 Helm 把 ESO 的 `{{ .k8s }}` 占位符提前吃掉了（要写成 ``{{ `"{{ .k8s }}"` }}`` 转义）。
- ⚠️ **命名口径三个存储各不相同，查之前先确认是哪一个**〔实测 2026-09-01〕：

  | 存储 | 口径 | 例子 |
  |---|---|---|
  | VictoriaMetrics `:8428` | **下划线**（启动带 `-opentelemetry.usePrometheusNaming=true`） | `k8s_container_restarts`、label `service_name` |
  | VictoriaLogs `:9428` | **保留 OTel 点号** | `service.name`、`kubernetes.container_name` |
  | VictoriaTraces `:10428` | **保留点号且带前缀** | `resource_attr:service.name`、`span_attr:rpc.service` |

  指标侧的口径**变过一次**（早期同为点号），两种写错的方式都「查不到数据且不报错」，
  所以别凭记忆——查指标先跑 `/api/v1/label/__name__/values`，查日志/链路先跑
  `/select/logsql/field_names`。详见 [`alerting-signal-hygiene.md`](alerting-signal-hygiene.md)。

## 会白排查半天的坑

**GitOps 当前是断的。** ArgoCD 装着且在跑，但**零 Application、零 ApplicationSet**，
AppProject 只有 `default`（2026-08-29 复测仍然如此）。集群实际由 `backend/services/*/deploy/`
的手工路径驱动，`helm/values.yaml` **不是**集群真相源。因此内环开发那条「先关 ArgoCD 自动同步」
当前不适用（`scripts/argocd-devwindow.sh` 已改为诚实空转）。接回 GitOps 前先读 `argocd-app.yml`
顶部告警：chart 与实况在资源名/标签/tag 三处不符，直接开 selfHeal 会起一整套影子服务并经 Consul 抢走网关流量。

## 集群已装、但读代码看不出来的能力

做选型或排查前先看这里，别现搜。按 [tech-selection.md](tech-selection.md)，它们也应登记进
`.service-matrix.yaml` / `docs/TECH-RADAR.md`。

| 方向 | 组件 |
|---|---|
| 证书与密钥 | `cert-manager`、`trust-system`(trust-manager)、`external-secrets`、`openbao` |
| 策略与授权 | `openfga`、`kyverno` |
| 运行时安全 | `tetragon`（2026-08-28 装，事件经 vector 进 node3 日志） |
| 弹性与发布 | `keda`、`argo-rollouts`、`argocd`（见坑 ③）、`vpa`（**只有 recommender**，无 updater/webhook；live 共 17 个 VPA，其中 ecommerce 15 个均为 `Off`） |
| 网络与穿透 | Cilium Gateway API（LAN `gateway` 策略）、Pangolin + newt（Mac `remote-dev` 策略）、`cilium-secrets` |
| 存储与镜像 | `openebs`、`spegel` |
| 数据库 | CNPG：Operator 在 `cnpg-system`（`cnpg-cloudnative-pg-*`，其 `cnpg-webhook-service` 是 webhook 不是库入口），`Cluster/pg-main` 在 `postgresql`（`pg-main-rw`/`-r`/`-ro` Service + `TLSRoute/pg-main`）。2026-09-22 重建后接管业务库，node3 Pigsty 退役；核实用 `kubectl get cluster -A` |

**Pod 节点均衡**：业务 Deployment 统一带 `app.kubernetes.io/part-of: ecommerce` +
namespace 内共享的硬 `topologySpreadConstraints`（`maxSkew: 1`、`DoNotSchedule`）；spread 只约束调度不触发迁移，
倾斜后用 `scripts/rebalance-spread.sh` 受控回平（批量重启前先做 CEP/CES 对账，见 cilium-datapath-ops.md 第二节）。
consumer-next 的反亲和是 preferred（2026-09-15 起，required 反亲和 + 硬 spread + 节点污点曾叠成滚动死锁）。
**不得用 `kubernetes.io/hostname: node5` 之类硬钉实现「稳定」**——那把节点故障升级成不可调度。

VPA 发布证据、经验与下一步见
docs/reports/2026-08-29-vpa-recommendation-only.md；
约束全文、rollout 死锁处理与 VPA/Descheduler 路线见
[`docs/design/platform/capacity-balancing.md`](../../docs/design/platform/capacity-balancing.md)。

## 自助核对

本文任何一行可疑时，按下表重跑，不要靠猜：

```bash
# 域名与路由（/etc/hosts 应与此一致）
kubectl get httproute,tlsroute,tcproute -A -o custom-columns='NS:.metadata.namespace,N:.metadata.name,HOST:.spec.hostnames'
# LoadBalancer 地址
kubectl get svc -A --field-selector spec.type=LoadBalancer \
  -o custom-columns='NS:.metadata.namespace,N:.metadata.name,IP:.status.loadBalancer.ingress[0].ip,PORTS:.spec.ports[*].port'
# 集群到底跑着什么
kubectl get ns && helm list -A
# 服务从哪个环境读配置
kubectl get secret ecommerce-config-source-pre -n ecommerce -o json | jq -r '.data[]' | base64 -d | grep environment | sort -u
# 新 Pangolin 观测入口活没活（302/401/403 都算边缘活，000 才是断）
for h in grafana metrics traces vmalert alerts; do
  printf '%s -> ' "$h"; curl -sk -o /dev/null -w '%{http_code}\n' --max-time 8 "https://$h.apikv.com/"
done
```

## 相关

- 公网暴露与隧道操作：[pangolin-tunnel.md](pangolin-tunnel.md)
- 内环开发：[okteto-inner-loop.md](okteto-inner-loop.md)
- 网关 JWT 与 Casdoor 时钟偏移：[`jwt-nbf-clock-skew-loop.md`](../project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md)
- Consul TTL 首次心跳盲窗：[`consul-ttl-first-ping-blind-window.md`](../project/ecommerce/registry/experience/consul-ttl-first-ping-blind-window.md)
- 一次性搭建/迁移实录（node3、Silo、Redis TLS、PG 切流、可观测外移）：
  docs/progress-archive/node3-migration-20260824.md



本机 Mac 不在机房 LAN 时，不使用 `10.10.31.x` Gateway VIP，也不需要 `/etc/resolver/dev.test` split DNS。开发流量走：

```text
Mac → Pangolin resource → node4/node5 newt → K8s Gateway 或 node service
```

- Consul：`https://consul-dev.apikv.com` → `10.10.31.240:443`，HTTP resource 关闭 SSO，Host/TLS Server Name 保留 `consul.dev.test`。
- Dragonfly：`redis-dev.apikv.com:30005` → `10.10.31.243:6380`，raw TCP/TLS 直通。
- 配置生成：`bash tools/config-center-harvest.sh --env dev --strategy remote-dev`；`dev` 默认即 `remote-dev`。
- 机房 LAN 开发机才使用 `--strategy gateway` 与 `*.dev.test`。

本地服务默认不注册 Consul；需要注册时在对应服务目录运行 `make dev-consul`，并提供 `CONSUL_HTTP_TOKEN`。
