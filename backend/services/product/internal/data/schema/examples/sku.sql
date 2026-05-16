INSERT INTO products.skus (spu_id,merchant_id, sku_code, price, cost_price, stock_quantity, attributes, bar_code, thumbnail_url, status)
VALUES
-- 关联 iPhone 15 Pro (假设 SPU ID 为 1)
(
    1,1001, 'iphone-15-pro-black-256g', 8999.00, 7500.00, 100,
    '{"颜色": "原色钛金属", "版本": "256GB"}',
    '6901234567890', 'https://cdn.example.com/iphone15pro/black_thumb.jpg', 'active'
),
(
    1, 1001,'iphone-15-pro-blue-512g', 10999.00, 9000.00, 50,
    '{"颜色": "蓝色钛金属", "版本": "512GB"}',
    '6901234567891', 'https://cdn.example.com/iphone15pro/blue_thumb.jpg', 'active'
),

-- 关联 小棕瓶 (假设 SPU ID 为 2)
(
    2, 1001,'estee-lauder-anr-50ml', 650.00, 300.00, 500,
    '{"容量": "50ml"}',
    '729238123456', 'https://cdn.example.com/anr/50ml_thumb.jpg', 'active'
),
(
    2,1001, 'estee-lauder-anr-100ml', 1150.00, 550.00, 200,
    '{"容量": "100ml"}',
    '729238123457', 'https://cdn.example.com/anr/100ml_thumb.jpg', 'active'
);
INSERT INTO products.skus (spu_id, merchant_id, sku_code, price, cost_price, stock_quantity, attributes, bar_code, thumbnail_url, status)
VALUES
-- 关联 20W 适配器 (SPU ID = 3)
(
    3, 1001, 'apple-20w-adapter-white', 149.00, 45.00, 1000,
    '{"颜色": "白色"}',
    '6901112223334', 'https://cdn.example.com/adapter/white_thumb.jpg', 'active'
),
-- 关联 咖啡机 (SPU ID = 4)
(
    4, 3003, 'delonghi-nespresso-red', 888.00, 450.00, 30,
    '{"颜色": "宝石红"}',
    '8004399332942', 'https://cdn.example.com/coffee/red_thumb.jpg', 'active'
),
(
    4, 3003, 'delonghi-nespresso-white', 888.00, 450.00, 15,
    '{"颜色": "珍珠白"}',
    '8004399332943', 'https://cdn.example.com/coffee/white_thumb.jpg', 'active'
);