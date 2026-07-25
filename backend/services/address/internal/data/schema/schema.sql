CREATE SCHEMA IF NOT EXISTS addresses;
-- DROP TABLE addresses.addresses;
CREATE TABLE IF NOT EXISTS addresses.addresses
(
    address_id      UUID PRIMARY KEY,                    -- 地址唯一标识ID（UUID）
    recipient_name  VARCHAR(255) NOT NULL,               -- 收件人姓名
    recipient_phone VARCHAR(50)  NOT NULL,               -- 收件人电话号码
    user_id         VARCHAR(255) NOT NULL,               -- 所属用户ID

    province        VARCHAR(64)  NOT NULL,               -- 省
    city            VARCHAR(64)  NOT NULL,               -- 市
    district        VARCHAR(64)  NOT NULL,               -- 区
    detail          VARCHAR(500) NOT NULL,               -- 详细地址（街道、门牌号）
    postal_code     VARCHAR(16)  NOT NULL DEFAULT '',    -- 邮编

    full_text       TEXT         NOT NULL,               -- 拼接后的完整地址文本，方便前端直接展示
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE, -- 是否为默认地址（每个用户只能有一个默认地址）
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE, -- 是否删除（回收站可恢复）
    deleted_at      TIMESTAMPTZ,                         -- 软删除时间（为空表示未删除）
    created_at      TIMESTAMPTZ           DEFAULT now(), -- 创建时间
    updated_at      TIMESTAMPTZ           DEFAULT now()  -- 最后更新时间
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_is_default ON addresses.addresses (is_default);
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at ON addresses.addresses (deleted_at);
