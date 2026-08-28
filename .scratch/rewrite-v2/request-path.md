# v2 请求链路蓝图：从 QUIC 客户端到微服务与事件流

> 定位：[`rewrite-baseline.md`](rewrite-baseline.md) 的附卷一。以**一次真实请求的旅程**为主线
> （客户端 QUIC → CDN → Pangolin 公网校验 → Cilium → 应用网关中间件 → 微服务 → 数据与事件），
> 逐跳落地九个主题：基础设施完备、可观测性、全栈、DDD、微服务、RBAC、分布式、MQ、一致性。
> 事实与建议分开：〔实测〕〔官方声明〕来自 [`../bun-runtime-quic/research.md`](../bun-runtime-quic/research.md)
> 与 `context/team/pangolin-tunnel.md` 的证据；〔v2 设计〕是本文新决策；〔待验证〕落地前必须实测。
> 领域模型、K0–K6 事件路线、分阶段验收的完整版在 baseline，本文不重复只引用。

---

## 0. 全链总览

```text
 Hop0 客户端(Browser/Tauri, connect-web + Protobuf-ES)
   │  HTTPS：首连 H2 → Alt-Svc 升级 HTTP/3(QUIC/UDP 443)
 Hop1 CDN / WAF / DDoS（v2 新增；静态域全缓存，API 域仅防护与回源）
   │  回源：TCP+TLS（H2；H3 回源按厂商能力〔待验证〕）
 Hop2 Pangolin 公网入口（node1 VPS：Gerbil + Traefik v3.7）
   │  ①TLS/H3 终止 ②badger 资源策略/SSO ③云防火墙 CIDR
   │  WireGuard 隧道(UDP 51820/21820, newt) → 内网
 Hop3 Cilium（LB-IPAM → Gateway API/Envoy TLS 终止 → eBPF/KPR 负载）
   │  CiliumNetworkPolicy：default-deny + gateway-only + egress 白名单
 Hop4 control-tower 应用网关（中间件链，见 §5）
   │  h2c（明文 HTTP/2，网络层由 Cilium 策略与节点加密兜底）
 Hop5 服务发现与路由（Consul Watch + 健康过滤 + P2C → 目标迁 K8s Service DNS）
 Hop6 微服务（fx 四层 DDD，拦截器链，owner 校验 = 授权第三道门）
 Hop7 同步一致性段（PostgreSQL 事务/行锁/CAS/幂等键；TCC 同步段）
 Hop8 异步段（同事务 outbox → relay → Kafka(K0–K6) → consumer Inbox → Saga 补偿）
        └─ 观测：每一跳发 OTel（trace/metric/log）→ node3 Victoria 三支柱
```

### 0.1 协议与身份变换总表（每跳做什么、变什么）

| 跳 | 入协议 | TLS 在哪终止 | 出协议 | 身份载体（入→出） | 该跳新增/剥离 | 负载均衡 |
|---|---|---|---|---|---|---|
| 0 客户端 | — | — | H3/H2 | httpOnly cookie（Web）/ session header（Tauri）/ legacy bearer | 加 `traceparent`、幂等键 | — |
| 1 CDN | H3/H2 | CDN 边缘（公网证书） | H2/H1.1 回源 | 透传 cookie/header | 加 `X-Forwarded-For`/真实 IP 头（规范化） | 边缘就近 |
| 2 Pangolin | H3/H2〔实测已通告 Alt-Svc〕 | Traefik（ZeroSSL 泛证书） | HTTPS over WireGuard | 透传 | badger SSO 仅拦运维面资源；业务 API 资源 SSO off | Traefik service（单 target） |
| 3 Cilium GW | HTTPS | Gateway listener（cert-manager 证书） | HTTP/1.1（h2c 〔待验证〕） | 透传 | L3/4 策略裁决：非法源直接 deny | eBPF/KPR socket-LB |
| 4 应用网关 | HTTP/1.1+h2c | —（已明文） | h2c | cookie/JWT → **`x-md-global-*` 可信头** | **无条件剥离入站 `x-md-*`**，认证后注入；剥 cookie 不下传 | P2C 选点 |
| 5-6 微服务 | h2c | — | — | 只认 `x-md-global-*` | 不解析 session/JWT | — |
| 7 PG | — | 客户端 TLS `verify-ca` | — | 服务账号 | owner 条件进 SQL | PgBouncer（v2） |
| 8 Kafka | TLS+SASL/ACL | broker | — | 服务 principal | 事件 envelope（event_id/tenant/trace） | partition by key |

