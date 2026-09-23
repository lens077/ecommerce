package data

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/lens077/ecommerce/backend/services/search/internal/biz"
	"go.uber.org/zap"
)

var _ biz.SearchRepo = (*searchRepo)(nil)

type searchRepo struct {
	data *Data
	log  *zap.Logger
}

func NewSearchRepo(data *Data, logger *zap.Logger) biz.SearchRepo {
	return &searchRepo{
		data: data,
		log:  logger,
	}
}

func (u searchRepo) Search(ctx context.Context, req biz.SearchRequest) (*biz.SearchResponse, error) {
	result, err := u.data.catalog.SearchProducts(ctx, req.Name)
	if err != nil {
		// 调用方取消或超时原样返回，由 service 层映射为 canceled / deadline_exceeded；
		// 其余都是搜索后端故障，包装为 ErrSearchUnavailable。日志由 RPC 拦截器按错误码分级记录。
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("search products: %w", err)
		}
		return nil, fmt.Errorf("%w: %w", biz.ErrSearchUnavailable, err)
	}

	products := make([]biz.Product, 0, len(result))
	for _, product := range result {
		if product.ID <= 0 || product.ID > math.MaxUint32 {
			u.log.Warn("ignoring search document with unsupported id", zap.Int64("id", product.ID))
			continue
		}

		quantity := uint32(0)
		if product.SaleCount > 0 {
			if product.SaleCount > math.MaxUint32 {
				quantity = math.MaxUint32
			} else {
				quantity = uint32(product.SaleCount)
			}
		}
		products = append(products, biz.Product{
			ID:           uint32(product.ID),
			Name:         product.Name,
			SpuCode:      product.SpuCode,
			Price:        product.Price,
			Status:       product.Status,
			MainMediaUrl: product.MainMediaURL,
			Quantity:     quantity,
		})
	}

	return &biz.SearchResponse{Products: products}, nil
}
