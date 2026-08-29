# Next.js 商品详情垂直切片 POC

日期：2026-08-28  
范围：`frontend/apps/consumer-next`  
目标：验证 Next.js App Router 是否适合承载商品详情页的 SSR、Connect RPC、TanStack Query 注水、ISR、i18n 和 arm64 standalone 部署。

## 结论

**架构结论：拆分模式 go；「同一路由既转发逐请求 Cookie，又做整页 ISR」no-go。**

**2026-08-28 补测后状态：原两项待验证（arm64 容器、真实网关联调+多 Pod 一致性）已全部完成——整体判定升级为 go**：真实网关匿名数据链跑通（真实 PG 数据渲染 + MISS→HIT）、arm64 容器集群内稳态 RSS 43–45Mi、多 Pod 缓存不一致的机理与窗口已量化（缓解方案三选一列为转正实施项）。可按实施序扩页。

实测得到两条不同结果：

- Cookie-aware SSR 对照路由 `/[lang]/product-cookie/[spuCode]` 每请求创建 transport 并转发 Cookie，隔离正确，但响应始终为 `private, no-store`，两次请求均再次调用 RPC。
- 公开商品路由 `/[lang]/product/[spuCode]` 使用匿名 server transport，不读取、不转发 Cookie；首次请求为 `x-nextjs-cache: MISS`，第二次为 `HIT`，网关 mock 只收到一次匿名 RPC。个性化数据由独立 client component 在 hydration 后携带浏览器 Cookie 拉取。

由此形成架构规则：**公开、可收录、需要 ISR 的页面，其服务端数据获取必须匿名；per-request Cookie transport 只用于明确的 dynamic 路由，或把会话相关数据下沉到客户端。**

Next.js `16.3.3` 的 SSR、Connect Query 注水、Cookie 隔离、拆分后的 ISR 和中英文路由均已跑通。standalone 产物也已生成并在本机直接启动。Docker daemon 不可用，因此 linux/arm64 镜像构建、容器启动和容器 RSS 仍为「待验证」。

## 实现边界

- Next.js `16.3.3`、App Router、TypeScript、React `19.2.8`、`output: "standalone"`，端口 `3004`。
- Canonical 商品页 `/[lang]/product/[spuCode]`：匿名 Connect Node transport + `revalidate = 300` + 空数组 `generateStaticParams()`，支持所有商品编码首次访问时按需生成 ISR entry。
- Dynamic 对照页 `/[lang]/product-cookie/[spuCode]`：每次页面请求调用 `createServerTransport(cookie)` 新建 `@connectrpc/connect-node` transport；Cookie 通过该 transport 的 interceptor 写入 RPC header。不存在模块级、携带 Cookie 的 server transport。
- 服务端用 `createQueryOptions()` + `QueryClient.prefetchQuery()` + `dehydrate()`；客户端公开商品查询用 `@connectrpc/connect-query` 的 `useQuery()` + `HydrationBoundary`。
- 公开 server transport 与浏览器公开 transport 均使用静态 query key `consumer-next-product-v1`，确保公开商品查询 hydration 后不重复请求。
- 个性化 client component 使用独立静态 query key `consumer-next-personalized-v1`，通过同源 `/api` 携带浏览器 Cookie 发起 Connect Query。它不会污染公开商品 cache entry。
- Next Route Handler 在运行时把 `/api` 转发到 `CONSUMER_NEXT_GATEWAY_URL`。浏览器 Cookie 仍按同源规则发送。
- `backend/api/product/v1/product.proto` 由 app 自己的 `buf.gen.yaml` 生成到本 app 的 `src/gen/`，没有跨 app import。
- `app/[lang]/layout.tsx` 为 `zh`、`en` 生成静态参数；canonical 商品页输出两种语言的 hreflang alternates。
- 有意不引入 MUI/Emotion。POC 使用单个普通 CSS 文件，避免在架构结论尚未成立前把 RSC 样式方案也纳入变量。

## 判定表

