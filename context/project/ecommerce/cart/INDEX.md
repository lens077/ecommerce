# cart

**代码路径**：`backend/services/cart/`（RPC：`backend/api/cart/v1/cart.proto`；表：`cart.cart_item`）

购物车服务。身份来自网关注入的 `x-md-global-user-id`（登录用户 UUID 或访客 UUID v4，
后者伴随 `x-md-global-anonymous=true`），写入 `cart_item.user_id`；该列无外键，两类身份混存。

## 当前事实（2026-09-03 实测）

- 网关访客轨（`guest:` 清单 4 个购物车 RPC）已在 dev 生效：无 cookie 调 `GetCart` 返回 200 并签发
  `ct_guest`；访客之间隔离；访客调下单 401。
- **`AddProductToCart` 从未成功落库**：dev 库 `cart.cart_item` 0 行。原因见 experience。
- `.service-matrix.yaml` 里 cart 的 `depends_on: []`，没有任何服务依赖；补店铺名若走回查 merchant
  就是新增依赖。

## experience

| 症状 | 文件 |
|---|---|
| 匿名加购端到端：网关放行、cart 落库被 `shop_name NOT NULL` 挡住返回 500；登录用户同样从未加购成功 | [guest-add-to-cart-blocked-by-shop-name.md](experience/guest-add-to-cart-blocked-by-shop-name.md) |

## 相关

- 匿名购物设计与落地步骤：[`docs/design/platform/anonymous-shopping.md`](../../../../docs/design/platform/anonymous-shopping.md)
- 前端购物车重复请求：[consumer/INDEX.md](../consumer/INDEX.md)
