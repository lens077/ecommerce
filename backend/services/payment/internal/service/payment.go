package service

import (
	"context"
	"net/url"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/payment/v1"
	"github.com/lens077/ecommerce/backend/api/payment/v1/paymentv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/payment/internal/biz"
	"github.com/lens077/ecommerce/backend/services/payment/internal/pkg/reqctx"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PaymentService struct {
	uc  *biz.PaymentUseCase
	log *zap.SugaredLogger
}

// CreatePayment 创建支付订单
func (s *PaymentService) CreatePayment(ctx context.Context, c *connect.Request[v1.CreatePaymentRequest]) (*connect.Response[v1.CreatePaymentResponse], error) {
	req := c.Msg
	customerId, err := uuid.Parse(req.CustomerId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "无效的用户ID")
	}

	s.log.Debugf("customerId%v", customerId)

	// merchantId, err := uuid.Parse(req.MerchantId)
	// if err != nil {
	// 	return nil, status.Error(codes.InvalidArgument, "无效的商家ID")
	// }

	// 从上下文或请求获取订单ID
	var orderID int64
	if req.OrderId != 0 {
		orderID = req.OrderId
	} else {
		return nil, status.Error(codes.InvalidArgument, "订单ID不能为空")
	}

	// 创建支付请求
	// merchanVersions := make([]int64, 0, len(req.MerchanVersion))
	createReq := &biz.CreatePaymentReq{
		OrderID:    orderID,
		CustomerID: customerId,
		// MerchantID:      merchantId,
		Amount:          req.Amount,
		Currency:        req.Currency,
		Subject:         req.Subject,
		ReturnURL:       req.ReturnUrl,
		FreezeId:        req.FreezeId,
		CustomerVersion: req.CustomerVersion,
		MerchanVersions: req.MerchantVersions,
	}

	// 调用业务逻辑
	result, err := s.uc.CreatePayment(ctx, createReq)
	if err != nil {
		s.log.Errorf("Failed to create payment: %v", err)
		return nil, err
	}

	response := &v1.CreatePaymentResponse{
		PaymentId: result.Payment.ID,
		PayUrl:    result.Payment.PayURL,
	}
	// 返回创建结果
	return connect.NewResponse(response), nil
}

// GetPaymentStatus 查询支付状态
func (s *PaymentService) GetPaymentStatus(ctx context.Context, c *connect.Request[v1.GetPaymentStatusRequest]) (*connect.Response[v1.GetPaymentStatusResponse], error) {
	req := c.Msg
	// 转换请求
	getReq := &biz.GetPaymentStatusReq{
		PaymentID: req.PaymentId,
	}

	// 调用业务逻辑
	resp, err := s.uc.GetPaymentStatus(ctx, getReq)
	if err != nil {
		s.log.Errorf("Failed to get payment status: %v", err)
		return nil, err
	}

	// 转换支付状态
	var payStatus v1.PaymentStatus
	switch resp.Payment.Status {
	case constants.PaymentStatusPending:
		payStatus = v1.PaymentStatus_PAYMENT_STATUS_PENDING
	case constants.PaymentStatusProcessing:
		payStatus = v1.PaymentStatus_PAYMENT_STATUS_PROCESSING
	case constants.PaymentStatusSuccess:
		payStatus = v1.PaymentStatus_PAYMENT_STATUS_SUCCESS
	case constants.PaymentStatusFailed:
		payStatus = v1.PaymentStatus_PAYMENT_STATUS_FAILED
	case constants.PaymentStatusClosed:
		payStatus = v1.PaymentStatus_PAYMENT_STATUS_CLOSED
	default:
		payStatus = v1.PaymentStatus_PAYMENT_STATUS_UNKNOWN
	}

	// 返回结果
	response := &v1.GetPaymentStatusResponse{
		PaymentId: resp.Payment.ID,
		OrderId:   resp.Payment.OrderID,
		Status:    payStatus,
		TradeNo:   resp.Payment.TradeNo,
	}
	return connect.NewResponse(response), nil
}

