# Bun 1.4 / QUIC / Traefik / Pangolin / Vite+pnpm 调研

Type: research
Status: resolved

调研日期：2026-08-27。外部能力结论来自第一方文档；末尾「本项目现网核验」记录了本次只读检查。

## 证据等级约定

本文每条结论标注证据等级。不要跨等级引用——「官方声明」不等于「实测通过」。

| 标记 | 含义 |
|---|---|
| 〔官方声明〕 | 第一方文档或发布说明的明确陈述，本次调研只做了阅读，未复现 |
| 〔官方数据〕 | 第一方给出的基准测试数字。测试条件由发布方设定，未独立复现 |
| 〔推论〕 | 由第一方事实推导，第一方文档没有直接写出这个结论 |
| 〔实测〕 | 本次调研实际执行并观察到的结果 |

外部 API 调研没有安装 Bun、启动 Traefik或部署 Pangolin。末尾单独记录本项目已有配置和 HTTP 响应的〔实测〕结果；这些结果不能替代 Bun 运行时兼容性测试。

## 概念边界：generic QUIC、HTTP/3、WebTransport

这三个词在二手资料里经常混用，先固定含义。

| 概念 | 定义 | 本次调研中谁在用 |
|---|---|---|
| generic QUIC | RFC 9000 定义的传输层协议，在 UDP 之上提供多路复用和内建 TLS 1.3。ALPN 可以是任意字符串。**它本身不是 HTTP** | `node:quic` 的核心抽象 |
| HTTP/3 | RFC 9114 定义的应用层协议，运行在 QUIC 之上，ALPN 固定为 `h3`，用 QPACK（RFC 9204）压缩头部 | 浏览器、Traefik 的 `http3` 配置、`Bun.serve({http3:true})` |
| WebTransport | 浏览器 API，在 HTTP/3 之上通过 CONNECT 和 Capsule 协议（RFC 9297）暴露双向流与数据报 | **无。四方资料均未提供** |

Node.js 官方文档明确写出了 QUIC 与 HTTP/3 的分层关系〔官方声明〕：

> The `quic` module is designed to be application-agnostic in general but includes built-in support for HTTP/3 as a specific application protocol.
> Currently, the `quic` module only supports HTTP/3 as a built-in application protocol. All other protocols must be implemented by the user on top of the provided JavaScript API.

来源：<https://raw.githubusercontent.com/nodejs/node/main/doc/api/quic.md>

关于 WebTransport：本次查阅的 Node.js、Bun、Traefik、Pangolin 四方文档中都没有 WebTransport 支持声明。这是**检索结果为空**，不等于四方明确声明不支持。需要 WebTransport 时，按「无第一方支持路径」处理。

## 一、Bun 1.4 的 node:quic

### API 形状

Node.js 官方文档定义三个核心抽象〔官方声明〕，来源同上：

- `QuicEndpoint`：本地 UDP socket 绑定，可被多个 session 共享，可同时作为 client 和 server
- `QuicSession`：一条连接，由 `quic.connect()` 或 `quic.listen()` 产生。session 可以迁移到不同的本地或远端地址，可以 outlive 创建它的 endpoint，也可以同时关联多个 endpoint
- `QuicStream`：session 内的流，双向或单向。通过 `session.createBidirectionalStream()` 和 `session.createUnidirectionalStream()` 创建，读取侧是 async iterable，每次迭代 yield 一批 `Uint8Array`

其他 API 事实〔官方声明〕：

- 不可靠数据报走 `session.sendDatagram()`（RFC 9221）。两端都要在握手时通告非零 `maxDatagramFrameSize`；HTTP/3 session 还需要额外设置 `application.enableDatagrams` 为 `true`
- 0-RTT 早期数据依赖 `session.onsessionticket` 拿到的 session ticket，下次连接时通过 `sessionOptions.sessionTicket` 传入
- TLS 1.3 强制内建。原文：「It is currently not possible to use QUIC without TLS or to use a different version of TLS」

### 稳定性

Node.js 侧标注为 **Stability 1.0 - Early development**，`added: v23.8.0`〔官方声明〕。

Bun 侧兼容表把 `node:quic` 标为 🟢〔官方声明〕：

> Implemented: `listen()`, `connect()`, `QuicEndpoint`, `QuicSession` and `QuicStream`. 99% of Node.js's test suite passes. The API is experimental in Node.js, and importing it emits an `ExperimentalWarning` in Bun too.