### 0.2 九主题 → 落地位置

| 主题 | 落地章节 |
|---|---|
| 基础设施完备 | §2 CDN、§3 Pangolin、§4 Cilium、§13 分阶段验收；baseline §5 |
| 可观测性 | §10（贯穿每跳的观测点 + trace 传播 + RUM join） |
| 全栈 | §1 客户端（4 app + BFF 登录 + 埋点）+ §5 网关 + §7-9 后端 |
| DDD | §7 微服务内部分层；baseline §6 领域模型 |
| 微服务 | §6 发现路由、§7 服务内部、§12 失败模式 |
| RBAC | 四道门：§3 badger（运维面）→ §5 Casbin（procedure）→ §7 owner（对象）→ P2 OpenFGA |
| 分布式 | §11 超时/重试/背压预算、§12 失败模式、baseline §7 |
| MQ | §9 outbox→Kafka→Inbox；baseline §5.3 K0–K6 |
| 一致性 | §8 同步段（PG/TCC）+ §9 异步段（Saga/对账）+ 不变量（baseline §6） |

---

## 1. Hop 0：客户端与前端（全栈的起点）

**形态**：4 个 app（consumer:3000 / merchant:3002 / admin:3003 / desktop=Tauri 壳），pnpm workspace + vite-plus；RPC 用 connect-web + Protobuf-ES，与后端共享同一份 proto——**契约先行是全栈的地基**，一次 proto 变更同时检查 Go 与 TS。

**QUIC 怎么发生**：前端代码不感知 H3。浏览器首连走 TCP+TLS（H2），收到边缘返回的 `Alt-Svc: h3=":443"` 后续请求自动升级 QUIC〔实测：现网 Pangolin 已返回该头〕。可选加 DNS HTTPS RR（SVCB）让首连即 H3。Tauri（WebView）同理由系统网络栈决定。**结论：H3 是边缘配置问题，不是前端代码问题**；`fetch`/connect-web 零改动。

**最佳实践**：

- **transport 统一构造**：`createConnectTransport({ baseUrl: VITE_GATEWAY_URL, interceptors: [auth, logger, error] })`；拦截器与错误模型收敛在 `@ecommerce/api`——`toAppError` 保证 message 非空，`AUTH_REASONS`（退登）与 `PERMISSION_REASONS`（仅提示）分开，无差别退登会把「无权限」误判成「未登录」（v1 经验）。
- **身份**：Web 只持 httpOnly cookie，Tauri 用 session header，浏览器不落 token（v1 曾把 token/user 放 localStorage → PII 留盘 + 登出登不干净，已血偿）。登录走 `/auth/login → Casdoor → /auth/callback`。
- **写请求带幂等键**：`requestId`（UUIDv7）必须真实存在于 proto 并被服务端消费——v1 曾用 cast 假装字段存在、运行时被丢弃，防重从未生效。
- **超时预算自上而下**：前端统一请求预算（示例 8s，见 §11），比网关路由级超时略长，避免「前端先放弃、后端还在跑」的孤儿请求。
- **埋点例外**：页面关闭那次上报用 `navigator.sendBeacon` + 手写 Connect unary JSON 线格式——beacon 不允许自定义头（`Connect-Protocol-Version`），这是 v1 验证过的唯一送得出去的方式。
- **RUM**：`@ecommerce/perf` 上报 Web Vitals；v2 必须补 traceparent 透传 + 网关回 `Server-Timing`，否则前端慢请求与后端 span 永远无法 join（v1 已确认缺口）；四个 app 都要 `initPerf`，不只 consumer。
- consumer 评估 TanStack Start 做 SSR/SSG（SEO/首屏）；merchant/admin 保持 SPA；OpenFeature + Unleash 做灰度开关（P1）。

---

## 2. Hop 1：CDN / WAF / DDoS（v2 新增层）

**职责**：静态加速 + 攻击面外移。**自研 Go 网关和家庭出口不承担清洗中心职责**——WAF、Bot、大流量 DDoS 放云边缘。

