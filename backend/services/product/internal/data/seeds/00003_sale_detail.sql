-- 商品示例数据：销量明细（由 schema/examples/sales_detail.sql 改写语义而来，2026-08-21）。
-- 改写要点：
--   1. spu_id/sku_id 不再写死自增 1..7，改用 spu_code/sku_code 子查询（顺序无关）；
--   2. 主键 id 是业务侧显式赋值（表无自增），以 ON CONFLICT (id) DO NOTHING 保证可重复执行；
--   3. 原文件末尾与 id=20 内容重复的 id=37 行保留（演示不同 id 的同内容销量记录）。

-- +goose Up
INSERT INTO products.sale_detail
(id, order_no, merchant_id, spu_id, sku_id, category_id, brand_id, quantity, price, total_amount, type, paid_at, dt, created_at)
VALUES
-- iPhone 15 Pro 黑色 256GB 销量
(1, 'ORDER202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-black-256g'),
 1001, 10, 2, 8999.00, 17998.00, 'paid', '2026-02-24 10:30:00+00', '2026-02-24', now()),
(2, 'ORDER202602240058', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-black-256g'),
 1001, 10, 1, 8999.00, 8999.00, 'paid', '2026-02-24 15:20:00+00', '2026-02-24', now()),
(3, 'ORDER202602250102', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-black-256g'),
 1001, 10, 1, 8999.00, 8999.00, 'paid', '2026-02-25 09:15:00+00', '2026-02-25', now()),

-- iPhone 15 Pro 蓝色 512GB 销量
(4, 'ORDER202602240089', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-blue-512g'),
 1001, 10, 1, 10999.00, 10999.00, 'paid', '2026-02-24 11:45:00+00', '2026-02-24', now()),
(5, 'ORDER202602240112', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-blue-512g'),
 1001, 10, 2, 10999.00, 21998.00, 'paid', '2026-02-24 16:30:00+00', '2026-02-24', now()),
(6, 'ORDER202602250205', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-blue-512g'),
 1001, 10, 1, 10999.00, 10999.00, 'paid', '2026-02-25 14:20:00+00', '2026-02-25', now()),

-- 退款示例：iPhone 15 Pro 黑色 256GB 退货
(7, 'ORDER202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-black-256g'),
 1001, 10, -1, 8999.00, -8999.00, 'refund', '2026-02-25 10:00:00+00', '2026-02-25', now()),

-- 雅诗兰黛小棕瓶 50ml 销量
(8, 'ORDER202602240035', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-50ml'),
 2005, 55, 5, 650.00, 3250.00, 'paid', '2026-02-24 09:20:00+00', '2026-02-24', now()),
(9, 'ORDER202602240067', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-50ml'),
 2005, 55, 3, 650.00, 1950.00, 'paid', '2026-02-24 13:40:00+00', '2026-02-24', now()),
(10, 'ORDER202602240091', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-50ml'),
 2005, 55, 2, 650.00, 1300.00, 'paid', '2026-02-24 17:55:00+00', '2026-02-24', now()),
(11, 'ORDER202602250038', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-50ml'),
 2005, 55, 4, 650.00, 2600.00, 'paid', '2026-02-25 11:30:00+00', '2026-02-25', now()),

-- 雅诗兰黛小棕瓶 100ml 销量
(12, 'ORDER202602240112', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-100ml'),
 2005, 55, 2, 1150.00, 2300.00, 'paid', '2026-02-24 12:15:00+00', '2026-02-24', now()),
(13, 'ORDER202602240156', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-100ml'),
 2005, 55, 1, 1150.00, 1150.00, 'paid', '2026-02-24 18:30:00+00', '2026-02-24', now()),
(14, 'ORDER202602250087', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'estee-lauder-anr'),
 (SELECT id FROM products.skus WHERE sku_code = 'estee-lauder-anr-100ml'),
 2005, 55, 3, 1150.00, 3450.00, 'paid', '2026-02-25 10:45:00+00', '2026-02-25', now()),

-- 适配器销量（连带 iPhone 用户经常购买）
(15, 'ORDER202602260001', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'apple-20w-adapter'),
 (SELECT id FROM products.skus WHERE sku_code = 'apple-20w-adapter-white'),
 1002, 10, 1, 149.00, 149.00, 'paid', '2026-02-26 08:30:00+00', '2026-02-26', now()),
(16, 'ORDER202602260022', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'apple-20w-adapter'),
 (SELECT id FROM products.skus WHERE sku_code = 'apple-20w-adapter-white'),
 1002, 10, 2, 149.00, 298.00, 'paid', '2026-02-26 12:45:00+00', '2026-02-26', now()),

-- 咖啡机 红色销量
(17, 'ORDER202602260055', 'ca8ceec3-3345-48ce-b2db-40afe710eb62',
 (SELECT id FROM products.spus WHERE spu_code = 'delonghi-nespresso'),
 (SELECT id FROM products.skus WHERE sku_code = 'delonghi-nespresso-red'),
 3001, 88, 1, 888.00, 888.00, 'paid', '2026-02-26 10:10:00+00', '2026-02-26', now()),

-- 咖啡机 白色销量
(18, 'ORDER202602260089', 'ca8ceec3-3345-48ce-b2db-40afe710eb62',
 (SELECT id FROM products.spus WHERE spu_code = 'delonghi-nespresso'),
 (SELECT id FROM products.skus WHERE sku_code = 'delonghi-nespresso-white'),
 3001, 88, 1, 888.00, 888.00, 'paid', '2026-02-26 15:20:00+00', '2026-02-26', now()),

-- 模拟一笔取消订单（负数 quantity）
(19, 'ORDER202602260055', 'ca8ceec3-3345-48ce-b2db-40afe710eb61',
 (SELECT id FROM products.spus WHERE spu_code = 'delonghi-nespresso'),
 (SELECT id FROM products.skus WHERE sku_code = 'delonghi-nespresso-red'),
 3001, 88, -1, 888.00, -888.00, 'refund', '2026-02-26 11:00:00+00', '2026-02-26', now()),

-- 不同日期的销量波动
(20, 'ORDER202602260112', 'ca8ceec3-3345-48ce-b2db-40afe710eb69',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-black-256g'),
 1001, 10, 1, 8999.00, 8999.00, 'paid', '2026-02-26 19:00:00+00', '2026-02-26', now()),
(37, 'ORDER202602260112', 'ca8ceec3-3345-48ce-b2db-40afe710eb69',
 (SELECT id FROM products.spus WHERE spu_code = 'iphone-15-pro'),
 (SELECT id FROM products.skus WHERE sku_code = 'iphone-15-pro-black-256g'),
 1001, 10, 1, 8999.00, 8999.00, 'paid', '2026-02-26 19:00:00+00', '2026-02-26', now())
ON CONFLICT (id) DO NOTHING;

-- +goose Down
DELETE FROM products.sale_detail WHERE id IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,37);
