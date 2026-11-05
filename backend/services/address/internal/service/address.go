package service

import (
	"context"
	"errors"

	"connectrpc.com/connect/v2"
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

func (s *AddressService) CreateAddress(ctx context.Context, c *v1.CreateAddressRequest) (*v1.CreateAddressResponse, error) {
	info, _ := connect.CallInfoForServerContext(ctx)
	if info == nil {
		info = &connect.CallInfo{} // 直调(单测)无 CallInfo;经 Server.Call 时必有
	}
	userID, err := uuid.Parse(info.RequestHeader().Get(constants.UserIdMetadataKey))
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnauthenticated, "invalid authenticated user id")
	}

	result, err := s.uc.CreateAddress(ctx, biz.CreateAddressRequest{
		RecipientName:  c.RecipientName,
		RecipientPhone: c.RecipientPhone,
		UserID:         userID.String(),
		Detail: &biz.AddressDetail{
			Province:   c.Detail.Province,
			City:       c.Detail.City,
			District:   c.Detail.District,
			Detail:     c.Detail.Detail,
			PostalCode: c.Detail.PostalCode,
			FullText:   c.Detail.FullText,
		},
		IsDefault: c.IsDefault,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return &v1.CreateAddressResponse{
		AddressId: result.AddressID,
	}, nil
}

func (s *AddressService) UpdateAddress(ctx context.Context, c *v1.UpdateAddressRequest) (*v1.UpdateAddressResponse, error) {
	var recipientName, recipientPhone *string
	if c.RecipientName != nil {
		recipientName = &c.RecipientName.Value
	}
	if c.RecipientPhone != nil {
		recipientPhone = &c.RecipientPhone.Value
	}

	var detail *biz.AddressDetail
	if c.Detail != nil {
		detail = &biz.AddressDetail{
			Province:   c.Detail.Province,
			City:       c.Detail.City,
			District:   c.Detail.District,
			Detail:     c.Detail.Detail,
			PostalCode: c.Detail.PostalCode,
			FullText:   c.Detail.FullText,
		}
	}

	_, err := s.uc.UpdateAddress(ctx, biz.UpdateAddressRequest{
		AddressID:      c.AddressId,
		RecipientName:  recipientName,
		RecipientPhone: recipientPhone,
		Detail:         detail,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return &v1.UpdateAddressResponse{}, nil
}

func (s *AddressService) DeleteAddress(ctx context.Context, c *v1.DeleteAddressRequest) (*v1.DeleteAddressResponse, error) {
	_, err := s.uc.DeleteAddress(ctx, biz.DeleteAddressRequest{
		AddressID: c.AddressId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return &v1.DeleteAddressResponse{}, nil
}

func (s *AddressService) GetAddress(ctx context.Context, c *v1.GetAddressRequest) (*v1.GetAddressResponse, error) {
	result, err := s.uc.GetAddress(ctx, biz.GetAddressRequest{
		AddressID: c.AddressId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	if result == nil {
		return nil, connect.Errorf(connect.CodeNotFound, "address not found")
	}

	return &v1.GetAddressResponse{
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
	}, nil
}

func (s *AddressService) ListAddresses(ctx context.Context, c *v1.ListAddressesRequest) (*v1.ListAddressesResponse, error) {
	info, _ := connect.CallInfoForServerContext(ctx)
	if info == nil {
		info = &connect.CallInfo{} // 直调(单测)无 CallInfo;经 Server.Call 时必有
	}
	userIdStr := info.RequestHeader().Get(constants.UserIdMetadataKey)
	customerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnauthenticated, "invalid authenticated user id")
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

	return &v1.ListAddressesResponse{
		Addresses: addresses,
	}, nil
}

func (s *AddressService) SetDefaultAddress(ctx context.Context, c *v1.SetDefaultAddressRequest) (*v1.SetDefaultAddressResponse, error) {
	_, err := s.uc.SetDefaultAddress(ctx, biz.SetDefaultAddressRequest{
		AddressID: c.AddressId,
	})
	if err != nil {
		return nil, addressError(err)
	}

	return &v1.SetDefaultAddressResponse{}, nil
}

// addressError 把 biz 哨兵错误映射为 RPC 错误码（docs/design/platform/error-handling.md 第 3 条）。
// 未映射时 connect 记成 unknown，日志拦截器按「rpc system error」报 ERROR；
// 地址不存在、地址 ID 非法都是调用方可预期的结果，不能和系统故障混在一起。
func addressError(err error) error {
	switch {
	case errors.Is(err, biz.ErrAddressNotFound):
		return connect.NewError(connect.CodeNotFound, err.Error()).WithCause(err)
	case errors.Is(err, biz.ErrInvalidAddressID):
		return connect.NewError(connect.CodeInvalidArgument, err.Error()).WithCause(err)
	default:
		return connect.NewError(connect.CodeUnknown, err.Error()).WithCause(err)
	}
}
