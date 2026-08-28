# 2026-08-28 零信任与运行时安全验证

> 状态：dev 集群的身份、CNP、consumer-next、OTLP 与安全告警闭环已发布并验收。Gorse Config Center 修复等待 Casdoor 管理员登录；address BOLA 按本次用户决策不处理，仍是已知且被接受的应用授权风险。

## 结论

1. control-tower gateway、10 个 API、frontend、consumer-next、outbox-relay、search-indexer 已切换到独立 ServiceAccount，Pod 与 SA 双层关闭 token automount；15 个 Deployment 全部 Ready，Pod 不再挂载 `kube-api-access-*`。
2. `ecommerce-api-default-deny` CiliumNetworkPolicy 已上线且 Valid。API 只接受 gateway、精确的 Consul server SA 与节点探针；gateway/frontend/consumer-next 只接受各自所需入口；出站按实际依赖精确放行。
3. 普通 Pod 直连 consumer-next、gateway 与 user ClusterIP 均 timeout；Consul 10/10 gRPC readiness、gateway product RPC 与 consumer-next SSR 商品页均恢复 200。
4. live `ecommerce-cart-route` 已删除。直连 Cilium Gateway `192.168.3.121` 并携带 `Host: cart-api.apikv.com` 返回 Envoy 404，不再存在绕过 control-tower 的 K8s backend route。
5. Tetragon `1.7.1` 在三个节点 `3/3` Ready。原始事件已进入 VictoriaLogs，token-access/可疑 exec 与 Hubble deny 指标已进入 VictoriaMetrics；四条 vmalert 规则已通过真实注入进入 Alertmanager 与通知审计桥。
6. 10 个 API 的 OTLP Authorization 已从 Vault `otel-auth` 注入，当前 Pod 均为 87 字节 header，服务日志与 node3 collector 均无新 401。Gorse 的两个 Config Center 条目仍等待 Casdoor 管理员登录，未绕过管理 API 修改。

## Live 集群状态

| 检查 | 发布后结果 |
|---|---|
| ServiceAccount | 14 个 ecommerce 工作负载 SA 由本仓管理；`control-tower-gateway` SA 由 control-tower 仓管理；均无 RoleBinding |
| Deployment | gateway、10 个 API、frontend、consumer-next、relay/indexer，共 15 个 Deployment 使用独立 SA，`automountServiceAccountToken:false` |
| projected token | 上述 15 个 Deployment 的新 Pod 无 projected token volume |
| consumer-next | 两副本使用 `ecommerce-consumer-next`；只允许 ingress/node probe 入站，出站只有 DNS 与 gateway；ISR writable mount 已验证 MISS→HIT |
| CNP | `ecommerce-api-default-deny` generation 7，`Valid=True`；Consul 10/10 deep readiness passing |
| cart HTTPRoute | `ecommerce/ecommerce-cart-route` 已删除；Gateway 直连 host 验证为 404 |
| Cilium/Hubble | Cilium Helm revision 4；Relay server TLS，connected nodes=`3/3`；drop/flow 指标已落 VictoriaMetrics |
| Security metrics | Vector Helm revision 4、DaemonSet `3/3`；OTel revision 3、Deployment `1/1`；`:9598` 只允许 Collector ingress |
| Tetragon | Helm revision 3，DaemonSet desired/current/ready=`3/3/3`，无 nodeSelector |
| TracingPolicy | 仅 `ecommerce-service-account-token-access`，namespaced、audit-only |

## 身份与最小 RBAC

### ecommerce 仓

Canonical 清单为 `helm/files/zero-trust.yaml`：

- 10 个 API、frontend、outbox-relay、search-indexer，共 13 个独立 ServiceAccount；
- consumer-next 的独立 SA 与 Deployment 约束保存在 `frontend/apps/consumer-next/deploy/dev.yaml`；
- ServiceAccount 设置 `automountServiceAccountToken:false`；
- 20 份 API dev/prod Deployment、frontend dev/pre、consumer-next dev、两个 tool Deployment 均指定独立 SA，并设置 Pod 级 `automountServiceAccountToken:false` 与 `enableServiceLinks:false`；
- search reindex Job 使用 `ecommerce-search-indexer` SA，并继续关闭 token automount；
- 不创建 Role、RoleBinding、ClusterRole 或 ClusterRoleBinding。业务不调用 Kubernetes API，零绑定就是最小 RBAC。

`backend/structcheck` 已把上述约束变成棘轮：退回 default SA、遗漏显式 false、canonical 缺 SA、consumer-next 漏独立身份或引入 RBAC 均会失败。

### control-tower 仓

已新增：

