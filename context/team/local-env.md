---
name: local-env
layer: team
description: 本地开发机与集群连哪套基础设施：活地址、配置来源、解析与信任链，以及会白排查半天的几个坑
---

# 本地开发环境约定

> **本文只回答「现在往哪连」**，不记建设过程。凭据一律不入库（只写主机名和端口）。
> 一次性的搭建/迁移实录见 [`docs/progress-archive/node3-migration-20260824.md`](../../docs/progress-archive/node3-migration-20260824.md)，
> 别把它搬回来。
>
> **地址会漂。** 下面每张表都标了核对日期；超过日期就按「§ 自助核对」重跑一遍命令，
> 不要直接相信本文。核对完请顺手更新日期。

## 活地址（2026-08-29 逐项实测）

| 组件 | 从本机连 | 从 Pod 连 | 备注 |
|---|---|---|---|
| 共享网关 | `192.168.3.121:80/443` | 同左 | Cilium Gateway；HTTPRoute 按 hostname 接入 |
| Consul（**仅注册发现**） | `192.168.3.120:8500` | `consul-server.consul.svc:8500` | 已开 ACL，必须带 token，见下 |
| Dragonfly | `192.168.3.122:6380` | `dragonfly.dragonfly.svc:6379` | TLS-only + AUTH，明文被拒；CA 在 Secret `dragonfly-tls` |
| PostgreSQL（业务库 + config schema） | `node1:30001` | 同左 | node3 Pigsty，PG 18.6，`sslmode=verify-ca` |
| Config Center | — | `config-center.config-center.svc:30010` | Web `https://config.app.com`，API `https://config-api.app.com`；跑的是 control-tower 镜像，ns 名是遗留标签 |
| Casdoor | `https://casdoor.apikv.com` | 同左 | 集群外的外部服务 |
| Meilisearch | `search.dev.test` | `meilisearch.search.svc` | 存量运行端点；2026-09 仓库 search/indexer 代码已不再引用，不能拿它配置新代码 |
| Elasticsearch | 经 SSH 隧道使用 `127.0.0.1:9200` | **当前不可达** | search 代码目标；node3 仅回环监听，Pod 通路未解决，未运行时切流 |
| NATS JetStream | — | `nats.nats.svc` | 存量运行链和新 indexer 代码仍使用；目标 Kafka 尚未接线 |
| Kafka（仅 PoC） | `node1:30004` | 同左 | SCRAM-SHA-512；有账号和 topic，**无业务 producer/consumer** |
| node3 观测后端 | `https://node3-{metrics,logs,traces,vmalert,alerts}.apikv.com` | 同左 | 已挂 Pangolin SSO（浏览器访问返 302 跳登录；写入路径已放行） |
| node3 OTLP 入口 | `node3-otlp.apikv.com:443` | 同左 | 需 Bearer token，无 token 返 401 |

⚠️ **`192.168.3.132:5432`（pg.dev.test / CNPG `pg-main`）已是空壳**：CNPG 自 2026-08-24 起
`cnpg.io/hibernation=on`，postgresql 命名空间零 Pod。LB 和 HTTPRoute 还在，所以 **TCP 连得上、
PG 协议握不了手**——`nc` 探测会骗你。它只是回切候选，取消 hibernate 并回灌数据前不得当成可用地址。

### 基础设施主机

3 个节点，全部 arm64 / Ubuntu 26.04 LTS，都允许调度：control plane `node101`（`192.168.3.101`）、
worker `node102`（`.102`）、`node103`（`.103`）。节点 `shutdown now` 有最多 90 秒优雅退出窗口，
机制见 [node-graceful-shutdown.md](node-graceful-shutdown.md)。

**node3 是另一台机器，不在内网**：NAT 后的云主机（ssh 别名 `node3`，内网 `10.10.21.172/24`，
与 `192.168.3.0/24` **不互通**，x86_64），跑 Pigsty v4.5 全 systemd 原生服务。
**所有访问都经 node1 `node1` 的 Pangolin 隧道**——直接探 `node3:5432`
永远是 filtered，会让人误判「没通路」。隧道机制见 [pangolin-tunnel.md](pangolin-tunnel.md)。
凭据只在 `node3:/root/pigsty-deploy/.credentials-extra`（0600）与 `pigsty.yml`，不入库。

## 配置加载：Config Center 是唯一来源

服务启动读 `configs/source.dev.yaml`（被 gitignore）里的 selector 自举，再从 Config Center 拉
`<service>/<env>/bootstrap.yaml`。selector 缺失、token 无效或 key 不存在 → **直接启动失败**。
没有 KV 回退（Consul KV 已退役，见
[`consul-kv-retired.md`](../project/ecommerce/config/experience/consul-kv-retired.md)）。

