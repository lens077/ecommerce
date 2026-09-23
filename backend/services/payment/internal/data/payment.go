package data

import (
	"context"
	"fmt"
	"net/url"

	"connectrpc.com/connect"
	"github.com/lens077/ecommerce/backend/services/payment/internal/biz"
	conf "github.com/lens077/ecommerce/backend/services/payment/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/payment/internal/data/models"

	"go.uber.org/zap"
)

var _ biz.PaymentRepo = (*paymentRepo)(nil)

type paymentRepo struct {
	queries *models.Queries
	data    *Data
	log     *zap.SugaredLogger
	conf    *conf.Pay
}

// NewPaymentRepo 构造 payment 仓储。下面 5 个方法均未实现，统一返回 Unimplemented。
func NewPaymentRepo(data *Data, c *conf.Pay, logger *zap.Logger) biz.PaymentRepo {
	return &paymentRepo{
		queries: models.New(data.db),
		data:    data,
		log:     logger.Sugar(),
		conf:    c,
	}
}

// errUnimplemented 统一的未实现错误,code = 12(Unimplemented)。
func errUnimplemented(method string) error {
	return connect.NewError(
		connect.CodeUnimplemented,
		fmt.Errorf("payment.v1.PaymentService/%s is not implemented yet", method),
	)
}

func (r *paymentRepo) CreatePayment(_ context.Context, _ *biz.CreatePaymentReq) (*biz.CreatePaymentResp, error) {
	return nil, errUnimplemented("CreatePayment")
}

func (r *paymentRepo) GetPaymentStatus(_ context.Context, _ *biz.GetPaymentStatusReq) (*biz.GetPaymentStatusResp, error) {
	return nil, errUnimplemented("GetPaymentStatus")
}

func (r *paymentRepo) HandlePaymentNotify(_ context.Context, _ url.Values) (*biz.PaymentNotifyResp, error) {
	return nil, errUnimplemented("HandlePaymentNotify")
}

func (r *paymentRepo) HandlePaymentCallback(_ context.Context, _ *biz.PaymentCallbackReq) (*biz.PaymentCallbackResp, error) {
	return nil, errUnimplemented("HandlePaymentCallback")
}

func (r *paymentRepo) GetPaymentByOrderID(_ context.Context, _ *biz.GetPaymentByOrderIDRequest) (*biz.Payment, error) {
	return nil, errUnimplemented("GetPaymentByOrderID")
}