来源：<https://bun.com/docs/runtime/nodejs-compat#node-quic>

Bun 1.4 发布说明的柱状图给出 quic 模块 235/237 通过〔官方数据〕，来源：<https://bun.com/blog/bun-v1.4#node-js-compatibility>

**边界提示**〔推论〕：测试通过率高不代表 API 稳定。Bun 实现的是一个被 Node.js 明确标注为 Early development、预期会变更的接口。通过率描述的是「与当前 Node 行为一致的程度」，不是「接口不会变」。

### 需要什么 flags

| 运行时 | 要求 | 证据 |
|---|---|---|
| Node.js 26 | 必须 `node --experimental-quic`，且只能通过 `node:` scheme 导入 | 〔官方声明〕quic.md |
| Bun 1.4 | 文档只说明导入时发出 `ExperimentalWarning`，**未要求** `--experimental-quic` | 〔官方声明〕Bun 兼容表 |

Bun 未要求该 flag 是文档中「没有提及要求」，而非文档明确写「不需要」。首次使用时应实测确认。

### 它等于 HTTP/3 client/server 吗

**不等于，但包含。**〔推论，基于上文官方声明〕

`node:quic` 是 generic QUIC 传输层，HTTP/3 只是它内建支持的其中一个 ALPN。只有协商到 `h3` 时，session 和 stream 才获得 HTTP/3 特有能力（headers、trailers、优先级，通过 `onheaders` 回调消费）。要用其他 ALPN，framing 和多路复用需要自己在 JS 层实现。

它也不是 `fetch` 风格的 HTTP/3 客户端：没有 Request/Response 抽象，拿到的是流和字节。

## 二、Bun.serve 与 fetch 对 HTTP/2 / HTTP/3 的支持

### 先纠正一条流行错误

多个二手来源（含搜索引擎摘要与 Medium 文章）称「Bun 不支持 HTTP/2 server」。**这是过期信息。** 以第一方文档为准，见下文。

### Bun.serve 的 HTTP/3

Bun 官方文档有专门章节〔官方声明〕，来源：<https://bun.com/docs/runtime/http/server#http-3-quic>

```js
Bun.serve({
  tls: { key: Bun.file("./key.pem"), cert: Bun.file("./cert.pem") },
  http3: true,
  fetch(req) { return new Response("Hello over HTTP/3!"); },
});
```

文档明确的行为与限制〔官方声明〕：

- 标注为 experimental，「may change in future releases」
- 必须同时配置 `tls`，HTTP/3 requires TLS
- 开启后**在同一端口同时监听 TCP（HTTP/1.1）和 UDP（HTTP/3）**。HTTP/1.1 响应带 `Alt-Svc` 头通告 HTTP/3 端点，支持的客户端自动升级
- `http1: false` 可关闭 TCP 监听，只服务 HTTP/3。该选项要求 `http3: true`
- **不支持 unix domain socket**，QUIC 需要 UDP 端口

发布说明补充了更强的限制〔官方声明〕，来源：<https://bun.com/blog/release-notes/bun-v1.4.0>

> Experimental: zero-round-trip connection resumption is disabled, `server.upgrade()` returns `false` over H3, and `unix:` sockets skip the H3 listener. **Don't ship `http3: true` to production yet.**

`server.upgrade()` 在 H3 上返回 `false`，意味着 **HTTP/3 连接上没有 WebSocket**〔推论〕。需要 WebSocket 的路由必须保留 TCP 监听，即不能用 `http1: false`。

同一发布说明给出：静态路由基准测试中 HTTP/3 比同一服务器上的 HTTPS/1.1 快 2.7 倍〔官方数据〕。测试条件为 Bun 自行设定的 static-route benchmark，未独立复现。

**版本提示**〔官方声明〕：早期发布说明使用 `h1` / `h3`，当前文档与合入的重命名 PR #30583 使用 `http1` / `http3`。面向 Bun 1.4 当前版本应采用 `http1: false` 与 `http3: true`。来源：<https://github.com/oven-sh/bun/pull/30583>。

### fetch 的 HTTP/2 与 HTTP/3

〔官方声明〕来源：<https://bun.com/blog/release-notes/bun-v1.4.0>

```js
await fetch("https://api.example.com/a", { protocol: "http2" });
await fetch("https://example.com", { protocol: "http3" });
```