⚠️ **只有 `dev` 一个环境，集群跑的也是 `dev`**（2026-08-29 实测：`config.entry` 共 15 个 key，
`environment` 唯一取值 `dev`；集群 Secret `ecommerce-config-source-dev` 里 10 个服务全写
`environment: dev`）。历史上写过「dev 只能开发机跑、k8s 必须用 pre」——**那条约定已不成立**，
`pre` 分支从未建过。要恢复环境隔离，得先在 Config Center 里真的建出 `pre` 再改这里。

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
而且 `pg-main-rw` 指向的 CNPG **已经 hibernate**，即使解析得了也连不上。两条出路：

1. 用上表的活地址覆盖（PG `node1:30001`、Dragonfly `192.168.3.122:6380`、Consul `192.168.3.120:8500`）；
2. 走内环开发，在集群身份下跑代码 —— [okteto-inner-loop.md](okteto-inner-loop.md)。


## `*.dev.test` 解析与 TLS 信任

**不跑任何 DNS 服务**，Mac 的 `/etc/hosts` 直接写死到集群 LoadBalancer IP。判据是规模：
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

### 新增一个 `*.dev.test` 域名

1. 建 HTTPRoute（hostnames 写新域名，`parentRefs` 挂 `default/cilium-gateway` 的 `sectionName: https`）；
2. 在 `/etc/hosts` 对应 IP 那行追加域名，然后：

```bash
sudo sh -c 'echo "192.168.3.121  <name>.dev.test" >> /etc/hosts'   # 或编辑已有行
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
curl -sk -o /dev/null -w '%{http_code}\n' https://<name>.dev.test/  # 业务路由只挂 443
```

### 地址分段

| 段 | 范围 | 用途 |
|---|---|---|
| DHCP | `192.168.3.2-20` | 路由器动态分配 |
| Cilium LB 池 | `192.168.3.100-199` | `CiliumLoadBalancerIPPool/default-pool` |
| 静态 | `.101` `.102` `.103` `.220` | node101 / node102 / node103 / Mac |

**新增静态地址前先确认不落在上面两段内。** 2026-08-18 前 DHCP 段覆盖了整个 LB 池，
`192.168.3.100` 被局域网设备（随机化 MAC）抢占过，表现为 ping 通但延迟数百毫秒、80/443 全闭。

## 可观测：数据往哪流（2026-08-29 核对）

集群内**没有任何观测存储**（`victoriametrics` / `observability` 两个 ns 是空的，只剩标签），
后端全在 node3。两条腿互相独立，改一条不影响另一条：

| 来源 | 通路 | 配置在哪 |
|---|---|---|
| 10 个业务服务 + 网关的 trace/metric/log | **直连** `node3-otlp.apikv.com:443` → node3 上 docker 跑的 otelcol → 本机三个 Victoria | Config Center 各服务 `observability.{trace,metric,log}.endpoint` |
| 集群自身指标与事件（`k8s_cluster` / `k8sobjects` / cilium / hubble / vector） | 集群内 otel collector → 直发 node3 Victoria 端点 | kubernetes 仓 `components/opentelemetry/` |
| 容器日志 + tetragon 安全事件 | vector DaemonSet → `node3-logs.apikv.com/insert/jsonline` | kubernetes 仓 `components/vector/values.yaml` |

**集群内那个 collector 不在业务链路上**（2026-08-28 重装，角色变了）：业务服务是直连 node3 的。
想让业务遥测改道，只能改 Config Center，改 collector 没用。

**OTLP 已强制鉴权**（2026-08-27 起，匿名写入关闭）：`node3-otlp` 挂不了 Pangolin SSO（机器客户端
过不了浏览器登录墙），鉴权落在 collector 的 `bearertokenauth` 上。无 token / 错 token 一律 401。
三个身份的 token 真相源在 Vault `secret/observability/otlp`：

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

## 会白排查半天的三个坑

**① 集群拉镜像依赖这台 Mac 上的代理。** 节点 containerd 配了 `http-proxy = 192.168.3.220:7890`，
而 `.220` 就是这台开发机（FlClash 混合端口）。**Mac 关机或代理没开 → 全集群拉不了新镜像**，
症状是 `ImagePullBackOff` + `proxyconnect tcp: dial tcp 192.168.3.220:7890: connect: connection refused`，
极易误判成「私有仓凭据不对」（2026-08-19 实付学费，当时 TCR 凭据完全正常）。
**判据：报错里出现 `proxyconnect` 就是代理问题，与 registry 凭据无关**；已在跑的 Pod 不受影响。
`ccr.ccs.tencentyun.com` 已加进 `NO_PROXY`（源在 `../kubernetes/bootstrap/config.env`），其余仓库仍走代理。
这是个真实单点：笔记本合盖 = 集群失去发布能力。集群装了 `spegel` 做 P2P 分发能缓解重复拉取，但首拉仍要出网。

