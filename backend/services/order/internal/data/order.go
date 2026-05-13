package data

import (
	"context"
	"errors"
	"fmt"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/lens077/ecommerce/backend/services/order/constants"
	"github.com/lens077/ecommerce/backend/services/order/internal/biz/domain"
	"github.com/lens077/ecommerce/backend/services/order/internal/data/models"
	"github.com/lens077/ecommerce/backend/services/order/internal/pkg/money"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var _ domain.OrderCommandRepo = (*orderCommandRepo)(nil)
var _ domain.OrderQueryRepo = (*orderQueryRepo)(nil)

type orderCommandRepo struct {
	queries *models.Queries
	rdb     *redis.Client
	auth    *casdoorsdk.Client
	log     *zap.SugaredLogger
}

func (o orderCommandRepo) GetOrderByNo(ctx context.Context, orderNo string) (*domain.OrderRoot, error) {
	o.log.Debugw("get order by no", "orderNo", orderNo)
	order, err := o.queries.GetOrderByNo(ctx, orderNo)
	if err != nil {
		if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok {
			switch pgErr.Code {
			// case "42P01":
			// 	return nil, domain.ErrOrderNotFound
			default:
				return nil, fmt.Errorf("databases error: %w", err)
			}
		}
		return nil, err
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

func (o orderCommandRepo) SaveOrder(ctx context.Context, order *domain.OrderRoot) error {
	o.log.Debugw("save order", "order", order)
	return nil
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
	queries *models.Queries
	rdb     *redis.Client
	auth    *casdoorsdk.Client
	log     *zap.SugaredLogger
}

func (o orderQueryRepo) GetOrderGroupByNo(ctx context.Context, groupNo string) (*domain.OrderGroupRoot, error) {
	// TODO implement me
	panic("implement me")
}

func (o orderQueryRepo) GetOrderByNo(ctx context.Context, orderNo string) (*domain.OrderDTO, error) {
	o.log.Debugw("get order by no", "orderNo", orderNo)
	order, err := o.queries.GetOrderByNo(ctx, orderNo)
	if err != nil {
		if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok {
			switch pgErr.Code {
			// case "42P01":
			// 	return nil, domain.ErrOrderNotFound
			default:
				return nil, fmt.Errorf("databases error: %w", err)
			}
		}
		return nil, err
	}

	totalAmount, err := money.NumericToFloat(order.TotalAmount)
	if err != nil {
		return nil, fmt.Errorf("type numeric to float: %w", err)
	}
	return &domain.OrderDTO{
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
		queries: models.New(data.db),
		rdb:     data.rdb,
		log:     logger.Sugar(),
	}
}

func NewQueryOrderRepo(data *Data, logger *zap.Logger) domain.OrderQueryRepo {
	return &orderQueryRepo{
		queries: models.New(data.db),
		rdb:     data.rdb,
		log:     logger.Sugar(),
	}
}
