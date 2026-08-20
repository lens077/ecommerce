-- 商品示例数据：SPU（由 schema/examples/spu.sql 改写语义而来，2026-08-21）。
-- goose no-versioning 模式执行：`dbmigrate -svc product seed` / `seed-down`。
-- 改写要点：以业务唯一键 spu_code 做 ON CONFLICT DO NOTHING，可重复执行。

-- +goose Up
INSERT INTO products.spus (spu_code, merchant_id, name, description, category_id, brand_id, status, main_media_url, images_gallery, specs)
VALUES
-- 案例 1: 手机
(
    'iphone-15-pro',
    'ca8ceec3-3345-48ce-b2db-40afe710eb61',
    'Apple iPhone 15 Pro',
    '钛金属设计，A17 Pro 芯片，超强摄影系统。',
    1001, 10, 'online',
    'https://cdn.example.com/iphone15pro/main.jpg',
    '["https://cdn.example.com/iphone15pro/gallery1.jpg", "https://cdn.example.com/iphone15pro/gallery2.jpg"]',
    '{"屏幕尺寸": "6.1英寸", "分辨率": "2556 x 1179", "操作系统": "iOS"}'
),
-- 案例 2: 美妆
(
    'estee-lauder-anr',
    'ca8ceec3-3345-48ce-b2db-40afe710eb61',
    '雅诗兰黛小棕瓶精华',
    '第七代黄金夜修护，深层修护，淡化细纹。',
    2005, 55, 'online',
    'https://cdn.example.com/anr/main.jpg',
    '["https://cdn.example.com/anr/details1.jpg"]',
    '{"适用肤质": "所有肤质", "产地": "美国"}'
),
-- 案例 3: 数码配件
(
    'apple-20w-adapter',
    'ca8ceec3-3345-48ce-b2db-40afe710eb61',
    'Apple 20W USB-C 电源适配器',
    '快速充电，兼容任何支持 USB‑C 的设备。',
    1002, 10, 'online',
    'https://cdn.example.com/adapter/main.jpg',
    '["https://cdn.example.com/adapter/gallery1.jpg"]',
    '{"接口": "USB-C", "功率": "20W"}'
),
-- 案例 4: 生活家电（另一个商家）
(
    'delonghi-nespresso',
    'ca8ceec3-3345-48ce-b2db-40afe710eb62',
    '德龙 Nespresso 胶囊咖啡机',
    '一键开启意式浓缩，小巧机身，19巴高压。',
    3001, 88, 'online',
    'https://cdn.example.com/coffee/main.jpg',
    '["https://cdn.example.com/coffee/gallery1.jpg", "https://cdn.example.com/coffee/gallery2.jpg"]',
    '{"水箱容量": "0.6L", "压力": "19bar"}'
),
-- 案例 5: 外设
(
    'logitech-mx-master-3s',
    'ca8ceec3-3345-48ce-b2db-40afe710eb61',
    '罗技 MX Master 3S 无线鼠标',
    '8K DPI 高精度传感器，静音按键，多设备无缝切换。',
    1003, 20, 'online',
    'https://cdn.example.com/mxmaster3s/main.jpg',
    '["https://cdn.example.com/mxmaster3s/gallery1.jpg"]',
    '{"连接方式": "蓝牙/USB接收器", "续航": "70天"}'
),
-- 案例 6: 影音
(
    'sony-wh-1000xm5',
    'ca8ceec3-3345-48ce-b2db-40afe710eb62',
    '索尼 WH-1000XM5 降噪耳机',
    '行业领先主动降噪，30小时续航，高解析音质。',
    1004, 30, 'online',
    'https://cdn.example.com/xm5/main.jpg',
    '["https://cdn.example.com/xm5/gallery1.jpg", "https://cdn.example.com/xm5/gallery2.jpg"]',
    '{"降噪": "自适应", "蓝牙": "5.2"}'
),
-- 案例 7: 运动鞋
(
    'nike-air-zoom-pegasus-41',
    'ca8ceec3-3345-48ce-b2db-40afe710eb62',
    'Nike Air Zoom Pegasus 41 跑鞋',
    'ReactX 中底科技，回弹更强，日常训练全能款。',
    4001, 40, 'online',
    'https://cdn.example.com/pegasus41/main.jpg',
    '["https://cdn.example.com/pegasus41/gallery1.jpg"]',
    '{"适用场景": "路跑/训练", "鞋面": "工程网眼"}'
)
ON CONFLICT (spu_code) DO NOTHING;

-- +goose Down
DELETE FROM products.spus
WHERE spu_code IN ('iphone-15-pro', 'estee-lauder-anr', 'apple-20w-adapter',
                   'delonghi-nespresso', 'logitech-mx-master-3s', 'sony-wh-1000xm5',
                   'nike-air-zoom-pegasus-41');
