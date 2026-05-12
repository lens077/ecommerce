package events

import "github.com/google/uuid"

type OrderCompletedPayload struct {
	OrderId     int64
	UserId      uuid.UUID
	SpuId       int64
	Quantity    int64
	TotalAmount int64
}
