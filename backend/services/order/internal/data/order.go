package data

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain/events"
	"github.com/lens077/ecommerce/backend/services/order/internal/outbox"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/money"
	"go.uber.org/zap"
)

var _ domain.OrderCommandRepo = (*orderCommandRepo)(nil)
var _ domain.OrderQueryRepo = (*orderQueryRepo)(nil)

type orderCommandRepo struct {
	data *Data
	log  *zap.SugaredLogger
}

func (o orderCommandRepo) GetOrderByNo(ctx context.Context, orderNo string) (*domain.OrderRoot, error) {
	o.log.Debugw("get order by no", "orderNo", orderNo)
	db := o.data.DB(ctx)
	order, err := db.GetOrderByNo(ctx, orderNo)
	if err != nil {
		return nil, o.data.dbErrHandler.MustHandleError(err, domain.ErrOrderNotFound)
	}

	totalAmount, err := money.NumericToFloat(order.TotalAmount)
	if err != nil {
		return nil, fmt.Errorf("type numeric to float: %w", err)
	}
	return &domain.OrderRoot{
		Id:           order.ID,
		OrderNo:      order.OrderNo,
		GroupNo:      order.GroupNo,
		MerchantId:   order.MerchantID,
		MerchantName: order.MerchantName,
		UserId:       order.UserID,
		// OrderItems:     order.,
		OrderStatus:    constants.OrderStatusEnum(order.OrderStatus),
		ShippingStatus: constants.ShippingStatusEnum(order.ShippingStatus),
		Address: domain.Address{
			Name:       order.AddressName,
			Phone:      order.AddressPhone,
			Province:   order.AddressProvince,
			City:       order.AddressCity,
			District:   order.AddressDistrict,
			Detail:     order.AddressDetail,
			PostalCode: *order.AddressPostalCode,
			FullText:   order.AddressFullText,
		},
		TotalAmount: totalAmount,
		// FreightAmount:  order.FreightAmount,
		// DiscountAmount: order.DiscountAmount,
		// PayAmount:      order.PayAmount,
		// CourierCode:    order.CourierCode,
		// CourierName:    order.CourierName,
		// TrackingNo:     order.TrackingNo,
		// ShippedAt:      order.ShippedAt,
		// DeliveredAt:    order.DeliveredAt,
		// PayChannel:     order.PayChannel,
		// PayNo:          order.PayNo,
		// PaidAt:         order.PaidAt,
		PayDeadline: order.PayDeadline,
		// Remark:         order.Remark,
		// MerchantRemark: order.MerchantRemark,
		CreatedAt: order.CreatedAt,
		UpdatedAt: order.UpdatedAt,
	}, nil
}

func (o orderCommandRepo) GetOrderGroupByNo(ctx context.Context, groupNo string) (*domain.OrderGroupRoot, error) {
	// TODO implement me
	panic("implement me")
}

func (o orderCommandRepo) SaveOrderGroup(ctx context.Context, group *domain.OrderGroupRoot) error {
	o.log.Debugw("save order group", "group", group)
	return nil
}

// orderEventType 是本仓第一条领域事件的 CE type（reverse-DNS 过去式）。
// 事件目录（proto + buf）尚未落地，类型字符串在 outbox.md 里登记为临时契约；
// 换契约时同步改这里与事件目录，别只改一边。
const orderEventType = "io.lens077.ecommerce.order.completed.v1"

