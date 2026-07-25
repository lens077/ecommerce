package service

import (
	"context"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/product/internal/biz"
	"github.com/lens077/ecommerce/backend/services/product/internal/pkg/decimal"
	"google.golang.org/protobuf/types/known/structpb"

	v1 "github.com/lens077/ecommerce/backend/api/product/v1"
	"github.com/lens077/ecommerce/backend/api/product/v1/productv1connect"

	"connectrpc.com/connect"
)

// ProductService 实现 Connect 服务
type ProductService struct {
	uc *biz.ProductUseCase
}

// 显式接口检查
var _ productv1connect.ProductServiceHandler = (*ProductService)(nil)

func NewProductService(uc *biz.ProductUseCase) productv1connect.ProductServiceHandler {
	return &ProductService{
		uc: uc,
	}
}

func (s *ProductService) GetProductDetail(ctx context.Context, c *connect.Request[v1.GetProductDetailRequest]) (*connect.Response[v1.GetProductDetailResponse], error) {
	res, err := s.uc.GetProductDetail(
		ctx,
		biz.GetProductDetailRequest{
			SpuCode: c.Msg.SpuCode,
		},
	)
	if err != nil {
		return nil, err
	}

	result, err := ToProtoDetail(res.ProductDetail)
	if err != nil {
		return nil, err
	}

	response := &v1.GetProductDetailResponse{
		ProductDetail: result,
	}

	return connect.NewResponse(response), nil
}

func ToProtoDetail(bizDetail biz.ProductSpuDetail) (*v1.ProductSpuDetail, error) {
	// 转换 CommonSpecs (map -> structv1)
	commonSpecs, err := structpb.NewStruct(bizDetail.CommonSpecs)
	if err != nil {
		return nil, err
	}

	skus := make([]*v1.ProductSku, len(bizDetail.Skus))
	for i, s := range bizDetail.Skus {
		price := decimal.DecimalToCNYMoney(s.Price)
		costPrice := decimal.DecimalToCNYMoney(s.CostPrice)
		status := ToProtoSpuStatus(s.Status)
		// 转换 SKU Attrs
		attributes, _ := structpb.NewStruct(s.Attributes)
		skus[i] = &v1.ProductSku{
			SkuId:        s.SkuID,
			SkuCode:      s.SkuCode,
			MerchantId:   s.MerchantId.String(),
			Price:        price,
			CostPrice:    costPrice,
			StockLocked:  s.StockLocked,
			Attributes:   attributes,
			SpecTemplate: s.SpecTemplate,
			SkuName:      s.SkuName,
			ThumbnailUrl: s.ThumbnailUrl,
			Status:       status,
		}
	}

	return &v1.ProductSpuDetail{
		SpuId:       bizDetail.SpuID,
		SpuName:     bizDetail.SpuName,
		SpuCode:     bizDetail.SpuCode,
		CommonSpecs: commonSpecs,
		Skus:        skus,
	}, nil
}

func ToProtoSpuStatus(s constants.ProductSpuStatus) v1.SPUStatus {
	switch s {
	case constants.ProductSpuStatusDraft:
		return v1.SPUStatus_STATUS_DRAFT
	case constants.ProductSpuStatusOnline:
		return v1.SPUStatus_STATUS_ONLINE
	case constants.ProductSpuStatusOffline:
		return v1.SPUStatus_STATUS_OFFLINE
	case constants.ProductSpuStatusDeleted:
		return v1.SPUStatus_STATUS_DELETED
	default:
		return v1.SPUStatus_STATUS_UNKNOWN
	}
}
