package data

import (
	"context"
	"errors"
	"fmt"

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
	addressUUID, err := parseAddressID(req.AddressID)
	if err != nil {
		return nil, err
	}

	address, err := r.data.queries.GetAddressByID(ctx, addressUUID)
	if err != nil {
		if isNoRows(err) {
			return nil, fmt.Errorf("%w: %w", biz.ErrAddressNotFound, err)
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
	addressUUID, err := parseAddressID(req.AddressID)
	if err != nil {
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
	addressUUID, err := parseAddressID(req.AddressID)
	if err != nil {
		return nil, err
	}

	address, err := r.data.queries.GetAddressByID(ctx, addressUUID)
	if err != nil {
		if isNoRows(err) {
			return nil, fmt.Errorf("%w: %w", biz.ErrAddressNotFound, err)
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
	addressUUID, err := parseAddressID(req.AddressID)
	if err != nil {
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
		if isNoRows(err) {
			return nil, fmt.Errorf("%w: %w", biz.ErrAddressNotFound, err)
		}
		r.log.Error("SetDefaultAddress failed", zap.Error(err))
		return nil, err
	}

	return &biz.SetDefaultAddressResponse{}, nil
}

// isNoRows 判断「查不到」。sqlc 生成的查询走 pgx，返回的是 pgx.ErrNoRows；
// 旧代码用 `err == sql.ErrNoRows` 比较，这个条件永远不成立——地址不存在时先打
// ERROR 日志，再以 rpc.code=unknown 返回（2026-09-23 修正）。
func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

// parseAddressID 把非法 ID 包装成 biz.ErrInvalidAddressID：这是调用方的输入错误，
// 不是服务故障，不打 ERROR 日志，由 service 层映射为 invalid_argument。
func parseAddressID(id string) (uuid.UUID, error) {
	addressUUID, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%w: %w", biz.ErrInvalidAddressID, err)
	}
	return addressUUID, nil
}

func txFromCtx(ctx context.Context) pgx.Tx {
	tx, _ := ctx.Value(contextTxKey{}).(pgx.Tx)
	return tx
}