- 逐请求 opt-in，通过 `protocol` 选项指定
- HTTP/2 下，同一 origin 的并发请求共享一条连接。重定向、解压、流式传输行为与 HTTP/1.1 一致
- 全局开启：设置 `BUN_FEATURE_FLAG_EXPERIMENTAL_HTTP2_CLIENT=1`，或传 `--experimental-http3-fetch`
- 带 HTTP/3 flag 时，Bun 会记住哪些 origin 支持 H3，后续请求自动使用

**文档同步问题**〔推论〕：`fetch` 主文档页的「Protocol support」章节只列出 `s3://`、`file://`、`data:`、`blob:`，**完全没有提到 http2/http3**（<https://bun.com/docs/runtime/networking/fetch#protocol-support>）。该特性目前唯一的第一方依据是发布说明。

### node:http2

Bun 兼容表〔官方声明〕，来源：<https://bun.com/docs/runtime/nodejs-compat#node-http2>

> 🟢 Client & server are implemented. 94% of Node.js's test suite passes. The `maxDeflateDynamicTableSize`, `peerMaxConcurrentStreams`, `streamResetBurst`/`streamResetRate` and `maxOriginSetSize` options are accepted but ignored.

即需要 HTTP/2 服务端时，`node:http2` 一直是可用路径。

## 三、Traefik 的 HTTP/3：只终止 downstream

### Downstream（客户端到 Traefik）：支持

entryPoint 上的 `http3` 选项〔官方声明〕，来源：<https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/>

> `http3`：Enable HTTP/3 protocol on the `entryPoint`. **HTTP/3 requires a TCP `entryPoint`**, as HTTP/3 always starts as a TCP connection that then gets upgraded to UDP. In most scenarios, this `entryPoint` is the same as the one used for TLS traffic.
>
> `http3.advertisedPort`：Set the UDP port to advertise as the HTTP/3 authority. It defaults to the entryPoint's address port. It can be used to override the authority in the `alt-svc` header.

### Upstream（Traefik 到后端）：不支持 HTTP/3

控制 Traefik 与后端服务器之间连接的是 `ServersTransport`。其完整配置选项表为〔官方声明〕，来源：<https://doc.traefik.io/traefik/reference/routing-configuration/http/load-balancing/serverstransport/>

`serverName`、`certificates`、`insecureSkipVerify`、`rootCAs`、`cipherSuites`、`minVersion`、`maxVersion`、`maxIdleConnsPerHost`、**`disableHTTP2`**、`peerCertURI`、`forwardingTimeouts.*`、`spiffe.*`

该表中**没有任何 h3、QUIC 或 UDP 相关选项**。唯一的协议开关是 `disableHTTP2`（关闭到后端的 HTTP/2），说明上游协议栈上限为 HTTP/2。

旁证〔推论〕：`forwardingTimeouts.readIdleTimeout` 和 `pingTimeout` 的说明文字只提及 HTTP/2 ping frame 和 HTTP/2 连接，未提 QUIC。

### Bun 能否直接以 QUIC 连接 Traefik

分方向讨论，结论不同〔推论，基于上述官方声明〕：

| 方向 | 可行性 | 理由 |
|---|---|---|
| Bun 作为客户端主动连 Traefik | **可以** | Traefik entryPoint 开启 `http3` 后接受任何 HTTP/3 客户端，包括 `fetch(url,{protocol:"http3"})`。这是标准 downstream 终止，Traefik 随后降级为 HTTP/1.1 或 HTTP/2 转发给后端 |
| Traefik 用 QUIC 回源到 Bun 后端 | **不行** | ServersTransport 无此能力。即使后端配置了 `Bun.serve({http3:true})`，Traefik 仍只会用 TCP + HTTP/1.1 或 HTTP/2 连接它，H3 监听器不会被使用 |
| 绕过 Traefik，UDP 端口直接映射到 Bun | 网络上可行，架构上不可取 | 等于放弃 Traefik 的路由、TLS 终止、中间件，以及 Pangolin 的 badger 鉴权 |

## 四、Pangolin 与 newt 对 UDP / HTTP3 / QUIC 的官方能力

### Pangolin 的 HTTP/3：Traefik 开关，默认关闭

官方 Docker Compose 文档中，HTTP/3 以注释形式预置，需要手动打开两处〔官方声明〕，来源：<https://docs.pangolin.net/self-host/manual/docker-compose>

