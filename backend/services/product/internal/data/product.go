package data

import (
	"encoding/json"

	"github.com/lens077/ecommerce/backend/services/product/internal/biz"
	"github.com/lens077/ecommerce/backend/services/product/internal/data/models"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	// "github.com/lens077/ecommerce/backend/services/product/internal/data/models"
	"context"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var _ biz.ProductRepo = (*productRepo)(nil)

type productRepo struct {
	queries *models.Queries
	rdb     *redis.Client
	auth    *casdoorsdk.Client
	l       *zap.Logger
}

func NewProductRepo(data *Data, logger *zap.Logger) biz.ProductRepo {
	return &productRepo{
		queries: models.New(data.db),
		rdb:     data.rdb,
		l:       logger,
	}
}

func (p *productRepo) GetProductDetail(ctx context.Context, req biz.GetProductDetailRequest) (*biz.GetProductDetailResponse, error) {
	productDetail, err := p.queries.GetProductDetail(ctx, &req.SpuCode)
	if err != nil {
		return nil, err
	}

	var skus []biz.ProductSku
	if err := json.Unmarshal(productDetail.Skus, &skus); err != nil {
		p.l.Warn("failed to unmarshal product skus",
			zap.Int64("spu_id", productDetail.SpuID),
			zap.String("spu_code", productDetail.SpuCode),
			zap.Error(err),
		)
		reportErrorToOTel(ctx, err, productDetail.SpuID)
	}

	var specsMap map[string]any
	if err := json.Unmarshal(productDetail.CommonSpecs, &specsMap); err != nil {
		p.l.Warn("failed to unmarshal product specs",
			zap.Int64("spu_id", productDetail.SpuID),
			zap.String("spu_code", productDetail.SpuCode),
			zap.Error(err),
		)
		reportErrorToOTel(ctx, err, productDetail.SpuID)
	}

	return &biz.GetProductDetailResponse{
		ProductDetail: biz.ProductSpuDetail{
			SpuID:       productDetail.SpuID,
			Name:        productDetail.Name,
			SpuCode:     productDetail.SpuCode,
			CommonSpecs: specsMap,
			Skus:        skus,
		},
	}, nil
}

func reportErrorToOTel(ctx context.Context, err error, spuID int64) {
	span := trace.SpanFromContext(ctx)
	if span.IsRecording() {
		// 记录异常（OTel 标准操作，会自动提取错误消息和堆栈）
		span.RecordError(err, trace.WithAttributes(
			attribute.Int64("product.spu_id", spuID),
			attribute.String("error.type", "json_unmarshal"),
		))
		// 如果这个解析失败导致业务不可用，可以设置 Span 状态为 Error
		// span.SetStatus(codes.Error, "failed to parse product data")
	}
}
