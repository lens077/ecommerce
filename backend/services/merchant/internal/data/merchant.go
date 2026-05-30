package data

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/merchant/internal/biz"
	"github.com/lens077/ecommerce/backend/services/merchant/internal/data/models"

	"go.uber.org/zap"
)

var _ biz.MerchantRepo = (*merchantRepo)(nil)

type merchantRepo struct {
	queries *models.Queries
	data    *Data
}

func (m *merchantRepo) ApproveApplication(ctx context.Context, req *biz.ApproveApplicationRequest) (*biz.ApproveApplicationResponse, error) {
	// TODO implement me
	panic("implement me")
}

func (m *merchantRepo) RejectApplication(ctx context.Context, req *biz.RejectApplicationRequest) (*biz.RejectApplicationResponse, error) {
	// TODO implement me
	panic("implement me")
}

func (m *merchantRepo) GetApplication(ctx context.Context, req *biz.GetApplicationRequest) (*biz.GetApplicationResponse, error) {
	result, err := m.queries.GetApplication(ctx, req.ApplicationId)
	if err != nil {
		return nil, m.data.dbErrHandler.MustHandleError(err, biz.ErrApplicationIdNotFound)
	}

	rejectReason := ""
	if result.RejectReason != nil {
		rejectReason = *result.RejectReason
	}

	return &biz.GetApplicationResponse{
		ApplicationId: result.ApplicationID,
		Status:        constants.ApplicationStatus(result.Status),
		CompanyName:   result.CompanyName,
		CreditCode:    result.CreditCode,
		LegalPerson:   result.LegalPerson,
		ContactPhone:  result.ContactPhone,
		RejectReason:  rejectReason,
		SubmittedAt:   result.SubmittedAt,
		ReviewedAt:    result.ReviewedAt.Time,
	}, nil
}

func (m *merchantRepo) ActivateMerchant(ctx context.Context, req *biz.ActivateMerchantRequest) (*biz.ActivateMerchantResponse, error) {
	// TODO implement me
	panic("implement me")
}

func (m *merchantRepo) SubmitApplication(ctx context.Context, req *biz.SubmitApplicationRequest) (*biz.SubmitApplicationResponse, error) {
	applicationId, err := uuid.NewV7()
	if err != nil {
		return nil, err
	}
	submitApplicationErr := m.queries.SubmitApplication(ctx, models.SubmitApplicationParams{
		ApplicationID:         applicationId.String(),
		CompanyName:           req.CompanyName,
		CreditCode:            req.CreditCode,
		LegalPerson:           req.LegalPerson,
		LegalPersonID:         req.LegalPersonId,
		ContactPhone:          req.ContactPhone,
		BusinessLicenseUrl:    &req.BusinessLicenseUrl,
		LegalPersonIDFrontUrl: &req.LegalPersonIdFrontUrl,
		LegalPersonIDBackUrl:  &req.LegalPersonIdBackUrl,
		CategoryIds:           req.CategoryIds,
		ReviewedAt: pgtype.Timestamptz{
			Time: time.Now(),
		},
		Remark: &req.Remark,
	})
	if submitApplicationErr != nil {
		return nil, submitApplicationErr
	}

	return &biz.SubmitApplicationResponse{
		ApplicationId: applicationId.String(),
		Status:        constants.ApplicationStatusPendingReview,
	}, nil
}

func NewMerchantRepo(data *Data, logger *zap.Logger) biz.MerchantRepo {
	return &merchantRepo{
		queries: models.New(data.db),
		data:    data,
	}
}