〔v2 设计〕：

- **域名拆分**：`static.*`（前端产物、商品图，全缓存）与 `api.*`/`shop.*`（动态，仅防护+回源不缓存）分开；商品图经 imgproxy 出多尺寸/AVIF/WebP + 防盗链签名 URL，业务 Pod 不扛公网图片带宽。
- **缓存策略**：静态 immutable + content-hash；商品详情/类目页走 ETag + stale-while-revalidate；API 响应默认 `Cache-Control: no-store`，可缓存的公共配置显式声明。
- **H3**：主流云 CDN 支持对客户端开启 HTTP/3，开启后 Hop0↔Hop1 全程 QUIC；**回源协议按厂商能力配置，默认 TCP+TLS(H2)**〔待验证〕。
- **真实 IP 规范化**：边缘注入 `X-Forwarded-For`/真实 IP 头并**覆盖**客户端伪造值；下游（Pangolin/网关）只信任第一跳边缘。限流、风控、审计都依赖这一条。
- **回源收敛**：CDN → Pangolin 443 单一回源点；源站防火墙可进一步只放行 CDN 回源网段（腾讯云 Lighthouse 用 `CidrBlock` 锁死，禁止 `0.0.0.0/0`——v1 规矩）。
- **国内合规红线**：未备案域名在部分云商会被 ICP 网络层拦截（HTTP 403 `Beaver`/HTTPS SNI reset，v1 在阿里云实付学费）——上 CDN 前先核对备案与云商归属，判别法：纯 IP 通、带域名 403/reset 即是。

---

## 3. Hop 2：Pangolin 公网入口（QUIC 终止与第一道校验）

**现状事实**（node1 腾讯云 VPS，Pangolin CE 1.21.1 + Gerbil 1.4.3 + Traefik v3.7）：

- **HTTP/3 已启用**〔实测〕：compose 暴露 `443:443/udp`，Traefik `websecure` entryPoint 配 `http3.advertisedPort: 443`，公网已返回 `Alt-Svc: h3=":443"; ma=2592000`。H3 是 **downstream-only**：Traefik 终止 QUIC 后，向上游只会用 TCP+H1.1/H2（ServersTransport 无任何 h3 选项〔官方声明〕）。
- **隧道是 WireGuard 不是 QUIC**〔官方声明〕：newt 站点经 UDP 51820/21820 回源；「newt 用 QUIC」是二手讹传（上游仅有未合入提案）。QoS 恶化时的 fallback 是换 TCP 隧道层。
- **TLS**：ZeroSSL `*.apikv.com` 泛证书终止在 Traefik；⚠️ 自动续期链路缺位（当前手工续，2026-11-25 到期，到期=所有公网入口一起挂）——v2 P0：acme.sh/DNS-01 定时续期 + 双部署点同步 + ntfy 到期告警。
- **第一道校验（badger 资源策略）**：Pangolin 按 resource 施加 SSO 登录墙/路径放行规则——**定位是运维面与控制面的门**（argocd/consul/grafana 等 SSO on）；业务 API 资源必须 SSO off（机器客户端过不了浏览器登录流），鉴权交给 Hop4 的应用网关。**SSO 与应用自带鉴权二选一，关 SSO 前先确认应用自身鉴权非空**（v1 gorse 教训）。
- **云防火墙是真相**：`docker ps` 显示 `0.0.0.0:<port>` ≠ 公网可达；判断暴露面从外部实测、带对照端口。放行规则 IPv4/IPv6 成对处理；先加新规则再删旧规则（中间是裸奔/断连窗口）。

**转发链**：Traefik（终止 H3/TLS）→ WireGuard 隧道 → k8s 站点 target = cilium-gateway ClusterIP `:443`（HTTPS，`insecureSkipVerify` 兼容集群自签证书；当前值以 `kubectl -n default get svc cilium-gateway` 实查为准）。

**503/502 排查纪律**（v1 四笔学费换来的验收三条，缺一不可）：① Pangolin `traefik-config` 里该资源 `servers` 非空；② 公网响应（SSO on→302，off→业务响应；Traefik 动态配置 5s 轮询，改完等 ≥6s）；③ 带 Host 头绕过登录墙直测后端真实回源。**302 只证明登录墙在，不证明后端活着**。建资源必须走面板/API（DB 后门补不出 internalPort/authToken）；health check 要开就必须配对 `hcPort`/`hcPath`，否则健康后端被误判 unhealthy。

