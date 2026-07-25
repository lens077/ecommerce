package biz

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type AddressDetail struct {
	Province   string `json:"province"`
	City       string `json:"city"`
	District   string `json:"district"`
	Detail     string `json:"detail"`
	PostalCode string `json:"postal_code"`
	FullText   string `json:"full_text"`
}

type Address struct {
	AddressID      string         `json:"address_id"`
	RecipientName  string         `json:"recipient_name"`
	RecipientPhone string         `json:"recipient_phone"`
	UserID         string         `json:"user_id"`
	Detail         *AddressDetail `json:"detail"`
	IsDefault      bool           `json:"is_default"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      *time.Time     `json:"deleted_at"`
}

type CreateAddressRequest struct {
	RecipientName  string         `json:"recipient_name"`
	RecipientPhone string         `json:"recipient_phone"`
	UserID         string         `json:"user_id"`
	Detail         *AddressDetail `json:"detail"`
	IsDefault      bool           `json:"is_default"`
}

type CreateAddressResponse struct {
	AddressID string `json:"address_id"`
}

type UpdateAddressRequest struct {
	AddressID      string         `json:"address_id"`
	RecipientName  *string        `json:"recipient_name"`
	RecipientPhone *string        `json:"recipient_phone"`
	Detail         *AddressDetail `json:"detail"`
}

type UpdateAddressResponse struct{}

type DeleteAddressRequest struct {
	AddressID string `json:"address_id"`
}

type DeleteAddressResponse struct{}

type GetAddressRequest struct {
	AddressID string `json:"address_id"`
}

type GetAddressResponse struct {
	AddressID      string
	RecipientName  string
	RecipientPhone string
	UserID         string
	Detail         *AddressDetail
	IsDefault      bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type ListAddressesRequest struct {
	UserID uuid.UUID
}

type ListAddressesResponse struct {
	Addresses []*GetAddressResponse
}

type SetDefaultAddressRequest struct {
	AddressID string `json:"address_id"`
}

type SetDefaultAddressResponse struct{}

type AddressRepo interface {
	CreateAddress(ctx context.Context, req CreateAddressRequest) (*CreateAddressResponse, error)
	UpdateAddress(ctx context.Context, req UpdateAddressRequest) (*UpdateAddressResponse, error)
	DeleteAddress(ctx context.Context, req DeleteAddressRequest) (*DeleteAddressResponse, error)
	GetAddress(ctx context.Context, req GetAddressRequest) (*GetAddressResponse, error)
	ListAddresses(ctx context.Context, req ListAddressesRequest) (*ListAddressesResponse, error)
	SetDefaultAddress(ctx context.Context, req SetDefaultAddressRequest) (*SetDefaultAddressResponse, error)
}

type AddressUseCase struct {
	repo AddressRepo
}

func NewAddressUseCase(repo AddressRepo) *AddressUseCase {
	return &AddressUseCase{
		repo: repo,
	}
}

func (uc *AddressUseCase) CreateAddress(ctx context.Context, req CreateAddressRequest) (*CreateAddressResponse, error) {
	return uc.repo.CreateAddress(ctx, req)
}

func (uc *AddressUseCase) UpdateAddress(ctx context.Context, req UpdateAddressRequest) (*UpdateAddressResponse, error) {
	return uc.repo.UpdateAddress(ctx, req)
}

func (uc *AddressUseCase) DeleteAddress(ctx context.Context, req DeleteAddressRequest) (*DeleteAddressResponse, error) {
	return uc.repo.DeleteAddress(ctx, req)
}

func (uc *AddressUseCase) GetAddress(ctx context.Context, req GetAddressRequest) (*GetAddressResponse, error) {
	return uc.repo.GetAddress(ctx, req)
}

func (uc *AddressUseCase) ListAddresses(ctx context.Context, req ListAddressesRequest) (*ListAddressesResponse, error) {
	return uc.repo.ListAddresses(ctx, req)
}

func (uc *AddressUseCase) SetDefaultAddress(ctx context.Context, req SetDefaultAddressRequest) (*SetDefaultAddressResponse, error) {
	return uc.repo.SetDefaultAddress(ctx, req)
}
