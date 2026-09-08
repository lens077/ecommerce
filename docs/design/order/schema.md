# 订单表设计

> 从根 `DESIGN.md` 拆出（2026-08-08）。拆单方案（`order_group` 按商家拆单 + `order_log`）见 [checkout.md](checkout.md)。
> 下面的 DDL **由 [`scripts/doc-embed.py`](../../../scripts/doc-embed.py) 从
> [`backend/services/order/internal/data/migrations/00001_order.sql`](../../../backend/services/order/internal/data/migrations/00001_order.sql) 生成**，
> 不要手改代码块；改迁移后跑 `scripts/doc-embed.py`，`verify-context.sh` 的 [EMBED] 会拦截漂移。
> `order_item` 只存 ID + 业务快照，不做跨 schema 外键（`STACK.md`「零跨 schema 外键」）。

1. 订单状态

    <!-- embed: backend/services/order/internal/data/migrations/00001_order.sql sql:type orders.order_status_enum -->
    ```sql
    -- 订单状态枚举
    CREATE TYPE orders.order_status_enum AS ENUM (
        'pending_payment', -- 待支付
        'paid', -- 已支付
        'pending_shipment', -- 待发货
        'shipped', -- 已发货
        'completed', -- 已完成
        'cancelled', -- 已取消
        'refunding', -- 退款中
        'refunded' -- 已退款
        );
    ```
    <!-- /embed -->

2. 订单组（按商家拆单的父级）

    <!-- embed: backend/services/order/internal/data/migrations/00001_order.sql sql:table orders.order_group -->
    ```sql
    -- 订单组表（无外键）
    CREATE TABLE IF NOT EXISTS orders.order_group
    (
        id              BIGSERIAL PRIMARY KEY,                -- 自增主键
        group_no        VARCHAR(64)    NOT NULL UNIQUE,       -- 订单组号，全局唯一，格式如：OG202604270001
        user_id         VARCHAR(64)    NOT NULL,              -- 下单用户ID（来自Casdoor等认证系统）

        total_amount    DECIMAL(10, 2) NOT NULL DEFAULT 0,    -- 商品总金额（所有子订单商品金额合计）
        freight_amount  DECIMAL(10, 2) NOT NULL DEFAULT 0,    -- 总运费
        discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,    -- 总优惠金额
        pay_amount      DECIMAL(10, 2) NOT NULL DEFAULT 0,    -- 实付总金额 = total_amount + freight_amount - discount_amount

        created_at      timestamptz    NOT NULL DEFAULT now(),-- 创建时间
        updated_at      timestamptz    NOT NULL DEFAULT now() -- 更新时间
    );
    ```
    <!-- /embed -->

3. 订单主表

    <!-- embed: backend/services/order/internal/data/migrations/00001_order.sql sql:table orders.order_main -->
    ```sql
    -- 订单主表
    CREATE TABLE IF NOT EXISTS orders.order_main
    (
        id                  BIGSERIAL PRIMARY KEY,                                          -- 自增主键
        order_no            VARCHAR(64)                 NOT NULL UNIQUE,                    -- 订单号，全局唯一，如：OM202604270001
        group_no            VARCHAR(64)                 NOT NULL,                           -- 关联的订单组号（业务关联，非外键约束）

        merchant_id         UUID                        NOT NULL,                           -- 商家ID（数据隔离核心字段）
        merchant_name       VARCHAR(255)                NOT NULL,                           -- 商家名称快照（避免商家改名后历史数据变化）
        user_id             UUID                        NOT NULL,                           -- 下单用户ID

        order_status        orders.order_status_enum    NOT NULL DEFAULT 'pending_payment', -- 订单状态
        shipping_status     orders.shipping_status_enum NOT NULL DEFAULT 'unshipped',       -- 物流状态

        -- 收货地址快照（保留订单时的地址信息）
        address_name        VARCHAR(64)                 NOT NULL,                           -- 收货人姓名
        address_phone       VARCHAR(32)                 NOT NULL,                           -- 收货人电话
        address_province    VARCHAR(64)                 NOT NULL,                           -- 省
        address_city        VARCHAR(64)                 NOT NULL,                           -- 市
        address_district    VARCHAR(64)                 NOT NULL,                           -- 区
        address_detail      VARCHAR(500)                NOT NULL,                           -- 详细地址
        address_postal_code VARCHAR(16),                                                    -- 邮编
        address_full_text   TEXT                        NOT NULL,                           -- 完整地址文本（用于展示）

        -- 金额信息
        total_amount        DECIMAL(10, 2)              NOT NULL,                           -- 商品总金额
        freight_amount      DECIMAL(10, 2)              NOT NULL DEFAULT 0,-- 运费
        discount_amount     DECIMAL(10, 2)              NOT NULL DEFAULT 0,-- 优惠金额
        pay_amount          DECIMAL(10, 2)              NOT NULL,                           -- 实付金额

        -- 物流信息
        courier_code        VARCHAR(64),                                                    -- 快递公司编码
        courier_name        VARCHAR(64),                                                    -- 快递公司名称
        tracking_no         VARCHAR(64),                                                    -- 物流单号
        shipped_at          timestamptz,                                                    -- 发货时间
        delivered_at        timestamptz,                                                    -- 签收时间

        -- 支付信息
        pay_channel         VARCHAR(32),                                                    -- 支付渠道：alipay / wechat 等
        pay_no              VARCHAR(64),                                                    -- 支付单号
        paid_at             timestamptz,                                                    -- 支付时间

        pay_deadline        timestamptz                 NOT NULL,                           -- 支付截止时间
        remark              TEXT,                                                           -- 用户备注
        merchant_remark     TEXT,                                                           -- 商家备注

        created_at          timestamptz                 NOT NULL DEFAULT now(),             -- 创建时间
        updated_at          timestamptz                 NOT NULL DEFAULT now()              -- 更新时间
    );
    ```
    <!-- /embed -->