- `deploy/dev/gateway/serviceaccount.yaml`；
- `deploy/pre/gateway/serviceaccount.yaml`。

已更新 dev/pre gateway Deployment：

```yaml
serviceAccountName: control-tower-gateway
automountServiceAccountToken: false
enableServiceLinks: false
```

发布时使用 `kubectl patch` 只修改 live Pod template，保留当前不可变镜像、环境变量和另一个 Agent 正在处理的 Service/HTTPRoute 配置。两副本滚动完成后 `/readyz=200`。

## CiliumNetworkPolicy

### 强制边界

- API endpoint 通过 `io.cilium.k8s.policy.serviceaccount=ecommerce-<service>` 选择；
- API ingress 只允许 namespace `ecommerce` 中的 `control-tower-gateway` SA、namespace `consul` 中的 `consul-server` SA，以及节点探针；每条规则仍只开放该 API 自身端口；
- gateway 自身也按 gateway SA identity 选择，不再依赖可伪造的 `app` label；consumer-next SA 只能访问 gateway:8080；
- kubelet 探针只通过 `host` / `remote-node` entity 访问对应工作负载端口；
- frontend 只允许 Cilium `ingress` entity 与节点探针访问 Caddy 实际 target port 80，运行时 egress 为空；Service 对外端口仍为 30080；
- consumer-next 只允许 Cilium `ingress` entity 与节点探针访问 3004，出站只有 kube-dns 与 gateway:8080；
- cart 不允许 Cilium `ingress` entity 直接访问 30006。

### 出站依赖

共同允许 kube-dns、Config Center、Consul 与 OTLP。gateway 另允许 10 个 API、Dragonfly、Casdoor，以及集群内 OTLP collector/Jaeger。业务服务按 `.service-matrix.yaml` 精确增加 PostgreSQL、Dragonfly、Meilisearch、Gorse、MinIO 等依赖。

发布期间发现 `.service-matrix.yaml` 漏记实际 Redis 使用者。live 启动日志证明 user、product、order、inventory、cart、merchant、address、behavior 均连接 Dragonfly；真相源与 CNP 已同步补齐。search 未接 Redis，payment 的 Redis 健康检查未启用，因此没有扩大放行。

### Fail-safe 记录

首次 apply 后：

- 普通 Pod deny 测试符合预期；
- behavior 匿名推荐从 200 变成 504；
- 立即删除 CNP，behavior 首次重试恢复 200；
- behavior 日志明确显示 `10.108.247.145:6379 i/o timeout`，定位为漏放 Dragonfly，而不是 selector 或 gateway 问题。

补齐 Redis 依赖后重新 apply：

- gateway identity 到 10 个服务 `/healthz` 全部 200；
- `/behavior.v1.BehaviorService/Recommend` 返回 200；
- `/address.v1.RegionService/ListRegions` 返回 200；
- `https://gateway.apikv.com/readyz` 返回 200；
- 普通 SA Pod 到 gateway/user/cart 均 timeout。

后续滚动 10 个 API 时发现第二个边界缺口：Consul TTL liveness passing，但由 `consul-server-0` Pod 主动发起的 gRPC readiness 全部 critical。旧规则只放了 gateway 和 `host`/`remote-node`，因此 gateway resolver 保留已删除 Pod IP，product RPC 返回 504。修复只加入 namespace `consul`、SA `consul-server` 的精确 selector 和各服务端口；CNP generation 6 发布后 10/10 deep readiness passing，gateway product RPC、consumer-next SSR 商品页与两副本 ISR MISS→HIT 均恢复。

## cart 直连入口

仓库 dev/prod 中会被目录级 `kubectl apply -f` 自动加载的 cart HTTPRoute 已删除。live Route 也已执行删除。

公网 `cart-api.apikv.com` 仍先被 Pangolin 认证层重定向到登录页，这是 Pangolin 自身行为，不能证明 K8s backend 存在。绕过 Pangolin，直连 `192.168.3.121:443` 并指定同一 Host 后返回 Envoy 404，证明 Gateway API 已无匹配 Route；即使误建 Route，CNP 仍会阻断 `reserved:ingress → cart:30006`。

## 「只信任网关头」边界

control-tower 仍保持以下成立条件：

- Auth middleware 对所有入站请求先剥离 `x-md-*`；
- reverse proxy 只按已验证 claims 注入 user-id/name/role/owner；
- `Authorization` 不下传；
- forged identity 集成测试已覆盖。

CNP 把该代码约定变成网络边界：普通 Pod 无法直接访问 API，gateway 身份由 ServiceAccount identity 判定。

