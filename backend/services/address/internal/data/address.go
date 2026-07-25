package data

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
	"github.com/lens077/ecommerce/backend/services/address/internal/data/models"
	"go.uber.org/zap"
)

var _ biz.AddressRepo = (*addressRepo)(nil)

type addressRepo struct {
	data *Data
	log  *zap.Logger
}

func NewAddressRepo(data *Data, logger *zap.Logger) biz.AddressRepo {
	return &addressRepo{
		data: data,
		log:  logger,
	}
}

func (r *addressRepo) CreateAddress(ctx context.Context, req biz.CreateAddressRequest) (*biz.CreateAddressResponse, error) {
	addressID := uuid.New()

	var province, city, district, detail, postalCode, fullText string
	if req.Detail != nil {
		province = req.Detail.Province
		city = req.Detail.City
		district = req.Detail.District
		detail = req.Detail.Detail
		postalCode = req.Detail.PostalCode
		if req.Detail.FullText != "" {
			fullText = req.Detail.FullText
		} else {
			fullText = province + " " + city + " " + district + " " + detail
		}
	}

	err := r.data.ExecTx(ctx, func(txCtx context.Context) error {
		q := r.data.queries.WithTx(txFromCtx(txCtx))

		if req.IsDefault {
			if err := q.UnsetAllDefaultByUserID(txCtx, req.UserID); err != nil {
				r.log.Warn("UnsetAllDefaultByUserID failed", zap.Error(err))
			}
		}

		return q.CreateAddress(txCtx, models.CreateAddressParams{
			AddressID:      addressID,
			UserID:         req.UserID,
			RecipientName:  req.RecipientName,
			RecipientPhone: req.RecipientPhone,
			Province:       province,
			City:           city,
			District:       district,
			Detail:         detail,
			PostalCode:     postalCode,
			FullText:       fullText,
			IsDefault:      req.IsDefault,
		})
	})
	if err != nil {
		r.log.Error("CreateAddress failed", zap.Error(err))
		return nil, err
	}

	return &biz.CreateAddressResponse{AddressID: addressID.String()}, nil
}

func (r *addressRepo) UpdateAddress(ctx context.Context, req biz.UpdateAddressRequest) (*biz.UpdateAddressResponse, error) {
	addressUUID, err := uuid.Parse(req.AddressID)
	if err != nil {
		r.log.Error("Invalid address ID", zap.Error(err))
		return nil, err
	}

	address, err := r.data.queries.GetAddressByID(ctx, addressUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		r.log.Error("GetAddressByID failed", zap.Error(err))
		return nil, err
	}

	recipientName := address.RecipientName
	recipientPhone := address.RecipientPhone
	province := address.Province
	city := address.City
	district := address.District
	detail := address.Detail
	postalCode := address.PostalCode
	fullText := address.FullText

	if req.RecipientName != nil {
		recipientName = *req.RecipientName
	}
	if req.RecipientPhone != nil {
		recipientPhone = *req.RecipientPhone
	}
	if req.Detail != nil {
		province = req.Detail.Province
		city = req.Detail.City
		district = req.Detail.District
		detail = req.Detail.Detail
		postalCode = req.Detail.PostalCode
		if req.Detail.FullText != "" {
			fullText = req.Detail.FullText
		} else {
			fullText = province + " " + city + " " + district + " " + detail
		}
	}

	err = r.data.queries.UpdateAddress(ctx, models.UpdateAddressParams{
		AddressID:      addressUUID,
		RecipientName:  recipientName,
		RecipientPhone: recipientPhone,
		Province:       province,
		City:           city,
		District:       district,
		Detail:         detail,
		PostalCode:     postalCode,
		FullText:       fullText,
	})
	if err != nil {
		r.log.Error("UpdateAddress failed", zap.Error(err))
		return nil, err
	}

	return &biz.UpdateAddressResponse{}, nil
}

