package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/lens077/ecommerce/backend/services/order/constants"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain/events"
	"github.com/shopspring/decimal"
)

// 业务错误定义
var (
	ErrOrderAlreadyExists = errors.New("[Order] 订单已存在")
	ErrOrderNotFound      = errors.New("[Order] 订单不存在")
	ErrNotOrderStatusPaid = errors.New("[Order] 只能完成已付款订单")
	ErrOrderGroupNotFound = errors.New("[Order] 订单组不存在")
	ErrAuthFailed         = errors.New("[Order] 身份认证失败")
	ErrInsufficientStock  = errors.New("[Order] 库存不足")
	ErrProductOffline     = errors.New("[Order] 商品已下架")
	ErrAddressNotFound    = errors.New("[Order] 收货地址不存在")
	ErrCartEmpty          = errors.New("[Order] 购物车为空")
	ErrMerchantMismatch   = errors.New("[Order] 商家不匹配")
)

// 领域模型

// OrderGroupRoot 订单组聚合根
// 用户一次提交购物车可能包含多个商家的商品，
// 系统按商家拆单，生成一个 OrderGroupRoot 和多个 OrderRoot (子订单)
type OrderGroupRoot struct {
	Id             int64     // 订单组自增主键ID
	GroupNo        string    // 订单组号，业务唯一标识，如：OG202605090001
	UserId         string    // 下单用户ID，来自Casdoor统一身份认证
	TotalAmount    float64   // 订单组商品总金额（所有子订单商品金额合计，不含运费/优惠）
	FreightAmount  float64   // 订单组总运费（所有子订单运费合计）
	DiscountAmount float64   // 订单组总优惠金额（所有子订单优惠合计）
	PayAmount      float64   // 订单组实付总金额（用户实际需要支付的金额）
	CreatedAt      time.Time // 创建时间
	UpdatedAt      time.Time // 更新时间
}

// OrderRoot 订单主聚合根 (对应数据库 order_main 表)
// 一个 OrderGroupRoot 包含多个 OrderRoot，每个 OrderRoot 对应一个商家
type OrderRoot struct {
	Id             int64                        // 订单自增主键ID
	OrderNo        string                       // 订单号，业务唯一标识，如：OM202605090001
	GroupNo        string                       // 关联订单组号 (业务关联，对应 OrderGroupRoot.GroupNo)
	MerchantId     uuid.UUID                    // 商家ID (数据隔离核心字段)
	MerchantName   string                       // 商家名称快照 (保留下单时的名称，防止后续商家改名)
	UserId         uuid.UUID                    // 下单用户ID，来自Casdoor
	OrderItems     []OrderItem                  // 订单明细列表 (聚合根包含子实体)
	OrderStatus    constants.OrderStatusEnum    // 订单主状态
	ShippingStatus constants.ShippingStatusEnum // 订单物流状态
	Address        Address                      // 收货地址快照 (值对象)
	TotalAmount    float64                      // 该商家子订单商品总金额
	FreightAmount  float64                      // 该商家子订单运费
	DiscountAmount float64                      // 该商家子订单优惠金额
	PayAmount      float64                      // 该商家子订单实付金额
	CourierCode    string                       // 快递公司编码 (如：SF、YTO)
	CourierName    string                       // 快递公司名称 (如：顺丰速运)
	TrackingNo     string                       // 物流单号
	ShippedAt      *time.Time                   // 发货时间 (指针类型，允许为空)
	DeliveredAt    *time.Time                   // 签收时间 (指针类型，允许为空)
	PayChannel     string                       // 支付渠道 (如：alipay/wechat)
	PayNo          string                       // 支付机构返回的支付单号
	PaidAt         *time.Time                   // 支付成功时间 (指针类型，允许为空)
	PayDeadline    time.Time                    // 支付截止时间 (超时自动取消)
	Remark         string                       // 用户下单备注
	MerchantRemark string                       // 商家备注
	CreatedAt      time.Time                    // 创建时间
	UpdatedAt      time.Time                    // 更新时间

	// 事件
	events []any
}

