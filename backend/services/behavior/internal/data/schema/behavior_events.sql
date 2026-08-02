CREATE SCHEMA IF NOT EXISTS behaviors;

-- 行为事件流水。
-- 这张表是事实来源:gorse 里的 feedback 必须能从这里完整重放,反过来不行。
-- 所以投喂 gorse 失败不回滚落库,只把 synced_at 留空等补偿任务重投。
CREATE TABLE IF NOT EXISTS behaviors.events
(
    id          BIGSERIAL PRIMARY KEY,
    -- 登录用户为 casdoor 的 user id;未登录为 'anon:<前端生成的稳定 id>'。
    -- 加前缀是为了和真实 user id 在 gorse 的用户空间里分开,登录后做身份合并时也好识别。
    user_id     VARCHAR(80)      NOT NULL,
    anonymous   BOOLEAN          NOT NULL DEFAULT FALSE,
    session_id  VARCHAR(64)      NOT NULL DEFAULT '',
    -- impression / read / dwell / cart / favorite / purchase / dislike
    -- 取值必须与 gorse config.toml [recommend.data_source] 里声明的类型一致
    event_type  VARCHAR(32)      NOT NULL,
    -- 商品标识,统一用 spu_code,与 gorse 的 ItemId 对齐
    item_id     VARCHAR(64)      NOT NULL,
    -- dwell 为停留秒数,其余事件恒为 1
    value       DOUBLE PRECISION NOT NULL DEFAULT 1,
    -- 事件来源,用于渠道归因: search:关键词 / category:3 / home_feed / neighbors
    source      VARCHAR(128)     NOT NULL DEFAULT '',
    -- 已按服务端时钟纠偏过的事件时间
    occurred_at TIMESTAMPTZ      NOT NULL,
    -- 投喂 gorse 成功的时间;NULL 表示还没投或投失败,等补偿任务捞
    synced_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- 补偿任务的唯一扫描路径,部分索引把已同步的行排除在外,索引不会随流水无限膨胀
CREATE INDEX IF NOT EXISTS idx_events_pending_sync
    ON behaviors.events (id)
    WHERE synced_at IS NULL;

-- 读取侧过滤 dislike 用
CREATE INDEX IF NOT EXISTS idx_events_user_dislike
    ON behaviors.events (user_id, item_id)
    WHERE event_type = 'dislike';

-- 按用户回溯行为(离线分析、登录后的匿名身份合并)
CREATE INDEX IF NOT EXISTS idx_events_user_time
    ON behaviors.events (user_id, occurred_at DESC);

-- 按商品统计热度
CREATE INDEX IF NOT EXISTS idx_events_item_time
    ON behaviors.events (item_id, occurred_at DESC);