节点探针仍需要 `host` / `remote-node`，因此被攻陷节点属于当前 TCB。集群管理员也能创建使用 gateway SA 的 Pod；这属于 Kubernetes 管理面信任，不由 namespaced CNP 解决。

### 明确接受的 address 风险

address 仍存在 BOLA：`CreateAddress` 信任请求体 `user_id`，Update/Delete/Get/SetDefault 没有把 gateway user-id 加入 ownership 条件。本次用户明确要求忽略该项，因此没有修改业务代码或测试。NetworkPolicy 不能降低已认证用户越权访问其他用户地址的风险。

## Tetragon

### 发布结果

- Helm release 从 revision 2 升级到 revision 3；
- DaemonSet 从 node103 单点改为 node101/node102/node103 三节点 `3/3` Ready；
- live operator 仍固定 node103；后续源码已取消该硬钉，但尚未执行新的 Helm upgrade；
- 开启 process credential/namespace 上下文；
- exporter 保留 ecommerce `PROCESS_EXEC`、`PROCESS_EXIT`、`PROCESS_KPROBE` 与敏感命令行参数脱敏。

三个节点分别通过临时、无 token 的 Pod 触发 `/bin/sh`，stdout exporter 均出现对应 `node_name`、Pod、binary、UID 与 namespace/capability 信息。临时 Pod 已全部删除。

### projected-token policy

`ecommerce-service-account-token-access` 使用 `sys_openat` 字符串参数，匹配：

- `/var/run/secrets/kubernetes.io/serviceaccount/`；
- `/var/run/secrets/tokens/`。

测试 Pod 显式挂载一个 TTL 600 秒、零 RBAC 的 projected token，读取时只重定向到 `/dev/null`。stdout 最终输出：

```text
policy_name=ecommerce-service-account-token-access
pod=token-audit-probe
path=/var/run/secrets/tokens/audit-token
```

测试过程没有输出 token 内容，测试 Pod 随后删除。正常业务基线应为零 token-access 事件。

### 为什么不保留 shell TracingPolicy

`security_bprm_check` 与 `sys_execve` 都能增加 policy hit metrics，但事件发生在新进程进入 Tetragon process map 前，KPROBE 缺少 Pod/namespace，无法形成可调查记录。45 秒 raw gRPC 验收仍没有可用事件。

交互工具启动改由已经验证的内建 `PROCESS_EXEC` 审计。保留一条只涨 metrics、不提供工作负载上下文的 TracingPolicy 会形成虚假安全感，因此已删除。

## 查询与告警闭环

- Vector 已把 Tetragon `export-stdout` 写入 node3 VictoriaLogs；24 小时查询能返回带 Pod、binary、parent chain 与 policy name 的原始事件。
- Vector 在三节点把 token-access 与 ecommerce 可疑工具执行转成低基数 `ecommerce_tetragon_security_events_total{event_type,node}`；OTel Collector 每 15 秒抓取并写入 VictoriaMetrics。`vector-security-metrics` NetworkPolicy 已验证 Collector source 200、普通 Pod timeout。
- Cilium Helm revision 4 启用了 Hubble Relay、drop/DNS/TCP/flow/ICMP 指标与 HTTP metadata redaction。Relay server 只开放 TLS 443；使用自动 CA 与 `ui.hubble-relay.cilium.io` server name 验证，三个节点全部 connected。
- CNP deny 注入同时通过 Relay 返回具体 source/destination/port，`hubble_drop_total{reason="POLICY_DENIED"}` 在 VictoriaMetrics 保留聚合历史。
- `infrastructure/observability/ecommerce-security-alerts.yml` 已部署为 node3 `/infra/rules/ecommerce-security.yml`。token-access、可疑 exec 与 deny burst 三条真实注入均进入 firing，Alertmanager 与 `pigsty-alert-audit`/ntfy bridge 收到事件；Hubble telemetry missing 规则保持 inactive。
- 注入窗口结束后 deny burst 仍持续 firing，Hubble 先定位出 `reserved:ingress → ecommerce-frontend:80`：Service `targetPort` 和 Caddy 实际监听为 80，但 CNP 与 Deployment metadata 写成 30080。generation 7 改为只放 80，并同步 containerPort；`shop.dev.test` 与 `shop.apikv.com` 根页从 503 恢复 200。
- frontend 修复后，剩余 deny 全部是 product 周期性访问已退役的 `node2:8088`。这是下节 Gorse Config Center 阻塞的同一真实信号，因此 `EcommerceNetworkPolicyDeniedBurst` 保持 firing；没有通过放行旧 IP、调高阈值或静音掩盖它。

完整数据路径、调查入口与回滚见 `infrastructure/observability/README.md`。

