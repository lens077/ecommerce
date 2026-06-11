package service

import (
	"context"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/services/address/api/address/v1"
	"github.com/lens077/ecommerce/backend/services/address/api/address/v1/addressv1connect"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
)

type AddressService struct {
	uc *biz.AddressUseCase
}

var _ addressv1connect.AddressServiceHandler = (*AddressService)(nil)

func NewAddressService(uc *biz.AddressUseCase) addressv1connect.AddressServiceHandler {
	return &AddressService{uc: uc}
}

func (s *AddressService) Address(ctx context.Context, c *connect.Request[v1.AddressRequest]) (*connect.Response[v1.AddressResponse], error) {
	// 1. 调用业务逻辑层
	result, err := s.uc.Address(ctx, biz.AddressRequest{
		Index: c.Msg.Index,
		Name:  c.Msg.Name,
	})
	if err != nil {
		return nil, err
	}

	// 2. 转换结果集
	v1Products := make([]*v1.Product, 0, len(result.Products))
	for _, p := range result.Products {
		v1Products = append(v1Products, bizToV1Product(&p))
	}

	// 3. 返回响应
	return connect.NewResponse(&v1.AddressResponse{
		Products: v1Products,
	}), nil
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
