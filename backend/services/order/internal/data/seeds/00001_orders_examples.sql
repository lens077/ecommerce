-- 订单示例数据（由 schema/examples/instert.sql 改写语义而来，2026-08-21）。
-- goose no-versioning 模式执行：`dbmigrate -svc order seed` / `seed-down`。
-- 改写要点：
--   1. 原文件开头整段重复建表 DDL 删除——那份 DDL 与真 schema 已漂移
--      （user_id 写成 VARCHAR(64)，真表是 UUID），结构真相只在 migrations/00001_order.sql；
--   2. 破坏性的 TRUNCATE ... RESTART IDENTITY 删除，改为幂等插入：
--      order_group/order_main 走 ON CONFLICT (group_no / order_no) DO NOTHING，
--      order_item/order_log 无唯一键，用 WHERE NOT EXISTS 守卫；
--   3. 修正原数据不一致：ORDER202602240035 明细 650.50×5=3252.50 与主单 3250.00
--      对不上，统一为 650.00×5=3250.00（与 product 侧 estee-lauder-anr-50ml 价格一致）。

-- +goose Up

-- 1. 订单组
INSERT INTO orders.order_group (group_no, user_id, total_amount, freight_amount, discount_amount, pay_amount)
VALUES
    ('OG202602240001', '88735c43-9899-44b6-9aec-74f37a8996b4', 26997.00, 0.00, 0.00, 26997.00),
    ('OG202602240002', '88735c43-9899-44b6-9aec-74f37a8996b4', 3250.00,  0.00, 0.00, 3250.00)
ON CONFLICT (group_no) DO NOTHING;

-- 2. 订单主表
INSERT INTO orders.order_main (
    order_no, group_no, merchant_id, merchant_name, user_id,
    order_status, shipping_status,
    address_name, address_phone, address_province, address_city, address_district, address_detail, address_postal_code, address_full_text,
    total_amount, freight_amount, discount_amount, pay_amount,
    pay_channel, pay_no, paid_at, pay_deadline
)
VALUES
    ('ORDER202602240001', 'OG202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', '苹果官方旗舰店', '88735c43-9899-44b6-9aec-74f37a8996b4',
     'paid', 'shipped',
     '张三', '13800138000', '广东省', '深圳市', '南山区', '科技园1号', '518000', '广东省深圳市南山区科技园1号 张三 13800138000',
     17998.00, 0, 0, 17998.00,
     'alipay', 'PAY202602240001', '2026-02-24 10:30:00+08', '2026-02-24 11:00:00+08'),

    ('ORDER202602240058', 'OG202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', '苹果官方旗舰店', '88735c43-9899-44b6-9aec-74f37a8996b4',
     'completed', 'delivered',
     '张三', '13800138000', '广东省', '深圳市', '南山区', '科技园1号', '518000', '广东省深圳市南山区科技园1号 张三 13800138000',
     8999.00, 0, 0, 8999.00,
     'wechat', 'PAY202602240058', '2026-02-24 15:20:00+08', '2026-02-24 16:00:00+08'),

    ('ORDER202602240035', 'OG202602240002', '00000000-0000-0000-0000-000000002002', '雅诗兰黛旗舰店', '88735c43-9899-44b6-9aec-74f37a8996b4',
     'completed', 'delivered',
     '李四', '13900139000', '上海市', '浦东新区', '陆家嘴', '金融中心2号', '200120', '上海市浦东新区陆家嘴金融中心2号 李四 13900139000',
     3250.00, 0, 0, 3250.00,
     'alipay', 'PAY202602240035', '2026-02-24 09:20:00+08', '2026-02-24 10:00:00+08')
ON CONFLICT (order_no) DO NOTHING;

-- 3. 订单明细（order_id 动态取主表自增 ID，防止写死冲突；无唯一键，用 NOT EXISTS 守卫幂等）
INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
SELECT
    id, 'ORDER202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 1, 1,
    'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB', '{"颜色": "原色钛金属", "版本": "256GB"}', 'https://cdn.example.com/iphone15pro/black_thumb.jpg',
    8999.00, 7500.00, 2, 17998.00
FROM orders.order_main
WHERE order_no = 'ORDER202602240001'
  AND NOT EXISTS (SELECT 1 FROM orders.order_item WHERE order_no = 'ORDER202602240001' AND sku_id = 1);

INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
SELECT
    id, 'ORDER202602240058', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 1, 1,
    'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB', '{"颜色": "原色钛金属", "版本": "256GB"}', 'https://cdn.example.com/iphone15pro/black_thumb.jpg',
    8999.00, 7500.00, 1, 8999.00
FROM orders.order_main
WHERE order_no = 'ORDER202602240058'
  AND NOT EXISTS (SELECT 1 FROM orders.order_item WHERE order_no = 'ORDER202602240058' AND sku_id = 1);

-- 小金额高精度的化妆品场景
INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
SELECT
    id, 'ORDER202602240035', '00000000-0000-0000-0000-000000002002', 2, 3,
    '雅诗兰黛小棕瓶精华', '小棕瓶精华 50ml', '{"容量": "50ml"}', 'https://cdn.example.com/anr/50ml_thumb.jpg',
    650.00, 300.00, 5, 3250.00
FROM orders.order_main
WHERE order_no = 'ORDER202602240035'
  AND NOT EXISTS (SELECT 1 FROM orders.order_item WHERE order_no = 'ORDER202602240035' AND sku_id = 3);

-- 4. 状态日志（同样以 NOT EXISTS 守卫）
INSERT INTO orders.order_log (order_id, order_no, merchant_id, old_status, new_status, operator_type, operator_id, remark)
SELECT id, 'ORDER202602240001', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 'pending_payment', 'paid', 'user', '88735c43-9899-44b6-9aec-74f37a8996b4', '用户支付成功'
FROM orders.order_main
WHERE order_no = 'ORDER202602240001'
  AND NOT EXISTS (SELECT 1 FROM orders.order_log WHERE order_no = 'ORDER202602240001' AND new_status = 'paid');

INSERT INTO orders.order_log (order_id, order_no, merchant_id, old_status, new_status, operator_type, operator_id, remark)
SELECT id, 'ORDER202602240058', 'ca8ceec3-3345-48ce-b2db-40afe710eb69', 'paid', 'completed', 'system', 'system', '订单已签收完成'
FROM orders.order_main
WHERE order_no = 'ORDER202602240058'
  AND NOT EXISTS (SELECT 1 FROM orders.order_log WHERE order_no = 'ORDER202602240058' AND new_status = 'completed');

-- +goose Down
DELETE FROM orders.order_log  WHERE order_no IN ('ORDER202602240001', 'ORDER202602240058', 'ORDER202602240035');
DELETE FROM orders.order_item WHERE order_no IN ('ORDER202602240001', 'ORDER202602240058', 'ORDER202602240035');
DELETE FROM orders.order_main WHERE order_no IN ('ORDER202602240001', 'ORDER202602240058', 'ORDER202602240035');
DELETE FROM orders.order_group WHERE group_no IN ('OG202602240001', 'OG202602240002');