| 问题 | 判定方法 | 实测结果 | 判定 |
|---|---|---|---|
| Q1 Cookie 逐请求隔离 | `pnpm verify:runtime` 启动本地 Connect JSON mock 与 `next dev`，并发请求 dynamic 对照页，分别携带 `poc=A`、`poc=B`；HTML 标记与 mock 收到的 Cookie 必须一一对应 | 输出 `cookieIsolation: pass`、`cookieRpcCount: 2`；A 页面只含 `POC cookie A`，B 页面只含 `POC cookie B`；mock 记录均为 `scope: cookie-ssr`，且 A/B 没有串线。适用范围是明确的 dynamic SSR 路由 | **go** |
| Q2 公开查询注水零重复请求 | 本地 mock + `next start`，Playwright 等待真实 hydration，监听浏览器 Connect 请求的 `x-consumer-next-scope`，并读取 mock 计数 | 公开 SSR 只调用一次 `scope: public-ssr`；hydration 后没有公开查询 refetch。浏览器仅发出预期的 `scope: personalized-client` 请求；页面无 hydration error | **go** |
| Q3a Cookie 转发路由可 ISR？ | `next start` 下连续请求 `/zh/product-cookie/poc-isr-fresh` 两次，检查响应 header 与 mock RPC 次数 | 两次均为 `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`，没有 `x-nextjs-cache`；mock 收到 2 次 `cookie-ssr` RPC | **no-go** |
| Q3b 匿名公开数据 + 客户端个性化时可 ISR？ | canonical 商品页使用匿名 server transport；对新商品编码连续请求两次，同时故意给页面请求带 Cookie，检查 `x-nextjs-cache` 与 mock scope | 第一次 `MISS`、第二次 `HIT`；两次响应均为 `s-maxage=300`；mock 只收到 1 次 `public-ssr` RPC，且 marker 为 `none`，证明传入页面的 Cookie 没有进入公开 RPC。Playwright 另证客户端个性化请求携带 `CLIENT_ONLY` Cookie | **go** |
| Q4 arm64 standalone | `next build` 检查 standalone；`docker buildx --platform linux/arm64` 构建并启动容器，再用 `docker stats --no-stream` 记录 RSS | **2026-08-28 补测通过**：linux/arm64 镜像构建成功（基底经 daocloud 镜像源；依赖阶段需 `--ignore-scripts` 跳过 workspace `prepare` 的 `vp config`——容器内无 git）；本机容器起动接真实网关，RSS **58.42MiB**、CPU 0.08%；集群内两 Pod 稳态 RSS **43–45Mi**（metrics-server）。镜像 raw 402MB。详见「补测」节 | **go** |
| Q5 i18n | 请求 `/zh/product/poc-i18n`、`/en/product/poc-i18n`，检查 `<html lang>` 和 `hreflang="zh|en"` | `pnpm verify:runtime` 输出 `i18n: pass`；两条路由均为 200，HTML 分别有 `lang="zh"`、`lang="en"`，且两份 HTML 都包含 zh/en alternates | **go** |
| Q6 现有 app 零影响 | `cd frontend && pnpm ready` | rc=0：格式化 213 个文件；lint 为 0 warning/0 error；perf 12 个测试、consumer 8 个测试通过，merchant 无测试按约定通过；递归 build 全部通过 | **go** |
| Q7 workspace 兼容 | workspace 安装后执行 `cd frontend && pnpm exec vp run -r build` | 本 agent 的 `pnpm install --frozen-lockfile` 实测 rc=0；共享 named catalog 稳定后，同队 agent 再次实测安装/peer 检查为绿；本 agent 最终显式执行 `vp run -r build`，6/6 workspace build 通过 | **go** |

## 关键证据与复现

### 默认网关连通性

实测命令：

```bash
curl -sS -m 5 http://192.168.3.131:8080/healthz
```

结果：`curl: (7) Failed to connect to 192.168.3.131 port 8080`。因此本报告没有声称真实 dev 网关的商品数据已经跑通；Q1、Q2、Q3 和 Q5 的运行时行为由本地 Connect JSON mock 验证。

### Q1 与 Q5

```bash
cd frontend/apps/consumer-next
pnpm verify:runtime
```

实测摘要：

```json
{
  "cookieIsolation": "pass",
  "cookieRpcCount": 2,
  "i18n": "pass",
  "routes": [
    "/zh/product/poc-i18n",
    "/en/product/poc-i18n"
  ]
}
```

### Q2 与客户端个性化拆分

重复验证脚本会先构建应用，再自动启动本地 mock 与 `next start`，最后调用仓库已有的 Playwright：

```bash
cd frontend/apps/consumer-next
pnpm verify:browser
```

脚本给页面设置 `poc=CLIENT_ONLY` Cookie，打开一个未生成过的 canonical 商品 URL，并等待真实 hydration 与 `[data-personalized-state=success]`。实测输出：

