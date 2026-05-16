-- name: GetStockBySkuId :one
SELECT *
FROM inventory.stock
WHERE merchant_id = @merchant_id
  AND sku_id = @sku_id
    FOR UPDATE;

-- name: Reserve :execrows
UPDATE inventory.stock
SET available = available - @quantity,
    version   = version + 1
WHERE merchant_id = @merchant_id
  AND sku_id = @sku_id
  AND warehouse_id = @warehouse_id
  AND available >= @quantity -- 防止超卖
  AND version = @version;
-- 乐观锁

-- name: InsertChangeLog :exec
INSERT INTO inventory.change_log (order_no,
                                  sku_id,
                                  warehouse_id,
                                  merchant_id,
                                  change_type,
                                  quantity,
                                  before_available,
                                  after_available,
                                  before_on_hand,
                                  after_on_hand,
                                  before_locked,
                                  after_locked,
                                  from_status,
                                  to_status,
                                  operator,
                                  created_at)
VALUES (@order_no,
        @sku_id,
        @warehouse_id,
        @merchant_id,
        'RESERVE',
        @quantity,
        @before_available,
        @after_available,
        @before_on_hand,
        @after_on_hand,
        @before_locked,
        @after_locked,
        @from_status,
        @to_status,
        'system',
        now())
ON CONFLICT (order_no, change_type) DO NOTHING; -- 幂等键
