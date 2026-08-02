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

-- 全国行政区划字典表。静态数据，只读，由 ../seed/seed_regions.sql 灌入
-- （数据源见 ../seed/regions.tsv，生成器见 cmd/regionseed）。
-- 主键沿用数据集自带的 id：港澳的区/堂区和「海外」在国标里根本没有 6 位码，
-- 用 code 当主键就得为这 28 行编造编号。
-- DROP TABLE addresses.regions;
CREATE TABLE IF NOT EXISTS addresses.regions
(
    id         INTEGER PRIMARY KEY,               -- 数据集自带 id
    parent_id  INTEGER      NOT NULL DEFAULT 0,   -- 上级 id，0 表示省级
    level      SMALLINT     NOT NULL,             -- 1 省 / 2 市 / 3 区县
    code       VARCHAR(12)  NOT NULL DEFAULT '',  -- GB/T 2260 行政区划代码，港澳及海外为空
    name       VARCHAR(64)  NOT NULL,             -- 规范中文名，含后缀：北京市 / 朝阳区
    name_en    VARCHAR(128) NOT NULL DEFAULT '',  -- 英文名，英文界面展示用
    pinyin     VARCHAR(128) NOT NULL DEFAULT '',  -- 拼音，留给后续搜索/首字母定位
    sort_order INTEGER      NOT NULL DEFAULT 0    -- 展示顺序，沿用数据集的 order
);

CREATE INDEX IF NOT EXISTS idx_regions_parent ON addresses.regions (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_regions_code ON addresses.regions (code);
