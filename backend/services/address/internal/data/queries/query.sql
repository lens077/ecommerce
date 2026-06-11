-- 创建地址
-- name: CreateAddress :exec
INSERT INTO addresses.address (address_id, user_id, recipient_name, recipient_phone,
                       province, city, district, detail, postal_code, full_text, is_default, is_deleted)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false);

-- 根据地址ID查询
-- name: GetAddressByID :one
SELECT *
FROM addresses.address
WHERE address_id = $1
  AND is_deleted = false;

-- 查询用户的所有地址（未删除）
-- name: ListAddressesByUserID :many
SELECT *
FROM addresses.address
WHERE user_id = $1
  AND is_deleted = false
ORDER BY is_default DESC, created_at DESC;

-- 查询用户的默认地址
-- name: GetDefaultAddressByUserID :one
SELECT *
FROM addresses.address
WHERE user_id = $1
  AND is_default = true
  AND is_deleted = false
LIMIT 1;

-- 更新地址信息（仅更新非空字段，由应用层构造）
-- name: UpdateAddress :exec
UPDATE addresses.address
SET recipient_name  = COALESCE($2, recipient_name),
    recipient_phone = COALESCE($3, recipient_phone),
    province        = COALESCE($4, province),
    city            = COALESCE($5, city),
    district        = COALESCE($6, district),
    detail          = COALESCE($7, detail),
    postal_code     = COALESCE($8, postal_code),
    full_text       = COALESCE($9, full_text),
    updated_at      = now()
WHERE address_id = $1
  AND is_deleted = false;

-- 软删除地址
-- name: DeleteAddress :exec
UPDATE addresses.address
SET is_deleted = true,
    updated_at = now()
WHERE address_id = $1;

-- 设置默认地址（取消用户当前默认，再设置新默认）
-- name: UnsetAllDefaultByUserID :exec
UPDATE addresses.address
SET is_default = false,
    updated_at = now()
WHERE user_id = $1
  AND is_default = true
  AND is_deleted = false;

-- 设置指定地址为默认
-- name: SetDefaultAddress :exec
UPDATE addresses.address
SET is_default = true,
    updated_at = now()
WHERE address_id = $1
  AND is_deleted = false;