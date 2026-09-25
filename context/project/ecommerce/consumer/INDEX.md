# consumer（前端消费者端）

**代码路径**：`frontend/apps/consumer/`　**端口**：3000

C 端主应用。React 19 + MUI 9 + Emotion + TanStack Router/Query + Connect-RPC + Casdoor + Zustand
（2026-08-28 完成 valtio→zustand 全量迁移，valtio 依赖已移除）。

## 关键结构

| 路径 | 作用 |
|---|---|
| `src/api/{cart,order,product,search,addresses,users}/` | 各域的 Connect transport + client |
| `src/providers/AuthProvider.tsx` | Casdoor 登录态；Web 凭 httpOnly cookie、桌面凭内存会话 id，**不落 localStorage**（`store/users.test.ts` 锁此不变量；2026-08-26 修正本行陈旧描述「token 存 localStorage」） |
| `src/routes/callback/` | OAuth 回调 |
| `src/styles/tokens.ts` | 设计 token（⚠️ 见下方 experience） |
| `src/store/cart.ts` | Zustand 购物车状态（vanilla store + 模块级 action），localStorage 持久化 |

## experience

| 症状 | 文件 |
|---|---|
| 间距大得离谱，购物车每项高约 500px | [mui-spacing-tokens-8x.md](experience/mui-spacing-tokens-8x.md) |
| 购物车页一次挂载打出 4 个 POST | [duplicate-cart-queries.md](experience/duplicate-cart-queries.md) |
| 登出后过一会儿自己又登回去 | [logout-auto-relogin.md](experience/logout-auto-relogin.md) |
| 读屏跳不到页面标题、整页没有 h1，但 axe 全绿 | [mui-typography-variant-decides-heading.md](experience/mui-typography-variant-decides-heading.md) |
| PageSpeed 移动端比桌面低 20 分，TBT/CLS 却满分 | [mobile-pagespeed-gap-is-bytes-not-js.md](experience/mobile-pagespeed-gap-is-bytes-not-js.md) |

## 已知注意事项

- **没有 MUI `ThemeProvider`** —— 用的是 MUI 默认主题（spacing factor = 8）。这是上面那条坑的前提。
  同样因为没有自定义 `variantMapping`，`Typography` 的 `variant` 会**直接决定渲染出的标题标签**
  （`h1`–`h6` → 同名标签、`subtitle1/2` → `h6`），挑字号等于定文档大纲——非标题内容务必显式
  `component="p"`，详见上表最后一条 experience。
- 所有 `createConnectTransport` 的 `baseUrl` 走 `env.VITE_GATEWAY_URL ?? "http://localhost:8080"`。
- 错误处理统一走 `@ecommerce/api` 的 `toAppError`，区分 `AUTH_REASONS`（退登）与
  `PERMISSION_REASONS`（仅提示，不退登）。**不要再写 `String((error as Error)?.message)` 兜底。**
- **数据拉取一律走查询层，不要写裸 `useEffect` + fetch。** `isMounted` 只挡 `setState`，
  挡不住请求，StrictMode 下会实打实双发。具体写法见
  [`frontend-api/sop/connect-query.md`](../frontend-api/sop/connect-query.md)：
  正在从「手写 `queryKey` + `queryFn` 包 client」迁到 connect-query，key 由
  `schema + input + transport` 自动推导，不再需要人为约定
  （购物车原来的约定 key 是 `["cart","items"]`）。
- 购物车徽标取 `GetCart` 的 `items.length`（**行数**），而 `cartStore.totalQuantity` 是
  `sum(item.quantity)`（**件数**）——两者不是一回事，「一个 SKU 加 3 件」前者是 1 后者是 3。
  改徽标取值时务必分清。（原 `GetCartSummary.totalCount` 也是行数，该 RPC 已于 2026-08 删除，
  因为 `GetCartResponse.cart_item_quantity` 返回的就是同一个数）
- **协议生成快照也要同步**：2026-09-24 发现 consumer 的 CreateAddressRequest 仍发送后端已 reserved 的 `user_id`，仅跑 TypeScript 检查发现不了。后端 `make api` 后运行 `bash scripts/sync-ts-gen.sh`；`bash scripts/sync-ts-gen.sh --check` 已接前端快速门禁，覆盖两个应用及相对生成依赖。不要手改 descriptor。
- **写成功与刷新成功分开判断**：地址 mutation 返回真实 RPC 结果；列表刷新失败由查询错误展示，不能让已创建地址被当成创建失败再提交。下单只发条目 ID 时，要比对服务端快照的数量、商品和金额，不能用「ID 是数字」证明本地改动已持久化。
- 登录死循环见 [`gateway/experience/jwt-nbf-clock-skew-loop.md`](../gateway/experience/jwt-nbf-clock-skew-loop.md)