compose 侧，`gerbil` 服务的 ports：

```yaml
      - 443:443
      # - 443:443/udp # Uncomment if you enable HTTP/3 in Traefik.
      - 80:80
```

traefik 侧，`websecure` entryPoint：

```yaml
    # Uncomment to enable HTTP/3. You must also expose 443/udp in docker-compose.yml.
    # http3:
    #   advertisedPort: 443
```

结论〔推论〕：Pangolin 的 HTTP/3 就是 Traefik 的 HTTP/3，属于纯 downstream 终止，默认关闭，需要 opt-in。Pangolin 自身没有独立的 HTTP/3 实现。

注意 traefik 服务配置了 `network_mode: service:gerbil`，与 gerbil 共享网络栈，因此端口映射写在 gerbil 服务上。

### newt 的 UDP 与 HTTP/3 无关

Pangolin 官方前置条件〔官方声明〕，来源同上：

> - TCP ports `80` and `443` open
> - UDP ports `51820` and `21820` open if you are using tunneling

这两个 UDP 端口用于 WireGuard 隧道，与 HTTP/3 无关。

newt 官方安装文档中，命令行参数只有 `--id`、`--secret`、`--endpoint`，**没有任何 transport、QUIC 或 HTTP/3 选择参数**〔官方声明〕，来源：<https://docs.pangolin.net/manage/sites/install-site>

### 纠正：newt 不使用 QUIC

搜索引擎摘要称「Pangolin supports QUIC via Newt」「Newt uses QUIC for faster connections」。**查证第一方讨论串后确认这是错误的。**

fosrl 官方讨论 #2076 标题即为 *Transport flexibility: QUIC, WS, TCP (TLS)*，属于 Feature Requests 分类〔官方声明〕，来源：<https://github.com/orgs/fosrl/discussions/2076>

- 提案人开篇写：「Right now, Pangolin relies heavily on UDP-based tunnels (**WireGuard**)」，即 QUIC 是提案内容，不是现状
- maintainer `oschwartz10612` 回应：「No opposed but I think it would be difficult. You are looking at needing to change olm, gerbil, and newt... Would be open to hear a plan first before we go about changing anything.」
- 后续贡献者 `nicholasliverett` 最终转向 **WebSocket** 回退方案而非 QUIC：「I've revisited this idea and thought using websockets to relay client traffic when udp direct or udp relay was not available/working was a better idea」

截至该讨论最后更新，QUIC 传输仍是未合入的提案。

### raw TCP/UDP resource

Pangolin 支持暴露任意 UDP 端口，但需手动配置防火墙、Docker 端口映射和 Traefik entryPoint〔官方声明〕，来源：<https://docs.pangolin.net/manage/resources/public/raw-resources>

```yaml
  udp-1704:
    address: ":1704/udp"
```

〔推论〕理论上可用它透传一个 QUIC 端口到后端，但那是 L4 透传而非 HTTP/3 代理，TLS 必须由后端自行终止。

### 小结

**Bun 以 QUIC 直连 Pangolin 或 newt，没有第一方支持路径。**〔推论〕整个栈中唯一的 QUIC 接触面是 Traefik 的 downstream `h3` entryPoint。

## 五、Vite + pnpm + Vitest + Playwright 静态 SPA monorepo 用 Bun 替换 Node/pnpm

### 本仓前置事实

以下来自本仓 `AGENTS.md`，属于仓库既有约定，不是外部调研结论：

- 前端工程化由 **vite-plus（`vp`）** 一个包覆盖 dev/build/test/lint/fmt/任务运行/git 钩子，没有 husky/biome/eslint/prettier
- git 钩子由 vite-plus 安装，`core.hooksPath` 指向 `frontend/.vite-hooks/_`，是**仓库级设置，后端 Go 的提交同样受管**
- commitlint 由 frontend workspace 承载，根目录不再有 Node workspace
- CI 仅由发布 tag 触发，push main 不构建

第三条和第二条共同决定：包管理器变更的影响范围超出前端。

### 收益

#### 1. 包管理器：收益最确定

Bun 的 isolated linker 与 pnpm 语义对齐〔官方声明〕，来源：<https://bun.com/docs/pm/isolated-installs>

> Bun provides an alternative package installation strategy called isolated installs that creates strict dependency isolation **similar to pnpm's approach**. This mode prevents phantom dependencies.

迁移路径被官方标为 direct〔官方声明〕：

