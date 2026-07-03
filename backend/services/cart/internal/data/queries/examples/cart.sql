-- 用户 buyer_01 在商家 merchant_A 添加一个商品，数量 2，默认勾选
INSERT INTO cart.cart_item (user_id, merchant_id, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4', -- user_id (UUID)
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82', -- merchant_id (UUID)
        5, -- spu_id
        9, -- sku_id
        2, -- quantity
        'iPhone 15 Pro', -- spu_name 快照
        'iPhone 15 Pro 黑色 256GB', -- sku_name 快照
        8999.00, -- price 快照
        '{
          "颜色": "黑色",
          "容量": "256GB"
        }'::jsonb, -- sku_attributes 快照
        'https://cdn.example.com/images/ip15.jpg', -- sku_thumbnail_url 快照
        true, -- selected 勾选
        'active' -- status 活跃
       );

WITH deleted AS (
    DELETE FROM cart.cart_item
        WHERE merchant_id = 'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82'
            AND user_id = '88735c43-9899-44b6-9aec-74f37a8996b4'
            AND spu_id = 5
            AND sku_id = 9
            AND quantity = 1
            AND status = 'active'
        RETURNING id)
SELECT COALESCE(SUM(quantity), 0)::INT AS cart_total_quantity,
       CASE
           WHEN COUNT(*) = 0 THEN
               TRUE
           ELSE
               FALSE
           END                         AS is_cart_empty
FROM cart.cart_item
WHERE user_id = '88735c43-9899-44b6-9aec-74f37a8996b4'
  AND status = 'active';

-- 不勾选（加入购物车但暂时不打算买）
INSERT INTO cart.cart_item (user_id, merchant_id, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        5,
        9,
        1,
        'iPhone 15 Pro',
        'iPhone 15 Pro 白色 512GB',
        9999.00,
        '{
          "颜色": "白色",
          "容量": "512GB"
        }'::jsonb,
        'https://cdn.example.com/images/ip15w.jpg',
        false, -- selected 不勾选
        'active');

-- 同用户同商家同 SKU 再次添加（触发唯一约束自动累加）
-- 这会和第一条冲突，报错：duplicate key value violates unique constraint
INSERT INTO cart.cart_item (user_id, merchant_id, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        5,
        9, -- 和第一条相同的 sku_id
        3,
        'iPhone 15 Pro',
        'iPhone 15 Pro 黑色 256GB',
        8999.00,
        '{
          "颜色": "黑色",
          "容量": "256GB"
        }'::jsonb,
        'https://cdn.example.com/images/ip15.jpg',
        true,
        'active')

-- 正确的累加写法（使用 ON CONFLICT）
INSERT INTO cart.cart_item (user_id, merchant_id, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        5,
        9,
        3, -- 新添加的数量
        'iPhone 15 Pro',
        'iPhone 15 Pro 黑色 256GB',
        8999.00,
        '{
          "颜色": "黑色",
          "容量": "256GB"
        }'::jsonb,
        'https://cdn.example.com/images/ip15.jpg',
        true,
        'active')
ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE SET quantity          = cart.cart_item.quantity + EXCLUDED.quantity,
                                                         spu_name          = EXCLUDED.spu_name,
                                                         sku_name          = EXCLUDED.sku_name,
                                                         price             = EXCLUDED.price,
                                                         sku_attributes    = EXCLUDED.sku_attributes,
                                                         sku_thumbnail_url = EXCLUDED.sku_thumbnail_url,
                                                         selected          = EXCLUDED.selected,
                                                         status            = 'active',
                                                         updated_at        = now();
-- 添加一个已过期的商品（模拟历史记录）
INSERT INTO cart.cart_item (user_id, merchant_id, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        '550e8400-e29b-41d4-a716-446655440020',
        202,
        2001,
        1,
        'AirPods Pro',
        'AirPods Pro 白色',
        1799.00,
        '{
          "颜色": "白色"
        }'::jsonb,
        'https://cdn.example.com/images/ap.jpg',
        false,
        'expired' -- status 为过期
       );

-- 指定 selected 和自定义时间
INSERT INTO cart.cart_item (user_id, merchant_id, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status, created_at)
VALUES ('550e8400-e29b-41d4-a716-446655440002', -- 另一个用户
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        303,
        3003,
        1,
        'Apple Watch Series 9',
        'Apple Watch 45mm 星光色',
        3199.00,
        '{
          "颜色": "星光色",
          "尺寸": "45mm"
        }'::jsonb,
        'https://cdn.example.com/images/aw.jpg',
        true,
        'active',
        '2025-06-01 10:00:00+08' -- 自定义创建时间
       );