// HandlePaymentNotify 处理支付通知
func (s *PaymentService) HandlePaymentNotify(ctx context.Context, c *connect.Request[v1.UrlValues]) (*connect.Response[v1.HandlePaymentNotifyResponse], error) {
	req := c.Msg
	s.log.Infof("service HandlePaymentNotify: %v", req)

	// 1. 从 context 中获取原始的 HTTP 请求
	httpReq := reqctx.HTTPRequest(ctx) // 或者你直接写获取逻辑
	values := make(url.Values)

	if httpReq == nil {
		s.log.Warn("no http request in context, cannot read form data")
	} else {
		// 2. 确保表单已解析（中间件已经解析过，但再调用一次也安全）
		if err := httpReq.ParseForm(); err != nil {
			s.log.Errorf("parse form error: %v", err)
		} else {
			// 3. 从 PostForm 中获取所有表单字段
			// 注意：支付宝回调参数在 PostForm 中（URL-encoded 表单）
			for k, v := range httpReq.PostForm {
				values[k] = v
			}
			s.log.Infof("received form data: %v", values)
		}
	}
	// ProtoToUrlValues(values)
	s.log.Infof("service HandlePaymentNotify values: %v", values)
	// 转换请求
	// notifyReq := &constants.PaymentNotifyReq{
	// 	AppID:       req.AppId,
	// 	AuthAppId:   req.AuthAppId,
	// 	TradeNo:     req.TradeNo,
	// 	Charset:     req.Charset,
	// 	Method:      req.Method,
	// 	Sign:        req.Sign,
	// 	SignType:    req.SignType,
	// 	OutTradeNo:  req.OutTradeNo,
	// 	TotalAmount: req.TotalAmount,
	// 	SellerId:    req.SellerId,
	// 	Params:      values,
	// }

	// 调用业务逻辑
	resp, err := s.uc.HandlePaymentNotify(ctx, values)
	if err != nil {
		s.log.Errorf("Failed to handle payment notify: %v", err)
		return nil, err
	}

	// 返回结果
	response := &v1.HandlePaymentNotifyResponse{
		Success: resp.Success,
		Message: resp.Message,
	}
	return connect.NewResponse(response), nil
}

func ProtoToUrlValues(protoData *v1.UrlValues) url.Values {
	values := url.Values{}
	for _, pair := range protoData.Pairs {
		for _, v := range pair.Values {
			values.Add(pair.Key, v)
		}
	}
	return values
}

func copyValues(dst, src url.Values) {
	for k, vs := range src {
		dst[k] = append(dst[k], vs...)
	}
}

// HandlePaymentCallback 处理支付回调
func (s *PaymentService) HandlePaymentCallback(ctx context.Context, c *connect.Request[v1.HandlePaymentCallbackRequest]) (*connect.Response[v1.HandlePaymentCallbackResponse], error) {
	req := c.Msg
	s.log.Infof("service HandlePaymentCallback: %v", req)

	// 1. 从 context 中获取原始的 HTTP 请求
	httpReq := reqctx.HTTPRequest(ctx) // 或者你直接写获取逻辑
	values := make(url.Values)

	if httpReq == nil {
		s.log.Warn("no http request in context, cannot read form data")
	} else {
		// 2. 确保表单已解析（中间件已经解析过，但再调用一次也安全）
		if err := httpReq.ParseForm(); err != nil {
			s.log.Errorf("parse form error: %v", err)
		} else {
			// 3. 从 PostForm 中获取所有表单字段
			// 注意：支付宝回调参数在 PostForm 中（URL-encoded 表单）
			for k, v := range httpReq.PostForm {
				values[k] = v
			}
			s.log.Infof("received form data: %v", values)
		}
	}
	s.log.Infof("service values: %v", values)

	// 转换请求
	callbackReq := &biz.PaymentCallbackReq{
		Params:      req.Params,
		OutTradeNo:  req.OutTradeNo,
		TradeNo:     req.TradeNo,
		TotalAmount: req.TotalAmount,
		Subject:     req.Subject,
		TradeStatus: req.TradeStatus,
	}

	// 调用业务逻辑
	resp, err := s.uc.HandlePaymentCallback(ctx, callbackReq)
	if err != nil {
		s.log.Errorf("Failed to handle payment callback: %v", err)
		return nil, err
	}

	// 返回结果
	response := &v1.HandlePaymentCallbackResponse{
		Success: resp.Success,
		Message: resp.Message,
	}
	return connect.NewResponse(response), nil
}

var _ paymentv1connect.PaymentServiceHandler = (*PaymentService)(nil)

func NewPaymentService(uc *biz.PaymentUseCase, logger *zap.Logger) paymentv1connect.PaymentServiceHandler {
	return &PaymentService{uc: uc, log: logger.Sugar()}
}
