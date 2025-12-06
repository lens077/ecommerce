package biz

import (
	"context"
	"time"
)

type SearchRepo interface {
	Search(ctx context.Context, req SearchRequest) (*SearchResponse, error)
}
type SearchUseCase struct {
	repo SearchRepo
	// cfg  *conf.Search
}

func NewSearchUseCase(repo SearchRepo) *SearchUseCase {
	return &SearchUseCase{
		repo: repo,
	}
}

func (s SearchUseCase) Search(ctx context.Context, req SearchRequest) (*SearchResponse, error) {
	return s.repo.Search(ctx, req)
}

type (
	SearchRequest struct {
		Index string
		Name  string
	}
	SearchResponse struct {
		Products []Product
	}
)

// ProductImage 商品图片结构
type ProductImage struct {
	URL       string
	Type      string
	SortOrder int
	AltText   string
}

// ProductAttribute 商品属性结构
type ProductAttribute struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Product 商品结构
type Product struct {
	ProductId    int64             `json:"product_id"`
	ProductName  string            `json:"product_name"`
	NameSuggest  string            `json:"name_suggest,omitempty"` // 用于搜索建议
	Description  string            `json:"description,omitempty"`
	Price        float64           `json:"price"`
	Status       string            `json:"status"` // 上架/下架
	MerchantID   string            `json:"merchant_id"`
	CategoryID   int               `json:"category_id"`
	CategoryName string            `json:"category_name"`
	Images       []ProductImage    `json:"images,omitempty"`
	CoverImage   string            `json:"cover_image,omitempty"`
	Attributes   map[string]string `json:"attributes,omitempty"`
	SalesCount   int               `json:"sales_count"`
	RatingScore  float64           `json:"rating_score"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}
