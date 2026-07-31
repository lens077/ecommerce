INSERT INTO products.skus (spu_id,merchant_id, sku_code, price, cost_price, stock_quantity, attributes, bar_code, thumbnail_url, status)
VALUES
-- 关联 iPhone 15 Pro (假设 SPU ID 为 1)
(
    1,'ca8ceec3-3345-48ce-b2db-40afe710eb61', 'iphone-15-pro-black-256g', 8999.00, 7500.00, 100,
    '{"颜色": "原色钛金属", "版本": "256GB"}',
    '6901234567890', 'https://cdn.example.com/iphone15pro/black_thumb.jpg', 'active'
),
(
    1, 'ca8ceec3-3345-48ce-b2db-40afe710eb61','iphone-15-pro-blue-512g', 10999.00, 9000.00, 50,
    '{"颜色": "蓝色钛金属", "版本": "512GB"}',
    '6901234567891', 'https://cdn.example.com/iphone15pro/blue_thumb.jpg', 'active'
),

-- 关联 小棕瓶 (假设 SPU ID 为 2)
(
    2, 'ca8ceec3-3345-48ce-b2db-40afe710eb61','estee-lauder-anr-50ml', 650.00, 300.00, 500,
    '{"容量": "50ml"}',
    '729238123456', 'https://cdn.example.com/anr/50ml_thumb.jpg', 'active'
),
(
    2,'ca8ceec3-3345-48ce-b2db-40afe710eb61', 'estee-lauder-anr-100ml', 1150.00, 550.00, 200,
    '{"容量": "100ml"}',
    '729238123457', 'https://cdn.example.com/anr/100ml_thumb.jpg', 'active'
);
INSERT INTO products.skus (spu_id, merchant_id, sku_code, price, cost_price, stock_quantity, attributes, bar_code, thumbnail_url, status)
VALUES
-- 关联 20W 适配器 (SPU ID = 3)
(
    3, 'ca8ceec3-3345-48ce-b2db-40afe710eb61', 'apple-20w-adapter-white', 149.00, 45.00, 1000,
    '{"颜色": "白色"}',
    '6901112223334', 'https://cdn.example.com/adapter/white_thumb.jpg', 'active'
),
-- 关联 咖啡机 (SPU ID = 4)
(
    4, 'ca8ceec3-3345-48ce-b2db-40afe710eb62', 'delonghi-nespresso-red', 888.00, 450.00, 30,
    '{"颜色": "宝石红"}',
    '8004399332942', 'https://cdn.example.com/coffee/red_thumb.jpg', 'active'
),
(
    4, 'ca8ceec3-3345-48ce-b2db-40afe710eb62', 'delonghi-nespresso-white', 888.00, 450.00, 15,
    '{"颜色": "珍珠白"}',
    '8004399332943', 'https://cdn.example.com/coffee/white_thumb.jpg', 'active'
);
INSERT INTO products.skus (spu_id, merchant_id, sku_code, price, cost_price, stock_quantity, attributes, bar_code, thumbnail_url, status)
VALUES
-- 关联 罗技 MX Master 3S (SPU ID = 5)
(
    5, 'ca8ceec3-3345-48ce-b2db-40afe710eb61', 'logitech-mx-master-3s-graphite', 799.00, 320.00, 200,
    '{"颜色": "石墨黑"}',
    '5099206103634', 'https://cdn.example.com/mxmaster3s/graphite_thumb.jpg', 'active'
),
(
    5, 'ca8ceec3-3345-48ce-b2db-40afe710eb61', 'logitech-mx-master-3s-pale-grey', 799.00, 320.00, 120,
    '{"颜色": "浅灰"}',
    '5099206103641', 'https://cdn.example.com/mxmaster3s/palegrey_thumb.jpg', 'active'
),
-- 关联 索尼 WH-1000XM5 (SPU ID = 6)
(
    6, 'ca8ceec3-3345-48ce-b2db-40afe710eb62', 'sony-wh-1000xm5-black', 2499.00, 1500.00, 80,
    '{"颜色": "曜石黑"}',
    '4548736134339', 'https://cdn.example.com/xm5/black_thumb.jpg', 'active'
),
(
    6, 'ca8ceec3-3345-48ce-b2db-40afe710eb62', 'sony-wh-1000xm5-silver', 2499.00, 1500.00, 60,
    '{"颜色": "月光银"}',
    '4548736134346', 'https://cdn.example.com/xm5/silver_thumb.jpg', 'active'
),
-- 关联 Nike Pegasus 41 (SPU ID = 7)，多尺码
(
    7, 'ca8ceec3-3345-48ce-b2db-40afe710eb62', 'nike-pegasus-41-black-42', 899.00, 400.00, 150,
    '{"颜色": "黑白", "尺码": "42"}',
    '1950000000420', 'https://cdn.example.com/pegasus41/black42_thumb.jpg', 'active'
),
(
    7, 'ca8ceec3-3345-48ce-b2db-40afe710eb62', 'nike-pegasus-41-black-43', 899.00, 400.00, 90,
    '{"颜色": "黑白", "尺码": "43"}',
    '1950000000437', 'https://cdn.example.com/pegasus41/black43_thumb.jpg', 'active'
);