```bash
rm -rf node_modules pnpm-lock.yaml
bun install --linker isolated
```

默认 linker 由 lockfile 的 `configVersion` 决定〔官方声明〕：从 pnpm 迁移得到 `configVersion = 1`（workspace 下默认 isolated）；从 npm 或 yarn 迁移得到 `configVersion = 0`（hoisted）。本仓当前用 pnpm，因此迁移后默认即为 isolated。

`install.hoist = false` 可进一步对齐 pnpm 严格度，且该键名与 pnpm 的 `.npmrc` 一致〔官方声明〕。

性能〔官方数据〕，来源：<https://bun.com/blog/release-notes/bun-v1.4.0>

> On the common CI path (lockfile present, cache warm, `node_modules` wiped), a 1,400-package install is **7x faster**.

**前提条件**：该数字要求启用 `install.globalStore`，而官方明确写出「The global store is **opt-in**」「off by default」。不开启则拿不到这个倍数。

#### 2. 启动与内存

〔官方数据〕来源：<https://bun.com/blog/bun-v1.4#startup>

Linux 上 `hello.js`：Bun 1.4 启动 5.1ms、峰值内存 14.6MB；Node.js 26 启动 27.2ms、峰值内存 44.5MB。

〔推论〕对需要反复启动大量短命进程的 CI（lint、test 分片）这个差异会累积；对 `vite build` 这类单次长任务，收益被构建本身摊薄。

#### 3. 反证：Vite dev server 是 Node 更优

〔官方数据〕来源：<https://bun.com/blog/bun-v1.4#memory-usage>

Bun 自己的峰值内存对比表中，Vite dev server 一行：Bun 1.4 为 233 MB，Bun 1.3 为 268 MB，**Node.js 26 为 214 MB 且被加粗标为最优**。这是该表中唯一 Node 胜出的一行。

〔推论〕在本 stack 最核心的场景上，Bun 的第一方数据显示它不如 Node。这条足以否定「为了性能把 Vite 跑在 Bun 运行时上」这个动机。

### Next.js 全栈场景

〔官方数据〕来源：<https://bun.com/blog/bun-v1.4>。Bun 1.4 的优势在自托管 Next.js SSR 中才真正进入生产请求链路：官方给出的 Next.js SSR 峰值内存为 Bun 1.4 285 MB、Node.js 26 342 MB；4,000 页面压力场景为 Bun 238 MB、Node.js 410 MB。Bun 也声明 `bun --bun next build` 支持 Next.js 16.3 + Turbopack + React Compiler。

证据边界：这是 Bun 厂商自测与指定版本组合，不是 Vercel 或独立机构的对等验证。部署到 Vercel 托管运行时时，运行时由平台能力决定；只有自托管 Node-compatible server 时，才能直接把 Node 生产进程换成 Bun。静态导出的 Next.js 与当前 Vite SPA 一样，生产路径没有 JavaScript server，收益仍主要停留在安装和构建阶段。

### 风险

1. **vite-plus 明确只把 Bun 当包管理器，不把它当 JavaScript 运行时。** vite-plus 官方说明可用 pnpm、npm、Yarn 或 Bun 管理依赖，但由 `vp env` 管理 Node.js 运行时；运行时 RFC 当前只有 Node provider，Bun/Deno 列为 future / non-goal。来源：<https://github.com/voidzero-dev/vite-plus/blob/main/docs/guide/why.md>、<https://github.com/voidzero-dev/vite-plus/blob/main/rfcs/js-runtime.md>。因此未知数收窄为 Bun isolated 布局下的依赖解析、lint/fmt/task/git-hooks 行为，而不是 `vp` 会不会改用 Bun 运行。Bun 自列的 isolated 安装故障模式恰好覆盖这类工具〔官方声明〕，来源：<https://bun.com/docs/pm/isolated-installs#compatibility-issues>

   > - **Hardcoded paths** — Packages that assume a flat `node_modules` structure
   > - **Build tools** — Tools that scan `node_modules` directly

2. **「跑得起来」不等于「行为等价」。** 官方措辞是 vitest「runs under Bun, including `--coverage`, with the threads and forks pools」，Playwright「now runs on Bun: `connectOverCDP()`, `playwright test`, `playwright.config.ts`, `--ui`」〔官方声明〕。这是支持声明，不是零差异声明。

