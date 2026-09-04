---
name: consul-register-once-then-give-up
module: registry
description: 启动瞬间连不上 Consul 时，注册只试一次就永久放弃并继续提供服务，Pod 一直 1/1 Running 却对网关永久不可见；2026-08-29 记录、未修，2026-09-02 在全部 10 个服务上复发，2026-09-03 以守护循环修复
---

> **状态（2026-09-03）：已修复**。`go-connect-kit/registry` 的注册实现采用守护循环（失败退避重试、心跳
> 失败重注册），10 个服务与模板只保留 Options adapter。修法与实测数据见文末
> 「修复」节。本文前半部分保留原样，因为**症状识别和排查捷径没有变**——将来若有人把重试拿掉，
> 或换了注册中心带回同样的一次性语义，症状会原样重现。

# 服务 `1/1 Running` 零重启，网关却说它不存在

**症状**

网关持续刷同一条错误，`streak` 单调增长：

```json
{"level":"error","msg":"consul returned empty instance list; check ACL token and registration",
 "service":"payment-service","streak":204}
```

但那个服务在 K8s 眼里**完全健康**：`1/1 Running`、`RESTARTS 0`、
`/healthz` 通、日志里 `starting server` 打得好好的。`kubectl` 侧没有任何异常信号。

**关键陷阱**

三重伪装叠在一起：

1. **K8s 探针不覆盖注册**。注册失败不影响 HTTP 监听，readiness 照样通过。
   任何只看 Pod 状态的巡检（包括 `kubectl get pods` 和大多数告警规则）都发现不了。
2. **日志自己在骗人**。失败路径上先打了一条「成功」：

   ```
   05:44:33.272 DEBUG registry/consul.go:196  service registration completed  ← 假的
   05:44:33.275 ERROR registry/consul.go:199  failed to register service with Consul
   ```

   `:196` 的「completed」在 `:199` 的错误检查**之前**无条件打出。
   只 grep `registration completed` 会得到「注册成功」的结论。
3. **真正的放弃是一条 WARN，不是 ERROR**：
   `failed to register with Consul, service discovery disabled`。
   级别不够高，日志告警多半不会命中。

**根因**

启动瞬间解析不到 Consul：

```
Put "http://consul-server.consul.svc:8500/v1/agent/service/register?wait=10000ms":
  dial tcp: lookup consul-server.consul.svc on 10.96.0.10:53: no such host
```

`registry/consul.go` 把注册失败当作**非致命且一次性**：打一条 WARN、
把服务发现整个关掉、然后继续启动 HTTP server。**没有重试，没有退避，没有后续补偿。**

于是只要 Pod 恰好在一次基础设施抖动中启动，它就变成一个**永久僵尸**：
K8s 认为它健康，网关认为它不存在。而且因为它从不重启，这个状态可以维持到下次发布为止。

2026-08-29 的实例：`payment` 在 05:44 那次集群故障窗口内启动，DNS 短暂失败，
此后 3 小时一直 Running 且零重启，网关侧 `streak` 累到 204——
`204 × 30s ≈ 102min`，正好等于 Pod age，坐实了「从启动那一刻起就没注册过」。

**修复（当下）**

DNS 恢复后重启一次即可，注册逻辑本身没坏：

```bash
kubectl rollout restart deploy/ecommerce-<svc>-deploy -n ecommerce
```

复验（`consul catalog services` **需要 ACL token**，不带 token 会返回空列表，
很容易被误读成「一个都没注册」）：

```bash
TOK=$(kubectl get secret -n ecommerce consul-ecommerce-token -o jsonpath='{.data}' \
  | python3 -c "import json,sys,base64;d=json.load(sys.stdin);print(base64.b64decode(d[list(d)[0]]).decode())")
kubectl exec -n consul consul-server-0 -c consul -- \
  env CONSUL_HTTP_TOKEN="$TOK" consul catalog services
```

拿注册名（**不是目录名**）对照 [`.service-matrix.yaml`](../../../../../.service-matrix.yaml)
的 `discovery:` 字段逐个核，缺谁一目了然。

**复发（2026-09-02）**

上面那段「遗留」写下 4 天后原样复发，而且这次不是一个服务，是**全部 10 个**。
集群整机重启（所有 Pod 09:59 同批重建；16:30 又一轮），Consul 容器 16:30:26 起来，
业务服务 16:31:08～16:31:21 之间各做了唯一一次注册，**全部 `i/o timeout`**：

```
Put "http://consul-server.consul.svc:8500/v1/agent/service/register?wait=10000ms":
  dial tcp 10.244.2.189:8500: i/o timeout
```

目标 IP 就是 Consul 当前 Pod，DNS 没错；是 `timeout` 而非 `refused`，
包在途中被丢——与 Cilium 默认拒绝策略（`ecommerce-api-default-deny`）在节点重启后
尚未编程完成的窗口相符（策略本身核对无误：11 个 serviceaccount 都放行了 8500/8501，
Consul Pod 标签也匹配）。此后 Consul 目录里只剩 `consul` 自己。

