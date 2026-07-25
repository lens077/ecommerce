-- name: GetProductDetail :one
SELECT s.id          AS spu_id,
       s.name,
       s.spu_code,
       s.specs       AS common_specs, -- 通用规格
       json_agg(k.*) AS skus
FROM products.spus s
         JOIN products.skus k ON s.id = k.spu_id
WHERE s.spu_code = @spu_code
  AND s.status = 'online'
GROUP BY s.id;