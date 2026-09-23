package data

import (
	"context"
	"fmt"
	"time"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	conf "github.com/lens077/ecommerce/backend/services/search/internal/conf/v1"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// Module 导出给 FX 的 Provider
var Module = fx.Module("data",
	fx.Provide(
		NewData,
		NewSearchCatalog,
		NewSearchRepo,
	),
)

// Data 包含搜索服务的运行时数据源。
type Data struct {
	catalog SearchCatalog
}

// CatalogProduct 是 SearchCatalog 返回给仓储层的项目内 DTO。
type CatalogProduct struct {
	ID           int64
	Name         string
	SpuCode      string
	Price        float64
	Status       string
	MainMediaURL string
	SaleCount    int64
}

// SearchCatalog 是搜索仓储使用的单实现深度模块边界。当前唯一 provider 是 esCatalog。
type SearchCatalog interface {
	SearchProducts(context.Context, string) ([]CatalogProduct, error)
	Health(context.Context) error
}

// NewData 是 Data 的构造函数。
func NewData(catalog SearchCatalog) *Data {
	return &Data{catalog: catalog}
}

func NewCasdoorAuthClient(conf *conf.Bootstrap, logger *zap.Logger) *casdoorsdk.Client {
	casdoorCfg := conf.Auth.Casdoor
	client := casdoorsdk.NewClient(
		casdoorCfg.Endpoint,         // endpoint
		casdoorCfg.ClientId,         // clientId
		casdoorCfg.ClientSecret,     // clientSecret
		casdoorCfg.Certificate,      // certificate (x509 format)
		casdoorCfg.OrganizationName, // organizationName
		casdoorCfg.ApplicationName,  // applicationName
	)

	logger.Info(fmt.Sprintf("casdoor connected successfully to %s", casdoorCfg.Endpoint))

	return client
}

// CheckSearch 检查搜索目录的查询就绪状态。
func (d *Data) CheckSearch(ctx context.Context) error {
	if d.catalog == nil {
		return fmt.Errorf("search catalog not initialized")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := d.catalog.Health(ctx); err != nil {
		return fmt.Errorf("search catalog health check failed: %w", err)
	}
	return nil
}
