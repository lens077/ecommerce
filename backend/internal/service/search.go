package service

import (
	v1 "connect-go-example/api/search/v1"
	"connect-go-example/api/search/v1/searchv1connect"
	"connect-go-example/internal/biz"
	"context"
	"fmt"
	"log"
	"strconv"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var _ searchv1connect.SearchServiceHandler = (*SearchService)(nil)

type SearchService struct {
	uc *biz.SearchUseCase
}

func NewSearchService(uc *biz.SearchUseCase) searchv1connect.SearchServiceHandler {
	return SearchService{uc: uc}
}

func (s SearchService) Search(ctx context.Context, c *connect.Request[v1.SearchRequest]) (*connect.Response[v1.SearchResponse], error) {
	log.Printf("msg:%v %v", c.Msg.Index, c.Msg.Name)
	result, err := s.uc.Search(ctx,
		biz.SearchRequest{
			Index: c.Msg.Index,
			Name:  c.Msg.Name,
		})
	if err != nil {
		return nil, err
	}

	var v1Products []*v1.Product // 存放 Protobuf 格式的商品列表
	for _, hit := range result.Products {
		var bizProduct biz.Product
		v1Product := bizToV1Product(&hit)
		v1Products = append(v1Products, v1Product)

		fmt.Printf("商品名称: %s, 价格: %.2f\n", bizProduct.ProductName, bizProduct.Price)
	}
	fmt.Printf("成功解析 %d 个商品\n", len(v1Products))

	return connect.NewResponse(&v1.SearchResponse{Products: v1Products}), nil
}

func bizToV1Product(bp *biz.Product) *v1.Product {
	// 转换嵌套结构体 Image
	v1Images := make([]*v1.ProductImage, len(bp.Images))
	for i, img := range bp.Images {
		v1Images[i] = &v1.ProductImage{
			Url:       img.URL,
			Type:      img.Type,
			SortOrder: int32(img.SortOrder),
			AltText:   img.AltText,
		}
	}

	// 转换嵌套结构体 Attribute
	// v1Attributes := make([]*v1.ProductAttribute, len(bp.Attributes))
	// for i, attr := range bp.Attributes {
	// 	v1Attributes[i] = &v1.ProductAttribute{
	// 		Key: attr.Key,
	// 		Value: attr.Value,
	// 	}
	// }

	return &v1.Product{
		Id:           strconv.FormatInt(bp.ProductId, 10),
		Name:         bp.ProductName,
		NameSuggest:  bp.NameSuggest,
		Description:  bp.Description,
		Price:        bp.Price,
		Status:       bp.Status,
		MerchantId:   bp.MerchantID,
		CategoryId:   int32(bp.CategoryID), // int 转换为 int32
		CategoryName: bp.CategoryName,
		Images:       v1Images,
		CoverImage:   bp.CoverImage,
		Attributes:   bp.Attributes,
		SalesCount:   int32(bp.SalesCount), // int 转换为 int32
		RatingScore:  bp.RatingScore,
		CreatedAt:    timestamppb.New(bp.CreatedAt),
		UpdatedAt:    timestamppb.New(bp.UpdatedAt),
	}
}
