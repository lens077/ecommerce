# 商品列表 ListProducts — 首页无限滚动 / 游标分页

> 从根 `DESIGN.md` 拆出（2026-08-08）。状态：**设计已定，待落地**（见 `TODO.md`）。
> ⚠️ 2026-08-26 标注：本文契约用 `google.type.Money`，与 proto 金额铁律（int64 分）不一致。
> 列表页属**展示投影、非交易事实**，是否豁免须过 ADR 定夺；交易链路（cart/order/payment）
> 禁止效仿——cart.proto 的 float64 金额是既知活违规（`STACK.md`），迁移列看板 P1。


首页从「重定向到 categories 桩」改为直接展示商品。商品列表采用**无限滚动**：先加载一批（默认 20），下拉到底再请求下一批，**不做总数分页**（省去 count，避免翻页期间重复/漏项）。

### 契约（proto，游标代替页码，无 total）

```proto
rpc ListProducts(ListProductsRequest) returns (ListProductsResponse){}

message ListProductsRequest {
  uint32 page_size = 1;    // 每批数量，默认20，上限60
  int64 category_id = 2;   // 0=不限
  string keyword = 3;      // ""=不限（按商品名模糊）
  int64 cursor = 4;        // 游标：上一批最后一个 spu_id；首次传0
}
message ListProductsResponse {
  repeated ProductCard products = 1;
  int64 next_cursor = 2;   // 下一批游标（本批最后一个 spu_id）；0=没有更多
  bool has_more = 3;       // 是否还有更多
}
message ProductCard {
  int64 spu_id = 1;
  string spu_code = 2;             // 跳详情页用
  string name = 3;
  string main_media_url = 4;
  google.type.Money min_price = 5; // 价格区间下限，“¥min 起”
  int64 category_id = 6;
  string merchant_id = 7;
  int64 brand_id = 8;              // 品牌
  google.type.Money max_price = 9; // 价格区间上限；min==max 时前端只显示一个价
}
```

### 核心 SQL（无 COUNT，游标 keyset，按 id 倒序）

```sql
-- name: ListProducts :many
SELECT s.id AS spu_id, s.spu_code, s.name, s.main_media_url,
       s.category_id, s.merchant_id, s.brand_id,
       MIN(k.price) AS min_price, MAX(k.price) AS max_price
FROM products.spus s
         JOIN products.skus k ON k.spu_id = s.id AND k.status = 'active'
WHERE s.status = 'online'
  AND (@cursor::bigint = 0 OR s.id < @cursor)    -- 游标：取比上一批最后一个更小的 id
  AND (@category_id::bigint = 0 OR s.category_id = @category_id)
  AND (@keyword::text = '' OR s.name ILIKE '%' || @keyword || '%')
GROUP BY s.id
ORDER BY s.id DESC
LIMIT @page_size;
```

- **只统计在售 SKU**：`JOIN skus status='active'`，无在售 SKU 的 SPU 不出现；`MIN/MAX(k.price)` 得价格区间。
- **游标而非 OFFSET**：无限滚动下 OFFSET 越翻越慢，且翻页期间新商品上架会重复/漏项；`s.id < cursor`（`id` 为 BIGSERIAL 单调递增，`id DESC`≈最新在前）定位精确、恒定快、不重不漏。

### 核心逻辑（biz）

- `page_size` 默认 20、上限 60。
- **多查一条判断有没有下一批**：向 SQL 传 `page_size + 1`，若返回条数 > page_size → `has_more=true`，砍掉多的一条只返回 20；否则 `has_more=false`。无需 count 即可准确判断。
- `next_cursor` = 本批最后一条的 `spu_id`（空则 0）。
- `min/max_price`：numeric → `google.type.Money`（复用 `decimal.DecimalToCNYMoney`）。

### 前端（首页无限滚动）

- `useInfiniteQuery`：`getNextPageParam = (last) => last.hasMore ? last.nextCursor : undefined`，首屏 cursor=0。
- 底部哨兵 + `IntersectionObserver`，滚到底自动 `fetchNextPage`，各批 `products` 拼接铺进商品网格。
- **DOM 虚拟化后置**：先做无限滚动加载；列表很长需只渲染可视区时，再接 `packages/ui/VirtualList`。

### 落地顺序（待实现）

`product.proto` → `make api`（ts 拷前端 gen）→ `query.sql` → `make sqlc`（连 DB）→ biz/data/service 样板 → 前端 `api/product.listProducts` + 首页 `useInfiniteQuery` 接真实数据。
