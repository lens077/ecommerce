---
name: connect-query
module: frontend-api
description: 前端数据拉取的唯一写法——connect-query 直接吃 protoc-gen-es v2 的方法描述符，不再手写 queryKey/queryFn 包一层 client
---

# SOP · Connect Query 数据拉取规范

**适用范围**：`frontend/apps/*/src/` 与 `frontend/packages/api/`。
凡是「组件里要拿后端数据」，都按本文写。

**迁移状态**：consumer 已全量迁完（2026-08-03）。merchant / admin 目前没有 RPC 调用。
`config` 准备迁出本仓库，暂不改，它那两处 `createAppTransport()` 是仅存的旧写法。

> 出处：改写自 Redpanda Console 的 `api-patterns` 规则集（Apache 2.0）。
> 原文假定的是 Redpanda 自己的目录（`/src/protogen/`、`task proto:generate`、
> `formatToastErrorMessage`），**本文已全部换成本仓库的真实路径与工具**，不要照抄原文。

## 铁律速查

| 场景 | 规矩 | 章节 |
|---|---|---|
| 组件要数据 | `useQuery(Service.method.xxx, input)`，不写 `queryKey`/`queryFn` | [1](#1-数据拉取一律走-connect-query) |
| 写操作 | `useMutation(Service.method.xxx)` | [1](#1-数据拉取一律走-connect-query) |
| transport | 全 app **一个实例**，由 `TransportProvider` 下发 | [2](#2-transport-必须唯一) |
| 写完刷新 | `createConnectQueryKey({ schema, cardinality: "finite" })` | [3](#3-失效用-createconnectquerykey手写字符串-key-一律不收) |
| 报错 | `toAppError(error)` + `ErrorHandler` | [4](#4-错误一律过-toapperror) |
| `src/gen/` | **只读**，改 proto 再重新生成 | [5](#5-srcgen-是生成物不许手改) |
| 免鉴权接口 | 单独 transport，`options.transport` 传入 | [6](#6-免鉴权接口走独立-transport) |
| `int64` 字段 | 传 `BigInt(...)`，读要 `.toString()` | [7](#7-int64--messageinitshape) |

---

## 0. 为什么不需要 codegen 插件

`@connectrpc/connect-query@2` 的 `useQuery` 第一个参数类型是 `DescMethodUnary`：

```ts
// node_modules/@connectrpc/connect-query/dist/esm/use-query.d.ts
export declare function useQuery<I extends DescMessage, O extends DescMessage, SelectOutData = MessageShape<O>>(
  schema: DescMethodUnary<I, O>,
  input?: SkipToken | MessageInitShape<I>,
  options?: UseQueryOptions<O, SelectOutData>,
): UseQueryResult<SelectOutData, ConnectError>;
```

而 `protoc-gen-es@2` 生成的 `src/gen/api/cart/v1/cart_pb.ts` 里，`CartService` 是
`GenService<...>`，`CartService.method.getCart` 就是一个 `DescMethodUnary`。

**两边直接对得上**，所以：

- 不装 `protoc-gen-connect-query`，`buf.gen.yaml` 不动
- `src/gen/` 目录结构不变，不会多出 `*_connectquery.ts`
- 只在 `frontend/pnpm-workspace.yaml` 的 catalog 里加一条
  `"@connectrpc/connect-query": ^2.2.0`，再给用到的 app 加依赖

peer 版本已核对，和现有 catalog 全部相容：
`react ^18||^19`、`@bufbuild/protobuf 2.x`、`@connectrpc/connect ^2.0.1`、
`@tanstack/react-query >=5.62.0`。

---

## 1. 数据拉取一律走 connect-query

**影响：CRITICAL** —— 手写 `queryKey` 是本仓库[购物车 4 个 POST](../../consumer/experience/duplicate-cart-queries.md)那类
问题的温床：key 靠人肉约定，两个 hook 一不小心就各拉各的。

### ❌ 不要（现状写法）

```ts
// src/api/cart/index.ts —— 手工包一层 client
const transport = createAppTransport();
const client = createClient(CartService, transport);

export class CartApiClient {
  async getCartItems(): Promise<CartItem[]> {
    const response = await client.getCart({});
    return response.items.map(mapRpcCartItemToCartItem);
  }
}
export const cartApi = new CartApiClient();

// src/hooks/useCart.ts —— 再手工编 key
const CART_ITEMS_QUERY_KEY = ["cart", "items"] as const;
useQuery({ queryKey: CART_ITEMS_QUERY_KEY, queryFn: () => cartApi.getCartItems() });
```

三层：`client` → `cartApi` 门面 → `useQuery` 包装。中间两层不产生任何信息，
只是把 proto 已经描述过的东西又抄了一遍。

### ✅ 要这样

```ts
// src/hooks/useCart.ts
import { useQuery } from "@connectrpc/connect-query";
import { CartService } from "@/gen/api";

export function useCartItemsQuery() {
  return useQuery(CartService.method.getCart, {}, { staleTime: 10_000 });
}

export function useCartBadge(): number {
  // 与 useCart 共用同一个 key（由 schema + input 自动推出），天然去重
  const { data } = useCartItemsQuery();
  return data?.items.length ?? 0;
}
```

key 由 `schema + input + transport` 自动推导，形如：

```
["connect-query", { transport: "t1", serviceName: "cart.v1.CartService",
                    methodName: "GetCart", input: {}, cardinality: "finite" }]
```

**同一个 RPC + 同一个入参 = 同一个 key，不需要任何人为约定。**

### mutation

```ts
import { useMutation } from "@connectrpc/connect-query";

const addToCart = useMutation(CartService.method.addProductToCart, {
  onSuccess: () => { /* 见第 3 节 */ },
});

addToCart.mutate({ spuId: BigInt(spuId), skuId: BigInt(skuId), /* ... */ });
```

### 条件拉取

`enabled` 仍然可用，但**优先用 `skipToken`** —— 它同时把 key 里的 `input` 标成 `"skipped"`，
类型上也不用把入参写成可选：

```ts
import { skipToken } from "@connectrpc/connect-query";

useQuery(AddressService.method.listAddresses, userId ? { userId } : skipToken);
```

### 常用 option

| option | 用途 |
|---|---|
| `staleTime` | 多久之内不重新拉。购物车用 `10_000` |
| `select` | 只取需要的字段，减少重渲染（⚠️ 见下方红线） |
| `transport` | 覆盖本次调用的 transport（见第 6 节） |
| `retry` / `refetchOnWindowFocus` | 已在各 app `bootstrap.tsx` 的 `QueryClient` 里设过默认值，**不要在单点重复设置** |

⚠️ **要做映射的 `select` 一律提到模块作用域，不要写成内联箭头函数。**

```ts
// ✅ 模块级：身份稳定,data 不变就不重算
function toStoreItems(res: GetCartResponse) {
  return res.items.map((i) => ({ ...i, spuId: i.spuId.toString() }));
}
useQuery(CartService.method.getCart, {}, { select: toStoreItems });

// ❌ 内联:每次渲染都是新身份,每次渲染都重跑一遍映射
useQuery(CartService.method.getCart, {}, { select: (res) => res.items.map(...) });
```

实测过四种组合（`apps/consumer/src/hooks/useCart.test.tsx` 那轮）：

| `select` | `structuralSharing` | 结果 |
|---|---|---|
| 模块级 | 默认 `true` | 同步 effect 跑 1 次 |
| 内联 | 默认 `true` | 也只跑 1 次 |
| 模块级 | `false` | 跑 1 次 |
| **内联** | **`false`** | **死循环，测试进程跑不完** |

所以**「内联 select 会让 `useEffect([data])` 无限触发」这个说法本身是不准确的** ——
默认配置下不会，是 TanStack 的结构共享（`replaceEqualDeep`）把新算出的数组换回了旧引用，
把这个坑兜住了。真正的风险是它**只差一个配置项就成立**：谁给这个查询加上
`structuralSharing: false`，内联 select 立刻产出新引用 → effect 写 store → 订阅回调
setState → 再渲染 → 循环，而那个人根本不会想到是 select 的问题。

模块级函数把这条路堵死，顺带省掉每次渲染的重复映射。返回既有引用（`res.addresses`）
的内联 select 无所谓，但既然规则统一更省心，就一律提出去。

### 不进缓存的一次性调用

登录换 token、带自定义节流/abort 的搜索这类，本来就不该进查询缓存，用
`callUnaryMethod` 直接调，别硬套 hook：

```ts
import { callUnaryMethod, useTransport } from "@connectrpc/connect-query";

const transport = useTransport();
const res = await callUnaryMethod(transport, UserService.method.signIn, { code, state });
```

组件外（或要指定免鉴权）时把 `getSharedTransport()` / `getPublicTransport()` 传进去即可。

---

## 2. transport 必须唯一

**影响：CRITICAL** —— 这条是本仓库特有的坑，Redpanda 原文没有。

query key 里带 `transport` 字段，值来自 `createTransportKey(transport)`，
而这个函数**对每个对象引用返回一个不同的字符串**。也就是说：

> 两个 transport 实例 ⇒ 两套互不相通的缓存命名空间 ⇒ invalidate 打不中另一半。

迁移前 `createAppTransport()` 被调了 **10 次**（consumer 8 次、config 2 次），每个
`src/api/*/index.ts` 一个。现在 consumer 侧已收敛成 `packages/api/src/transport.ts`
里的两个懒单例：

```ts
export function getSharedTransport(): Transport;  // 带 auth，给 TransportProvider
export function getPublicTransport(): Transport;  // 免鉴权，product / search 用
export function resetTransports(): void;          // 仅供测试
```

```tsx
// apps/consumer/src/bootstrap.tsx —— TransportProvider 包在 QueryClientProvider 外层
import { TransportProvider } from "@connectrpc/connect-query";
import { getSharedTransport } from "@ecommerce/api";

<TransportProvider transport={getSharedTransport()}>
  <QueryClientProvider client={queryClient}>{/* ... */}</QueryClientProvider>
</TransportProvider>
```

⚠️ `createAppTransport` 在创建时就固化了 `baseUrl` 和 `fetch`（见 `packages/api/src/runtime.ts`
的注释）。桌面端要在 `setGatewayBaseUrl()` / `setAppFetch()` 之后才第一次取 transport，
懒初始化就是为了这个，**不要改成模块顶层 `const sharedTransport = createAppTransport()`**。

---

## 3. 失效用 `createConnectQueryKey`，手写字符串 key 一律不收

**影响：HIGH**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { CartService } from "@/gen/api";

const queryClient = useQueryClient();

const addToCart = useMutation(CartService.method.addProductToCart, {
  onSuccess: () => {
    // 不带 input / transport ⇒ 部分匹配，命中该 RPC 的所有入参与所有 transport
    queryClient.invalidateQueries({
      queryKey: createConnectQueryKey({
        schema: CartService.method.getCart,
        cardinality: "finite",
      }),
    });
  },
});
```

`cardinality` 是**必填**，三种取值：`"finite"`（普通查询）、`"infinite"`（分页）、
`undefined`（做过滤器时同时匹配两者）。

整个 service 一起失效：

```ts
createConnectQueryKey({ schema: CartService, cardinality: undefined })
```

⚠️ **不要照抄 Redpanda 原文的 `queryKey: ['getClusters']`** —— 那种扁平字符串 key
在 connect-query 里一个都匹配不上，写了等于没写，而且不报错，只是 UI 不刷新。

### 乐观更新

```ts
const update = useMutation(CartService.method.updateCartItemQuantity, {
  onMutate: async (input) => {
    const key = createConnectQueryKey({
      schema: CartService.method.getCart, input: {}, cardinality: "finite",
    });
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData(key);  // key 自带类型，无需泛型标注
    queryClient.setQueryData(key, (prev) => /* 返回 GetCartResponse */);
    return { previous, key };
  },
  onError: (_err, _input, ctx) => ctx && queryClient.setQueryData(ctx.key, ctx.previous),
  onSettled: (_d, _e, _v, ctx) => ctx && queryClient.invalidateQueries({ queryKey: ctx.key }),
});
```

`ConnectQueryKey` 用 TanStack 的 `DataTag` 携带了返回值类型，`getQueryData` / `setQueryData`
自动有类型。`createProtobufSafeUpdater` 在 v2 已 **deprecated**，别再用。

---

## 4. 错误一律过 `toAppError`

**影响：HIGH**

本仓库**没有** `formatToastErrorMessage`（那是 Redpanda 的东西），也没有全局 toast。
统一入口是 `@ecommerce/api` 的 `toAppError()`，展示层是 `@ecommerce/ui` 的 `ErrorHandler`。

```tsx
import { toAppError, isUnauthenticated } from "@ecommerce/api";
import { ErrorHandler } from "@ecommerce/ui";

const { data, isPending, error } = useQuery(ProductService.method.getProductDetail, { spuCode });

return (
  <ErrorHandler loading={isPending} error={error} onBack={() => router.history.back()}>
    <ProductDetail data={data} />
  </ErrorHandler>
);
```

mutation 的局部报错用 `<Alert>` 就地渲染：

```ts
const create = useMutation(AddressService.method.createAddress, {
  onError: (err) => setMessage(toAppError(err).message),  // message 保证非空中文
});
```

**红线**：

- 不要写 `err instanceof Error ? err.message : "xxx失败"` —— 会漏出浏览器原生英文
  （`Failed to fetch`），也绕开了 i18n 解析器。`toAppError` 已处理这两件事。
- 认证失效**不需要**在组件里处理。`errorInterceptor` 已经 `emitAuthError` 触发全局退登，
  组件里再判一次会和登录流程打架（见 [gateway 的死循环记录](../../gateway/experience/jwt-nbf-clock-skew-loop.md)）。
- `PERMISSION_REASONS` 只提示不退登，判定用 `isPermissionDenied`，别自己比字符串。

`useQuery` 的 `error` 类型已经是 `ConnectError`，`toAppError` 吃它没问题。

---

## 5. `src/gen/` 是生成物，不许手改

**影响：CRITICAL**

| 路径 | 说明 |
|---|---|
| `frontend/apps/consumer/src/gen/` | buf 从 `backend/api/*.proto` 生成 |
| `frontend/apps/config/src/gen/` | 同上 |
| 生成模板 | `frontend/apps/{consumer,config}/buf.gen.yaml`（`protoc-gen-es`，`opt: target=ts`） |

生成物已入库（不在 `.gitignore` 里），但在根 `frontend/vite.config.ts` 的 `IGNORED` 里
被排除出 lint 和 fmt —— 所以**手改了不会被格式化工具打回，只会在下次生成时无声丢失**。

要加字段就改 `backend/api/` 的 proto，然后 `cd backend && make api`
（它同时跑 `buf.gen.yaml` 和 `buf.gen.ts.yaml`）。改 proto 前先读
[`context/team/proto-design.md`](../../../../team/proto-design.md)。

派生类型写在 `src/gen/` **外面**：

```ts
// ✅ src/store/cart.ts
import type { CartItem as RpcCartItem } from "@/gen/api";
export interface CartItem extends Omit<RpcCartItem, "$typeName"> {
  costPrice: number;
}
```

⚠️ 旧的 `src/api/order/index.ts` 里有一处
`await client.createOrder(message as Parameters<...>[0])` —— 那是在**假装** proto 里有
`requestId` 字段。`CreateOrderRequest` 只有 `CartItemIds` / `addressId` / `remark` 三个字段，
`requestId` 运行时就是被丢掉，`as` 只是把编译器骗过去。迁移时已删掉这段 cast，
结算页留了 TODO：**下单防重目前没有生效**，要补 proto 字段并 `cd backend && make api`。

---

## 6. 免鉴权接口走独立 transport

`product` 和 `search` 是公开接口，**不能挂 `authInterceptor`** —— 挂了的话未登录用户
浏览商品会被拦截器判成认证失效而触发退登。所以它们走 `getPublicTransport()`，
在调用点显式传：

```ts
import { getPublicTransport } from "@ecommerce/api";

useQuery(ProductService.method.getProductDetail, { spuCode }, {
  transport: getPublicTransport(),
});
```

`regions`（行政区划字典）虽然网关也放行了，但历史上一直走带 auth 的 transport，
迁移时保持不变 —— 换 transport 会换掉缓存命名空间，不是无副作用的改动。

只允许这两个单例存在。**每多一个 transport 实例，就多一套缓存命名空间**（第 2 节）。
好在 `createConnectQueryKey` 省略 `transport` 时是部分匹配，跨 transport 失效仍然打得中。

---

## 7. `int64` 与 `MessageInitShape`

后端 `spuId` / `skuId` / `cartItemId` 是 `int64`，protobuf-es 映射成 `bigint`：

- **传入**：`{ spuId: BigInt(spuId) }`。字符串直接传会在运行时抛类型错。
  非纯数字 ID（本地临时购物车项）要先 `/^\d+$/` 过滤，别让它进 `BigInt()`。
- **读出**：`response.cartItemId.toString()`。`bigint` 不能进 `JSON.stringify`，
  也不能直接和 `number` 比较。

`useQuery` / `useMutation` 的入参类型是 `MessageInitShape<I>` 而不是完整 message：
`$typeName` 不用写，有默认值的字段可省，嵌套消息传普通对象字面量即可。

---

## 迁移检查清单

consumer 已按此顺序走完，config 迁回来时照抄：

1. `pnpm-workspace.yaml` catalog 加 `@connectrpc/connect-query`，给 app 的 `package.json` 加依赖
2. `packages/api` 的 `getSharedTransport()` / `getPublicTransport()` 直接用，不要再 `createAppTransport()`
3. app `bootstrap.tsx` 套 `TransportProvider`（在 `QueryClientProvider` **外层**）
4. 逐个 hook 迁移，**一次一个域**：`addresses` → `regions` → `product` → `cart` → `order` → `users`
5. 域迁完后删掉对应的 `src/api/<域>/index.ts`（保留 `types.ts` 里的表单类型和非 RPC 的工具，
   consumer 剩下的是 `addresses/types.ts`、`users/types.ts`、`location/`）
6. `src/api/index.ts` 的 barrel 没人用了就删掉，跑 `vp lint && vp run -r test`

**验收**：购物车页一次挂载仍然只有 1 个 POST（用 Network 面板数，dev 的 StrictMode 下要
按不同 key 的个数看，不是按请求条数）。这一条只能在跑起来的应用上验，`vp lint` / 构建
过了不代表请求数没变。

## 相关

- [`consumer/experience/duplicate-cart-queries.md`](../../consumer/experience/duplicate-cart-queries.md) —— 手写 key 各拉各的后果
- [`consumer/INDEX.md`](../../consumer/INDEX.md) —— consumer 的结构与已知注意事项
- [`team/proto-design.md`](../../../../team/proto-design.md) —— 改 proto 前必读