3. **仍存在的运行时缺口**〔官方声明〕，来源：<https://bun.com/docs/runtime/nodejs-compat>。若构建脚本用到需逐项核对：
   - `node:async_hooks`：`createHook`、`executionAsyncId`、`triggerAsyncId` 是 stub，async id 恒为 `0`；`AsyncLocalStorage` 上下文不传播到 `Worker`、`MessagePort`、`BroadcastChannel`
   - `node:crypto`：基于 BoringSSL，缺 `secp256k1`、`rsa-pss`、`ed448`、`x448`、`dsa`、`dh`，以及 CCM/OCB/XTS/`chacha20-poly1305`
   - `node:v8`：`serialize`/`deserialize` 使用 JavaScriptCore 格式而非 V8 格式
   - `node:sea`：未实现

4. **提交纪律耦合。** 〔推论〕包管理器变更后，vite-plus 是否仍正确安装 git 钩子、commitlint 是否仍能解析，必须实测。这条一旦损坏，后端 Go 的提交会一并损坏。

5. **CI 触发模型放大失败代价。** 〔推论〕本仓 CI 仅由裸 semver tag 触发并推到 `github` 远端，意味着「打 tag 才知道 CI 是否通过」，试错成本高于 push-to-main 模型。每一阶段都应在本地跑完 `scripts/verify-quick.sh` 后再推进。

### 低风险分阶段方案

按 AGENTS.md 的 E3 判定，这是 **L3**：包管理器变更属于仓库级，且 git 钩子是 grep 看不到的间接接线点。

每阶段独立可回滚，验证器复用既有锚点，不新增门禁。

#### 阶段 0：只装不换

前置条件：无。

1. 安装 Bun，确认 `bun --version` 有输出。
2. 在一份 scratch clone（不是工作副本）中运行 `bun install --linker isolated --verbose`。
3. 记录哪些包报错、`node_modules/.bun/` 的实际布局。

预期结果：产出一份报错清单。

停止条件：本阶段不修改工作副本，不产生 commit。

#### 阶段 1：只换包管理器，运行时保持 Node

这是收益与风险比最高的一步。关键约束：**继续用 `node` 跑所有脚本**，Bun 只负责安装。

前置条件：阶段 0 的报错清单已确认可接受。

1. 执行 `rm -rf node_modules pnpm-lock.yaml`。
2. 执行 `bun install --linker isolated`。
3. 在 `bunfig.toml` 写入 `[install] linker = "isolated"`，并显式启用 `install.globalStore`（不启用则拿不到 7 倍冷装收益）。
4. 评估是否加 `hoist = false` 以对齐 pnpm 严格度。
5. 运行 `cd frontend && pnpm ready` 的等价动作。
6. 运行 `scripts/verify-quick.sh`。
7. **单独测试 git 钩子**：构造一条违反 Conventional Commits 的 commit message，确认 commitlint 仍然拦截；再确认后端 Go 目录下的提交同样受管。

预期结果：第 5、6 步命令返回 0，第 7 步违规 message 被拦截。

失败时回滚：`git checkout pnpm-lock.yaml && rm -rf node_modules bunfig.toml && pnpm i`。

#### 阶段 2：CI 中只替换安装步骤

前置条件：阶段 1 在本地稳定运行多轮。因 CI 由 tag 触发、试错成本高，不要在阶段 1 尚未稳定时改 CI。

1. 只替换 CI 的 install 步骤，build 和 test 仍用 Node。
2. 观察 `context-gate`（main 上唯一必需的 CI 检查）是否仍通过。

#### 阶段 3：影子跑测试

前置条件：阶段 2 通过。

1. 新增一条**非阻塞**路径，用 `bun run vitest` 与 Playwright 跑测试，与现有 Node 路径并行。
2. 比对两条路径的结果差异。
3. Playwright 需重点确认浏览器下载与缓存路径在 isolated 布局下仍然正确。

停止条件：只有连续多次结果完全一致，才考虑切换主路径。

#### 阶段 4：建议停在此处

**不建议把 Vite 的 dev / build 迁到 Bun 运行时。**〔推论〕

理由不是风险，是没有收益：Bun 第一方数据显示 Vite dev server 内存 Node 更优（214 MB 对 233 MB）。静态 SPA 的构建产物与运行时无关，替换运行时换不来线上收益。

### 与 QUIC 的交集：零

〔推论〕静态 SPA 场景下，`Bun.serve({http3:true})`、`node:quic`、`fetch({protocol:"http3"})` 全部用不上：