**生产化边界**〔v2 设计〕：Pangolin/隧道**不做中大型生产流量主路径**——放量后主路径切云 LB/专线直入集群，Pangolin 降级为运维入口与备线；这与「QUIC 公网校验」不矛盾：H3 终止点随主入口迁移（云 LB/CDN 同样支持 H3），badger 继续看住运维面。raw TCP/UDP entrypoint（30001-30003 已预留）仅用于数据库等点对点通道，不承载业务 API。

---

## 4. Hop 3：Cilium——网络策略与负载

**在用**：Cilium CNI + kube-proxy replacement（eBPF socket-LB）+ LB-IPAM（cilium-gateway LB `192.168.3.121`）+ Gateway API 数据面；listener TLS 由 cert-manager 签发的集群证书终止。netkit/BBR 在选型基线中列为在用项，集群重建时逐项复核〔待验证〕。

**已实付的坑**：本仓 HTTPRoute parentRef 全带 `sectionName: https`——**路由只挂 443 listener，80 上零路由，Envoy 对一切 Host 返 404**。Pangolin target 必须走 443/https；判别 404 来源看响应头 `server: envoy` + 直连 svc 对比。孤儿 HTTPRoute（后端已卸载）只会产出 502——建公网入口前先查 `kubectl get endpoints`。

**v2 必须补齐的网络策略（P0，当前缺口）**——「后端只信任网关」从设计假设变成可强制不变式的唯一途径：

```yaml
# ① namespace 级 default-deny（ecommerce ns，ingress+egress 全拒）
# ② gateway-only ingress：业务服务只收 control-tower gateway 的流量
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: { name: allow-from-gateway-only }
spec:
  endpointSelector: { matchLabels: { app.kubernetes.io/part-of: ecommerce } }
  ingress:
    - fromEndpoints:
        - matchLabels: { app: control-tower-gateway }
      toPorts: [{ ports: [{ port: "8080", protocol: TCP }] }]
# ③ egress 白名单：每服务只放行 .service-matrix.yaml 声明的依赖
#    （PG 30001 / Dragonfly 6379 / Kafka / Meilisearch 7700 / Config Center / OTLP）
#    + kube-dns。矩阵是策略的生成源，structcheck 核对两边一致。
```

推进纪律：先用 **Hubble** 观察真实流量画出基线 → 按矩阵生成策略 → audit 模式跑一轮 → 收紧 enforce；每条 deny 都要在 Hubble 里可查证据。relay/indexer/gorse 出口、`kubectl port-forward` 调试路径都要显式建策略，否则收紧当天最先断的是自己人。节点间加密（WireGuard/IPsec）与 BBR 上线前先压测开销；Tetragon 做运行时检测（P1）。

**负载**：KPR 的 eBPF socket-LB 使 Service 转发无 iptables 开销；Gateway/HTTPRoute 层做 host/path 分流。注意 **h2c 长连接会钉死单 endpoint**——L4 负载对多路复用连接只在建连时生效，扩容后旧连接不再均衡；对策在 Hop5（客户端多连接+轮换）与 Rollouts（按副本切流）。

---

## 5. Hop 4：control-tower 应用网关——中间件链

网关是「认证授权 + 路由 + 治理」的收敛点，Connect 原生反向代理（HTTP/1.1 + h2c）。**中间件顺序本身就是安全语义**，逐个说明为什么在这个位置：