```json
{
  "browserRpcScopes": ["personalized-client"],
  "hydrated": "true",
  "pageErrors": [],
  "personalizedText": "客户端个性化层POC cookie CLIENT_ONLY",
  "publicHeading": "POC cookie none",
  "gatewayRequests": [
    {"marker":"none","scope":"public-ssr","spuCode":"poc-personalized-16765"},
    {"marker":"CLIENT_ONLY","scope":"personalized-client","spuCode":"poc-personalized-16765"}
  ]
}
```

这组证据同时说明：

- 公开 SSR 没有转发初始页面请求的 Cookie。
- Hydration 后没有 `public-ssr` 对应的公开查询重复请求。
- 个性化请求只存在于浏览器侧，并携带浏览器 Cookie。

### Q3a：Cookie-aware dynamic 对照

先运行 `pnpm build`，再在两个终端运行 `pnpm mock:gateway`，以及带 `CONSUMER_NEXT_GATEWAY_URL=http://127.0.0.1:4010` 的 `pnpm start`。然后执行：

```bash
curl -sS -X POST http://127.0.0.1:4010/__reset
for n in 1 2; do
  curl -sS -o /dev/null -D - -H 'Cookie: poc=COOKIE_ISR' \
    http://127.0.0.1:3004/zh/product-cookie/poc-isr-fresh
done
curl -sS http://127.0.0.1:4010/__stats
```

实测摘要：

```text
request 1: Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
request 2: Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

```json
{
  "requests": [
    {"marker":"COOKIE_ISR","scope":"cookie-ssr","spuCode":"poc-isr-fresh"},
    {"marker":"COOKIE_ISR","scope":"cookie-ssr","spuCode":"poc-isr-fresh"}
  ]
}
```

事实：`headers()` 是 request-time API。Next.js 官方说明，使用它会让路由进入动态渲染。本 POC 的生产实测与该行为一致。仅导出 `revalidate = 300` 不会产生可用的 ISR cache entry。

### Q3b：匿名公开 ISR

```bash
curl -sS -X POST http://127.0.0.1:4010/__reset
for n in 1 2; do
  curl -sS -o /dev/null -D - -H 'Cookie: poc=MUST_NOT_FORWARD' \
    http://127.0.0.1:3004/zh/product/poc-isr-fresh
done
curl -sS http://127.0.0.1:4010/__stats
```

实测摘要：

```text
request 1: x-nextjs-cache: MISS
request 1: Cache-Control: s-maxage=300, stale-while-revalidate=31535700
request 2: x-nextjs-cache: HIT
request 2: Cache-Control: s-maxage=300, stale-while-revalidate=31535700
```

```json
{
  "requests": [
    {"marker":"none","scope":"public-ssr","spuCode":"poc-isr-fresh"}
  ]
}
```

动态商品编码要在首次访问时建立 ISR entry，Next.js 官方要求对应 page 的 `generateStaticParams()` 返回空数组，或使用 `dynamic = "force-static"`；未预生成全部商品时，本 POC 采用空数组。构建路由清单因此把 canonical 商品页标为 `●`（SSG），Cookie 对照页仍标为 `ƒ`（Dynamic）。

多 Pod 风险仍需集群验证。默认 cache 与 revalidation 是各 Pod 本地状态；候选方案是共享 cache handler/远端 `use cache`，或者采用短 TTL 并接受副本间短暂不一致。Cookie 相关输出不得进入公共整页缓存。

### Q4

已通过的 standalone 部分：

```bash
cd frontend/apps/consumer-next
pnpm build
PORT=3004 HOSTNAME=127.0.0.1 \
CONSUMER_NEXT_GATEWAY_URL=http://127.0.0.1:4010 \
node .next/standalone/apps/consumer-next/server.js
```

Docker daemon 可用后执行：

```bash
cd frontend
docker buildx build --platform linux/arm64 \
  -f apps/consumer-next/Dockerfile \
  -t consumer-next:poc --load .

docker run --rm -d --name consumer-next-poc \
  -p 3004:3004 \
  -e CONSUMER_NEXT_GATEWAY_URL=http://host.docker.internal:4010 \
  consumer-next:poc
