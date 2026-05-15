package constants

type StockStatusEnum string

const (
	StockStatusAvailable StockStatusEnum = "available" //	可售库存，未被任何订单占用, 字段变化:	available 为正，locked 为 0（或相对独立）
	StockStatusReserved  StockStatusEnum = "reserved"  //	预占库存，下单未支付，临时冻结, 字段变化:	available 减少，locked 不变
	StockStatusLocked    StockStatusEnum = "locked"    //	已锁定库存，支付成功，等待发货, 字段变化:	available 不变，locked 增加
	StockStatusDeducted  StockStatusEnum = "deducted"  //	已扣减库存，发货完成，实物减少, 字段变化:	on_hand 减少，locked 减少
	StockStatusReleased  StockStatusEnum = "released"  //	已释放库存，订单取消/退款，回补可用, 字段变化:	available 增加，或 locked 减少并 available 增加
)