| # | 中间件 | 职责 | 为什么在这个位置 / v1 教训 |
|---|---|---|---|
| 1 | recover | panic → Connect internal 错误 | 最外层，任何后续环节炸了都有规范响应 |
| 2 | otelhttp | 建 span、续 `traceparent` | 尽早开 span 才能覆盖后续所有环节耗时；**采样必须 ParentBased 对齐后端**——v1 网关 AlwaysSample 是 trace 根，后端 ratio 压不住，高峰打爆 collector |
| 3 | access log | 结构化访问日志 | 在认证前记录，攻击流量也留痕；**5xx 必须按 `StatusCode>=500` 记错误**——v1 只看 `err!=nil`，后端 503 被记成功、告警全漏 |
| 4 | CORS | Origin allowlist + 暴露 Connect 头 | 认证之前拒掉非法跨域；`Access-Control-Expose-Headers` 带上 `X-Error-Reason`，否则前端读不到错误原因 |
| 5 | **剥离入站 `x-md-global-*`** | 无条件删除客户端伪造身份头 | **必须在匿名清单判断之前**——v1 免鉴权路径曾放行伪造身份头直达后端，任何人可自称任何人（已修并有回归测试，v2 不得回退） |
| 6 | 路由匹配 + 匿名清单 | procedure → 目标服务；匿名路径显式列举 | 匿名清单是白名单（搜索/商品详情/登录/支付回调/埋点），默认一切需认证 |
| 7 | **认证**：BFF session ∥ legacy JWT | session 查 Dragonfly；JWT 验 issuer/audience/type/sub/iat/exp + 60s 时钟偏移 | session store 不可达 **fail-closed**；删 session 即时撤权；JWT leeway 治了 v1 的 nbf 时钟偏移循环登录；`/readyz` 纳入 session store 可达性 |
| 8 | **授权第二道门**：Casbin RBAC | roles × Connect procedure，默认拒绝 | 模型/策略从 Config Center Watch，原子替换 + last-known-good + 指数退避；策略变更要 canary 和快速回滚 |
| 9 | 注入可信身份 | 写入 `x-md-global-user-id/roles/...` | 认证授权都过了才注入；同时**剥掉 cookie 不下传**（后端永远拿不到原始凭据） |
| 10 | 〔v2 新增〕治理组 | per-procedure 请求大小/并发/deadline；用户/商家/IP/设备 quota；总并发上限 + load shedding；bulkhead（支付/搜索/埋点独立并发池）；retry budget（仅幂等 procedure）；熔断（有恢复+降级语义才引入） | v1 明确没有这些（旧网关 BBR/熔断/重试已随 go-kratos fork 删除）；v2 按「先定义失败语义和幂等边界、压测验收后才开启」的门禁逐个加——**网关重试复制非幂等写单**是 v1 评审抓出的真实风险 |
| 11 | 路由级总超时 | 每 procedure 显式 deadline | 见 §11 预算表；支付回调类单独放宽 |
| 12 | 发现 + P2C 选点 → h2c 转发 | 见 Hop5 | — |

**错误规范**：404/405/无可用节点/超时等非业务错误也按 Connect 规范返回 `{code,message,details[]}` + `X-Error-Reason`（`gwerrors` 包）——前后端只处理一种错误形状。

**配置面**：路由表、JWT 公钥、Casbin model/policy、撤销名单全部经 Config Center Watch 热更新；网关自身的启动依赖要有**本地 last-known-good 快照**，控制面不可达时用旧配置起动（v2 P0，治「Config Center 挂 = 全线起不来」）。

---

## 6. Hop 5：服务发现与路由（网关 → 微服务）

- **现状**：Consul Watch + 健康节点过滤 + **P2C（power of two choices）**选点，h2c 直连 Pod。Consul 只做注册发现（KV 已退役）。
- **目标（定稿）**：迁 K8s Service DNS + Cilium KPR，四步走：①每服务建 ClusterIP + readiness ②网关双写影子解析比对 ③灰度切 ClusterIP 观察连接分布 ④删 Registrar、退役 Consul、收网络策略。**Argo Rollouts 的按权重切流以此为硬前置**（网关直连 Pod IP 时 Service 权重不生效）。
- **h2c 连接治理**：长连接钉死单 endpoint 的对策（按序）：每 endpoint 多连接 + 定期优雅轮换 → headless + DNS → 网关 watch EndpointSlice。滚动发布时靠 readiness 摘流 + 连接 drain（服务端 GOAWAY）。
- **注册质量**（v1 经验）：TTL 心跳首跳盲窗、Consul ACL token 缺失是**静默失败**——注册失败必须显式告警，不能让服务「看起来在线」。

---

## 7. Hop 6：微服务内部——DDD 分层与授权第三道门

**分层（fx 装配，v1 验证过的形状直接继承）**：

