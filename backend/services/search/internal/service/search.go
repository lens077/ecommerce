package service

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/search/v1"
	"github.com/lens077/ecommerce/backend/api/search/v1/searchv1connect"
	"github.com/lens077/ecommerce/backend/services/search/internal/biz"
)

type SearchService struct {
	uc *biz.SearchUseCase
}

var _ searchv1connect.SearchServiceHandler = (*SearchService)(nil)

func NewSearchService(uc *biz.SearchUseCase) searchv1connect.SearchServiceHandler {
	return &SearchService{uc: uc}
}

func (s *SearchService) Search(ctx context.Context, c *connect.Request[v1.SearchRequest]) (*connect.Response[v1.SearchResponse], error) {
	// 1. 调用业务逻辑层
	result, err := s.uc.Search(ctx, biz.SearchRequest{
		Name: c.Msg.Name,
	})
	if err != nil {
		return nil, searchError(err)
	}

	// 2. 转换结果集
	v1Products := make([]*v1.Product, 0, len(result.Products))
	for _, p := range result.Products {
		v1Products = append(v1Products, bizToV1Product(&p))
	}

	// 3. 返回响应
	return connect.NewResponse(&v1.SearchResponse{
		Products: v1Products,
	}), nil
}

// searchError 把 biz 哨兵错误映射为 RPC 错误码（docs/design/platform/error-handling.md 第 3 条）。
// 2026-09-23 修正前一律原样返回，Elasticsearch 抖动和客户端取消都被记成 unknown、按 ERROR 上报。
// unavailable 表示依赖故障、可重试，拦截器按 WARN 记录。
func searchError(err error) error {
	switch {
	case errors.Is(err, biz.ErrSearchUnavailable):
		return connect.NewError(connect.CodeUnavailable, err)
	case errors.Is(err, context.Canceled):
		return connect.NewError(connect.CodeCanceled, err)
	case errors.Is(err, context.DeadlineExceeded):
		return connect.NewError(connect.CodeDeadlineExceeded, err)
	default:
		return connect.NewError(connect.CodeUnknown, err)
	}
}

// 转换逻辑封装
func bizToV1Product(bp *biz.Product) *v1.Product {
	if bp == nil {
		return nil
	}

	return &v1.Product{
		Id:           bp.ID,
		Name:         bp.Name,
		SpuCode:      bp.SpuCode,
		Price:        bp.Price,
		Status:       bp.Status,
		MainMediaUrl: bp.MainMediaUrl,
		Quantity:     bp.Quantity,
	}
}
