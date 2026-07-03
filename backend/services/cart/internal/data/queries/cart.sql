-- name: AddProductToCart :one
INSERT INTO cart.cart_item(user_id,
                           merchant_id,
                           spu_id,
                           sku_id,
                           quantity,
                           selected,
                           spu_name,
                           sku_name,
                           price,
                           sku_attributes,
                           sku_thumbnail_url,
                           status)
VALUES (@user_id,
        @merchant_id,
        @spu_id,
        @sku_id,
        @quantity,
        @selected,
        @spu_name,
        @sku_name,
        @price,
        @sku_attributes,
        @sku_thumbnail_url,
        @status)
ON CONFLICT (user_id, merchant_id, sku_id)
    DO UPDATE SET
                  -- 如果商品已存在，数量进行累加 (旧数量 + 新传入的数量)
                  quantity   = cart_item.quantity + EXCLUDED.quantity,
                  -- 用户重新加这个商品时，默认帮他重新勾选上
                  selected   = EXCLUDED.selected,
                  -- 状态重新校准为正常
                  status     = EXCLUDED.status,
                  updated_at = now()
RETURNING id, quantity;
-- 把最新的 id 和叠加后的最终数量一起返回回去

-- name: RemoveCartItem :one
WITH deleted AS (
    DELETE FROM cart.cart_item
        WHERE merchant_id = @merchant_id
            AND user_id = @user_id
            AND spu_id = @spu_id
            AND sku_id = @sku_id
            AND status = @status
        RETURNING id)
SELECT COALESCE(COUNT(quantity), 0)::INT AS cart_total_quantity,
       CASE
           WHEN COUNT(*) = 0 THEN
               TRUE
           ELSE
               FALSE
           END                           AS is_cart_empty
FROM cart.cart_item
WHERE user_id = @user_id
  AND status = @status;

-- 更新商品数量, 并返回购物车商品总数量
-- name: UpdateCartItemQuantity :one
WITH do_uodate AS (
    UPDATE cart.cart_item
        SET quantity = @quantity,
            updated_at = now()
        WHERE merchant_id = @merchant_id
            AND user_id = @user_id
            AND spu_id = @spu_id
            AND sku_id = @sku_id
            AND status = @status
            AND @quantity > 0)
SELECT COUNT(*) AS cart_total_quantity
FROM cart.cart_item
WHERE user_id = @user_id
  AND status = @status;

-- 获取用户购物车所有商品
-- name: GetCartItems :many
SELECT id,
       merchant_id,
       spu_id,
       sku_id,
       quantity,
       selected,
       spu_name,
       sku_name,
       price,
       sku_attributes,
       sku_thumbnail_url,
       status,
       created_at,
       updated_at
FROM cart.cart_item
WHERE user_id = @user_id
  AND status = @status
ORDER BY updated_at DESC;