// SaveOrder 在**同一个事务**里写两件事：订单状态与由聚合产生的领域事件（outbox 行）。
//
// 旧实现只写状态、事件另发进程内总线，留下四个窗口（见 outbox.md）：W1 提交后崩溃
// 事件永久丢、W2 事件只在内存环、W3 反序发布、W0 handler 失败不可见。同事务写发件箱后
// 事件与状态要么都在、要么都不在；搬运交给 Debezium，进程内不再有任何缓冲。
func (o orderCommandRepo) SaveOrder(ctx context.Context, order *domain.OrderRoot) error {
	err := o.data.ExecTx(ctx, func(txCtx context.Context) error {
		tx, ok := o.data.Tx(txCtx)
		if !ok {
			// 不可达：ExecTx 一定建事务。留着是为了让「谁在连接池上直写发件箱」立刻炸。
			return fmt.Errorf("save order: no transaction in context")
		}

		// 手写 SQL：sqlc 生成需要在线 schema（sqlc.yaml 的 uri 指向运行库）。
		// 事件目录落地时把这句并进 queries/query.sql 重新生成，别留第二份真源。
		tag, execErr := tx.Exec(txCtx,
			`UPDATE orders.order_main SET order_status = $2, updated_at = now() WHERE id = $1`,
			order.Id, string(order.OrderStatus),
		)
		if execErr != nil {
			return o.data.dbErrHandler.MustHandleError(execErr, domain.ErrOrderNotFound)
		}
		if tag.RowsAffected() == 0 {
			return domain.ErrOrderNotFound
		}

		for _, payload := range order.Events() {
			ev, buildErr := orderCompletedEvent(order, payload)
			if buildErr != nil {
				return buildErr
			}
			if appendErr := outbox.Append(txCtx, tx, ev); appendErr != nil {
				return appendErr
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("save order (tx + outbox): %w", err)
	}
	return nil
}

// orderCompletedEvent 构造 CloudEvents 信封：binary mode，CE 属性走 Kafka header。
// 金额用 decimal 字符串而不是 float——事件契约里的金额类型借这次定死（TECH-RADAR §1.6）。
func orderCompletedEvent(order *domain.OrderRoot, p events.OrderCompletedPayload) (outbox.Event, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return outbox.Event{}, fmt.Errorf("generate event id: %w", err)
	}
	data, err := json.Marshal(struct {
		OrderID     int64  `json:"order_id"`
		OrderNo     string `json:"order_no"`
		UserID      string `json:"user_id"`
		TotalAmount string `json:"total_amount"`
	}{
		OrderID:     p.OrderId,
		OrderNo:     order.OrderNo,
		UserID:      p.UserId.String(),
		TotalAmount: p.TotalAmount.String(),
	})
	if err != nil {
		return outbox.Event{}, fmt.Errorf("marshal order completed payload: %w", err)
	}

	occurredAt := time.Now().UTC()
	return outbox.Event{
		ID:            id,
		Source:        "/services/order",
		Type:          orderEventType,
		Subject:       "order/" + order.OrderNo,
		AggregateType: "order",
		AggregateID:   order.OrderNo,
		PartitionKey:  order.OrderNo,
		Payload:       data,
		Headers: map[string]string{
			"ce_specversion": "1.0",
			"ce_id":          id.String(),
			"ce_source":      "/services/order",
			"ce_type":        orderEventType,
			"ce_subject":     "order/" + order.OrderNo,
			"ce_time":        occurredAt.Format(time.RFC3339Nano),
			"content-type":   "application/json",
		},
		OccurredAt: occurredAt,
	}, nil
}

func (o orderCommandRepo) UpdateOrderStatus(ctx context.Context, orderID int64, oldStatus *constants.OrderStatusEnum, newStatus constants.OrderStatusEnum, log *domain.OrderLog) error {
	// TODO implement me
	panic("implement me")
}

func (o orderCommandRepo) SaveOrderLog(ctx context.Context, log *domain.OrderLog) error {
	// TODO implement me
	panic("implement me")
}

type orderQueryRepo struct {
	data *Data
	log  *zap.SugaredLogger
}

func (o orderQueryRepo) GetOrderGroupByNo(ctx context.Context, groupNo string) (*domain.OrderGroupRoot, error) {
	// TODO implement me
	panic("implement me")
}

func (o orderQueryRepo) GetOrderByNo(ctx context.Context, orderNo string) (*domain.OrderRoot, error) {
	o.log.Debugw("get order by no", "orderNo", orderNo)
	db := o.data.DB(ctx)
	order, err := db.GetOrderByNo(ctx, orderNo)
	if err != nil {
		return nil, o.data.dbErrHandler.MustHandleError(err, domain.ErrOrderNotFound)
	}

	totalAmount, err := money.NumericToFloat(order.TotalAmount)
	if err != nil {
		return nil, fmt.Errorf("type numeric to float: %w", err)
	}
	return &domain.OrderRoot{
		Id:           order.ID,
		OrderNo:      order.OrderNo,
		GroupNo:      order.GroupNo,
		MerchantId:   order.MerchantID,
		MerchantName: order.MerchantName,
		UserId:       order.UserID,
		// OrderItems:     order.,
		OrderStatus:    constants.OrderStatusEnum(order.OrderStatus),
		ShippingStatus: constants.ShippingStatusEnum(order.ShippingStatus),
		Address: domain.Address{
			Name:       order.AddressName,
			Phone:      order.AddressPhone,
			Province:   order.AddressProvince,
			City:       order.AddressCity,
			District:   order.AddressDistrict,
			Detail:     order.AddressDetail,
			PostalCode: *order.AddressPostalCode,
			FullText:   order.AddressFullText,
		},
		TotalAmount: totalAmount,
		// FreightAmount:  order.FreightAmount,
		// DiscountAmount: order.DiscountAmount,
		// PayAmount:      order.PayAmount,
		// CourierCode:    order.CourierCode,
		// CourierName:    order.CourierName,
		// TrackingNo:     order.TrackingNo,
		// ShippedAt:      order.ShippedAt,
		// DeliveredAt:    order.DeliveredAt,
		// PayChannel:     order.PayChannel,
		// PayNo:          order.PayNo,
		// PaidAt:         order.PaidAt,
		PayDeadline: order.PayDeadline,
		// Remark:         order.Remark,
		// MerchantRemark: order.MerchantRemark,
		CreatedAt: order.CreatedAt,
		UpdatedAt: order.UpdatedAt,
	}, nil
}

func (o orderQueryRepo) GetOrdersByGroupNo(ctx context.Context, groupNo string) ([]*domain.OrderRoot, error) {
	// TODO implement me
	panic("implement me")
}

func (o orderQueryRepo) GetOrdersByUserID(ctx context.Context, userID string, page, pageSize int) ([]*domain.OrderRoot, int64, error) {
	// TODO implement me
	panic("implement me")
}

func (o orderQueryRepo) GetOrdersByMerchantID(ctx context.Context, merchantID int64, page, pageSize int) ([]*domain.OrderRoot, int64, error) {
	// TODO implement me
	panic("implement me")
}

func NewCommandOrderRepo(data *Data, logger *zap.Logger) domain.OrderCommandRepo {
	return &orderCommandRepo{
		data: data,
		log:  logger.Sugar(),
	}
}

func NewQueryOrderRepo(data *Data, logger *zap.Logger) domain.OrderQueryRepo {
	return &orderQueryRepo{
		data: data,
		log:  logger.Sugar(),
	}
}
