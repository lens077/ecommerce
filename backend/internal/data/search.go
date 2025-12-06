package data

import (
	"connect-go-example/internal/biz"
	"context"
	"encoding/json"
	"fmt"

	"github.com/elastic/go-elasticsearch/v9"
	"github.com/elastic/go-elasticsearch/v9/typedapi/core/search"
	"github.com/elastic/go-elasticsearch/v9/typedapi/types"
	"go.uber.org/zap"
)

var _ biz.SearchRepo = (*searchRepo)(nil)

type searchRepo struct {
	es *elasticsearch.TypedClient
	l  *zap.Logger
}

func NewSearchRepo(es *elasticsearch.TypedClient,
	l *zap.Logger) biz.SearchRepo {
	return &searchRepo{
		es: es,
		l:  l,
	}
}

func (s searchRepo) Search(ctx context.Context, req biz.SearchRequest) (*biz.SearchResponse, error) {
	searchFidles := []string{
		"product_name",
		"categoryName",
		"description",
		"attributes.*",
	}

	res, err := s.es.Search().Index(req.Index).Request(&search.Request{
		Query: &types.Query{
			MultiMatch: &types.MultiMatchQuery{
				Query:  req.Name,
				Fields: searchFidles,
			},
		},
	}).Do(ctx)
	if err != nil {
		return nil, err
	}

	var bizProducts []biz.Product
	for _, hit := range res.Hits.Hits {
		var bizProduct biz.Product
		if err := json.Unmarshal(hit.Source_, &bizProduct); err != nil {
			s.l.Error("解析文档失败:" + err.Error())
			continue
		}
		bizProducts = append(bizProducts, bizProduct)

		fmt.Printf("文档ID: %d, 评分: %f\n", hit.Id_, *hit.Score_)
		fmt.Printf("商品名称: %s, 价格: %.2f\n", bizProduct.ProductName, bizProduct.Price)
	}
	fmt.Printf("成功解析 %d 个商品\n", len(bizProducts))

	return &biz.SearchResponse{Products: bizProducts}, nil
}
