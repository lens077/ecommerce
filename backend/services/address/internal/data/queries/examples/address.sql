INSERT INTO addresses.addresses (
    address_id, recipient_name, recipient_phone, user_id,
    province, city, district, detail, postal_code,
    full_text, is_default, is_deleted
)
VALUES
    (
        gen_random_uuid(),
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
        gen_random_uuid(),
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
    );

SELECT *
FROM addresses.addresses
WHERE user_id = '88735c43-9899-44b6-9aec-74f37a8996b4'
  AND is_deleted = false
ORDER BY is_default DESC, created_at DESC;