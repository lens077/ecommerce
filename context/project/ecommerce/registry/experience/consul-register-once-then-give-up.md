---
name: consul-register-once-then-give-up
module: registry
description: 启动瞬间 DNS 解析 Consul 失败时，注册只试一次就永久放弃并继续提供服务，Pod 一直 1/1 Running 却对网关永久不可见
---

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

**遗留（已知，未改）**

- **注册失败没有重试**是设计缺陷，不是配置问题。10 个服务共用同一份
  `internal/pkg/registry/consul.go`，都有这个行为。要么加重试+退避，
  要么让注册失败直接 fail fast（让 K8s 用 CrashLoop 把问题暴露出来），
  当前这种「静默降级并继续服务」是最坏的一种。
- `consul.go:196` 那条 DEBUG「service registration completed」应当移到错误检查之后。
- 没有任何告警覆盖「注册数 < 预期服务数」。这是本次 9 小时无人发现的直接原因之一。

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
