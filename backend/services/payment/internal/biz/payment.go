package biz

import (
	"context"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/lens077/ecommerce/backend/constants"
)

// Payment 支付记录
type Payment struct {
	ID         int64
	OrderID    int64
	CustomerID uuid.UUID
	Amount     float64
	Currency   string
	Subject    string
	Status     constants.PaymentStatus
	TradeNo    string // 支付宝交易号
	PayURL     string
	NotifyTime time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// CreatePaymentReq 创建支付请求
type CreatePaymentReq struct {
	OrderID         int64
	CustomerID      uuid.UUID
	Amount          string
	Currency        string
	Subject         string
	ReturnURL       string
	FreezeId        int64
	CustomerVersion int64
	MerchanVersions []int64
}

// CreatePaymentResp 创建支付响应
type CreatePaymentResp struct {
	Payment *Payment
}

type (
	Notification struct {
		AuthAppId           string                `json:"auth_app_id"`
		NotifyTime          string                `json:"notify_time"`
		NotifyType          string                `json:"notify_type"`
		NotifyId            string                `json:"notify_id"`
		AppId               string                `json:"app_id"`
		Charset             string                `json:"charset"`
		Version             string                `json:"version"`
		SignType            string                `json:"sign_type"`
		Sign                string                `json:"sign"`
		TradeNo             string                `json:"trade_no"`
		OutTradeNo          string                `json:"out_trade_no"`
		OutRequestNo        string                `json:"out_request_no"`
		OutBizNo            string                `json:"out_biz_no"`
		BuyerId             string                `json:"buyer_id"`
		BuyerLogonId        string                `json:"buyer_logon_id"`
		BuyerOpenId         string                `json:"buyer_open_id"`
		SellerId            string                `json:"seller_id"`
		SellerEmail         string                `json:"seller_email"`
		TradeStatus         constants.TradeStatus `json:"trade_status"`
		RefundStatus        string                `json:"refund_status"`
		RefundReason        string                `json:"refund_reason"`
		RefundAmount        string                `json:"refund_amount"`
		TotalAmount         string                `json:"total_amount"`
		ReceiptAmount       string                `json:"receipt_amount"`
		InvoiceAmount       string                `json:"invoice_amount"`
		BuyerPayAmount      string                `json:"buyer_pay_amount"`
		PointAmount         string                `json:"point_amount"`
		RefundFee           string                `json:"refund_fee"`
		Subject             string                `json:"subject"`
		Body                string                `json:"body"`
		GmtCreate           string                `json:"gmt_create"`
		GmtPayment          string                `json:"gmt_payment"`
		GmtRefund           string                `json:"gmt_refund"`
		GmtClose            string                `json:"gmt_close"`
		FundBillList        string                `json:"fund_bill_list"`
		PassbackParams      string                `json:"passback_params"`
		VoucherDetailList   string                `json:"voucher_detail_list"`
		AgreementNo         string                `json:"agreement_no"`
		ExternalAgreementNo string                `json:"external_agreement_no"`
		DBackStatus         string                `json:"dback_status"`
		DBackAmount         string                `json:"dback_amount"`
		BankAckTime         string                `json:"bank_ack_time"`
	}
)

// PaymentNotifyReq 支付通知请求
type PaymentNotifyReq struct {
	AppID       string
	AuthAppId   string
	TradeNo     string
	Charset     string
	Method      string
	Sign        string
	SignType    string
	OutTradeNo  string
	TotalAmount string
	SellerId    string
	Params      map[string][]string
}

// PaymentNotifyResp 支付通知响应
type PaymentNotifyResp struct {
	Success bool
	Message string
}

// PaymentCallbackReq 支付回调请求
type PaymentCallbackReq struct {
	Params      map[string]string
	OutTradeNo  string
	TradeNo     string
	TotalAmount string
	Subject     string
	TradeStatus string
}

// PaymentCallbackResp 支付回调响应
type PaymentCallbackResp struct {
	Success bool
	Message string
}

// GetPaymentStatusReq 查询支付状态请求
type GetPaymentStatusReq struct {
	PaymentID int64
}

// GetPaymentStatusResp 查询支付状态响应
type GetPaymentStatusResp struct {
	Payment *Payment
}

type GetPaymentByOrderIDRequest struct {
	OrderID     int64
	TotalAmount string
}

// PaymentRepo 支付仓储接口
type PaymentRepo interface {
	// CreatePayment 创建支付记录
	CreatePayment(ctx context.Context, req *CreatePaymentReq) (*CreatePaymentResp, error)
	// GetPaymentStatus 查询支付状态
	GetPaymentStatus(ctx context.Context, req *GetPaymentStatusReq) (*GetPaymentStatusResp, error)
	// HandlePaymentNotify 处理支付通知
	HandlePaymentNotify(ctx context.Context, req url.Values) (*PaymentNotifyResp, error)
	// HandlePaymentCallback 处理支付回调
	HandlePaymentCallback(ctx context.Context, req *PaymentCallbackReq) (*PaymentCallbackResp, error)
	// GetPaymentByOrderID 根据订单ID查询支付记录
	GetPaymentByOrderID(ctx context.Context, req *GetPaymentByOrderIDRequest) (*Payment, error)
}

type PaymentUseCase struct {
	repo PaymentRepo
}

func NewPaymentUseCase(repo PaymentRepo) *PaymentUseCase {
	return &PaymentUseCase{
		repo: repo,
	}
}

// CreatePayment 创建支付
func (uc *PaymentUseCase) CreatePayment(ctx context.Context, req *CreatePaymentReq) (*CreatePaymentResp, error) {
	return uc.repo.CreatePayment(ctx, req)
}

// GetPaymentStatus 查询支付状态
func (uc *PaymentUseCase) GetPaymentStatus(ctx context.Context, req *GetPaymentStatusReq) (*GetPaymentStatusResp, error) {
	return uc.repo.GetPaymentStatus(ctx, req)
}

// HandlePaymentNotify 处理支付通知
func (uc *PaymentUseCase) HandlePaymentNotify(ctx context.Context, req url.Values) (*PaymentNotifyResp, error) {
	return uc.repo.HandlePaymentNotify(ctx, req)
}

// HandlePaymentCallback 处理支付回调
func (uc *PaymentUseCase) HandlePaymentCallback(ctx context.Context, req *PaymentCallbackReq) (*PaymentCallbackResp, error) {
	return uc.repo.HandlePaymentCallback(ctx, req)
}

// GetPaymentByOrderID 根据订单ID查询支付记录
func (uc *PaymentUseCase) GetPaymentByOrderID(ctx context.Context, req *GetPaymentByOrderIDRequest) (*Payment, error) {
	return uc.repo.GetPaymentByOrderID(ctx, req)
}