type OrderDTO struct {
	Id             int64                        // 订单自增主键ID
	OrderNo        string                       // 订单号，业务唯一标识，如：OM202605090001
	GroupNo        string                       // 关联订单组号 (业务关联，对应 OrderGroupRoot.GroupNo)
	MerchantId     uuid.UUID                    // 商家ID (数据隔离核心字段)
	MerchantName   string                       // 商家名称快照 (保留下单时的名称，防止后续商家改名)
	UserId         uuid.UUID                    // 下单用户ID，来自Casdoor
	OrderItems     []OrderItem                  // 订单明细列表 (聚合根包含子实体)
	OrderStatus    constants.OrderStatusEnum    // 订单主状态
	ShippingStatus constants.ShippingStatusEnum // 订单物流状态
	Address        Address                      // 收货地址快照 (值对象)
	TotalAmount    float64                      // 该商家子订单商品总金额
	FreightAmount  float64                      // 该商家子订单运费
	DiscountAmount float64                      // 该商家子订单优惠金额
	PayAmount      float64                      // 该商家子订单实付金额
	CourierCode    string                       // 快递公司编码 (如：SF、YTO)
	CourierName    string                       // 快递公司名称 (如：顺丰速运)
	TrackingNo     string                       // 物流单号
	ShippedAt      *time.Time                   // 发货时间 (指针类型，允许为空)
	DeliveredAt    *time.Time                   // 签收时间 (指针类型，允许为空)
	PayChannel     string                       // 支付渠道 (如：alipay/wechat)
	PayNo          string                       // 支付机构返回的支付单号
	PaidAt         *time.Time                   // 支付成功时间 (指针类型，允许为空)
	PayDeadline    time.Time                    // 支付截止时间 (超时自动取消)
	Remark         string                       // 用户下单备注
	MerchantRemark string                       // 商家备注
	CreatedAt      time.Time                    // 创建时间
	UpdatedAt      time.Time                    // 更新时间
}

// OrderItem 订单明细实体 (对应数据库 order_item 表)
// 一个 OrderRoot 包含多个 OrderItem
type OrderItem struct {
	Id              int64          // 订单明细自增主键ID
	OrderId         int64          // 关联订单主表ID (业务关联)
	OrderNo         string         // 冗余订单号，方便查询
	MerchantId      int64          // 商家ID (数据隔离)
	SpuId           int64          // 商品SPU_ID
	SkuId           int64          // 商品SKU_ID
	SpuName         string         // SPU名称快照 (保留下单时的商品名)
	SkuName         string         // SKU名称快照 (保留下单时的规格名)
	SkuAttributes   map[string]any // SKU销售属性快照 (JSONB映射，如：{"颜色": "黑", "尺寸": "XL"})
	SkuThumbnailUrl string         // SKU缩略图快照
	Price           float64        // 下单时的单价 (快照，防止后续商品调价)
	CostPrice       float64        // 下单时的成本价 (快照，用于商家财务分析)
	Quantity        int            // 购买数量
	TotalAmount     float64        // 小计金额 (Price * Quantity)
	CreatedAt       time.Time      // 创建时间
}

// OrderLog 订单状态变更日志实体 (对应数据库 order_log 表)
// 用于审计和追溯订单的所有状态变更
type OrderLog struct {
	Id           int64                      // 日志自增主键ID
	OrderId      int64                      // 关联订单主表ID (业务关联)
	OrderNo      string                     // 冗余订单号
	MerchantId   int64                      // 商家ID (数据隔离)
	OldStatus    *constants.OrderStatusEnum // 变更前状态 (指针类型，创建订单时为空)
	NewStatus    constants.OrderStatusEnum  // 变更后状态
	OperatorType constants.OperatorTypeEnum // 操作者类型
	OperatorId   string                     // 操作者ID (用户ID/商家ID/管理员ID)
	Remark       string                     // 变更备注 (如："用户支付成功"、"超时自动取消")
	CreatedAt    time.Time                  // 创建时间
}

