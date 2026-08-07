# 订单表设计（早期设计稿）

> 从根 `DESIGN.md` 拆出（2026-08-08）。⚠️ 已被下单终稿**部分取代**：
> [checkout.md](checkout.md) 引入了 `order_group`（按商家拆单）+ `order_log`，
> 本文的 `orders.main/item` 两表结构是拆单方案定稿前的版本。
> 真相以 [`backend/services/order/internal/data/schema/order.sql`](../../../backend/services/order/internal/data/schema/order.sql) 为准。

4. 订单表

    ```sql
    CREATE TYPE orders.order_status_enum AS ENUM ('pending_payment','paid','shipped','completed','cancelled','
       refunding','refunded');
    
    CREATE TABLE IF NOT EXISTS orders.main
    (
        id              BIGSERIAL PRIMARY KEY,
        order_no        VARCHAR(64)              NOT NULL UNIQUE,
        user_id         VARCHAR(64)              NOT NULL,
        merchant_id     BIGINT                   NOT NULL,
        total_amount    DECIMAL(10, 2)           NOT NULL,
        pay_amount      DECIMAL(10, 2)           NOT NULL,
        freight_amount  DECIMAL(10, 2)           NOT NULL DEFAULT 0,
        discount_amount DECIMAL(10, 2)           NOT NULL DEFAULT 0,
        status          orders.order_status_enum NOT NULL DEFAULT 'pending_payment',
        address_info    JSONB                    NOT NULL,
        pay_deadline    timestamptz              NOT NULL,
        created_at      timestamptz              NOT NULL DEFAULT now(),
        updated_at      timestamptz              NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE orders.main IS '订单主表';
    ```

5. 订单明细表

    ```sql
       CREATE TABLE IF NOT EXISTS orders.item
       (
           id             BIGSERIAL PRIMARY KEY,
           order_id       BIGINT         NOT NULL REFERENCES orders.main (id),
           order_no       VARCHAR(64)    NOT NULL,
           spu_id         BIGINT         NOT NULL,
           sku_id         BIGINT         NOT NULL REFERENCES products.skus (id),
           sku_name       VARCHAR(255)   NOT NULL,
           sku_attributes JSONB          NOT NULL,
           price          DECIMAL(10, 2) NOT NULL,
           quantity       INTEGER        NOT NULL,
           total_amount   DECIMAL(10, 2) NOT NULL,
           created_at     timestamptz    NOT NULL DEFAULT now()
       );
    COMMENT ON TABLE orders.item IS '订单明细表';
    ```
