package biz

import (
	"context"

	conf "github.com/lens077/ecommerce/backend/services/product/internal/conf/v1"
	"go.uber.org/zap"
)

type ProductDetailResponse []ProductSpuDetail

// ProductSpuDetail 代表 SPU 的详细信息及其包含的 SKU 列表
type ProductSpuDetail struct {
	SpuID       int64          `json:"spu_id"`
	Name        string         `json:"name"`
	SpuCode     string         `json:"spu_code"`
	CommonSpecs map[string]any `json:"common_specs"` // 对应数据库 spus.specs (JSONB)
	Skus        []ProductSku   `json:"skus"`
}

// ProductSku 代表具体的规格项
type ProductSku struct {
	SkuID   int64          `json:"sku_id"`
	SkuCode string         `json:"sku_code"`
	Price   float64        `json:"price"`
	Stock   int            `json:"stock"`
	Attrs   map[string]any `json:"attrs"` // 对应数据库 skus.attributes (JSONB)
	Img     string         `json:"img"`
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
