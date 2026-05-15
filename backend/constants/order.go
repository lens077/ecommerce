package constants

// OrderStatusEnum 订单主状态枚举
type OrderStatusEnum string

// ShippingStatusEnum 订单物流状态枚举
const (
	OrderStatusPendingPayment  OrderStatusEnum = "pending_payment"  // 待支付
	OrderStatusPaid            OrderStatusEnum = "paid"             // 已支付
	OrderStatusPendingShipment OrderStatusEnum = "pending_shipment" // 待发货
	OrderStatusShipped         OrderStatusEnum = "shipped"          // 已发货
	OrderStatusCompleted       OrderStatusEnum = "completed"        // 已完成
	OrderStatusCancelled       OrderStatusEnum = "cancelled"        // 已取消
	OrderStatusRefunding       OrderStatusEnum = "refunding"        // 退款中
	OrderStatusRefunded        OrderStatusEnum = "refunded"         // 已退款
)

type ShippingStatusEnum string

const (
	ShippingStatusUnshipped ShippingStatusEnum = "unshipped"  // 未发货
	ShippingStatusShipped   ShippingStatusEnum = "shipped"    // 已发货
	ShippingStatusInTransit ShippingStatusEnum = "in_transit" // 运输中
	ShippingStatusDelivered ShippingStatusEnum = "delivered"  // 已签收
	ShippingStatusReturning ShippingStatusEnum = "returning"  // 退货中
	ShippingStatusReturned  ShippingStatusEnum = "returned"   // 已退货
)