## Pod 节点落点补充（源码已验证，未发布）

- Tetragon DaemonSet 曾因 `nodeSelector=node103` 只运行 `1/3`，结果不是性能下降，而是 node101、node102 上的 syscall/process 事件完全不可见；工作负载迁移后审计覆盖随节点变化，node103 故障则整条运行时审计消失。当前 DaemonSet 已是无 selector 的 `3/3`。
- 业务 Deployment 没有 node103 selector。审计时 ecommerce 的 17 个 ReplicaSet Pod 实际分布为 node101 `12`、node102 `4`、node103 `1`；scheduler 不会主动重平衡历史 Pod，因此「没有硬钉」不等于「自然均匀」。
- 25 份 Deployment 源清单和 10 个 Helm 子 chart 已统一加 `app.kubernetes.io/part-of=ecommerce` 与 suite-wide hostname spread。它以 `maxSkew=1` 做调度偏好，并用 `ScheduleAnyway` 避免某节点资源不足时阻塞发布；consumer-next 另保留按自身 app 的 `DoNotSchedule`，保证两个副本不落同一节点。
- **后续状态覆盖（2026-08-28）**：Tetragon agent 三节点声明已写回 `~/lens077/kubernetes/components/tetragon/values.yaml` 并发布为 Helm revision 4；三个 agent `3/3` Ready，operator 仍固定 node103。业务 Deployment 的拓扑扩散源码已通过 server dry-run，但 live 业务分布是否已按该源码重滚仍须按当时发布记录核实。

## 已知配置漂移

- product 的 dev Config Center version 3 仍指向已退役的 `node2:8088`，product/behavior 的 Gorse API key 仍为空。当前 Gorse endpoint 健康、node2 配置中的真实 key 存在，但 machine token 按设计只有 `GetKey`/`WatchKeys`，管理员写入需要 Casdoor JWT；用户本轮暂时无法登录，因此没有绕过 Config Center 或直接写数据库。
- 一次 Config Center 预览的跨行正则越过目标段，使既有搜索凭据进入会话工具日志。临时文件已删且仓库未落值，但日志不可撤回；已在 TODO 登记轮换，并固化 parser + allowlist 手顺到 `context/project/ecommerce/config/experience/config-preview-allowlist.md`。
- 10 个 API 的 OTLP header 已从 `otel-auth` Secret 注入并滚动完成；每个 Pod 环境变量长度为 87，10 分钟日志和 node3 collector 均无新 Authorization 401。该项不再是 live 漂移。
- address BOLA 仍按用户决策保留。它是已接受的应用授权风险，不应被 NetworkPolicy 完成度掩盖。

## 验证结果

```text
backend build/vet/test -short                  PASS
backend structcheck                           PASS
Helm lint/render/server-side dry-run           PASS
10 services dev/prod server-side dry-run       PASS
CNP generation 7 / status Valid                PASS
Consul gRPC readiness                          10/10 PASS
Gateway product RPC                            200
consumer-next SSR / ISR                        200, MISS -> HIT on 2 Pods
Ordinary identity -> next/gateway/user          3/3 DENIED
Gateway public ready + anonymous RPC            PASS
Cart direct Gateway host                       404
10 API OTLP header / new auth 401              10/10 PASS, 0 errors
Tetragon Helm revision 4                       deployed（三节点声明已写回）
Tetragon DaemonSet                             3/3 Ready
Tetragon PROCESS_EXEC                          node101/102/103 PASS
Projected-token PROCESS_KPROBE + metric         PASS
Hubble Relay TLS / connected nodes             PASS, 3/3
Hubble POLICY_DENIED live/history              PASS
vmalert -> Alertmanager -> audit/ntfy bridge    3/3 injected alerts PASS; Gorse deny stays firing
Context/link gate                              PASS
```

## 回滚

- 业务网络异常：先删除 `ecommerce-api-default-deny`，不要重新开启 token 或退回 default SA；
- gateway 身份异常：回滚 Deployment Pod template，但保留独立 SA；
- Tetragon 异常：删除 namespaced token policy，再 `helm rollback tetragon 2 -n tetragon`；
- 安全告警异常：先移除 node3 `/infra/rules/ecommerce-security.yml` 并 reload vmalert，再分别回滚 Vector/OTel；不要删除原始 VictoriaLogs；
- Hubble 异常：先保留 CNP，确认业务健康后才 `helm rollback cilium 2 -n kube-system`；revision 3 是明文 Relay，不作为安全回滚目标；
- cart Route 只有在重新建立完整 gateway 认证边界后才能恢复，不能把 direct HTTPRoute 当调试入口。