```text
cmd/server/main.go   fx.App + fx.ValidateApp 静态验依赖图 + 优雅关闭（OTel flush 收尾）
internal/
├── server/    h2c server、拦截器链、healthz/readyz
├── service/   proto ⇄ biz 转换 + 错误码映射（唯一允许 import api/*/v1 的层）
├── biz/       领域模型（纯 struct）+ Repo 接口 + UseCase —— 不 import proto、不 import data
├── data/      Repo 实现：pgx/sqlc、cache、search、object、event（outbox 写入在这层）
└── pkg/       config/log/otel/registry —— v2 收敛为共享库，不再十份复制
```

依赖方向铁律 `server → service → biz ← data`：领域逻辑与传输/存储解耦，这就是 DDD 在代码里的形状；bounded context 对应服务边界，聚合不变量在 biz，**跨聚合只通过事件**（Hop8）。

**拦截器链**：otelconnect（`WithoutServerPeerAttributes()`——v1 的 `net_peer_port` 高基数让 rate() 恒 0）→ LoggingInterceptor（`rpc.procedure`/`rpc.code`/`trace_id`；注意 connect 无 CodeOK，成功要显式记 ok）→ `validate.NewInterceptor()`（protovalidate，结构性校验在入口一次做完）。

**授权第三道门（owner 校验）**：service 层从 `x-md-global-*` 读身份，**绝不信请求体里的 user_id/merchant_id**；每条用户/商家查询在 SQL 或领域层带 owner 条件（`AND user_id = @uid` / `AND merchant_id = @mid AND store_id = @sid`）。**RBAC 过了不等于对象是你的**——v1 的 address 全线越权、商家审批全表 UPDATE 都是缺这一层。桩实现一律显式 `Unimplemented`，禁止静默空操作。

**健康**：`/healthz` 聚合 DB/Cache 依赖（不健康 503 摘流）；`/readyz` 含配置就绪；启动日志必打实际生效的配置源。配置来自 Config Center（selector 自举，缺键/未知键直接启动失败——ErrorUnused + protovalidate 已接线，不得回退）。

---

## 8. Hop 7：同步一致性段——PostgreSQL 事务与不变量

请求落到写路径后，一致性的第一段在数据库边界内解决：

- **正确性锚点唯一**：PG 事务 + 行锁 + 条件更新（CAS）+ 唯一约束。**Redis/Dragonfly 禁承载锁、幂等键、库存真相**——锁键被驱逐即超卖（v1 已废止 Redis 可重入锁）。
- **TCC 同步段**：建单事务内同步 RPC 调库存 `ReserveGroup`（全组原子，一次请求一个库存事务），预占成功才建单成功；条件更新形如 `UPDATE ... SET reserved = reserved + @q WHERE sku_id=@sku AND available >= @q`，**检查受影响行数**——v1 的 Reserve 四连坑（比对未来版本号、丢弃行数、语义颠倒、恒 nil err）全因没检查。
- **幂等**：`requestId` 唯一约束落库，重复提交返回原结果；支付回调按渠道单号幂等，验签 + 防重放。
- **不变量**（baseline §6 全文）：库存 `available + reserved + locked == on_hand` 由属性测试守护；金额 int64 分；游标分页；每服务一 schema、跨服务只存 ID+快照不 JOIN。
- **长事务纪律**：事务内不做网络调用（broker publish 曾在事务+行锁内执行——v1 已识别为容量风险，v2 relay 移出事务窗口）；`statement_timeout`/`lock_timeout` 显式设置。

---

## 9. Hop 8：异步段——outbox → Kafka → Inbox（MQ 与最终一致）

同步段落库的同一事务里写 outbox，请求即可返回；剩余一致性交给异步段（路线全文 baseline §5.3，此处只述链路语义）：

