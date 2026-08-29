# 商品销量统计设计（PostgreSQL 事实 + Dragonfly 加速 + PostgreSQL 预聚合）

> 原 `backend/services/product/internal/data/schema/design/销量设计.md`，2026-08-13 移入本目录。
> **落地现状（2026-08-13 核对）**：
> - 明细表已落地但**改了名**：文档写 `products.sales_detail`，实际是
>   `products.sale_detail`（单数，`product/internal/data/migrations/00003_sale_detail.sql`），
>   且实际多建了文档没有的 `products.spu_total_sales` 视图——表结构以 SQL 为准；
> - **预聚合表（sales_daily）未落地**，「商家历史销量分析」整章仍是目标态；
> - 「Kafka → 统计服务（Statistics Service）」链路**当前不存在**：只有通用 Kafka producer Adapter，
>   没有业务 producer、consumer 或 statistics 服务。必须先完成 Outbox/Kafka 迁移与 product 域内 consumer，不因已有 Adapter 就把链路写成已落地。

方案为「PostgreSQL 销量明细事实 + Dragonfly 可丢缓存 + PostgreSQL 预聚合分析」，技术栈统一且维护成本低，后续数据量上来后可平滑迁移至 ClickHouse。
一、核心方案架构（PostgreSQL 版）
1.1 分层设计思路
表格
场景	存储方案	核心优势
首页 / 商品列表实时销量展示	Dragonfly（Redis 协议）可丢缓存	高并发读写、毫秒级响应
商家历史销量分析（趋势 / 多维度聚合）	PostgreSQL 预聚合表 + 索引优化	技术栈统一、初期数据量下性能足够
销量数据持久化与回溯	PostgreSQL 销量明细表	数据可靠存储、支持异常修复
1.2 数据流转链路
```plaintext
订单支付成功 → Kafka 发布「销量变更事件」（经 Outbox；当前 NATS 迁移中）→ Catalog 域统计消费者以 Inbox 幂等消费
                                                              ↓
                                                   写入 PostgreSQL 销量明细事实
                                                              ↓
                    ┌─────────────────────────────────────────┴─────────────────────────────────────────┐
                    ↓                                                                                         ↓
          best-effort 更新 Dragonfly 销量缓存                                   每日定时任务聚合数据至预聚合表
                    ↓                                                                                         ↓
          首页/商品列表优先读缓存，miss 回源 PG                                  商家后台从预聚合表查询历史分析
                                                                                                              ↓
                                                                                                商家后台从预聚合表查询历史分析
```
二、实时销量展示方案（首页 / 商品列表）
2.1 Redis 数据结构设计（保持不变）
同时存储 SKU 和 SPU 维度销量，避免实时计算：
```go
// SKU 实时销量：key = "sales:sku:{sku_id}"，value = 销量（int64）
// SPU 实时销量：key = "sales:spu:{spu_id}"，value = 销量（int64）
SET sales:sku:1001 500
SET sales:spu:2001 1200
```
2.2 首页读取逻辑（保持不变）
优先读 Dragonfly（Redis 协议），miss 或异常时从 PostgreSQL 事实/投影回填。缓存只能加速，不得决定销量正确性：
```go
func (p *ProductService) GetSpuSales(ctx context.Context, spuID int64) (int64, error) {
    sales, err := redisClient.Get(ctx, fmt.Sprintf("sales:spu:%d", spuID)).Int64()
    if err == nil {
        return sales, nil
    }
    // 兜底：从 PostgreSQL 最近1天销量聚合
    return s.pgRepo.GetRecentSalesBySpu(ctx, spuID, 1)
}
```
三、商家历史销量分析方案（PostgreSQL 实现）
3.1 PostgreSQL 表结构设计
设计销量明细表（持久化所有变更）和预聚合表（提升查询速度）：
（1）销量明细表（核心事实表，记录每一笔销量变更）
```sql
CREATE TABLE IF NOT EXISTS products.sales_detail
(
    id                BIGSERIAL PRIMARY KEY,
    order_no          VARCHAR(64)   NOT NULL,
    merchant_id       BIGINT        NOT NULL,
    spu_id            BIGINT        NOT NULL,
    sku_id            BIGINT        NOT NULL REFERENCES products.skus(id),
    category_id       BIGINT        NOT NULL,
    brand_id          BIGINT        NOT NULL,
    
    quantity          INTEGER       NOT NULL,      -- 销量（退款为负数）
    price             DECIMAL(10,2) NOT NULL,      -- 单价
    total_amount      DECIMAL(10,2) NOT NULL,      -- 总金额
    
    type              VARCHAR(32)   NOT NULL,      -- 变更类型：paid/refund
    paid_at           timestamptz   NOT NULL,      -- 支付/退款时间
    dt                DATE          NOT NULL,      -- 日期（用于聚合）
    
    -- 可扩展维度
    channel           VARCHAR(32)   DEFAULT 'app', -- 订单渠道
    activity_id       BIGINT,                      -- 关联活动ID
    
    created_at        timestamptz   NOT NULL DEFAULT now()
);
-- 核心索引：覆盖商家+SPU+时间的查询模式
CREATE INDEX idx_sales_merchant_spu_dt ON products.sales_detail(merchant_id, spu_id, dt);
CREATE INDEX idx_sales_merchant_brand_dt ON products.sales_detail(merchant_id, brand_id, dt);
CREATE INDEX idx_sales_dt ON products.sales_detail(dt);
```

