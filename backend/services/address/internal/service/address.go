package service

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	v1 "github.com/lens077/ecommerce/backend/api/address/v1"
	"github.com/lens077/ecommerce/backend/api/address/v1/addressv1connect"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type AddressService struct {
	uc *biz.AddressUseCase
}

var _ addressv1connect.AddressServiceHandler = (*AddressService)(nil)

func NewAddressService(uc *biz.AddressUseCase) addressv1connect.AddressServiceHandler {
	return &AddressService{uc: uc}
}

func (s *AddressService) CreateAddress(ctx context.Context, c *connect.Request[v1.CreateAddressRequest]) (*connect.Response[v1.CreateAddressResponse], error) {
	userID, err := uuid.Parse(c.Header().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid authenticated user id"))
	}

	result, err := s.uc.CreateAddress(ctx, biz.CreateAddressRequest{
		RecipientName:  c.Msg.RecipientName,
		RecipientPhone: c.Msg.RecipientPhone,
		UserID:         userID.String(),
		Detail: &biz.AddressDetail{
			Province:   c.Msg.Detail.Province,
			City:       c.Msg.Detail.City,
			District:   c.Msg.Detail.District,
			Detail:     c.Msg.Detail.Detail,
			PostalCode: c.Msg.Detail.PostalCode,
			FullText:   c.Msg.Detail.FullText,
		},
		IsDefault: c.Msg.IsDefault,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return connect.NewResponse(&v1.CreateAddressResponse{
		AddressId: result.AddressID,
	}), nil
}

func (s *AddressService) UpdateAddress(ctx context.Context, c *connect.Request[v1.UpdateAddressRequest]) (*connect.Response[v1.UpdateAddressResponse], error) {
	var recipientName, recipientPhone *string
	if c.Msg.RecipientName != nil {
		recipientName = &c.Msg.RecipientName.Value
	}
	if c.Msg.RecipientPhone != nil {
		recipientPhone = &c.Msg.RecipientPhone.Value
	}

	var detail *biz.AddressDetail
	if c.Msg.Detail != nil {
		detail = &biz.AddressDetail{
			Province:   c.Msg.Detail.Province,
			City:       c.Msg.Detail.City,
			District:   c.Msg.Detail.District,
			Detail:     c.Msg.Detail.Detail,
			PostalCode: c.Msg.Detail.PostalCode,
			FullText:   c.Msg.Detail.FullText,
		}
	}

	_, err := s.uc.UpdateAddress(ctx, biz.UpdateAddressRequest{
		AddressID:      c.Msg.AddressId,
		RecipientName:  recipientName,
		RecipientPhone: recipientPhone,
		Detail:         detail,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return connect.NewResponse(&v1.UpdateAddressResponse{}), nil
}

func (s *AddressService) DeleteAddress(ctx context.Context, c *connect.Request[v1.DeleteAddressRequest]) (*connect.Response[v1.DeleteAddressResponse], error) {
	_, err := s.uc.DeleteAddress(ctx, biz.DeleteAddressRequest{
		AddressID: c.Msg.AddressId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return connect.NewResponse(&v1.DeleteAddressResponse{}), nil
}

func (s *AddressService) GetAddress(ctx context.Context, c *connect.Request[v1.GetAddressRequest]) (*connect.Response[v1.GetAddressResponse], error) {
	result, err := s.uc.GetAddress(ctx, biz.GetAddressRequest{
		AddressID: c.Msg.AddressId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	if result == nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("address not found"))
	}

	return connect.NewResponse(&v1.GetAddressResponse{
		AddressId:      result.AddressID,
		RecipientName:  result.RecipientName,
		RecipientPhone: result.RecipientPhone,
		UserId:         result.UserID,
		Detail: &v1.AddressDetail{
			Province:   result.Detail.Province,
			City:       result.Detail.City,
			District:   result.Detail.District,
			Detail:     result.Detail.Detail,
			PostalCode: result.Detail.PostalCode,
			FullText:   result.Detail.FullText,
		},
		IsDefault: result.IsDefault,
		CreatedAt: timestamppb.New(result.CreatedAt),
		UpdatedAt: timestamppb.New(result.UpdatedAt),
	}), nil
}

func (s *AddressService) ListAddresses(ctx context.Context, c *connect.Request[v1.ListAddressesRequest]) (*connect.Response[v1.ListAddressesResponse], error) {
	userIdStr := c.Header().Get(constants.UserIdMetadataKey)
	customerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid authenticated user id"))
	}

	result, err := s.uc.ListAddresses(ctx, biz.ListAddressesRequest{
		UserID: customerId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	var addresses []*v1.GetAddressResponse
	for _, addr := range result.Addresses {
		addresses = append(addresses, &v1.GetAddressResponse{
			AddressId:      addr.AddressID,
			RecipientName:  addr.RecipientName,
			RecipientPhone: addr.RecipientPhone,
			UserId:         addr.UserID,
			Detail: &v1.AddressDetail{
				Province:   addr.Detail.Province,
				City:       addr.Detail.City,
				District:   addr.Detail.District,
				Detail:     addr.Detail.Detail,
				PostalCode: addr.Detail.PostalCode,
				FullText:   addr.Detail.FullText,
			},
			IsDefault: addr.IsDefault,
			CreatedAt: timestamppb.New(addr.CreatedAt),
			UpdatedAt: timestamppb.New(addr.UpdatedAt),
		})
	}

	return connect.NewResponse(&v1.ListAddressesResponse{
		Addresses: addresses,
	}), nil
}

func (s *AddressService) SetDefaultAddress(ctx context.Context, c *connect.Request[v1.SetDefaultAddressRequest]) (*connect.Response[v1.SetDefaultAddressResponse], error) {
	_, err := s.uc.SetDefaultAddress(ctx, biz.SetDefaultAddressRequest{
		AddressID: c.Msg.AddressId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return connect.NewResponse(&v1.SetDefaultAddressResponse{}), nil
}

// addressError 把 biz 哨兵错误映射为 RPC 错误码（docs/design/platform/error-handling.md 第 3 条）。
// 未映射时 connect 记成 unknown，日志拦截器按「rpc system error」报 ERROR；
// 地址不存在、地址 ID 非法都是调用方可预期的结果，不能和系统故障混在一起。
func addressError(err error) error {
	switch {
	case errors.Is(err, biz.ErrAddressNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, biz.ErrInvalidAddressID):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeUnknown, err)
	}
}
