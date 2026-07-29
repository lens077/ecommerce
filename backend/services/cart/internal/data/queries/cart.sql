SET search_path TO cart;

-- name: AddProductToCart :one
WITH insert AS (
    INSERT INTO cart.cart_item (user_id,
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
                -- 用户重新加这个商品时，默认帮他重新勾选上
                selected = EXCLUDED.selected,
                -- 状态重新校准为正常
                status = EXCLUDED.status,
                updated_at = now())
SELECT COUNT(*) AS cart_item_quantity
FROM cart.cart_item
WHERE user_id = @user_id;

-- 删除购物车项, 返回删除后的购物车总商品项和是否为空购物车和删除的购物车商品数量
-- name: RemoveCartItem :one
WITH deleted AS (
    DELETE
        FROM cart.cart_item
            WHERE user_id = @user_id
                AND (merchant_id, spu_id, sku_id, status) IN
                    (SELECT unnest(@merchant_ids::uuid[]),
                            unnest(@spu_ids::bigint[]),
                            unnest(@sku_ids::bigint[]),
                            unnest(@statuses::cart.cart_type[]))
            RETURNING id),
     remaining AS (SELECT COUNT(*) AS cnt
                   FROM cart.cart_item
                   WHERE user_id = @user_id
                     AND status = @status)
SELECT (SELECT cnt FROM remaining)     AS cart_item_quantity,
       (SELECT cnt FROM remaining) = 0 AS is_cart_empty,
       (SELECT COUNT(*) FROM deleted)  AS deleted_count;

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
       shop_name,
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

-- name: GetCartSummary :one
SELECT COUNT(*) AS total_count
FROM cart.cart_item
WHERE user_id = @user_id
  AND status = @status;
