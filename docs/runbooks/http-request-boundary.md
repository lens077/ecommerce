# HTTP 请求边界验收

## 目的

确认公网前置、Cilium Envoy 与 control-tower 对 HTTP/1.1 请求边界的处理不会产生歧义。该验收只发送带歧义的头部组合，不附带第二个请求，不发送 Cookie、Authorization 或业务请求体。

## 运行前提

- 只对已批准的预生产或隔离入口运行。
- 目标必须能证明请求确实到达被测网关；仅收到前置层的 `404` 不能证明 control-tower 已处理请求。
- 不要对生产域名运行，除非已有明确变更授权和回滚窗口。

## 执行

```bash
ALLOW_HTTP_BOUNDARY_PROBE=1 \
  scripts/verify-http-boundary.sh \
  https://<approved-gateway-host> <approved-host-header>
```

脚本分别发送 `CL.TE`、`TE.CL` 和重复 `Content-Length` 三种请求。每种请求都必须返回 `4xx/5xx`；出现 `2xx/3xx` 即失败。前置层若统一返回 `404`，只能说明请求未命中路由，应继续在 newt Pod 到 Gateway VIP 的路径上验证。

## 链路核对

```bash
kubectl -n default get gateway cilium-gateway -o wide
kubectl -n ecommerce get httproute control-tower-gateway -o yaml
kubectl -n ecommerce get deploy control-tower-gateway -o wide
kubectl -n kube-system get cm cilium-config -o yaml \
  | grep -E 'enable-gateway-api-alpn|enable-gateway-api-app-protocol|loadbalancer-l7'
```

同时在 Cilium Envoy、control-tower 和 node1 Traefik/Pangolin 日志中按时间窗口核对：请求数量、状态码、协议版本和连接关闭情况一致。不得将请求体或认证凭据写入日志。

## 通过标准

- 歧义请求不会得到 `2xx/3xx`。
- 前置层、Cilium Envoy、control-tower 对同一请求只产生一个解析结果。
- 异常请求连接关闭或不会复用到下一位用户。
- 网关访问日志包含 `X-Error-Reason=AMBIGUOUS_REQUEST_BOUNDARY`、协议和边界元数据。
