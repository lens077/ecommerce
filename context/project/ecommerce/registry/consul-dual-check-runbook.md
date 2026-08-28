---
name: consul-dual-check-runbook
module: registry
description: 在 dev 集群验证 10 个服务的 Consul TTL 与 gRPC readiness，并用可逆依赖故障确认摘流和恢复
---

# Consul 双健康检查验证手册

本文用于在 dev 集群复验后端服务的 Consul 双健康检查。验证分为两部分：先确认 10 个服务的每个实例同时具备 TTL 与 gRPC readiness，再对 inventory 注入可逆的依赖故障，确认 Consul 摘流与恢复语义。

本文只提供操作与判据。执行故障实验前，先确认当前 Kubernetes context 指向 dev 集群。

## 1. 设计语义

每个实例注册两个检查：

| 检查 | CheckID | 证明什么 | 故障后的行为 |
|---|---|---|---|
| TTL process liveness | `service:<实例 ID>` | 进程仍在运行，TTL pinger 能访问 Consul | TTL 持续 critical 后才自动注销实例 |
| gRPC deep readiness | `service:<实例 ID>:grpc-readiness` | 数据库、缓存等深度依赖可用 | 连续 3 次失败转 critical，只从 passing-only 发现结果摘除 |

Consul gRPC check 的 timeout 为 12 秒，连续 3 次失败转 critical，1 次成功转 passing。gRPC check 不设置 `deregister_critical_service_after`，因此依赖恢复后可以自动恢复流量。

「摘流」不等于删除 catalog 条目：

- `passing=false` 查询仍能看到进程实例与 critical check；
- `passing=true` 查询只返回所有检查均 passing 的实例；
- 网关使用 `passing=true`，所以 critical 实例对网关不可见。

## 2. 服务名清单

Consul 名称以 `.service-matrix.yaml` 和部署环境变量 `SERVICE_NAME` 为准：

| 服务目录 | Consul service |
|---|---|
| user | `user-identity` |
| search | `search-product` |
| product | `product-service` |
| order | `order-service` |
| inventory | `inventory-service` |
| cart | `cart-service` |
| merchant | `merchant-service` |
| address | `address-service` |
| behavior | `behavior-service` |
| payment | `payment-service` |

## 3. 前置检查

### 3.1 不要匿名查询 Consul

Consul ACL 的 default policy 是 deny。匿名请求可能返回 HTTP 200 和空 catalog，不能据此判断服务未注册。

在单个 shell 中读取 token，不要打印、写文件或加入 shell history：

```bash
token=$(kubectl -n consul get secret consul-bootstrap-acl-token \
  -o jsonpath='{.data.token}' | base64 --decode)
```

所有查询都带请求头：

```bash
curl -fsS -H "X-Consul-Token: $token" \
  'http://192.168.3.120:8500/v1/catalog/services' | jq
```

### 3.2 确认镜像与副本

使用不可变 tag，不要覆盖或依赖 `:dev`：

```bash
kubectl -n ecommerce get deploy \
  ecommerce-{user,search,product,order,inventory,cart,merchant,address,behavior,payment}-deploy \
  -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,IMAGE:.spec.template.spec.containers[0].image
```

本次 health rollout 使用过 `health-b766301dfbd0`。再次测试时应按当前代码生成新 tag。仓库中的 dev Deployment manifest 未因本次在线 rollout 批量改写；在有意更新 source-of-truth 前，不要执行会把镜像恢复到旧 tag 的整目录 `kubectl apply`。

### 3.3 已知的非健康检查问题

2026-08-27 rollout 期间，10 个服务的应用日志都出现：

```text
missing or empty authorization header: Authorization
```

HTTP 状态为 401，影响应用直接写入 `node3-otlp.apikv.com` 的 logs/metrics。旧 address 与 user Pod 同样出现该错误，因此不是双健康检查镜像引入的回归。

dev Deployment 从可选 Secret `otel-auth` 的 `OTEL_EXPORTER_OTLP_HEADERS` key 注入鉴权头。复验遥测前检查 ExternalSecret/Secret 与 Pod 环境是否就绪，但不要输出 secret value：

```bash
kubectl -n ecommerce get externalsecret,secret otel-auth
kubectl -n ecommerce get deploy ecommerce-user-deploy \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="OTEL_EXPORTER_OTLP_HEADERS")].valueFrom.secretKeyRef}{"\n"}'
kubectl -n ecommerce logs deploy/ecommerce-user-deploy --since=5m \
  | grep -F 'missing or empty authorization header' | head
```

OTLP 401 不应改变 Kubernetes `/healthz` 或 Consul gRPC readiness 的判据，但会导致遥测缺口。不要用「Victoria 后端没有业务样本」判断双检查失败。

## 4. 验证 10 个服务的双检查

对每个 Consul service 执行：

```bash
name=inventory-service
curl -fsS -H "X-Consul-Token: $token" \
  "http://192.168.3.120:8500/v1/health/service/${name}?passing=false" \
  | jq '[.[] | {
      id: .Service.ID,
      address: .Service.Address,
      checks: [.Checks[] | {
        id: .CheckID,
        name: .Name,
        status: .Status,
        output: .Output
      }]
    }]'
```

每个 Ready Pod 的成功判据：

1. catalog 中只有一个对应实例；多副本测试时实例数与 Ready Pod 数一致。
2. `.Service.Address` 等于对应 Ready Pod IP。
3. 存在 `TTL process liveness=passing`。
4. 存在 `gRPC deep readiness=passing`。
5. `passing=true` 查询包含同一个实例 ID。
6. 不存在已终止 Pod 的陈旧实例。

