package data

import (
	"context"
	"fmt"
	"time"

	"github.com/lens077/ecommerce/backend/pkg/searchindex"
	conf "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
	"github.com/lens077/ecommerce/backend/services/search/internal/pkg/config"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

// esCatalog is the only production provider of the SearchCatalog deep-module
// boundary. The repository consumes only the project-owned contract.
type esCatalog struct {
	client *searchindex.Client
	index  string
}

var _ SearchCatalog = (*esCatalog)(nil)

func NewSearchCatalog(
	lc fx.Lifecycle,
	bootstrap *conf.Bootstrap,
	live *config.Live,
	logger *zap.Logger,
) (SearchCatalog, error) {
	cfg := bootstrap.GetSearch().GetCatalog()
	client, err := searchindex.NewClient(searchindex.ClientConfig{
		Endpoint:       cfg.GetEndpoint(),
		Username:       cfg.GetUsername(),
		Password:       cfg.GetPassword(),
		APIKey:         cfg.GetApiKey(),
		RequestTimeout: 10 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("create search catalog: %w", err)
	}

	unsub := live.Subscribe(func(old, cur *conf.Bootstrap) {
		if !proto.Equal(old.GetSearch(), cur.GetSearch()) {
			logger.Warn("该配置段已变更,但需要重启服务才会生效", zap.String("section", "search"))
		}
	})
	lc.Append(fx.Hook{OnStop: func(ctx context.Context) error {
		unsub()
		return client.Close(ctx)
	}})
	logger.Info("elasticsearch search catalog initialized",
		zap.String("endpoint", cfg.GetEndpoint()),
		zap.String("index", cfg.GetIndex()),
	)
	return &esCatalog{client: client, index: cfg.GetIndex()}, nil
}

func (c *esCatalog) SearchProducts(ctx context.Context, query string) ([]CatalogProduct, error) {
	docs, err := c.client.SearchProducts(ctx, c.index, query, 0)
	if err != nil {
		return nil, fmt.Errorf("search catalog query: %w", err)
	}
	products := make([]CatalogProduct, 0, len(docs))
	for _, doc := range docs {
		products = append(products, CatalogProduct{
			ID:           doc.ID,
			Name:         doc.Name,
			SpuCode:      doc.SpuCode,
			Price:        doc.Price,
			Status:       doc.Status,
			MainMediaURL: doc.MainMediaURL,
			SaleCount:    doc.SaleCount,
		})
	}
	return products, nil
}

func (c *esCatalog) Health(ctx context.Context) error {
	return c.client.Health(ctx, c.index)
}
