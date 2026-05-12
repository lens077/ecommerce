package application

import (
	"context"

	"github.com/lens077/ecommerce/backend/services/order/internal/biz/doamin"
	conf "github.com/lens077/ecommerce/backend/services/order/internal/conf/v1"
	"go.uber.org/zap"
)

type OrderUseCase struct {
	repo doamin.OrderRepo
	cfg  *conf.Auth
	l    *zap.Logger
}

func NewOrderUseCase(repo doamin.OrderRepo, cfg *conf.Bootstrap, logger *zap.Logger) *OrderUseCase {
	return &OrderUseCase{
		repo: repo,
		cfg:  cfg.Auth,
		l:    logger.Named("OrderUseCase"),
	}
}

// CreateOrder 提交订单
func (uc *OrderUseCase) CreateOrder(ctx context.Context, req *doamin.CreateOrderRequest) (*doamin.CreateOrderResponse, error) {
	// 这里实现核心业务逻辑：
	// 1. 校验用户身份
	// 2. 查询购物车项
	// 3. 按 merchant_id 分组 (拆单)
	// 4. 校验商品状态、库存
	// 5. 查询收货地址并生成快照
	// 6. 计算金额
	// 7. 生成订单组号、订单号
	// 8. 保存订单组、订单、订单明细
	// 9. 扣减库存
	// 10. 清空购物车
	// 11. 返回响应

	// 具体实现会在 service 层完成，这里只定义接口契约
	return nil, nil
}

// PayOrder 支付成功回调
func (uc *OrderUseCase) PayOrder(ctx context.Context, orderNo string, payChannel string, payNo string) error {
	// 支付成功后的逻辑：
	// 1. 查询订单
	// 2. 更新订单状态为 paid
	// 3. 记录订单日志
	// 4. 通知商家
	return nil
}

// ShipOrder 商家发货
func (uc *OrderUseCase) ShipOrder(ctx context.Context, orderNo string, courierCode string, courierName string, trackingNo string) error {
	// 商家发货逻辑：
	// 1. 校验商家身份 (只能操作自己的订单)
	// 2. 更新订单状态为 shipped
	// 3. 记录物流信息
	// 4. 记录订单日志
	// 5. 通知用户
	return nil
}