批量核对时，不要只统计 check 数量；必须把 check 与 `.Service.ID`、Pod IP 关联，避免陈旧实例造成假阳性。

## 5. 可逆依赖故障实验

inventory 同时检查 PostgreSQL 与 Dragonfly，且当前没有 HTTPRoute 或服务调用方，适合作为目标。为了保留一个健康实例，先临时扩到 2 副本。

### 5.1 扩容并确认两个实例 passing

```bash
kubectl -n ecommerce scale deploy/ecommerce-inventory-deploy --replicas=2
kubectl -n ecommerce rollout status deploy/ecommerce-inventory-deploy --timeout=10m

curl -fsS -H "X-Consul-Token: $token" \
  'http://192.168.3.120:8500/v1/health/service/inventory-service?passing=true' \
  | jq 'length'
```

期望结果为 `2`。若不是 2，不要注入故障。

### 5.2 选择一个 Pod 并打临时标签

```bash
target_pod=$(kubectl -n ecommerce get pod -l app=ecommerce-inventory -o json \
  | jq -r '[.items[]
      | select(.status.phase=="Running")
      | select(any(.status.conditions[]?; .type=="Ready" and .status=="True"))]
      | sort_by(.metadata.creationTimestamp)
      | last.metadata.name')
target_ip=$(kubectl -n ecommerce get pod "$target_pod" -o jsonpath='{.status.podIP}')

kubectl -n ecommerce label pod "$target_pod" \
  fault-injection.lens077/dependency-failure=true --overwrite
```

### 5.3 只阻断依赖 egress

下面的临时 NetworkPolicy 继续允许 DNS、Consul 和 Config Center，但不允许 PostgreSQL 与 Dragonfly。策略只有 `Egress`，不会阻断 Consul 主动发起的 gRPC check ingress。

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: inventory-dependency-fault
  namespace: ecommerce
  labels:
    app.kubernetes.io/part-of: ecommerce
    fault-injection.lens077/temporary: "true"
spec:
  podSelector:
    matchLabels:
      fault-injection.lens077/dependency-failure: "true"
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: consul
          podSelector:
            matchLabels:
              app: consul
              component: server
      ports:
        - { protocol: TCP, port: 8500 }
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: config-center
          podSelector:
            matchLabels:
              app: config-center
      ports:
        - { protocol: TCP, port: 30010 }
```

保存到 `/tmp/inventory-dependency-fault.yaml` 后执行：

```bash
kubectl apply -f /tmp/inventory-dependency-fault.yaml
kubectl -n ecommerce wait --for=condition=Ready=false \
  "pod/$target_pod" --timeout=4m
```

### 5.4 验证摘流

查询全部实例：

```bash
all=$(curl -fsS -H "X-Consul-Token: $token" \
  'http://192.168.3.120:8500/v1/health/service/inventory-service?passing=false')

jq --arg ip "$target_ip" '
  [.[] | select(.Service.Address==$ip)][0]
  | {
      id: .Service.ID,
      checks: [.Checks[] | select(
        .Name=="TTL process liveness" or .Name=="gRPC deep readiness"
      ) | {name:.Name,status:.Status,output:.Output}]
    }' <<<"$all"
```

故障成功的判据：

- 目标 Pod Kubernetes Ready 为 false。
- `passing=false` catalog 仍有 2 个实例。
- 目标实例 TTL 为 passing。
- 目标实例 gRPC readiness 为 critical。
- `passing=true` 只剩 1 个实例。
- `passing=true` 不包含 `$target_ip`。

连续 3 次 gRPC 失败才转 critical，等待时间可能超过 30 秒。不要在第一次失败后立即判定实现无效。

### 5.5 撤销并验证恢复

```bash
kubectl -n ecommerce delete networkpolicy inventory-dependency-fault
kubectl -n ecommerce wait --for=condition=Ready=true \
  "pod/$target_pod" --timeout=4m

curl -fsS -H "X-Consul-Token: $token" \
  'http://192.168.3.120:8500/v1/health/service/inventory-service?passing=true' \
  | jq 'length'
```

恢复成功的判据：

- 目标 Pod Ready 恢复为 true。
- 目标实例 TTL 与 gRPC readiness 都为 passing。
- `passing=true` 恢复为 2 个实例。

### 5.6 清理

无论实验是否成功，都执行：

```bash
kubectl -n ecommerce delete networkpolicy inventory-dependency-fault --ignore-not-found
kubectl -n ecommerce label pod "$target_pod" \
  fault-injection.lens077/dependency-failure-
kubectl -n ecommerce scale deploy/ecommerce-inventory-deploy --replicas=1
kubectl -n ecommerce rollout status deploy/ecommerce-inventory-deploy --timeout=5m

kubectl -n ecommerce get networkpolicy inventory-dependency-fault
kubectl -n ecommerce get deploy ecommerce-inventory-deploy
```

最后确认 Consul 的 `passing=false` 与 `passing=true` 都只返回 1 个 inventory 实例。

## 6. 2026-08-27 执行记录

本次在线 rollout 的结果用于对照，不替代后续复验：

- 10 个服务均为 1 个 Ready Pod、1 个 Consul catalog 实例。
- 每个实例均有 passing TTL 与 passing gRPC readiness。
- inventory 临时扩到 2 副本后，故障 Pod 的 TTL 保持 passing，gRPC 转 critical。
- 故障期间 catalog 为 2，passing-only 为 1。
- 撤销 NetworkPolicy 后，gRPC 恢复 passing，passing-only 恢复为 2。
- 实验结束后 inventory 已还原为 1 副本，临时标签与 NetworkPolicy 已删除。