4. 订单明细表

    <!-- embed: backend/services/order/internal/data/migrations/00001_order.sql sql:table orders.order_item -->
    ```sql
    -- 订单明细表
    CREATE TABLE IF NOT EXISTS orders.order_item
    (
        id                BIGSERIAL PRIMARY KEY,                -- 自增主键
        order_id          BIGINT         NOT NULL,              -- 关联的订单主表ID（业务关联）
        order_no          VARCHAR(64)    NOT NULL,              -- 冗余的订单号，方便查询

        merchant_id       UUID         NOT NULL,              -- 商家ID（数据隔离）

        spu_id            BIGINT         NOT NULL,              -- SPU ID
        sku_id            BIGINT         NOT NULL,              -- SKU ID（业务关联，如关联商品服务）

        spu_name          VARCHAR(255)   NOT NULL,              -- 下单时的SPU名称快照
        sku_name          VARCHAR(255)   NOT NULL,              -- 下单时的SKU名称快照
        sku_attributes    JSONB          NOT NULL DEFAULT '{}', -- SKU销售属性快照，如：{"颜色":"黑","尺寸":"XL"}
        sku_thumbnail_url VARCHAR(500)   NOT NULL,              -- SKU缩略图快照
        price             DECIMAL(10, 2) NOT NULL,              -- 下单时的单价
        cost_price        DECIMAL(10, 2) NOT NULL,              -- 下单时的成本价（用于商家分析）

        quantity          INTEGER        NOT NULL,              -- 购买数量
        total_amount      DECIMAL(10, 2) NOT NULL,              -- 小计：price * quantity

        created_at        timestamptz    NOT NULL DEFAULT now() -- 创建时间
    );
    ```
    <!-- /embed -->

5. 订单状态变更日志

    <!-- embed: backend/services/order/internal/data/migrations/00001_order.sql sql:table orders.order_log -->
    ```sql
    -- 订单状态变更日志表
    CREATE TABLE IF NOT EXISTS orders.order_log
    (
        id            BIGSERIAL PRIMARY KEY,                          -- 自增主键
        order_id      BIGINT                   NOT NULL,              -- 关联的订单主表ID（业务关联）
        order_no      VARCHAR(64)              NOT NULL,              -- 冗余订单号
        merchant_id   UUID                   NOT NULL,              -- 商家ID

        old_status    orders.order_status_enum,                       -- 变更前状态（首次创建时可为NULL）
        new_status    orders.order_status_enum NOT NULL,              -- 变更后状态
        operator_type VARCHAR(32)              NOT NULL,              -- 操作者类型：user / merchant / admin / system
        operator_id   VARCHAR(64),                                    -- 操作者ID
        remark        TEXT,                                           -- 变更备注

        created_at    timestamptz              NOT NULL DEFAULT now() -- 记录创建时间
    );
    ```
    <!-- /embed -->
