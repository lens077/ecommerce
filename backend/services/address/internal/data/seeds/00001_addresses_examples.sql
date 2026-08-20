-- 地址示例数据（由 queries/examples/address.sql 改写语义而来，2026-08-21）。
-- goose no-versioning 模式执行：`dbmigrate -svc address seed` / `seed-down`。
-- 改写要点：
--   1. 原文件用 gen_random_uuid() 做主键——每跑一次多两行，无法幂等；
--      改为固定 UUID + ON CONFLICT (address_id) DO NOTHING；
--   2. 原文件末尾的 SELECT 演示语句移除（不属于种子数据）。
-- 行政区划字典（regions）不在这里：见 ../seed/seed_regions.sql 的 psql 整表重灌路径。

-- +goose Up
INSERT INTO addresses.addresses (
    address_id, recipient_name, recipient_phone, user_id,
    province, city, district, detail, postal_code,
    full_text, is_default, is_deleted
)
VALUES
    (
        '5eeda1a0-0000-4000-8000-000000000001',
        '张三',
        '13800138000',
        '88735c43-9899-44b6-9aec-74f37a8996b4',
        '广东省',
        '深圳市',
        '南山区',
        '科技园路1号创新大厦A座1201室',
        '518057',
        '广东省深圳市南山区科技园路1号创新大厦A座1201室 (张三 13800138000)',
        TRUE,
        FALSE
    ),
    (
        '5eeda1a0-0000-4000-8000-000000000002',
        '王五',
        '13798765432',
        '88735c43-9899-44b6-9aec-74f37a8996b4',   -- 同一用户可以有多个地址
        '上海市',
        '上海市',
        '浦东新区',
        '张江高科技园区1号楼',
        '200120',
        '上海市浦东新区张江高科技园区1号楼 (王五 13798765432)',
        FALSE,                                     -- 同一用户只能一个默认地址
        FALSE
    )
ON CONFLICT (address_id) DO NOTHING;

-- +goose Down
DELETE FROM addresses.addresses
WHERE address_id IN ('5eeda1a0-0000-4000-8000-000000000001',
                     '5eeda1a0-0000-4000-8000-000000000002');
