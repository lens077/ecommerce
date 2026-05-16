INSERT INTO products.spus (spu_code, merchant_id,name, description, category_id, brand_id, status, main_media_url, images_gallery, specs)
VALUES
-- 案例 1: 手机
(
    'iphone-15-pro',
    1001,
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
    1001,
    '雅诗兰黛小棕瓶精华',
    '第七代黄金夜修护，深层修护，淡化细纹。',
    2005, 55, 'online',
    'https://cdn.example.com/anr/main.jpg',
    '["https://cdn.example.com/anr/details1.jpg"]',
    '{"适用肤质": "所有肤质", "产地": "美国"}'
);
INSERT INTO products.spus (spu_code, merchant_id, name, description, category_id, brand_id, status, main_media_url, images_gallery, specs)
VALUES
-- 案例 3: 数码配件 (SPU ID 假设为 3)
(
    'apple-20w-adapter',
    1001,
    'Apple 20W USB-C 电源适配器',
    '快速充电，兼容任何支持 USB‑C 的设备。',
    1002, 10, 'online',
    'https://cdn.example.com/adapter/main.jpg',
    '["https://cdn.example.com/adapter/gallery1.jpg"]',
    '{"接口": "USB-C", "功率": "20W"}'
),
-- 案例 4: 生活家电 (SPU ID 假设为 4, 换一个商家 3003)
(
    'delonghi-nespresso',
    3003,
    '德龙 Nespresso 胶囊咖啡机',
    '一键开启意式浓缩，小巧机身，19巴高压。',
    3001, 88, 'online',
    'https://cdn.example.com/coffee/main.jpg',
    '["https://cdn.example.com/coffee/gallery1.jpg", "https://cdn.example.com/coffee/gallery2.jpg"]',
    '{"水箱容量": "0.6L", "压力": "19bar"}'
);