下游后果是网关：`control-tower-gateway` 的 `/readyz` 三个条件里配置那项全绿，
挂在 `Resolver.Ready()`（`readyN > 0`）——一个实例都解析不到，503 持续约 3 小时，
两个 Pod `0/1`，被摘出 endpoints，**dev 网关整体不接流量**。而 `kubectl get pods`
里 15 个业务 Pod 全是 `1/1 Running`。

这次排查还走了两条弯路，都值得记：先把 Dragonfly 日志里一条连接关闭噪声
（`Error reading from peer … 0 < 5`）当成 TLS 握手失败，实测 CA 指纹、证书链、SAN、
口令四项全部匹配；又疑心 CNP 拦截，逐条核对后排除。**真因在自己的注册代码里，
而它 4 天前就被写进了本文件。** 教训不在 Consul，在「沉淀了 ≠ 修了」。

**修复（2026-09-03，`github.com/lens077/go-connect-kit/registry`）**

把「一次注册 + 独立心跳 goroutine」换成一个守护循环 `Maintain`：

```
注册 ──失败──▶ 指数退避（1s 起、×2、封顶 30s、不限次数）──▶ 再注册
  │成功
  ▼
心跳续 TTL ──任一次失败──▶ 回到「注册」（同 ID 覆盖，幂等）
  │ctx 取消
  ▼
返回；Deregister 在「从未注册成功」时跳过 Consul 调用
```

三条设计判断：

- **fail-open 保留**。`OnStart` 只 `go Maintain()`，进程不等 Consul。之前评估过的另一条路
  「注册失败 fail fast 让 K8s CrashLoop」没选：Consul 在本项目定位是「暴露以备将来」，
  不该让一个可选依赖决定进程生死。
- **心跳失败一律当「Consul 可能忘了我」**。Consul 重启后对未知 CheckID 回 404，
  这是服务能拿到的唯一信号；旧代码注释写「记录错误不退出，Consul 会把服务标 critical」——
  重启后**没有 check 可标**，服务已经不在目录里了。重注册幂等，误判的代价是一个多余的 PUT。
- **配置错误不重试**。地址格式、缺 `check.ttl` 这类错误包成 `ErrInvalidOptions`，
  `Maintain` 直接返回并记 ERROR——它们不会自愈，重试只会把真正的错误埋进退避噪声。

顺手修掉的两条：`registration completed` 那条假 DEBUG 已删（成功日志只在 `ServiceRegister`
之后）；从未注册成功的进程退出时不再去 Consul 注销一个不存在的东西。

**实测数据（2026-09-03，cart 真实适配层 + fx 装配 + 真实 Consul，经 port-forward）**

| 场景 | 触发 | 观测 |
|---|---|---|
| Consul 起得慢 | 进程启动时 18500 端口无人监听 | 重试时刻 05/06/08/12/20/36s，第 6 次成功；进程全程 alive |
| Consul 重启丢注册 | 05:10:12 经 API 直接注销该服务 | 05:10:17 心跳 404 → 05:10:18 重注册成功，**6s**，一个心跳周期内 |
| Consul 不可达 | 05:10:26 杀隧道，05:10:48 恢复 | 退避 1→2→4→8→16s，05:10:59 重注册，恢复后 11s |
| 优雅退出 | SIGTERM | 目录实例 1 → 0 |

单元测试（`consul_test.go`）把三种场景各钉了一条：`TestMaintainRetriesUntilConsulAccepts`、
`TestMaintainReRegistersAfterConsulForgets`、`TestMaintainDoesNotRetryInvalidOptions`。

**仍然遗留**

- 没有任何告警覆盖「注册数 < 预期服务数」。修了重试之后这条的紧迫性下降，但没消失——
  重试解决「抖动后自愈」，解决不了「Consul 挂了半天」被发现的问题。
- 当前 10 个服务 dev 部署 `CONSUL_ENABLED` 实际全为 `"true"`（与「不使用 Consul」的口头约定不符）；
  cart 已随本次修复翻成 `"false"`，其余 9 个待决定。翻的时候记住网关的 `readyz` 依赖
  Consul 目录非空——全关等于网关永久 503，除非同时给网关换 resolver。

**排查捷径**

- 「网关说没实例、服务却健康」时，**先分清是没注册还是没 passing**。
  没注册 → 看服务自身启动日志的 registry 段；注册了但 critical →
  看 [consul-ttl-first-ping-blind-window.md](consul-ttl-first-ping-blind-window.md)。
  两者症状相同、根因完全不同。
- 网关错误里的 `streak` 是免费的时间戳：`streak × 轮询间隔` 约等于故障持续时间。
  它约等于 Pod age，就说明「从来没成功过」，而不是「中途掉了」。
- 排查一次基础设施故障的**收尾**时，不要只看崩溃的 Pod。
  全程 `Running` 的那些可能才是问题最深的——它们在故障窗口里静默降级了，
  而且不会自愈。

**相关**

- 注册了但不 passing：[consul-ttl-first-ping-blind-window.md](consul-ttl-first-ping-blind-window.md)
- 同批故障的网络侧根因：[`context/team/cilium-datapath-ops.md`](../../../../team/cilium-datapath-ops.md)
- 缺配置块导致组件静默关闭的同类模式：[`behavior/experience/consul-kv-missing-key-silent-disable.md`](../../behavior/experience/consul-kv-missing-key-silent-disable.md)
