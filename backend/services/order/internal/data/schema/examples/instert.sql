
--insert
SET search_path TO orders;
INSERT INTO order_group (group_no, user_id, total_amount, freight_amount, discount_amount, pay_amount)
VALUES
-- 苹果商家订单组
('OG202602240001', 'user_10001', 36996.00, 0.00, 0.00, 36996.00),
-- 雅诗兰黛商家订单组
('OG202602240002', 'user_10001', 17000.00, 0.00, 0.00, 17000.00);
INSERT INTO order_main (
    order_no, group_no, merchant_id, merchant_name, user_id,
    order_status, shipping_status,
    address_name, address_phone, address_province, address_city, address_district, address_detail, address_postal_code, address_full_text,
    total_amount, freight_amount, discount_amount, pay_amount,
    pay_channel, pay_no, paid_at, pay_deadline
)
VALUES
-- ==================== 商家1001：苹果订单 ====================
('ORDER202602240001', 'OG202602240001', 1001, '苹果官方旗舰店', 'user_10001',
 'paid', 'shipped',
 '张三', '13800138000', '广东省', '深圳市', '南山区', '科技园1号', '518000', '广东省深圳市南山区科技园1号 张三 13800138000',
 17998.00, 0, 0, 17998.00,
 'alipay', 'PAY202602240001', '2026-02-24 10:30:00+00', '2026-02-24 11:00:00+00'),

('ORDER202602240058', 'OG202602240001', 1001, '苹果官方旗舰店', 'user_10001',
 'completed', 'delivered',
 '张三', '13800138000', '广东省', '深圳市', '南山区', '科技园1号', '518000', '广东省深圳市南山区科技园1号 张三 13800138000',
 8999.00, 0, 0, 8999.00,
 'wechat', 'PAY202602240058', '2026-02-24 15:20:00+00', '2026-02-24 16:00:00+00'),

-- ==================== 商家2002：雅诗兰黛订单 ====================
('ORDER202602240035', 'OG202602240002', 2002, '雅诗兰黛旗舰店', 'user_10001',
 'completed', 'delivered',
 '李四', '13900139000', '上海市', '浦东新区', '陆家嘴', '金融中心2号', '200120', '上海市浦东新区陆家嘴金融中心2号 李四 13900139000',
 3250.00, 0, 0, 3250.00,
 'alipay', 'PAY202602240035', '2026-02-24 09:20:00+00', '2026-02-24 10:00:00+00');
INSERT INTO order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
VALUES
-- iPhone 15 Pro 黑色256G (SPU=1, SKU=1)
(1, 'ORDER202602240001', 1001, 1, 1,
 'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB',
 '{"颜色": "原色钛金属", "版本": "256GB"}',
 'https://cdn.example.com/iphone15pro/black_thumb.jpg',
 8999.00, 7500.00, 2, 17998.00),

-- iPhone 15 Pro 黑色256G
(2, 'ORDER202602240058', 1001, 1, 1,
 'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB',
 '{"颜色": "原色钛金属", "版本": "256GB"}',
 'https://cdn.example.com/iphone15pro/black_thumb.jpg',
 8999.00, 7500.00, 1, 8999.00),

-- 雅诗兰黛小棕瓶 50ml (SPU=2, SKU=3)
(3, 'ORDER202602240035', 2002, 2, 3,
 '雅诗兰黛小棕瓶精华', '小棕瓶精华 50ml',
 '{"容量": "50ml"}',
 'https://cdn.example.com/anr/50ml_thumb.jpg',
 650.00, 300.00, 5, 3250.00);
INSERT INTO order_log (
    order_id, order_no, merchant_id, old_status, new_status, operator_type, operator_id, remark
)
VALUES
    (1, 'ORDER202602240001', 1001, 'pending_payment', 'paid', 'user', 'user_10001', '用户支付成功'),
    (2, 'ORDER202602240058', 1001, 'paid', 'completed', 'system', 'system', '订单已签收完成'),
    (3, 'ORDER202602240035', 2002, 'pending_payment', 'paid', 'user', 'user_10001', '用户支付成功');


-- 场景：用户购买了多件商品，验证价格精度
INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
VALUES
    (1, 'ORDER202602240001', 1001, 1, 1,
     'Apple iPhone 15 Pro', 'iPhone15Pro 黑色钛金属 256GB',
     '{"color": "Titanium Black", "storage": "256GB"}',
     'https://cdn.example.com/iphone15pro/black_thumb.jpg',
     8999.00, 7500.00, 2, 17998.00);

-- 场景：购买化妆品，验证较小的金额数值
INSERT INTO orders.order_item (
    order_id, order_no, merchant_id, spu_id, sku_id,
    spu_name, sku_name, sku_attributes, sku_thumbnail_url,
    price, cost_price, quantity, total_amount
)
VALUES
    (3, 'ORDER202602240035', 2002, 2, 3,
     '雅诗兰黛小棕瓶精华', '小棕瓶精华 50ml',
     '{"size": "50ml"}',
     'https://cdn.example.com/anr/50ml_thumb.jpg',
     650.50, 300.00, 1, 650.50);
