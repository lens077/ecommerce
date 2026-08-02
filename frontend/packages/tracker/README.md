# @ecommerce/tracker

浏览行为埋点。把用户"漫无目的地逛"这件事变成事件流，经网关送到 `behavior` 服务，
再由它喂给 gorse，最后换回推荐结果。

## 事件与 gorse 的对应关系

gorse 的 `config.toml` 里声明了哪些反馈算正样本，这里的事件类型必须和它对齐：

```toml
[recommend.data_source]
positive_feedback_types = ["purchase", "cart", "favorite", "read>=3", "dwell>=20"]
read_feedback_types = ["impression", "read"]
```

| 事件                             | 触发时机                         | value | 写入方式                      |
| -------------------------------- | -------------------------------- | ----- | ----------------------------- |
| `impression`                     | 卡片在视口里露出 ≥50% 且停留 ≥1s | 1     | POST（累加）                  |
| `read`                           | 点进商品详情                     | 1     | POST（累加，满 3 次转正样本） |
| `dwell`                          | 详情页可见停留秒数               | 秒数  | PUT（覆盖）                   |
| `cart` / `favorite` / `purchase` | 对应业务动作                     | 1     | PUT（覆盖）                   |
| `dislike`                        | 用户点"不感兴趣"                 | 1     | **不进 gorse**                |

`dislike` 是个例外：当前 gorse 版本的 `config.toml` 没有 `negative_feedback_types`，
负反馈无处安放。所以它只落到 `behaviors.events` 表，由 behavior 服务在返回推荐结果前
把命中的商品剔掉。

`dwell` 走 PUT 而不是 POST，是因为 gorse 的反馈唯一键是
`(FeedbackType, UserId, ItemId)` 三元组，POST 会把 `Value` 累加。
停留时长和"加过购物车"这类事实必须是绝对值，累加会让同一个商品被反复加权。

## 用法

应用入口初始化一次：

```ts
import { initTracker } from "@ecommerce/tracker";

initTracker({ gatewayUrl: import.meta.env.VITE_GATEWAY_URL });
```

列表页记曝光：

```tsx
import { useImpression } from "@ecommerce/tracker/react";

function ProductCard({ spu, source }: { spu: Spu; source: string }) {
  const ref = useImpression<HTMLDivElement>(spu.spuCode, source);
  return <div ref={ref}>{spu.name}</div>;
}
```

详情页记 read + 停留：

```tsx
import { useProductView } from "@ecommerce/tracker/react";

useProductView(spuCode, `search:${keyword}`);
```

业务动作：

```ts
import { tracker } from "@ecommerce/tracker";

tracker().cart(spuCode);
tracker().favorite(spuCode);
tracker().purchase(spuCode);
tracker().dislike(spuCode);
```

取推荐（交给 react-query 管缓存）：

```ts
import { recommend, similarItems } from "@ecommerce/tracker/react";

useQuery({ queryKey: ["recommend", category], queryFn: () => recommend({ category, n: 20 }) });
useQuery({ queryKey: ["similar", spuCode], queryFn: () => similarItems(spuCode, { n: 12 }) });
```

`source` 用来做渠道归因，约定写成 `search:关键词` / `category:3` / `home_feed` / `neighbors`。

## 身份

- `anonId` 存 localStorage，跨会话保留，是未登录用户能形成画像的唯一线索。
- `sessionId` 存 sessionStorage，关标签页即失效，服务端拿它给曝光去重。
- 登录后网关会注入 `x-md-global-user-id`，服务端优先用它 —— 请求体里的 `anonId`
  是客户端可伪造的，不能覆盖网关的判断。

Safari 隐私模式下 storage 会抛异常，此时降级成一次性 id：埋点照发，只是串不起来。

## 上报时机

- 攒够 `batchSize`（默认 20）条立即发；
- 否则每 `flushIntervalMs`（默认 5000ms）发一次；
- `cart` / `favorite` / `purchase` / `dislike` 立即发，不等攒批；
- 页面隐藏或卸载时用 `navigator.sendBeacon` 发最后一批 —— 这一批带着最完整的停留时长。

因为 beacon 不能设置自定义请求头，这个包手写了 Connect 的 unary JSON 线格式，
没有用生成的 connect-web 客户端。详见 `src/transport.ts` 的注释。

上报失败不会重试也不会抛错。埋点是旁路，不该拖累页面；失败重排队只会在后端故障时越堆越多。