// Address 收货地址值对象 (对应数据库 address_* 字段快照)
// 订单必须保存地址快照，不能只存地址ID，防止后续用户修改地址导致历史订单信息变化
type Address struct {
	Name       string // 收货人姓名
	Phone      string // 收货人电话
	Province   string // 省/直辖市/自治区
	City       string // 城市
	District   string // 区/县
	Detail     string // 详细地址
	PostalCode string // 邮编 (可选)
	FullText   string // 完整地址文本 (方便前端直接展示，如："广东省深圳市南山区xxx 张三 13800138000")
}

// 请求/响应模型

// 提交订单
type (
	CreateOrderRequest struct {
		CartItemIDs []int64 // 选中的购物车项ID列表 (核心：用户从购物车勾选的商品)
		AddressID   int64   // 收货地址ID (用于查询地址并生成快照)
		Remark      string  // 用户备注 (可选)
	}
	CreateOrderResponse struct {
		GroupNo     string    // 订单组号
		OrderNos    []string  // 子订单号列表 (可能包含多个商家的订单)
		PayAmount   float64   // 实付总金额
		PayDeadline time.Time // 支付截止时间
	}
)

type (
	CompleteOrderRequest struct {
	}

	CompleteOrderResponse struct {
	}
)

// 仓储接口

// OrderCommandRepo 命令仓储：负责聚合根的持久化与加载（仅用于写操作）
type OrderCommandRepo interface {
	GetOrderByNo(ctx context.Context, orderNo string) (*OrderRoot, error)
	GetOrderGroupByNo(ctx context.Context, groupNo string) (*OrderGroupRoot, error)

	// SaveOrderGroup 保存订单组
	SaveOrderGroup(ctx context.Context, group *OrderGroupRoot) error
	// SaveOrder 保存订单 (包含 OrderItems)
	SaveOrder(ctx context.Context, order *OrderRoot) error
	// UpdateOrderStatus 更新订单状态 (同时记录日志)
	UpdateOrderStatus(ctx context.Context, orderID int64, oldStatus *constants.OrderStatusEnum, newStatus constants.OrderStatusEnum, log *OrderLog) error
	// SaveOrderLog 保存订单日志
	SaveOrderLog(ctx context.Context, log *OrderLog) error
}

// OrderQueryRepo 查询仓储：不经过领域模型，直接返回前端需要的数据
type OrderQueryRepo interface {
	// GetOrderGroupByNo 根据订单组号查询
	GetOrderGroupByNo(ctx context.Context, groupNo string) (*OrderGroupRoot, error)
	// GetOrderByNo 根据订单号查询
	GetOrderByNo(ctx context.Context, orderNo string) (*OrderDTO, error)
	// GetOrdersByGroupNo 根据订单组号查询所有子订单
	GetOrdersByGroupNo(ctx context.Context, groupNo string) ([]*OrderRoot, error)
	// GetOrdersByUserID 查询用户的订单列表
	GetOrdersByUserID(ctx context.Context, userID string, page, pageSize int) ([]*OrderRoot, int64, error)
	// GetOrdersByMerchantID 查询商家的订单列表 (数据隔离)
	GetOrdersByMerchantID(ctx context.Context, merchantID int64, page, pageSize int) ([]*OrderRoot, int64, error)
}

func (o *OrderRoot) Complete() error {
	if o.OrderStatus != constants.OrderStatusPaid {
		return ErrNotOrderStatusPaid
	}
	o.OrderStatus = constants.OrderStatusCompleted
	o.events = append(o.events, events.OrderCompletedPayload{
		OrderId:     o.Id,
		UserId:      o.UserId,
		TotalAmount: decimal.Decimal{},
	})
	return nil
}

// Events 返回聚合产生的所有领域事件
func (o *OrderRoot) Events() []any {
	return o.events
}