curl -sS http://127.0.0.1:3004/zh/product/poc-arm64
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' consumer-next-poc
docker stop consumer-next-poc
```

本次 `docker buildx build` 的实际失败原因：

```text
failed to connect to the docker API at unix:///Users/sumery/.docker/run/docker.sock:
connect: no such file or directory
```

### Q6 与 Q7：全仓门禁

```bash
cd frontend
pnpm ready
pnpm exec vp run -r build
```

两条命令均为 rc=0。`pnpm ready` 已包含格式化、lint、递归 test 和递归 build；第二条命令用于单独复核用户指定的 workspace build 链。最终路由清单仍为：canonical 商品页 `●`、Cookie 对照页 `ƒ`、同源 API proxy `ƒ`。

## 事实与推断边界

### 已确认事实

- Next.js `16.3.3` 构建通过；canonical 商品页为 `●`，Cookie 对照页为 `ƒ`。
- Connect Query v2 的 transport 会参与 query key；官方提供 `addStaticKeyToTransport()` 处理服务端与客户端 transport 引用不同的 SSR 场景。
- Dynamic 对照页中，逐请求 Cookie 没有串线。
- Canonical 商品页中，公开 SSR 查询没有在 hydration 后重复；个性化 Cookie 请求只在浏览器侧发生。
- 匿名 canonical 商品页首次访问 `MISS`、第二次 `HIT`；Cookie-aware 对照页始终 `no-store`。
- `pnpm ready` 与显式 `vp run -r build` 均通过，现有 workspace 默认态没有被 POC 破坏。
- 默认 dev 网关在本次执行环境中不可达。
- Docker daemon 在本次执行环境中不可用。

### 尚未确认

- ~~真实 dev 网关的商品响应是否与 mock 一致~~ → 2026-08-28 补测确认（见下节）。
- ~~linux/arm64 镜像、容器起动与 RSS~~ → 2026-08-28 补测确认。
- ~~多 Pod 缓存一致性~~ → 2026-08-28 集群实测确认「各 Pod 独立缓存」的机理与量化窗口（见下节）；**共享 cache handler 方案本身未实测**，列为转正实施项。
- ~~转正实施项：Cilium Gateway/HTTPRoute 公网路由接线、真实域名/TLS~~ → 2026-08-28 已完成并实测（见文末「转正后端到端验收」）。
- 仍未验证：带认证 Cookie 的 dynamic 路由联调（匿名链路已实测，登录态需真实 Casdoor 会话，待人工联调）；分类/首页扩页受阻于后端 `ListProducts` RPC 未实现。

## 2026-08-28 补测：真实网关联调 + arm64 容器 + 多 Pod 一致性

### 真实网关联调（go）

- 网关实况订正：`192.168.3.131:8080` LB 已不存在；control-tower 网关现为 ClusterIP `ecommerce-gateway-service.ecommerce.svc:8080`，公网入口为 Cilium Gateway `192.168.3.121`（HTTPRoute `gateway.dev.test/gateway.apikv.com`）。本地经 `kubectl port-forward` 18080 打通。
- 匿名（零 Cookie）`POST /product.v1.ProductService/GetProductDetail {"spuCode":"iphone-15-pro"}` 经网关返回真实 PG 数据（spuId 8、SKU ¥8999）——商品详情确在网关匿名清单内，「公开页匿名取数」的前提在真实网关上成立。
- 容器接真实网关渲染：`/zh/product/iphone-15-pro` 首请求 `x-nextjs-cache: MISS` 且 HTML 含「Apple iPhone 15 Pro」（真实数据链：容器 → port-forward → 网关 → product → PG），次请求 `HIT`，`s-maxage=300` 一致。

### arm64 容器（go）

```text
镜像：consumer-next:poc（linux/arm64，standalone，raw 402MB）
构建注意：①docker.io 直连超时，基底走 docker.m.daocloud.io 镜像源；
         ②依赖阶段必须 pnpm install --ignore-scripts——workspace 根 prepare(vp config) 需 git，slim 镜像无 git
