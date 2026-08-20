-- 用户服务初始结构。
-- 2026-08-21 由 schema/schema.sql 转为 goose 版本化迁移。
-- 语义修复（唯一一处改动）：删除模板残留的 `CREATE DATABASE connect_example;`——
-- 库名是 connect-example 脚手架时代的遗物（真库是 ecommerce，由 CNPG Database CR 声明），
-- 且 CREATE DATABASE 不能在事务里执行，留着会让 goose 迁移必失败。
-- users 表历史上建在 public（未走 per-service schema），保持不变——
-- queries/query.sql 与 sqlc 生成物都按无限定名引用它。

-- +goose Up
CREATE TABLE users
(
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(255) UNIQUE       NOT NULL, -- 关联用户ID
    password_hash VARCHAR(255)              NOT NULL, -- 加密后密码
    salt          VARCHAR(255)              NOT NULL, -- 盐值
    created_at    timestamptz DEFAULT now() NOT NULL, -- Unix时间戳，避免时区问题
    updated_at    timestamptz DEFAULT now() NOT NULL
);
COMMENT
    ON TABLE users IS '用户表';

-- +goose Down
DROP TABLE IF EXISTS users;
