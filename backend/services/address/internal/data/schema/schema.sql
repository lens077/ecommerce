CREATE SCHEMA IF NOT EXISTS addresses;

-- 地址表
CREATE TABLE IF NOT EXISTS addresses.address
(
    id              BIGSERIAL PRIMARY KEY,               -- 自增主键（物理）
    address_id      VARCHAR(64)  NOT NULL UNIQUE,        -- 地址业务唯一ID (UUID)
    user_id         VARCHAR(64)  NOT NULL,               -- 所属用户ID
    recipient_name  VARCHAR(64)  NOT NULL,               -- 收件人姓名
    recipient_phone VARCHAR(32)  NOT NULL,               -- 收件人电话

    -- 地址详情（值对象，平铺存储）
    province        VARCHAR(64)  NOT NULL,               -- 省
    city            VARCHAR(64)  NOT NULL,               -- 市
    district        VARCHAR(64)  NOT NULL,               -- 区
    detail          VARCHAR(500) NOT NULL,               -- 详细地址
    postal_code     VARCHAR(16)  NOT NULL DEFAULT '',    -- 邮编
    full_text       TEXT         NOT NULL,               -- 完整地址文本（拼接展示）

    is_default      BOOLEAN      NOT NULL DEFAULT false, -- 是否默认地址
    is_deleted      BOOLEAN      NOT NULL DEFAULT false, -- 软删除标记

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE addresses.address IS '收货地址表';

-- 索引
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses.address (user_id);
-- 确保每个用户只有一个默认地址（仅在未删除的记录中）
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_user_default ON addresses.address (user_id, is_default) WHERE is_default = true AND is_deleted = false;