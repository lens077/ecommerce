package service

import (
	"context"
	"errors"
	"net/http"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/merchant/v1"
	merchantconnect "github.com/lens077/ecommerce/backend/api/merchant/v1/merchantv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/pkg/identity"
	"github.com/lens077/ecommerce/backend/services/merchant/internal/biz"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type MerchantService struct {
	uc *biz.MerchantUseCase
}

// requireAdmin 是审批类 RPC 的 handler 内授权：判「主体能不能审批」，不判 HTTP 方法。
//
// 网关 Casbin 的 `p, admin, /merchant.v1.MerchantService/ApproveApplication, POST, allow`
// 是粗粒度放行（谁能碰这条路）；真正的判定在这里——策略被改宽、请求绕过网关（东西向
// 调用、误配）或换传输层方法，都逃不掉这一行。见 TECH.md §8.5 原则六。
// OpenFGA 接线后把这里换成关系检查（can_review_application），角色判定退为兜底。
func requireAdmin(h http.Header) error {
	_, err := identity.RequireRole(h, identity.RoleAdmin)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, identity.ErrRoleNotAllowed):
		return connect.NewError(connect.CodePermissionDenied, err)
	default:
		return connect.NewError(connect.CodeUnauthenticated, err)
	}
}

func (s *MerchantService) GetMerchantAgreement(ctx context.Context, _ *connect.Request[v1.GetMerchantAgreementRequest]) (*connect.Response[v1.GetMerchantAgreementResponse], error) {
	// req := c.Msg

	result, err := s.uc.GetMerchantAgreement(ctx, &biz.GetMerchantAgreementRequest{})
	if err != nil {
		return nil, err
	}
	response := &v1.GetMerchantAgreementResponse{
		Version:       result.Version,
		EffectiveDate: result.EffectiveDate.String(),
		ContentUrl:    result.ContentUrl,
	}

	return connect.NewResponse(response), err
}

func (s *MerchantService) CreateMerchant(ctx context.Context, c *connect.Request[v1.CreateMerchantRequest]) (*connect.Response[v1.CreateMerchantResponse], error) {
	// TODO implement me
	panic("implement me")
}

func (s *MerchantService) SubmitApplication(ctx context.Context, c *connect.Request[v1.SubmitApplicationRequest]) (*connect.Response[v1.SubmitApplicationResponse], error) {
	req := c.Msg
	result, err := s.uc.SubmitApplication(ctx, &biz.SubmitApplicationRequest{
		CompanyName:           req.CompanyName,
		CreditCode:            req.CreditCode,
		LegalPerson:           req.LegalPerson,
		LegalPersonId:         req.LegalPersonId,
		ContactPhone:          req.ContactPhone,
		BusinessLicenseUrl:    req.BusinessLicenseUrl,
		LegalPersonIdFrontUrl: req.LegalPersonIdFrontUrl,
		LegalPersonIdBackUrl:  req.LegalPersonIdBackUrl,
		CategoryIds:           req.CategoryIds,
		Remark:                req.Remark,
	})
	if err != nil {
		return nil, err
	}
	response := &v1.SubmitApplicationResponse{
		ApplicationId: result.ApplicationId,
		Status:        string(result.Status),
	}
	return connect.NewResponse(response), nil
}

func (s *MerchantService) ApproveApplication(ctx context.Context, c *connect.Request[v1.ApproveApplicationRequest]) (*connect.Response[v1.ApproveApplicationResponse], error) {
	if err := requireAdmin(c.Header()); err != nil {
		return nil, err
	}
	req := c.Msg
	_, err := s.uc.ApproveApplication(ctx, &biz.ApproveApplicationRequest{
		AuditComment:  req.AuditComment,
		ApplicationId: req.ApplicationId,
	})
	if err != nil {
		return nil, err
	}

	response := &v1.ApproveApplicationResponse{}

	return connect.NewResponse(response), nil
}

func (s *MerchantService) RejectApplication(ctx context.Context, c *connect.Request[v1.RejectApplicationRequest]) (*connect.Response[v1.RejectApplicationResponse], error) {
	// 授权先于实现：桩子被填成真实逻辑时这行已经在了，不靠实现者记得补。
	if err := requireAdmin(c.Header()); err != nil {
		return nil, err
	}
	// TODO implement me
	panic("implement me")
}

func (s *MerchantService) GetApplication(ctx context.Context, c *connect.Request[v1.GetApplicationRequest]) (*connect.Response[v1.GetApplicationResponse], error) {
	req := c.Msg
	result, err := s.uc.GetApplication(ctx, &biz.GetApplicationRequest{
		ApplicationId: req.ApplicationId,
	})
	if err != nil {
		return nil, err
	}

	protoStatus := v1.ApplicationStatus_APPLICATION_STATUS_UNSPECIFIED
	switch result.Status {
	case constants.ApplicationStatusPendingReview:
		protoStatus = v1.ApplicationStatus_APPLICATION_STATUS_PENDING_REVIEW
	case constants.ApplicationStatusApproved:
		protoStatus = v1.ApplicationStatus_APPLICATION_STATUS_APPROVED
	case constants.ApplicationStatusRejected:
		protoStatus = v1.ApplicationStatus_APPLICATION_STATUS_REJECTED
	case constants.ApplicationStatusActivated:
		protoStatus = v1.ApplicationStatus_APPLICATION_STATUS_ACTIVATED
	}

	response := &v1.GetApplicationResponse{
		ApplicationId: result.ApplicationId,
		Status:        protoStatus,
		CompanyName:   result.CompanyName,
		CreditCode:    result.CreditCode,
		LegalPerson:   result.LegalPerson,
		ContactPhone:  result.ContactPhone,
		RejectReason:  result.RejectReason,
		SubmittedAt:   timestamppb.New(result.SubmittedAt),
		ReviewedAt:    timestamppb.New(result.ReviewedAt),
	}

	return connect.NewResponse(response), nil
}

func (s *MerchantService) ActivateMerchant(ctx context.Context, c *connect.Request[v1.ActivateMerchantRequest]) (*connect.Response[v1.ActivateMerchantResponse], error) {
	if err := requireAdmin(c.Header()); err != nil {
		return nil, err
	}
	// TODO implement me
	panic("implement me")
}

var _ merchantconnect.MerchantServiceHandler = (*MerchantService)(nil)

func NewMerchantService(uc *biz.MerchantUseCase) merchantconnect.MerchantServiceHandler {
	return &MerchantService{uc: uc}
}
