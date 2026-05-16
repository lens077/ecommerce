package kafka

import (
	"time"

	"github.com/google/uuid"
)

type OrderCreatedEvent struct {
	EventID    string          `json:"event_id"`
	OrderID    int64           `json:"order_id"`
	OrderNo    string          `json:"order_no"`
	UserID     uuid.UUID       `json:"user_id"`
	SKUItems   []SKUCartItem  `json:"sku_items"`
	TotalAmount float64       `json:"total_amount"`
	CreatedAt  time.Time       `json:"created_at"`
}

type SKUCartItem struct {
	SkuID     int64  `json:"sku_id"`
	SpuID     int64  `json:"spu_id"`
	Quantity  int    `json:"quantity"`
	Price     float64 `json:"price"`
}
