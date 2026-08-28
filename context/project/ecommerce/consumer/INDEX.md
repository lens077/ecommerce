# consumer（前端消费者端）

**代码路径**：`frontend/apps/consumer/`　**端口**：3000

C 端主应用。React 19 + MUI 9 + Emotion + TanStack Router/Query + Connect-RPC + Casdoor + valtio。

## 关键结构

| 路径 | 作用 |
|---|---|
| `src/api/{cart,order,product,search,addresses,users}/` | 各域的 Connect transport + client |
| `src/providers/AuthProvider.tsx` | Casdoor 登录态；Web 凭 httpOnly cookie、桌面凭内存会话 id，**不落 localStorage**（`store/users.test.ts` 锁此不变量；2026-08-26 修正本行陈旧描述「token 存 localStorage」） |
| `src/routes/callback/` | OAuth 回调 |
| `src/styles/tokens.ts` | 设计 token（⚠️ 见下方 experience） |
| `src/store/cart.ts` | valtio 购物车状态，localStorage 持久化 |

## experience

| 症状 | 文件 |
|---|---|
| 间距大得离谱，购物车每项高约 500px | [mui-spacing-tokens-8x.md](experience/mui-spacing-tokens-8x.md) |
| 购物车页一次挂载打出 4 个 POST | [duplicate-cart-queries.md](experience/duplicate-cart-queries.md) |
| 登出后过一会儿自己又登回去 | [logout-auto-relogin.md](experience/logout-auto-relogin.md) |

## 已知注意事项

- **没有 MUI `ThemeProvider`** —— 用的是 MUI 默认主题（spacing factor = 8）。这是上面那条坑的前提。
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
- 登录死循环见 [`gateway/experience/jwt-nbf-clock-skew-loop.md`](../gateway/experience/jwt-nbf-clock-skew-loop.md)
