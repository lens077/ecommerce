# 请求边界不能靠猜：一次 HTTP 请求走私审计的真实记录

> 这不是一篇「加一条 WAF 规则就安全」的清单，而是本项目一次真实审计留下的工程记录：我们检查了哪些层、验证到了哪里、代码做了什么、哪些结论仍然不能下。
>
> 当前状态：control-tower 网关已增加 HTTP/1.1 `Transfer-Encoding` 拒绝策略和回归测试；链路外层 Pangolin/Traefik 的完整差分验收仍待在获批的预生产入口完成。

## 先说结论：没有证实漏洞，不等于证明没有漏洞

HTTP 请求走私最危险的地方，不在于某个请求看起来有多奇怪，而在于同一段 TCP 字节流经过不同组件后，可能被拆成不同数量的请求：前端代理认为请求已经结束，后端却认为还有下一段；或者前端把两条请求合成一条，后端再从连接池里把残余数据交给下一位用户。

它可以造成缓存投毒、会话错配和跨用户响应串线。日志也容易骗人：每一层通常只记录自己解析出来的那一个请求，真正错位的字节可能只出现在下一层的连接状态里。

因此，本次审计没有采用「普通 `curl` 能返回 200，所以安全」的判断。我们把链路拆成了几层：

```text
公网客户端
  -> Pangolin / node1 Traefik
  -> WireGuard / newt
  -> Cilium Gateway API / Envoy
  -> control-tower gateway
  -> 业务服务（ConnectRPC over HTTP/2，H2C）
```

审计结果是：代码中没有发现自定义的原始 HTTP 解析器、原始请求字节拼接或 HTTP/1.1 后端反向代理连接；网关到业务服务使用 `http2.Transport` 和 H2C，降低了后端连接复用产生经典 HTTP/1.1 走私的机会。但公网入口和 Cilium 到网关之间仍然存在 HTTP/1.1 解析边界，不能据此宣布整条链路绝对安全。

## 第一个误区：把「协议升级」当成「边界已经一致」

本项目的后端通信红线是 ConnectRPC over HTTP/2。control-tower 网关出站使用 `golang.org/x/net/http2.Transport`，代码在同级仓 `../control-tower/services/gateway/internal/proxy/proxy.go`。这解决的是网关到业务服务的协议选择问题，不会自动替公网入口解决请求边界问题。

网关业务端口当前由 `h2c.NewHandler` 承载，仍能接受 HTTP/1.1 和明文 HTTP/2，见 `../control-tower/services/gateway/cmd/server/main.go`。集群实际配置中，Cilium 的：

```text
enable-gateway-api-alpn: false
enable-gateway-api-app-protocol: false
loadbalancer.l7.backend: envoy
```

这意味着「公网客户端观察到 HTTP/2」不能推出「每一跳都是 HTTP/2」。一次真实检查中，`https://gateway.apikv.com` 返回了 HTTP/2 和 `404`，但这个 `404` 可能来自前置层或未命中路由，不能证明请求已经到达 control-tower，更不能证明边界安全。

## 第二个误区：标准库能解析，不代表代理链能达成共识

我们先用本地、非生产的 Go HTTP 服务器做了一个小探针，只观察解析结果，不发送第二个隐藏请求。结果如下：

| 输入 | Go 独立服务器结果 |
|---|---:|
| `Content-Length` + `Transfer-Encoding` | `200` |
| `Transfer-Encoding` + `Content-Length` | `200` |
| 重复 `Content-Length` | `400` |
| 重复 `Transfer-Encoding` | `501` |
| 折行头 | `200` |

这个结果没有被解读成「Go 有漏洞」，也没有被解读成「Go 已经替我们完成全链路防护」。它只说明：应用拿到的 `http.Request` 已经是标准库解析后的视图，某些原始歧义在到达中间件前可能已经丢失；真正需要回答的问题，是 Pangolin/Traefik、Envoy 和 Go 是否对同一字节流做出同一个决定。

## 代码现在怎样挡住最高风险边界

本项目 Connect 请求体是有界的，服务间同步调用的目标协议也是 HTTP/2。因此我们选择了一个保守且可回滚的边界：

> HTTP/1.1 请求只要携带 `Transfer-Encoding`，就不再进入鉴权、路由代理和后端连接池，直接返回 `400` 并关闭连接。

实现位置：

- `../control-tower/services/gateway/internal/httpmw/request_boundary.go`
- `../control-tower/services/gateway/internal/app/app.go`
- `../control-tower/services/gateway/internal/httpmw/request_boundary_test.go`

核心逻辑是刻意短的：

```go
if r.ProtoMajor == 1 && len(r.TransferEncoding) > 0 {
    w.Header().Set("Connection", "close")
    w.Header().Set("X-Error-Reason", "AMBIGUOUS_REQUEST_BOUNDARY")
    w.WriteHeader(http.StatusBadRequest)
    return
}
```