**② 库搬到集群外后，带 NetworkPolicy 的 tool 会被自己的 egress 白名单挡住。**
只有 `outbox-relay` / `search-indexer` / `product-seed` / `search-reindex` 有 NetworkPolicy，
原先只放行 postgresql 命名空间的 5432。症状是 **`connect: connection timed out`（不是拒绝）**，
十个业务服务全好、唯独 relay 起不来，很容易误判成隧道不稳。egress 需补
`ipBlock: <node1-source-cidr>` + `port 30001`（已在 `backend/tools/outbox-relay/deploy/dev/deployment.yaml` 补好）。

**③ GitOps 当前是断的。** ArgoCD 装着且在跑，但**零 Application、零 ApplicationSet**，
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
| 网络与穿透 | Cilium Gateway API、`cilium-secrets`、`pangolin`(newt，2026-08-28 起集群内也有站点) |
| 存储与镜像 | `openebs`、`spegel`（`cnpg-system` 已整体移除——2026-08-30 实测 ns 与 CNPG CRD 均不存在，PG 数据面只剩 node3 Pigsty） |

**OpenBao 自动解封**：`node101` 上 `openbao-auto-unseal.timer` 每 60 秒检查一次，sealed 时读
`/var/lib/k8s-installer/creds/openbao-init` 解封。满足无人值守重启，但 unseal key 与集群管理权限
同信任域——它**不能**替代外部 KMS 或 Transit auto-unseal，迁到独立信任根后应移除该 timer。

**Pod 节点均衡**：业务 Deployment 统一带 `app.kubernetes.io/part-of: ecommerce` +
namespace 内共享的硬 `topologySpreadConstraints`（`maxSkew: 1`、`DoNotSchedule`），健康态分布 5/6/6〔实测 2026-08-29〕；
〔实测 2026-08-30〕扩容统一重启曾遗留 14/2/1 倾斜——spread 只约束调度不触发迁移，同日已受控 rollout 回平至 6/6/5（批量重启前先做 CEP/CES 对账，见 cilium-datapath-ops.md 第二节）。
**不得用 `kubernetes.io/hostname: node103` 之类硬钉实现「稳定」**——那把节点故障升级成不可调度。

**VPA recommendation-only 基线（2026-08-29）**：Helm revision 2 只运行 recommender `1.7.1`，
推荐地板为 `10m/32Mi`。ecommerce 的 15 个 VPA 全部是 `Off`/`RequestsOnly`，且
`RecommendationProvided=True`；发布前后 17 个 active Pod 身份未变化。初始推荐仅用于确认采集链，
至少观察 7 天并覆盖 k6/启动窗口后才能写回 requests。config-center 的两个历史 VPA 仍为
`InPlace`，但当前没有 updater/webhook，不会修改 Pod；未来启用自动组件前必须先复查它们。

VPA 发布证据、经验与下一步见
[`docs/reports/2026-08-29-vpa-recommendation-only.md`](../../docs/reports/2026-08-29-vpa-recommendation-only.md)；
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
# CNPG 是否还 hibernate
kubectl get cluster pg-main -n postgresql -o jsonpath='{.metadata.annotations.cnpg\.io/hibernation}'
# 服务从哪个环境读配置
kubectl get secret ecommerce-config-source-dev -n ecommerce -o json | jq -r '.data[]' | base64 -d | grep environment | sort -u
# node3 入口活没活（302/401/403 都算活，000 才是断）
for h in node3-metrics node3-logs node3-traces node3-otlp; do
  printf '%s -> ' $h; curl -sk -o /dev/null -w '%{http_code}\n' --max-time 8 https://$h.apikv.com/
done
```

## 相关

- 公网暴露与隧道操作：[pangolin-tunnel.md](pangolin-tunnel.md)
- 内环开发：[okteto-inner-loop.md](okteto-inner-loop.md)
- 网关 JWT 与 Casdoor 时钟偏移：[`jwt-nbf-clock-skew-loop.md`](../project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md)
- Consul TTL 首次心跳盲窗：[`consul-ttl-first-ping-blind-window.md`](../project/ecommerce/registry/experience/consul-ttl-first-ping-blind-window.md)
- 一次性搭建/迁移实录（node3、Silo、Redis TLS、PG 切流、可观测外移）：
  [`docs/progress-archive/node3-migration-20260824.md`](../../docs/progress-archive/node3-migration-20260824.md)
