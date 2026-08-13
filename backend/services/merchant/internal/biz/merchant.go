package biz

import (
	"context"
	"errors"
	"time"

	"github.com/lens077/ecommerce/backend/constants"
)

var (
	ErrApplicationIdNotFound = errors.New("[Merchant] application_id not found")
)

type (
	GetMerchantAgreementRequest  struct{}
	GetMerchantAgreementResponse struct {
		Version       string
		EffectiveDate time.Time
		ContentUrl    string
	}
)
type (
	CreateMerchantRequest  struct{}
	CreateMerchantResponse struct{}
)

type (
	SubmitApplicationRequest struct {
		CompanyName           string
		CreditCode            string
		LegalPerson           string
		LegalPersonId         string
		ContactPhone          string
		BusinessLicenseUrl    string
		LegalPersonIdFrontUrl string
		LegalPersonIdBackUrl  string
		CategoryIds           []int64
		Remark                string
	}
	SubmitApplicationResponse struct {
		ApplicationId string
		Status        constants.ApplicationStatus
	}
)
type (
	ApproveApplicationRequest struct {
		AuditComment  string
		ApplicationId string
	}
	ApproveApplicationResponse struct {
	}
)
type (
	RejectApplicationRequest struct {
	}
	RejectApplicationResponse struct {
	}
)
type (
	GetApplicationRequest struct {
		ApplicationId string
	}
	GetApplicationResponse struct {
		ApplicationId string
		Status        constants.ApplicationStatus
		CompanyName   string
		CreditCode    string
		LegalPerson   string
		ContactPhone  string
		RejectReason  string
		SubmittedAt   time.Time
		ReviewedAt    time.Time
	}
)
type (
	ActivateMerchantRequest struct {
	}
	ActivateMerchantResponse struct {
	}
)

// MerchantRepo 商家
type MerchantRepo interface {
	GetMerchantAgreement(ctx context.Context, req *GetMerchantAgreementRequest) (*GetMerchantAgreementResponse, error)
	CreateMerchant(ctx context.Context, req *CreateMerchantRequest) (*CreateMerchantResponse, error)
	SubmitApplication(ctx context.Context, req *SubmitApplicationRequest) (*SubmitApplicationResponse, error)
	ApproveApplication(ctx context.Context, req *ApproveApplicationRequest) (*ApproveApplicationResponse, error)
	RejectApplication(ctx context.Context, req *RejectApplicationRequest) (*RejectApplicationResponse, error)
	GetApplication(ctx context.Context, req *GetApplicationRequest) (*GetApplicationResponse, error)
	ActivateMerchant(ctx context.Context, req *ActivateMerchantRequest) (*ActivateMerchantResponse, error)
}

type MerchantUseCase struct {
	repo MerchantRepo
}

func NewMerchantUseCase(repo MerchantRepo) *MerchantUseCase {
	return &MerchantUseCase{
		repo: repo,
	}
}

func (uc *MerchantUseCase) GetMerchantAgreement(ctx context.Context, req *GetMerchantAgreementRequest) (*GetMerchantAgreementResponse, error) {
	return uc.repo.GetMerchantAgreement(ctx, req)
}

func (uc *MerchantUseCase) CreateMerchant(ctx context.Context, req *CreateMerchantRequest) (*CreateMerchantResponse, error) {
	return uc.repo.CreateMerchant(ctx, req)
}

func (uc *MerchantUseCase) SubmitApplication(ctx context.Context, req *SubmitApplicationRequest) (*SubmitApplicationResponse, error) {
	return uc.repo.SubmitApplication(ctx, req)
}

func (uc *MerchantUseCase) ApproveApplication(ctx context.Context, req *ApproveApplicationRequest) (*ApproveApplicationResponse, error) {
	return uc.repo.ApproveApplication(ctx, req)
}

func (uc *MerchantUseCase) RejectApplication(ctx context.Context, req *RejectApplicationRequest) (*RejectApplicationResponse, error) {
	return uc.repo.RejectApplication(ctx, req)
}

func (uc *MerchantUseCase) GetApplication(ctx context.Context, req *GetApplicationRequest) (*GetApplicationResponse, error) {
	return uc.repo.GetApplication(ctx, req)
}

func (uc *MerchantUseCase) ActivateMerchant(ctx context.Context, req *ActivateMerchantRequest) (*ActivateMerchantResponse, error) {
	return uc.repo.ActivateMerchant(ctx, req)
}
