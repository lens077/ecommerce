# consumer（前端消费者端）

**代码路径**：`frontend/apps/consumer/`　**端口**：3000

C 端主应用。React 19 + MUI 9 + Emotion + TanStack Router/Query + Connect-RPC + Casdoor + valtio。

## 关键结构

| 路径 | 作用 |
|---|---|
| `src/api/{cart,order,product,search,addresses,users}/` | 各域的 Connect transport + client |
| `src/providers/AuthProvider.tsx` | Casdoor 登录态，token 存 localStorage |
| `src/routes/callback/` | OAuth 回调 |
| `src/styles/tokens.ts` | 设计 token（⚠️ 见下方 experience） |
| `src/store/cart.ts` | valtio 购物车状态，localStorage 持久化 |

## experience

| 症状 | 文件 |
|---|---|
| 间距大得离谱，购物车每项高约 500px | [mui-spacing-tokens-8x.md](experience/mui-spacing-tokens-8x.md) |
| 购物车页一次挂载打出 4 个 POST | [duplicate-cart-queries.md](experience/duplicate-cart-queries.md) |

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
- `GetCartSummary.totalCount` 是 `COUNT(*)`（**行数**），`cartStore.totalQuantity` 是
  `sum(quantity)`（**件数**）。两者不可互换。

## 相关

- 登录死循环见 [`gateway/experience/jwt-nbf-clock-skew-loop.md`](../gateway/experience/jwt-nbf-clock-skew-loop.md)