```text
业务事务 [ 领域写 + outbox insert ]  ←—— 原子边界
  → relay（advisory lock 单活；broker ack 才写 published_at；ack 后崩溃=允许重投）
  → Kafka（K0–K6：沙箱→地基→ProductChanged 影子链→搜索切流→交易事件→分析 CDC→退役 NATS）
      · partition key = group_no（同订单组保序）；交易 topic RF=3、min.insync=2、acks=all（以压测定稿）
      · 事件 = Protobuf schema（Buf 管兼容）+ CloudEvents envelope（event_id=UUIDv7/aggregate/tenant/trace/version）
  → consumer：持久 Inbox 幂等（与业务副作用同事务提交）→ NACK/backoff → max deliver → DLQ
      · poison 分类、重放需授权并审计；需要业务顺序的再校验单调 aggregate version
  → Saga 编舞：PaymentCaptured → InventoryConfirmRequested → InventoryConfirmed
      → OrderReadyForFulfillment（履约唯一门禁）；失败显式事件 + 补偿（补占一次→退款出口）
  → 兜底：backstop job（超时取消、对账）；分析 CDC（Debezium/Connect）与领域事件严格双轨
```

铁律：**不在业务事务内双写两个 broker**；迁移期两个 ack 独立记录；broker 的 EOS/去重窗口不替代业务幂等；搜索/缓存/报表永远是可重建投影。KEDA 按 lag 扩 consumer 的前置是幂等与下游容量已证明。

---

## 10. 横切：可观测性贯穿整条链

**一条 trace 走完全程**：前端生成 `traceparent`（RUM）→ CDN/Traefik 透传 → 网关 otelhttp 续 span（ParentBased 采样）→ otelconnect 服务 span → otelpgx DB span → outbox/relay/consumer 把 `traceparent` 写进事件 envelope，异步段 span link 回原 trace。网关回 `Server-Timing` 让 RUM 可 join〔v2 补缺〕。

| 跳 | 指标（RED/USE） | 日志 | Trace |
|---|---|---|---|
| 客户端 | Web Vitals、`frontend_api_duration` | 前端异常 → Sentry/GlitchTip（P1） | RUM traceparent |
| CDN | 命中率、回源量、边缘 4xx/5xx | 边缘访问日志（抽样） | — |
| Pangolin | Traefik entrypoint qps/时延/5xx、证书剩余天数、隧道在线 | Traefik access log | 透传 |
| Cilium | Hubble flow/policy-deny 计数、L4 时延 | Hubble 事件 | — |
| 网关 | 每 procedure RED、quota/shedding 拒绝数、上游选点分布 | 结构化访问日志（5xx 正确分级） | 根 span |
| 微服务 | RED + Go runtime（goroutine/GC/heap）+ pgx pool wait | zap→otelzap（限流 + suppressed counter 可见） | 服务/DB span |
| Kafka 段 | consumer lag、DLQ 深度、relay 积压/发布延迟 | relay/consumer 结构化日志 | envelope 传播 |
| 存储 | PG（连接/慢查/膨胀/WAL）、Dragonfly（命中/驱逐/内存） | auto_explain 慢 SQL | otelpgx |

采集面：应用 OTLP → node3 Collector（tail-based sampling：保错误与慢链路）→ VM/VL/VT；Vector 采容器日志；Grafana 统一展示；vmalert → Alertmanager → ntfy（已实测）+ 飞书/企业微信（P0 待接）。纪律：指标禁高基数标签；**外部探针放在业务故障域之外**；每条 critical 告警带 owner/影响/Runbook/Silence 条件/恢复验证；k6 结果 remote-write 进 VM，与 capacity profile 同源验收。

---

## 11. 横切：超时、重试与背压预算

**预算自上而下递减，重试只在一层做**（示例起始值，一律以 capacity profile 压测校准）：

| 层 | 超时 | 重试 |
|---|---|---|
| 前端 | 总预算 8s（支付回跳类单独 15s） | 不自动重试写请求；读请求最多 1 次且带幂等语义 |
| CDN | 回源连接 5s / 读 30s | 静态可重试；API 透传不重试 |
| Pangolin/Traefik | 转发超时显式配置（默认无限是坑） | 0 |
| 网关 | 路由级总超时：读 3s / 写 5s / 支付回调 15s；treat as deadline 下传 | **唯一允许重试的层**：仅幂等 procedure、retry budget（如 ≤10% 额外流量）、服从剩余 deadline |
| 微服务 | handler ctx 继承网关 deadline；对外依赖单独更短超时 | 0（依赖端超时交给上层裁决） |
| PG | `statement_timeout` 1-3s、`lock_timeout` 更短 | 0 |
| Kafka consumer | 处理超时 + NACK backoff | broker 重投递（幂等消化），max deliver 后 DLQ |

