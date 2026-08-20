-- 商家服务初始结构。
-- 2026-08-21 由 schema/merchant.sql 原样转为 goose 版本化迁移（DDL 语义未动）；
-- 存量环境先 `dbmigrate -svc merchant baseline` 记账。

-- +goose Up
CREATE SCHEMA IF NOT EXISTS merchants;
-- （SET search_path 已去掉，理由见 cart/00001；原依赖 search_path 的
-- 各 CREATE INDEX 目标表已显式限定到 merchants）

CREATE TABLE merchants.merchant_application
(
    id                        BIGSERIAL PRIMARY KEY,
    application_id            VARCHAR(64)  NOT NULL UNIQUE,                   -- 申请编号，如 APP202605300001

    -- 申请基本信息（对应 Proto 字段）
    company_name              VARCHAR(255) NOT NULL,                          -- 公司名称
    credit_code               VARCHAR(64)  NOT NULL,                          -- 统一社会信用代码
    legal_person              VARCHAR(64)  NOT NULL,                          -- 法人姓名
    legal_person_id           VARCHAR(32)  NOT NULL,                          -- 法人身份证号
    contact_phone             VARCHAR(32)  NOT NULL,                          -- 联系电话

    -- 资质图片URL
    business_license_url      TEXT,                                           -- 营业执照
    legal_person_id_front_url TEXT,                                           -- 法人身份证正面
    legal_person_id_back_url  TEXT,                                           -- 法人身份证反面

    -- 经营类目
    category_ids              BIGINT[]     NOT NULL DEFAULT '{}',             -- 申请类目ID数组

    -- 申请状态与审核信息
    status                    VARCHAR(32)  NOT NULL DEFAULT 'pending_review', -- pending_review / approved / rejected / activated
    reject_reason             TEXT,                                           -- 驳回原因
    audit_comment             TEXT,                                           -- 审核备注
    submitted_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reviewed_at               TIMESTAMPTZ,                                    -- 审核时间

    remark                    TEXT,                                           -- 申请备注

    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_application_status ON merchants.merchant_application (status);
CREATE INDEX idx_application_credit_code ON merchants.merchant_application (credit_code);

CREATE TABLE merchants.merchant
(
    id                    BIGSERIAL PRIMARY KEY,
    merchant_id           VARCHAR(64)  NOT NULL UNIQUE,           -- 商家唯一标识，如 M202605300001
    application_id        VARCHAR(64)  NOT NULL,                  -- 关联的申请编号

    agreement_version     varchar(16)  NOT NULL,                  -- 最近一次确认的协议版本
    agreement_accepted_at timestamptz  NOT NULL,                  -- 确认时间

    -- 从申请表快照过来的关键信息
    company_name          VARCHAR(255) NOT NULL,
    credit_code           VARCHAR(64)  NOT NULL,
    legal_person          VARCHAR(64)  NOT NULL,
    contact_phone         VARCHAR(32)  NOT NULL,

    -- 商家状态
    status                VARCHAR(32)  NOT NULL DEFAULT 'active', -- active / suspended / closed

    -- 店铺信息（激活时填写）
    shop_name             VARCHAR(255),
    shop_logo_url         TEXT,

    -- 用户关联（关联到 IAM 的商家主账号）
    owner_user_id         VARCHAR(64)  NOT NULL,                  -- 商家主账号的用户ID

    activated_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE merchants.agreement
(
    default_version INT          NOT NULL,
    version         INT          NOT NULL,
    effective_date  TIMESTAMPTZ  NOT NULL,
    content_url     VARCHAR(255) NOT NULL
);

-- 索引
CREATE INDEX idx_merchant_status ON merchants.merchant (status);
CREATE INDEX idx_merchant_credit_code ON merchants.merchant (credit_code);
CREATE INDEX idx_merchant_owner_user ON merchants.merchant (owner_user_id);

-- +goose Down
DROP TABLE IF EXISTS merchants.agreement;
DROP TABLE IF EXISTS merchants.merchant;
DROP TABLE IF EXISTS merchants.merchant_application;
DROP SCHEMA IF EXISTS merchants;
