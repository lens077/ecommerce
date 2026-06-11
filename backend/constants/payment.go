package constants

// PaymentStatus 支付状态
type PaymentStatus string

// TradeStatus 支付宝交易状态
type TradeStatus string

// 通用支付状态
const (
	PaymentStatusPending    PaymentStatus = "pending"
	PaymentStatusProcessing PaymentStatus = "processing"
	PaymentStatusSuccess    PaymentStatus = "success"
	PaymentStatusFailed     PaymentStatus = "failed"
	PaymentStatusClosed     PaymentStatus = "closed"
)

// 支付宝支付状态
const (
	AliPayStatusPending PaymentStatus = "WAIT_BUYER_PAY"
	AliPayStatusClosed  PaymentStatus = "TRADE_CLOSED"
	AliPayStatusSuccess PaymentStatus = "TRADE_SUCCESS"
)