func (r *addressRepo) DeleteAddress(ctx context.Context, req biz.DeleteAddressRequest) (*biz.DeleteAddressResponse, error) {
	addressUUID, err := uuid.Parse(req.AddressID)
	if err != nil {
		r.log.Error("Invalid address ID", zap.Error(err))
		return nil, err
	}

	err = r.data.queries.DeleteAddress(ctx, addressUUID)
	if err != nil {
		r.log.Error("DeleteAddress failed", zap.Error(err))
		return nil, err
	}

	return &biz.DeleteAddressResponse{}, nil
}

func (r *addressRepo) GetAddress(ctx context.Context, req biz.GetAddressRequest) (*biz.GetAddressResponse, error) {
	addressUUID, err := uuid.Parse(req.AddressID)
	if err != nil {
		r.log.Error("Invalid address ID", zap.Error(err))
		return nil, err
	}

	address, err := r.data.queries.GetAddressByID(ctx, addressUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		r.log.Error("GetAddress failed", zap.Error(err))
		return nil, err
	}

	return &biz.GetAddressResponse{
		AddressID:      address.AddressID.String(),
		RecipientName:  address.RecipientName,
		RecipientPhone: address.RecipientPhone,
		UserID:         address.UserID,
		Detail: &biz.AddressDetail{
			Province:   address.Province,
			City:       address.City,
			District:   address.District,
			Detail:     address.Detail,
			PostalCode: address.PostalCode,
			FullText:   address.FullText,
		},
		IsDefault: address.IsDefault,
		CreatedAt: address.CreatedAt.Time,
		UpdatedAt: address.UpdatedAt.Time,
	}, nil
}

func (r *addressRepo) ListAddresses(ctx context.Context, req biz.ListAddressesRequest) (*biz.ListAddressesResponse, error) {
	userAddresses, err := r.data.queries.ListAddressesByUserID(ctx, req.UserID.String())
	if err != nil {
		r.log.Error("ListAddresses failed", zap.Error(err))
		return nil, err
	}

	var addresses []*biz.GetAddressResponse

	for _, address := range userAddresses {
		addresses = append(addresses, &biz.GetAddressResponse{
			AddressID:      address.AddressID.String(),
			RecipientName:  address.RecipientName,
			RecipientPhone: address.RecipientPhone,
			UserID:         address.UserID,
			Detail: &biz.AddressDetail{
				Province:   address.Province,
				City:       address.City,
				District:   address.District,
				Detail:     address.Detail,
				PostalCode: address.PostalCode,
				FullText:   address.FullText,
			},
			IsDefault: address.IsDefault,
			CreatedAt: address.CreatedAt.Time,
			UpdatedAt: address.UpdatedAt.Time,
		})
	}

	return &biz.ListAddressesResponse{Addresses: addresses}, nil
}

func (r *addressRepo) SetDefaultAddress(ctx context.Context, req biz.SetDefaultAddressRequest) (*biz.SetDefaultAddressResponse, error) {
	addressUUID, err := uuid.Parse(req.AddressID)
	if err != nil {
		r.log.Error("Invalid address ID", zap.Error(err))
		return nil, err
	}

	err = r.data.ExecTx(ctx, func(txCtx context.Context) error {
		q := r.data.queries.WithTx(txFromCtx(txCtx))

		address, err := q.GetAddressByID(txCtx, addressUUID)
		if err != nil {
			return err
		}

		if err := q.UnsetAllDefaultByUserID(txCtx, address.UserID); err != nil {
			return err
		}

		return q.SetDefaultAddress(txCtx, addressUUID)
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		r.log.Error("SetDefaultAddress failed", zap.Error(err))
		return nil, err
	}

	return &biz.SetDefaultAddressResponse{}, nil
}

func txFromCtx(ctx context.Context) pgx.Tx {
	tx, _ := ctx.Value(contextTxKey{}).(pgx.Tx)
	return tx
}