（2）预聚合表（按天聚合，提升商家后台查询速度）

```sql
CREATE TABLE IF NOT EXISTS products.sales_daily_agg
(
    id                BIGSERIAL PRIMARY KEY,
    merchant_id       BIGINT        NOT NULL,
    spu_id            BIGINT        NOT NULL,
    sku_id            BIGINT        NOT NULL,
    category_id       BIGINT        NOT NULL,
    brand_id          BIGINT        NOT NULL,
    dt                DATE          NOT NULL,      -- 聚合日期
    
    total_quantity    INTEGER       NOT NULL DEFAULT 0,   -- 总销量
    total_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,   -- 总销售额
    order_count       INTEGER       NOT NULL DEFAULT 0,    -- 订单数
    
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    
    -- 唯一约束：避免重复聚合
    UNIQUE(merchant_id, spu_id, sku_id, dt)
);

-- 预聚合表索引
CREATE INDEX idx_sales_agg_merchant_spu_dt ON products.sales_daily_agg(merchant_id, spu_id, dt);
CREATE INDEX idx_sales_agg_merchant_dt ON products.sales_daily_agg(merchant_id, dt);
```
3.2 数据同步策略
实时写入明细表：统计服务消费订单事件后，实时写入 sales_detail 明细表：
```go
func (s *StatisticsService) writeSalesDetail(ctx context.Context, item *OrderItem, orderNo string, changeType string) error {
    _, err := pgClient.Exec(ctx, `
        INSERT INTO products.sales_detail 
        (order_no, merchant_id, spu_id, sku_id, category_id, brand_id, quantity, price, total_amount, type, paid_at, dt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, orderNo, item.MerchantID, item.SpuID, item.SkuID, item.CategoryID, item.BrandID,
        item.Quantity, item.Price, item.TotalAmount, changeType, event.PaidAt, event.PaidAt.Format("2006-01-02"))
    return err
}
```
定时聚合至预聚合表：每天凌晨 2 点通过 **K8s CronJob（`concurrencyPolicy: Forbid` + `FOR UPDATE SKIP LOCKED` + 幂等 upsert）**（2026-08-26 收敛：与 checkout v2 的调度口径统一，不引入 Temporal——工作流引擎须先过 ADR），从前一天的 sales_detail 聚合数据写入 sales_daily_agg：
```sql
-- 聚合前一天数据（幂等操作，使用 INSERT ON CONFLICT）
INSERT INTO products.sales_daily_agg
(merchant_id, spu_id, sku_id, category_id, brand_id, dt, total_quantity, total_amount, order_count, created_at, updated_at)
SELECT 
    merchant_id,
    spu_id,
    sku_id,
    category_id,
    brand_id,
    dt,
    SUM(quantity) AS total_quantity,
    SUM(total_amount) AS total_amount,
    COUNT(DISTINCT order_no) AS order_count,
    NOW(),
    NOW()
FROM products.sales_detail
WHERE dt = CURRENT_DATE - 1
GROUP BY merchant_id, spu_id, sku_id, category_id, brand_id, dt
ON CONFLICT (merchant_id, spu_id, sku_id, dt) 
DO UPDATE SET 
    total_quantity = EXCLUDED.total_quantity,
    total_amount = EXCLUDED.total_amount,
    order_count = EXCLUDED.order_count,
    updated_at = NOW();
```
3.3 商家分析功能实现（PostgreSQL 语法）
基于预聚合表实现核心分析能力，性能足够支撑初期数据量：
（1）销量趋势分析（折线图）
```sql
-- 商家查看某SPU最近30天销量趋势
SELECT 
    dt,
    SUM(total_quantity) AS sales,
    SUM(total_amount) AS amount
