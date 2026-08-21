package data

import (
	"context"
	"fmt"
	"math"

	"github.com/lens077/ecommerce/backend/pkg/searchindex"
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
	res, err := u.data.search.Search(ctx, req.Name)
	if err != nil {
		u.log.Error("failed to search meilisearch", zap.Error(err))
		return nil, fmt.Errorf("search products: %w", err)
	}

	products := make([]biz.Product, 0, len(res.Hits))
	for _, hit := range res.Hits {
		var doc searchindex.Doc
		if err := hit.DecodeInto(&doc); err != nil {
			u.log.Warn("failed to decode meilisearch hit", zap.Error(err))
			continue
		}
		if doc.ID <= 0 || doc.ID > math.MaxUint32 {
			u.log.Warn("ignoring search document with unsupported id", zap.Int64("id", doc.ID))
			continue
		}

		quantity := uint32(0)
		if doc.SaleCount > 0 {
			if doc.SaleCount > math.MaxUint32 {
				quantity = math.MaxUint32
			} else {
				quantity = uint32(doc.SaleCount)
			}
		}
		products = append(products, biz.Product{
			ID:           uint32(doc.ID),
			Name:         doc.Name,
			SpuCode:      doc.SpuCode,
			Price:        doc.Price,
			Status:       doc.Status,
			MainMediaUrl: doc.MainMediaURL,
			Quantity:     quantity,
		})
	}

	return &biz.SearchResponse{Products: products}, nil
}