这条策略不是「所有 HTTP 请求都拒绝」，也不是把 `Content-Length` 缺失当成非法。合法的 chunked 请求可以没有 `Content-Length`；本项目做的是更窄、更明确的选择：不让 HTTP/1.1 的分块传输语义进入这条 Connect 网关链路。HTTP/2 使用自己的二进制帧，不受这条检查影响。

边界检查放在访问日志之后、认证和反向代理之前。这样既能在最早位置拒绝请求，又不会让安全拒绝变成无记录的黑洞。

## 日志不再只记录「请求到了」

`../control-tower/services/gateway/internal/httpmw/middleware.go` 的访问日志现在会记录：

- `protocol`
- `request_content_length`
- `request_transfer_encoding`
- `X-Error-Reason`（例如 `AMBIGUOUS_REQUEST_BOUNDARY`）
- 原有的 method、path、status、bytes、duration、upstream

这里有一个必须守住的边界：日志不记录完整请求体、Cookie、`Authorization` 或其他凭据。请求走私调查需要的是协议和连接证据，不是把用户秘密复制进日志系统。

这组字段回答的是几个实际的值班问题：

1. 异常请求是 HTTP/1.1 还是 HTTP/2？
2. 网关看到的是声明长度、分块传输，还是已经被前置层规范化后的普通请求？
3. 拒绝发生在网关，还是请求根本没到网关？
4. 同一时间窗口内，是否出现异常 `400/501`、连接关闭和后端错误的同步上升？

## 我们如何验证，而不是只写一段安全话术

control-tower 的完整 Go 测试通过：

```text
go test ./...
go vet ./...
```

新增回归测试覆盖两件事：

- HTTP/1.1 携带 `Transfer-Encoding` 时返回 `400`、设置 `Connection: close` 和固定错误原因。
- HTTP/2 请求不会被这条 HTTP/1.1 策略误伤。

仓库还新增了一个需要显式授权环境变量的探针：

```bash
ALLOW_HTTP_BOUNDARY_PROBE=1 \
  scripts/verify-http-boundary.sh \
  https://<approved-gateway-host> <approved-host-header>
```

它分别发送 `CL.TE`、`TE.CL` 和重复 `Content-Length` 三种请求，但不附带第二个请求、不携带认证信息、不发送业务请求体。任何 `2xx/3xx` 都算失败；`404` 只能说明没有命中路由，不能当作「control-tower 已安全处理」的证据。

详细手顺见 [`../runbooks/http-request-boundary.md`](../runbooks/http-request-boundary.md)。

## 目前已经知道什么，还不知道什么

### 已确认

- control-tower 使用 Go 标准库 `net/http` 和 `httputil.ReverseProxy`，没有自定义原始 HTTP 边界解析器。
- 网关到业务服务使用 HTTP/2/H2C，不使用 HTTP/1.1 出站连接。
- HTTP/1.1 `Transfer-Encoding` 请求现在会在网关进入认证和代理前被拒绝。
- 重复 `Content-Length` 等异常输入已有标准库层面的拒绝行为，并有网关级边界测试保护关键策略。
- 当前集群的 Cilium Gateway 为 `Programmed=True`，control-tower gateway 为 2/2，HTTPRoute 为 `Accepted=True`、`ResolvedRefs=True`。

### 不能宣称已经完成

- 没有读取 node1 上实际运行的 Traefik/Pangolin 配置，因此不能为公网最外层解析行为背书。
- 没有在生产公网链路发送走私载荷；本次探针在公网域名上得到 `404`，无法证明请求已到达网关。
- 没有开启 Cilium ALPN 或修改线上 listener。那是入口协议变更，需要独立的维护窗口、兼容性验证和回滚方案。
- 没有证明所有历史 HTTP/1.1 变体在每一跳都得到完全相同的解析结果。

这几条「不能宣称」不是保守措辞，而是安全审计的结果本身。没有证据的地方，写成「已完成」只会把下一次事故的排查成本推迟。

## 下一步：把单点防护推进成链路共识

按风险和成本排序，下一阶段应完成：

1. 在获批的预生产入口运行边界探针，并同时采集 Pangolin/Traefik、Cilium Envoy、control-tower 三层日志。
2. 对每个测试用例核对「收到几个请求、解析成什么协议、后端连接是否关闭」，而不是只看最终状态码。
3. 核对 node1 Traefik/Pangolin 的实际版本、HTTP/2 降级策略、请求头规范化和后端连接复用配置。
4. 对 HTTP/1.1 到 HTTP/2 的每个转换点增加差分回归，避免某一层「修正」请求后让下一层得到另一种语义。
5. 若业务协议允许，评估把外部到网关的协议转换边界收敛到单一实现；不要用「再加一条 WAF 规则」替代解析器一致性。

HTTP 请求走私的防线最终不是某个组件的神奇开关，而是一条朴素的工程纪律：**任何请求边界只要存在两种解释，就在最早的可信入口拒绝；任何声称「安全」的结论，都必须能指出它覆盖了哪一跳、哪一种协议、哪一组证据。**