本机容器 RSS：58.42MiB / CPU 0.08%（起动+数次请求后）
集群内 Pod RSS：43Mi / 45Mi（2 副本，metrics-server）——远低于 384Mi limit
镜像已推 ccr.ccs.tencentyun.com/sumery/consumer-next:poc-20260828（TCR 主镜像仓库，集群直连拉取成功）
```

### 多 Pod 缓存一致性（机理坐实，缓解方案为转正实施项）

部署 `deploy/poc.yaml`（2 副本，topologySpread 强制分节点 node101/node103，readiness 探 `/zh` 路径，集群内直连网关 Service），用未预热的 `/en/product/iphone-15-pro` 做对照实验：

```text
Pod A #1: MISS   → A #2: HIT          （A 本地缓存建立）
Pod B #1: MISS   → B #2: HIT          （B 与 A 独立——A 已 HIT 的同一时刻 B 仍 MISS）
Service 连续 6 次（双 Pod 预热后）：全 HIT（稳态收敛）
```

结论：**Next.js 默认 ISR 缓存是 Pod 本地状态**。同一 URL 的生成时刻与 `revalidate=300` 过期时钟在各 Pod 间互不同步——商品改价后最长一个 revalidate 周期内，不同 Pod 可能返回不同版本；预热/稳态下用户视角一致。风险量化后可接受性取决于页面语义：详情页公共信息（分钟级偏差）通常可接受。缓解选项（转正时选一）：①短 TTL（把不一致窗口压到可接受值）；②共享 cache handler（自定义 `cacheHandler` 指向共享存储，彻底一致，需实测）；③发布/改价时对全部 Pod 广播 `revalidatePath`。实验后 POC 资源已清理（Deployment/Service 已删）。

**转正落地（2026-08-28 当日）**：缓解方案拍板为①短 TTL——页面 `revalidate` 由 300 改 60；POC 临时清单 `deploy/poc.yaml` 已被正式清单 `deploy/dev.yaml` 取代（2 副本分节点 + PDB `minAvailable:1` + `/healthz` 探针（有意不探下游）+ HTTPRoute 在 `shop.dev.test`/`shop.apikv.com` 上按 `/zh`、`/en`、`/_next` 前缀分流，SPA 保持 `/` catch-all）；`/product-cookie` 对照路由已删除（结论存档于本报告 Q1/Q3a）；Dockerfile 固化 `ARG BASE_IMAGE` 与 `--ignore-scripts` 教训。

## 转正后端到端验收（2026-08-28）

镜像 `ccr.ccs.tencentyun.com/sumery/consumer-next:dev-20260828-2`（linux/arm64，TCR 主镜像仓库），2 副本落在 node101/node103，`kubectl rollout` 成功、HTTPRoute `Accepted`。

**内网（splitdns → Cilium Gateway）**

```text
GET https://shop.dev.test/zh/product/iphone-15-pro   → 200，首次 MISS（双 Pod 各自冷启动），
                                                       预热后连续 5 次全 HIT，cache-control: s-maxage=60
GET https://shop.dev.test/en/product/iphone-15-pro   → 200，hrefLang zh/en alternates 指向 shop.dev.test
GET https://shop.dev.test/                           → 200，仍是 Vite SPA（catch-all 未被抢走）
GET https://shop.dev.test/_next/static/chunks/*.js   → 200
```

**公网（DNSPod → node1 Pangolin → newt → Cilium Gateway）**

```text
GET https://shop.apikv.com/zh/product/iphone-15-pro  → HTTP/2 200，真实数据「Apple iPhone 15 Pro」，
                                                       cache-control: s-maxage=60，x-nextjs-cache: STALE
GET https://shop.apikv.com/                          → 200（SPA 不受影响）
```

`STALE` 是 `stale-while-revalidate` 的正常语义：ISR entry 已存在但超过 60s revalidate 窗口，先返回旧内容再后台重生成——证明缓存链路生效且不阻塞请求。首屏真实数据、公私两条链路一致，判定公开页转正的端到端验收通过。

前端门禁：清理陈旧 `.next` 生成物后 `cd frontend && pnpm ready` rc=0（6/6 build 通过，含 consumer-next）。

## 参考资料

- Connect Query `addStaticKeyToTransport` 与 SSR 提示：<https://github.com/connectrpc/connect-query-es#addstatickeytotransport>
- TanStack Query App Router 的 prefetch/dehydrate/HydrationBoundary 模式：<https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr>
- Connect Node transport：<https://connectrpc.com/docs/node/using-clients/>
- Next.js `headers()` 的动态渲染说明：<https://nextjs.org/docs/app/api-reference/functions/headers>
- Next.js `generateStaticParams()` 的按需 ISR 要求：<https://nextjs.org/docs/app/api-reference/functions/generate-static-params>
- Next.js 多实例 revalidation 与 cache handler：<https://nextjs.org/docs/app/guides/how-revalidation-works>
