-- 购物车金额契约改为 int64 分；数据库继续使用精确 NUMERIC，约束到分精度。

-- +goose Up
-- DECIMAL(10,2) 已保证存量最多两位小数；该约束补齐 API 的正值与上限不变量。
ALTER TABLE cart.cart_item
    ADD CONSTRAINT chk_cart_item_price_cents
    CHECK (price > 0 AND price <= 99999999.99) NOT VALID;

ALTER TABLE cart.cart_item
    VALIDATE CONSTRAINT chk_cart_item_price_cents;

COMMENT ON COLUMN cart.cart_item.price IS '加入购物车时的单价快照，精确到分；API 使用 unit_price_cents int64';

-- +goose Down
ALTER TABLE cart.cart_item
    DROP CONSTRAINT IF EXISTS chk_cart_item_price_cents;

COMMENT ON COLUMN cart.cart_item.price IS NULL;
