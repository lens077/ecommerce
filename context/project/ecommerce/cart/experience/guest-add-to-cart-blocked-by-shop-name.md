---
name: guest-add-to-cart-blocked-by-shop-name
module: cart
description: 匿名购物端到端验证时（2026-09-03）网关访客轨全部通过，但 AddProductToCart 在 cart 服务落库时被 cart_item.shop_name NOT NULL 挡住返回 500；这不是访客引入的问题——data 层从未给 ShopName 赋值、proto 也没有该字段，dev 库 cart_item 至今 0 行，登录用户加购同样从未成功过。待修，三条修法待定。
---

> **状态（2026-09-03）：未修。** 网关侧访客轨已在 dev 验通（第 1、2 步），卡在 cart 落库（第 3 步的
> 「端到端验通」条件不成立）。修法是设计选择，见文末三条，由负责人拍板后再动。
> 设计文档：[`docs/design/platform/anonymous-shopping.md`](../../../../../docs/design/platform/anonymous-shopping.md) 第六节。

# 匿名加购端到端：网关放行了，cart 落库被 `shop_name NOT NULL` 挡住

**症状**

2026-09-03 在 dev 把 `guest:` 段贴进 Config Center `gateway/dev/routes.yaml` 后，经网关验证访客路径：

| 步骤 | 结果 |
|---|---|
| 无 cookie 调 `GetCart` | **200**（之前 401），响应 `Set-Cookie: ct_guest=<uuid v4>; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`，返回 `{"isCartEmpty":true}` |
| 换一个无 cookie 的新访客 | 另发一个 uuid，购物车独立为空——访客之间隔离 |
| 带访客 cookie 调 `CreateOrder`（C 级） | **401**——下单边界守住 |
| 带访客 cookie、**填满全部必填字段**调 `AddProductToCart` | **500** |

500 的原文：

```
ERROR: null value in column "shop_name" of relation "cart_item"
violates not-null constraint (SQLSTATE 23502)
```

**关键陷阱**

1. **它和访客无关。** 表 `cart.cart_item` 在 dev 库里是 **0 行、0 用户**——登录用户的加购从来也没成功过，
   只是没人经网关端到端跑过。访客轨只是第一个把它跑出来的路径。不要把这条记成「匿名购物的 bug」。
2. **前端无处可传。** `AddProductToCartRequest`（`backend/api/cart/v1/cart.proto`）字段是
   `spu_id / sku_id / merchant_id / quantity / selected / spu_name / sku_name / sku_attributes /
   sku_thumbnail_url / status / unit_price_cents`——**没有 `shop_name`**。前端 `useCart.ts` 想传也传不了。
3. **data 层漏赋值。** `backend/services/cart/internal/data/cart.go` 的 `AddProductToCart` 组装
   `models.AddProductToCartParams` 时给了 `UserID / MerchantID / SpuID / SkuID / Quantity / Selected /
   SpuName / SkuName / Price / SkuAttributes / SkuThumbnailUrl / Status`，**`ShopName` 一直是零值**；
   而 `00001_cart.sql:24` 把 `shop_name VARCHAR(255) NOT NULL`。sqlc 生成的 params 有这个字段，编译不会报。
4. **请求侧还有两个易踩的校验**，验证时先撞了它们才到 500：`sku_attributes` 是 `google.protobuf.Struct`
   且 `required`；`status` 必须恒为 `CART_STATUS_ACTIVE`（`enum.const = 1`，JSON 里写 `"CART_STATUS_ACTIVE"`）。
   这两条是契约，不是 bug。

**根因**

`cart_item.shop_name` 是建表时就有的展示列（购物车按商家分组时显示店铺名），但写入路径从设计到实现都没有人负责填它：
proto 没字段、biz 没查询、data 没赋值。列上的 `NOT NULL` 成了唯一的「校验」，于是每一次加购都在最后一步被数据库拒绝。

**修法（三选一，未定）**

| 方案 | 做法 | 代价 |
|---|---|---|
| A. cart 回查 merchant | `AddProductToCart` 里按 `merchant_id` 调 merchant 服务拿店铺名 | 新增服务依赖：`.service-matrix.yaml` 里 cart 的 `depends_on` 目前是 `[]`，要加 `merchant` 并接线；加购多一次 RPC |
| B. proto 加 `shop_name` 由前端传 | 商品详情页本来就有店铺信息，随加购一并提交 | 改 proto（先读 `docs/design/cart/`，按 `context/team/proto-design.md` 推校验约束）；前端 `useCart.ts` 同步；店铺改名后购物车里是旧名——本来 `spu_name/sku_name` 也是这么快照的，语义一致 |
| C. 列改可空 / 默认空串 | 一条迁移，展示层按 `merchant_id` 关联 | 最快解封，但把「店铺名从哪来」往后推；且 `GetCart` 返回结构里 `shopName` 会先是空 |

**验证方法（修完照跑）**

```bash
kubectl -n ecommerce port-forward svc/ecommerce-gateway-service 18080:8080 &
J=/tmp/guest.jar; U=http://127.0.0.1:18080; H='Content-Type: application/json'
curl -s -c $J -X POST $U/cart.v1.CartService/GetCart -H "$H" -d '{}'          # 200 + Set-Cookie ct_guest
curl -s -b $J -c $J -X POST $U/cart.v1.CartService/AddProductToCart -H "$H" -d '{
  "spuId":"8","skuId":"2","merchantId":"ca8ceec3-3345-48ce-b2db-40afe710eb61","quantity":1,"selected":true,
  "spuName":"Apple iPhone 15 Pro","skuName":"iphone-15-pro-black-256g","unitPriceCents":"899900",
  "skuThumbnailUrl":"https://cdn.example.com/iphone15pro/black_thumb.jpg",
  "skuAttributes":{"版本":"256GB","颜色":"原色钛金属"},"status":"CART_STATUS_ACTIVE"}'   # 期望 200
curl -s -b $J -X POST $U/cart.v1.CartService/GetCart -H "$H" -d '{}'          # 期望 isCartEmpty=false、1 件
curl -s -X POST $U/cart.v1.CartService/GetCart -H "$H" -d '{}'                # 新访客：仍为空
```

dev 网关 `SESSION_COOKIE_INSECURE=true`，cookie 名是 `ct_guest`（生产是 `__Secure-ct_guest` + Secure）。
修通后同步更新设计文档第六节第 3 步的状态，并让第 5 步（前端删匿名兜底）解除前置。

**相关**

- 访客轨代码：`../control-tower/services/gateway/internal/guest/`、`routes/dev.yaml` 的 `guest:` 段
- 同类「健康检查绿、功能已死」案例：[registry/consul-register-once-then-give-up.md](../../registry/experience/consul-register-once-then-give-up.md)
