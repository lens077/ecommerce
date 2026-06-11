package biz

import (
	"context"
)

type Product struct {
	ID           uint32  `json:"id"`
	Name         string  `json:"name"`
	SpuCode      string  `json:"spu_code"`
	Price        float64 `json:"price"`
	Status       string  `json:"status"`
	MainMediaUrl string  `json:"main_media_url"`
	Quantity     uint32  `json:"quantity"`
}

type (
	AddressRequest struct {
		Index string
		Name  string
	}

	AddressResponse struct {
		Products []Product
	}
)

// AddressRepo 用户接口
type AddressRepo interface {
	Address(ctx context.Context, req AddressRequest) (*AddressResponse, error)
}

type AddressUseCase struct {
	repo AddressRepo
}

func NewAddressUseCase(repo AddressRepo) *AddressUseCase {
	return &AddressUseCase{
		repo: repo,
	}
}

func (uc *AddressUseCase) Address(ctx context.Context, req AddressRequest) (*AddressResponse, error) {
	return uc.repo.Address(ctx, req)
}
