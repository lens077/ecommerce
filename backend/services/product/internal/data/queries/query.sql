-- name: GetProductDetail :one
SELECT
    s.id AS spu_id,
    s.name,
    s.spu_code,
    s.specs AS common_specs, -- 通用规格
    json_agg(
        json_build_object(
            'sku_id', k.id,
            'sku_code', k.sku_code,
            'price', k.price,
            'stock', k.stock_quantity,
            'attrs', k.attributes,  -- 销售属性 (颜色/内存)
            'img', k.thumbnail_url
        )
    ) AS skus
FROM products.spus s
JOIN products.skus k ON s.id = k.spu_id
WHERE s.spu_code = @spu_code AND s.status = 'online'
GROUP BY s.id;