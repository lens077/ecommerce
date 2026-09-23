package biz

import (
	"context"
	"errors"
)

var (
	ErrNotFound = errors.New("[Search] product not found")
	// ErrSearchUnavailable 搜索后端（Elasticsearch）不可用。搜不到结果不是错误，返回空列表。
	ErrSearchUnavailable = errors.New("[Search] search backend unavailable")
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
	SearchRequest struct {
		Name string
	}

	SearchResponse struct {
		Products []Product
	}
)

// SearchRepo 用户接口
type SearchRepo interface {
	Search(ctx context.Context, req SearchRequest) (*SearchResponse, error)
}

type SearchUseCase struct {
	repo SearchRepo
}

func NewSearchUseCase(repo SearchRepo) *SearchUseCase {
	return &SearchUseCase{
		repo: repo,
	}
}

func (uc *SearchUseCase) Search(ctx context.Context, req SearchRequest) (*SearchResponse, error) {
	return uc.repo.Search(ctx, req)
}
