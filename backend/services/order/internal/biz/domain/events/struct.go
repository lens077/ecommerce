package events

import (
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type OrderCompletedPayload struct {
	OrderId     int64
	UserId      uuid.UUID
	TotalAmount decimal.Decimal
}
