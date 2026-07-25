package service

import (
	"context"
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
	result, err := s.uc.CreateAddress(ctx, biz.CreateAddressRequest{
		RecipientName:  c.Msg.RecipientName,
		RecipientPhone: c.Msg.RecipientPhone,
		UserID:         c.Msg.UserId,
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
		return nil, err
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
		return nil, err
	}

	return connect.NewResponse(&v1.UpdateAddressResponse{}), nil
}

func (s *AddressService) DeleteAddress(ctx context.Context, c *connect.Request[v1.DeleteAddressRequest]) (*connect.Response[v1.DeleteAddressResponse], error) {
	_, err := s.uc.DeleteAddress(ctx, biz.DeleteAddressRequest{
		AddressID: c.Msg.AddressId,
	})
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.DeleteAddressResponse{}), nil
}

func (s *AddressService) GetAddress(ctx context.Context, c *connect.Request[v1.GetAddressRequest]) (*connect.Response[v1.GetAddressResponse], error) {
	result, err := s.uc.GetAddress(ctx, biz.GetAddressRequest{
		AddressID: c.Msg.AddressId,
	})
	if err != nil {
		return nil, err
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
	consumerId, err := uuid.Parse(userIdStr)
	if err != nil {
		return nil, err
	}

	result, err := s.uc.ListAddresses(ctx, biz.ListAddressesRequest{
		UserID: consumerId,
	})
	if err != nil {
		return nil, err
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
		return nil, err
	}

	return connect.NewResponse(&v1.SetDefaultAddressResponse{}), nil
}