背压：网关总并发上限 + per-procedure 并发 + bulkhead 池隔离（支付/搜索/埋点）；超限**快速拒绝**（Connect `unavailable` + `Retry-After`）而不是排队等超时；队列（Kafka lag）超过恢复窗口时消费端限速、生产端降级（如埋点丢弃）。**多层同时重试 = 重试风暴**：CDN/Traefik/服务层全部 0 重试，收敛在网关一层。

---

## 12. 横切：失败模式与降级

| 故障 | 表现 | 处置/降级 |
|---|---|---|
| CDN 故障 | 静态资源不可达 | DNS 切回源直出（预案演练）；API 域不受影响 |
| Pangolin/隧道断 | 公网入口 502 | 备线入口（云 LB 直入，P1）；ntfy 告警：`servers` 空 = 必 503 先查四否决条件 |
| 证书过期 | 所有 `*.apikv.com` 同时挂 | 自动续期 + 30 天期 Gatus 告警 + 双部署点同步（P0） |
| Cilium 策略误伤 | 服务间 deny | Hubble 查 deny 证据；audit 模式先行；策略与 matrix 同源生成 |
| 网关 session store 不可达 | 认证 fail-closed，全量 401 | `/readyz` 摘流；session store 独立故障域 + 副本（P0）；匿名路径不受影响 |
| Config Center 不可达 | 新 Pod 起不来 | last-known-good 本地快照启动 + 控制面 HA（P0）；运行中的 Pod 用旧配置继续跑 |
| 某服务不健康 | P2C 摘除 + healthz 503 | 网关只路由健康节点；bulkhead 防止单服务拖垮全网关 |
| PG 主库故障 | 写路径不可用 | Patroni failover（跨故障域，P0）；读路径可降级只读；恢复演练常态化 |
| Kafka 不可用 | 异步段停摆，同步段不受影响 | outbox 天然缓冲（积压告警 = 恢复窗口余量）；恢复后 relay 续投；这正是 outbox 相对双写的价值 |
| 观测面故障 | 业务无感，盲飞 | 观测与业务分故障域；外部探针独立告警「监控挂了」 |

---

## 13. 分阶段落地与验收（链路相关摘录，全文 baseline §11）

- **P0**：Cilium default-deny + gateway-only（Hubble 证据）；网关治理组第一批（per-procedure deadline + 请求大小 + 总并发/shedding）；session/cache 故障域拆分；证书自动续期；Config Center 快照启动；K0–K3；飞书/企业微信告警；k6 基线打通「客户端→网关→服务→PG」全链并 remote-write 进 VM。
- **P1**：CDN/imgproxy 上线并切静态域；云 LB 主入口 + Pangolin 降备；Consul→K8s DNS 四步 + Argo Rollouts；quota/bulkhead/retry budget 压测后启用；K4；Pyroscope/Hubble/Tetragon。
- **P2**：熔断（有恢复语义后）、SPIFFE/SPIRE、Cell 路由（网关 tenant→cell）、多区域——全部证据触发。
- **每跳验收判据**：Pangolin 三条验收（§3）；Cilium 策略 = Hubble deny 证据 + 直连被拒实测；网关 = 伪造 `x-md-*` 被剥离的回归测试 + 401/403/超时的 k6 断言；微服务 = owner 越权用例（他人 ID 全部 PERMISSION_DENIED）；事件段 = 重复投递/乱序/断连/积压重放演练记录。

## 14. 待验证清单

- 浏览器端到端 H3 的实证（当前只证明了 Alt-Svc 通告；用 Chrome net-export 或 `curl --http3` 验证协商成功）。
- CDN 回源协议与真实 IP 头在「CDN→Pangolin→Cilium→网关」四跳的透传完整性。
- Envoy(cilium-gateway) → control-tower 的 h2c/appProtocol 行为。
- netkit/BBR 当前集群实际启用状态；节点间 WireGuard 加密的吞吐开销压测。
- PgBouncer transaction pooling 与 pgx prepared statement 的兼容配置。
- Dragonfly 复制/故障转移语义实测（session store 独立部署形态）。
- 网关治理组每一项的压测验收（开启顺序：deadline → 大小限制 → shedding → quota → bulkhead → retry budget → 熔断）。
