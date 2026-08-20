-- 购物车示例数据（由 queries/examples/cart.sql 改写语义而来，2026-08-21）。
-- 用 goose no-versioning 模式执行：`dbmigrate -svc cart seed` / `seed-down`。
-- 改写要点：
--   1. 原文件里「故意触发唯一约束报错」的演示插入已删除——种子必须可重复执行；
--   2. 全部 INSERT 改为 ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE 的
--      收敛写法（重跑结果为定点，而不是数量无限累加）；
--      业务侧真正的「重复加购数量累加」写法见 queries/cart.sql 的 UpsertCartItem；
--   3. 原文件的 SELECT / DELETE 演示语句移除（不属于种子数据）。

-- +goose Up

-- 用户 88735c43 在商家 eb70eac3（Apple）购物车：黑色 256GB，勾选
INSERT INTO cart.cart_item (user_id, merchant_id, shop_name, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        'Apple',
        5, 9, 2,
        'iPhone 15 Pro', 'iPhone 15 Pro 黑色 256GB', 8999.00,
        '{"颜色": "黑色", "容量": "256GB"}'::jsonb,
        'https://cdn.example.com/images/ip15.jpg',
        true, 'active')
ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE SET
    quantity          = EXCLUDED.quantity,
    spu_name          = EXCLUDED.spu_name,
    sku_name          = EXCLUDED.sku_name,
    price             = EXCLUDED.price,
    sku_attributes    = EXCLUDED.sku_attributes,
    sku_thumbnail_url = EXCLUDED.sku_thumbnail_url,
    selected          = EXCLUDED.selected,
    status            = EXCLUDED.status,
    updated_at        = now();

-- 同用户同商家：白色 512GB，加入但不勾选
INSERT INTO cart.cart_item (user_id, merchant_id, shop_name, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        'Apple',
        5, 10, 1,
        'iPhone 15 Pro', 'iPhone 15 Pro 白色 512GB', 9999.00,
        '{"颜色": "白色", "容量": "512GB"}'::jsonb,
        'https://cdn.example.com/images/ip15w.jpg',
        false, 'active')
ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE SET
    quantity          = EXCLUDED.quantity,
    selected          = EXCLUDED.selected,
    status            = EXCLUDED.status,
    updated_at        = now();

-- 同用户另一商家：已过期的历史记录
INSERT INTO cart.cart_item (user_id, merchant_id, shop_name, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status)
VALUES ('88735c43-9899-44b6-9aec-74f37a8996b4',
        '550e8400-e29b-41d4-a716-446655440020',
        'Apple',
        202, 2001, 1,
        'AirPods Pro', 'AirPods Pro 白色', 1799.00,
        '{"颜色": "白色"}'::jsonb,
        'https://cdn.example.com/images/ap.jpg',
        false, 'expired')
ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE SET
    status     = EXCLUDED.status,
    updated_at = now();

-- 另一个用户：自定义创建时间
INSERT INTO cart.cart_item (user_id, merchant_id, shop_name, spu_id, sku_id, quantity,
                            spu_name, sku_name, price, sku_attributes, sku_thumbnail_url,
                            selected, status, created_at)
VALUES ('550e8400-e29b-41d4-a716-446655440002',
        'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82',
        'Apple',
        303, 3003, 1,
        'Apple Watch Series 9', 'Apple Watch 45mm 星光色', 3199.00,
        '{"颜色": "星光色", "尺寸": "45mm"}'::jsonb,
        'https://cdn.example.com/images/aw.jpg',
        true, 'active',
        '2025-06-01 10:00:00+08')
ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE SET
    quantity   = EXCLUDED.quantity,
    updated_at = now();

-- +goose Down
DELETE FROM cart.cart_item
WHERE (user_id, merchant_id, sku_id) IN (
    ('88735c43-9899-44b6-9aec-74f37a8996b4'::uuid, 'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82'::uuid, 9),
    ('88735c43-9899-44b6-9aec-74f37a8996b4'::uuid, 'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82'::uuid, 10),
    ('88735c43-9899-44b6-9aec-74f37a8996b4'::uuid, '550e8400-e29b-41d4-a716-446655440020'::uuid, 2001),
    ('550e8400-e29b-41d4-a716-446655440002'::uuid, 'eb70eac3-3b65-4a0a-a0e1-0d28fca13b82'::uuid, 3003)
);
