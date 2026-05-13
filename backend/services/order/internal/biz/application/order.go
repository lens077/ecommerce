package application

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain"
	"github.com/lens077/ecommerce/backend/services/order/internal/eventbus"
	"go.uber.org/zap"
)

type OrderCommandUseCase struct {
	repo     domain.OrderCommandRepo
	log      *zap.Logger
	eventBus *eventbus.EventBus
}
type OrderQueryUseCase struct {
	repo     domain.OrderQueryRepo
	log      *zap.Logger
	eventBus *eventbus.EventBus
}

func (uc *OrderQueryUseCase) GetOrderByNo(ctx context.Context, orderNo string) (*domain.OrderDTO, error) {
	return uc.repo.GetOrderByNo(ctx, orderNo)
}

func NewOrderCommandUseCase(repo domain.OrderCommandRepo, logger *zap.Logger, eventBus *eventbus.EventBus) *OrderCommandUseCase {
	return &OrderCommandUseCase{
		repo:     repo,
		log:      logger.Named("OrderUseCase"),
		eventBus: eventBus,
	}
}

func NewOrderQueryUseCase(repo domain.OrderQueryRepo, logger *zap.Logger, eventBus *eventbus.EventBus) *OrderQueryUseCase {
	return &OrderQueryUseCase{
		repo:     repo,
		log:      logger.Named("OrderUseCase"),
		eventBus: eventBus,
	}
}

// CreateOrder 提交订单
func (uc *OrderCommandUseCase) CreateOrder(ctx context.Context, req *domain.CreateOrderRequest) (*domain.CreateOrderResponse, error) {
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
func (uc *OrderCommandUseCase) PayOrder(ctx context.Context, orderNo string, payChannel string, payNo string) error {
	// 支付成功后的逻辑：
	// 1. 查询订单
	// 2. 更新订单状态为 paid
	// 3. 记录订单日志
	// 4. 通知商家
	return nil
}

// ShipOrder 商家发货
func (uc *OrderCommandUseCase) ShipOrder(ctx context.Context, orderNo string, courierCode string, courierName string, trackingNo string) error {
	// 商家发货逻辑：
	// 1. 校验商家身份 (只能操作自己的订单)
	// 2. 更新订单状态为 shipped
	// 3. 记录物流信息
	// 4. 记录订单日志
	// 5. 通知用户
	return nil
}

func (uc *OrderCommandUseCase) CompleteOrder(ctx context.Context, orderNo string) error {
	// 通过命令仓储加载聚合根
	order, err := uc.repo.GetOrderByNo(ctx, orderNo)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrOrderNotFound):
			return connect.NewError(connect.CodeNotFound, err)
		default:
			// 可以在这里包装一个具体的 Unknown 描述，或者直接返回
			return connect.NewError(connect.CodeUnknown, err)
		}
	}

	// 调用聚合根的业务方法
	if err := order.Complete(); err != nil {
		switch {
		case errors.Is(err, domain.ErrOrderNotFound):
			return connect.NewError(connect.CodeNotFound, err)
		default:
			// 可以在这里包装一个具体的 Unknown 描述，或者直接返回
			return connect.NewError(connect.CodeUnknown, err)
		}
	}

	// 持久化
	if err := uc.repo.SaveOrder(ctx, order); err != nil {
		return fmt.Errorf("save order: %w", err)
	}

	// 发布聚合产生的所有领域事件
	for _, evt := range order.Events() {
		// 将领域事件负载发布到对应投影
		if err := uc.eventBus.Publish("OrderCompleted", evt); err != nil {
			return fmt.Errorf("publish event: %w", err)
		}
	}

	// 事件发布后，驱动异步处理器执行
	uc.eventBus.Store().Publish()
	return nil
}