FROM products.sales_daily_agg
WHERE merchant_id = $1
  AND spu_id = $2
  AND dt >= CURRENT_DATE - 30
GROUP BY dt
ORDER BY dt;
```
（2）多维度销量对比（柱状图）
```sql
-- 商家查看旗下各品牌本月销量对比
SELECT 
    brand_id,
    SUM(total_quantity) AS sales,
    SUM(total_amount) AS amount
FROM products.sales_daily_agg
WHERE merchant_id = $1
  AND dt >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY brand_id
ORDER BY sales DESC;
```
（3）SPU/SKU 销量排行
```sql
-- 商家查看本月销量TOP10的SPU
SELECT 
    spu_id,
    SUM(total_quantity) AS sales,
    SUM(total_amount) AS amount
FROM products.sales_daily_agg
WHERE merchant_id = $1
  AND dt >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY spu_id
ORDER BY sales DESC
LIMIT 10;
```
3.4 PostgreSQL 性能优化（初期必备）
索引优化：
明细表和预聚合表均创建覆盖商家 + 时间 + 维度的联合索引，避免全表扫描。
定期执行 REINDEX 维护索引碎片。
查询优化：
商家分析查询优先走预聚合表，避免直接查明细表。
限制查询时间范围（如默认只查最近 3 个月），避免一次性聚合过多数据。
分区表（可选，数据量达百万级后启用）：对 sales_detail 按 dt 字段进行范围分区，提升历史数据查询和清理速度：
```sql
-- 分区表示例（PostgreSQL 11+）
CREATE TABLE products.sales_detail (
    -- 同上字段
) PARTITION BY RANGE (dt);

-- 创建月度分区
CREATE TABLE products.sales_detail_202401 PARTITION OF products.sales_detail
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```
四、销量更新逻辑（调整版）
product 域编舞消费者先以 Inbox 幂等方式写入 PostgreSQL 明细事实，再 best-effort 更新 Dragonfly；缓存失败不得回滚或丢失 PostgreSQL 事实：
```go
func (s *StatisticsService) HandleOrderPaid(ctx context.Context, event *OrderPaidEvent) error {
    for _, item := range event.OrderItems {
        // 1. 原子更新 Redis 销量
        redisClient.IncrBy(ctx, fmt.Sprintf("sales:sku:%d", item.SkuID), int64(item.Quantity))
        redisClient.IncrBy(ctx, fmt.Sprintf("sales:spu:%d", item.SpuID), int64(item.Quantity))
        
        // 2. 写入 PostgreSQL 销量明细表
        if err := s.writeSalesDetail(ctx, item, event.OrderNo, "paid", event.PaidAt); err != nil {
            log.Errorf("write sales detail failed: %v", err)
            // 可记录失败事件，后续重试
        }
    }
    return nil
}

func (s *StatisticsService) HandleOrderRefund(ctx context.Context, event *OrderRefundedEvent) error {
    for _, item := range event.OrderItems {
        // 1. 原子扣减 Redis 销量
        redisClient.DecrBy(ctx, fmt.Sprintf("sales:sku:%d", item.SkuID), int64(item.Quantity))
        redisClient.DecrBy(ctx, fmt.Sprintf("sales:spu:%d", item.SpuID), int64(item.Quantity))
        
        // 2. 写入 PostgreSQL 销量明细表
        if err := s.writeSalesDetail(ctx, item, event.OrderNo, "refund", event.RefundedAt); err != nil {
            log.Errorf("write sales detail failed: %v", err)
        }
    }
    return nil
}
```
五、后续迁移 ClickHouse 的平滑过渡方案
当数据量达千万级、PostgreSQL 聚合查询变慢时，可按以下步骤平滑迁移：
双写阶段：统计服务同时写入 PostgreSQL 和 ClickHouse，预聚合任务仍从 PostgreSQL 读取。
查询切分阶段：商家后台查询优先走 ClickHouse，异常时兜底到 PostgreSQL。
下线阶段：停止 PostgreSQL 预聚合任务，完全切换至 ClickHouse，PostgreSQL 仅作为历史数据备份。
六、方案优势总结
技术栈统一：初期使用 PostgreSQL + Dragonfly（Redis 协议），降低运维和学习成本。
性能足够：预聚合表 + 索引优化，可支撑百万级数据下的商家分析秒级响应。
可扩展：表结构预留维度字段，后续可轻松添加渠道、活动等分析维度。
平滑迁移：数据结构与 ClickHouse 兼容，后续迁移无需大幅修改代码。