- 静态资源由 Caddy 返回，Traefik 只终止公网连接并转发；链路不经过 Bun 运行时
- 用户能否用上 HTTP/3，取决于 Traefik entryPoint 是否开启 `http3`，与前端用什么运行时构建无关

要让用户用上 HTTP/3，需要在 Pangolin 暴露 `443:443/udp`，并在 Traefik 的 `websecure` entryPoint 启用 `http3.advertisedPort`。**该动作与 Bun 迁移完全正交。** 本项目已经完成这两项配置，见末尾现网核验。

## 六、需要纠正的二手错误说法

| 流行说法 | 实际情况 | 第一方依据 |
|---|---|---|
| Bun 不支持 HTTP/2 server | 过期。`node:http2` client 与 server 均已实现（94% 测试通过），且 `Bun.serve` 已有 `http3: true` | <https://bun.com/docs/runtime/nodejs-compat#node-http2> |
| newt 通过 QUIC 连接 | 错误。newt 使用 WireGuard。QUIC 是 fosrl 讨论区一个未合入的提案，社区实际转向 WebSocket 回退 | <https://github.com/orgs/fosrl/discussions/2076> |

## 七、第一方来源清单

Node.js

- QUIC API 文档：<https://raw.githubusercontent.com/nodejs/node/main/doc/api/quic.md>

Bun

- Node.js 兼容性总表：<https://bun.com/docs/runtime/nodejs-compat>
- HTTP Server（含 HTTP/3 章节）：<https://bun.com/docs/runtime/http/server#http-3-quic>
- Fetch：<https://bun.com/docs/runtime/networking/fetch>
- Isolated installs：<https://bun.com/docs/pm/isolated-installs>
- v1.4 发布说明：<https://bun.com/blog/bun-v1.4>
- v1.4.0 发布说明：<https://bun.com/blog/release-notes/bun-v1.4.0>

Traefik

- EntryPoints reference：<https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/>
- ServersTransport reference：<https://doc.traefik.io/traefik/reference/routing-configuration/http/load-balancing/serverstransport/>
- HTTP Services / load balancing：<https://doc.traefik.io/traefik/reference/routing-configuration/http/load-balancing/service/>

Pangolin / fosrl

- Docker Compose 自托管文档：<https://docs.pangolin.net/self-host/manual/docker-compose>
- Install Sites（newt）：<https://docs.pangolin.net/manage/sites/install-site>
- TCP / UDP raw resources：<https://docs.pangolin.net/manage/resources/public/raw-resources>
- Discussion #2076 Transport flexibility：<https://github.com/orgs/fosrl/discussions/2076>

## 待确认项

以下事项本次调研无法从第一方文档确定，落地前需实测：

- Bun 运行 `node:quic` 是否真的不需要 `--experimental-quic`（文档未提及要求，非明确否定）
- Bun isolated 布局安装出的依赖能否让 Node 运行的 vite-plus（`vp`）正确安装 git 钩子并运行任务
- Playwright 浏览器下载与缓存路径在 isolated 布局下是否正确

## 本项目现网核验

以下为 2026-08-27 的只读核验结果。

- 〔实测〕`docker-deploy/pangolin/docker-compose.yml` 已暴露 `443:443/udp`。
- 〔实测〕`docker-deploy/pangolin/config/traefik/traefik_config.yml` 已在 `websecure` entryPoint 启用 `http3.advertisedPort: 443`。
- 〔实测〕`https://pangolin.apikv.com/` 与 `https://gateway.apikv.com/` 均返回 `Alt-Svc: h3=":443"; ma=2592000`。本机 curl 实际协商为 HTTP/2，因为该 curl 构建不含 HTTP/3；因此这证明 Traefik 正在通告 H3，但不是浏览器已经成功使用 H3 的端到端证明。
- 〔实测〕前端生产镜像源码使用 Node.js + pnpm 进行 Vite 构建，最终运行层是 Caddy；live Pod 返回 Caddy `v2.11.4`。生产 Pod 内没有 Node.js 服务进程，因此 Bun 迁移只会直接影响安装、构建、测试和开发命令，不会自动提升浏览器运行性能。
- 〔实测〕当前开发机安装 Node.js `v24.20.0`、pnpm `11.22.0`，尚未安装 Bun。本文没有执行 Bun 兼容性或性能基准。
