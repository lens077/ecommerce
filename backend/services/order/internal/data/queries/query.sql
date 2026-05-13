-- name: GetOrderByNo :one
SELECT *
FROM orders.order_main
WHERE order_no = $1;
