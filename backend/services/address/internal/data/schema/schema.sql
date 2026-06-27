CREATE SCHEMA IF NOT EXISTS addresses;
CREATE TABLE IF NOT EXISTS addresses.addresses
(
    address_id      VARCHAR(255) PRIMARY KEY,
    recipient_name  VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(50)  NOT NULL,
    user_id         VARCHAR(255) NOT NULL,
    detail          JSONB        NOT NULL,
    full_text       TEXT,
    is_default      BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_is_default ON addresses.addresses (is_default);
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at ON addresses.addresses (deleted_at);