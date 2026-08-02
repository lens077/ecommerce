---
name: duplicate-cart-queries
module: consumer
description: 购物车页一次挂载打 4 个 POST——两个 hook 各拉各的，其中一个的 isMounted 只挡了 setState 没挡请求
---

# 购物车页一次挂载打出 4 个 POST

**症状**

打开购物车页，Network 面板里一秒内出现 4 个打向 `/cart.v1.CartService/*` 的 POST。
上游一抖，这 4 个就都变成 503 再各自重试，看起来像「网关在疯狂重试」。

**根因**

两个 hook 各拉各的，且其中一个会双发：

| hook | 走的 RPC | 次数 |
|---|---|---|
| `useCartBadge`（AppBar 用） | `GetCartSummary` | 1（+ 重试） |
| `useCart`（页面用） | `GetCart`，裸 `useEffect` | **2**（StrictMode 双发） |

`useCart` 里那个 `isMounted` 标志**只挡了 `setState`，没挡请求**——
它在 `then` 里判断，请求早就发出去了。React StrictMode 在 dev 下双调用 effect，
于是两个请求都真实打到了网关，只是第二个的结果被丢弃。

这是一个很常见的误解：`isMounted` 防的是「卸载后 setState」的告警，
**不是**请求去重。要去重得在发请求之前拦，或者交给带缓存的查询层。

**修复**

两个 hook 合并到同一个 TanStack Query：

```ts
const CART_ITEMS_QUERY_KEY = ["cart", "items"] as const;

function useCartItemsQuery() {
  return useQuery({
    queryKey: CART_ITEMS_QUERY_KEY,
    queryFn: () => cartApi.getCartItems(),
    staleTime: 10000,
  });
}
```

同一个 `queryKey` 天然去重，StrictMode 双调用也只发一个请求，重试统一交给 `QueryClient`。
一次挂载从 4 个 POST 降到 1 个。

加购之后 `invalidateQueries({ queryKey: CART_ITEMS_QUERY_KEY })`，
AppBar 徽标立刻刷新而不用等 `staleTime` 到期。`useCart.addItem` 和 `useAddToCart.addToCart`
两条路径都要加，商详页加购走的是后者。

**⚠️ 合并时差点静默改掉徽标数字**

徽标原来取 `GetCartSummary` 的 `totalCount`。合并后要从 items 推导，
直觉是用 `cartStore.getSummary().totalQuantity`——**这会改变显示的数字**：

| 来源 | 语义 |
|---|---|
| `GetCartSummary.totalCount` | `SELECT COUNT(*)`（`queries/cart.sql:102`），**行数** |
| `cartStore.totalQuantity` | `sum(item.quantity)`，**件数** |

一个 SKU 加 3 件，前者是 1，后者是 3。
两个后端 handler 又都按 `constants.CartStatusActive` 过滤，
所以正确的等价写法是 **`items.length`**，不是 `totalQuantity`。

这类「换数据源」的改动，先去后端把两边的 SQL 语义对一遍，别看字段名猜。

**排查捷径**

- 「网关在重试」之前先看 Network 面板：**几个不同的请求** vs **一个请求重试几次**，
  是两个完全不同的问题。前者在前端，后者在网关。
- React 里数请求数量要在 dev 的 StrictMode 下数，然后除以 2 再对照 prod，
  或者直接看 `queryKey` 有几个不同的。

**相关**

- 网关侧的重试放大：[`gateway/experience/retry-amplification-and-phantom-health-check.md`](../../gateway/experience/retry-amplification-and-phantom-health-check.md)
- 本轮 503 的真凶在服务注册侧：[`registry/experience/consul-ttl-first-ping-blind-window.md`](../../registry/experience/consul-ttl-first-ping-blind-window.md)
