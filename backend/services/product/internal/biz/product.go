package biz

import (
	"context"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/shopspring/decimal"

	"github.com/google/uuid"
	conf "github.com/lens077/ecommerce/backend/services/product/internal/conf/v1"
	"go.uber.org/zap"
)

type ProductDetailResponse []ProductSpuDetail

// ProductSpuDetail 代表 SPU 的详细信息及其包含的 SKU 列表
type ProductSpuDetail struct {
	SpuID       int64
	SpuName     string
	SpuCode     string
	CommonSpecs map[string]any
	Skus        []ProductSku
}

// ProductSku 代表具体的规格项
type ProductSku struct {
	SkuID         int64
	SkuCode       string
	MerchantId    uuid.UUID
	Price         decimal.Decimal
	CostPrice     decimal.Decimal
	StockQuantity int64
	StockLocked   int64
	Attributes    map[string]any
	SpecTemplate  []string
	SkuName       string
	ThumbnailUrl  string
	Status        constants.ProductSpuStatus
}

type (
	GetProductDetailRequest struct {
		SpuCode string
	}

	GetProductDetailResponse struct {
		ProductDetail ProductSpuDetail
	}
)

// ProductRepo 用户接口
type ProductRepo interface {
	GetProductDetail(ctx context.Context, req GetProductDetailRequest) (*GetProductDetailResponse, error)
}

type ProductUseCase struct {
	repo ProductRepo
	cfg  *conf.Auth
}

func NewProductUseCase(repo ProductRepo, cfg *conf.Bootstrap, logger *zap.Logger) *ProductUseCase {
	return &ProductUseCase{
		repo: repo,
		cfg:  cfg.Auth,
	}
}

func (uc *ProductUseCase) GetProductDetail(ctx context.Context, req GetProductDetailRequest) (*GetProductDetailResponse, error) {
	return uc.repo.GetProductDetail(ctx, req)
}
