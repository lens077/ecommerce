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

## 已知注意事项

- **没有 MUI `ThemeProvider`** —— 用的是 MUI 默认主题（spacing factor = 8）。这是上面那条坑的前提。
- 所有 `createConnectTransport` 的 `baseUrl` 走 `env.VITE_GATEWAY_URL ?? "http://localhost:8080"`。
- 错误处理统一走 `@ecommerce/api` 的 `toAppError`，区分 `AUTH_REASONS`（退登）与
  `PERMISSION_REASONS`（仅提示，不退登）。**不要再写 `String((error as Error)?.message)` 兜底。**

## 相关

- 登录死循环见 [`gateway/experience/jwt-nbf-clock-skew-loop.md`](../gateway/experience/jwt-nbf-clock-skew-loop.md)
