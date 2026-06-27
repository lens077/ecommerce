package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
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
	detailJSON, err := json.Marshal(req.Detail)
	if err != nil {
		r.log.Error("Failed to marshal address detail", zap.Error(err))
		return nil, err
	}

	fullText := req.Detail.Province + " " + req.Detail.City + " " + req.Detail.District + " " + req.Detail.Detail

	query := `
		INSERT INTO addresses (address_id, recipient_name, recipient_phone, user_id, detail, full_text, is_default)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING address_id
	`

	var addressID string
	err = r.data.db.QueryRow(ctx, query,
		req.UserID+"_"+req.RecipientPhone[:4], // 简单生成唯一ID
		req.RecipientName,
		req.RecipientPhone,
		req.UserID,
		detailJSON,
		fullText,
		req.IsDefault,
	).Scan(&addressID)

	if err != nil {
		r.log.Error("CreateAddress failed", zap.Error(err))
		return nil, err
	}

	if req.IsDefault {
		_, err := r.data.db.Exec(ctx,
			`UPDATE addresses SET is_default = false WHERE user_id = $1 AND address_id != $2`,
			req.UserID, addressID,
		)
		if err != nil {
			r.log.Warn("Reset default address failed", zap.Error(err))
		}
	}

	return &biz.CreateAddressResponse{AddressID: addressID}, nil
}

func (r *addressRepo) UpdateAddress(ctx context.Context, req biz.UpdateAddressRequest) (*biz.UpdateAddressResponse, error) {
	query := `UPDATE addresses SET updated_at = CURRENT_TIMESTAMP`
	args := []interface{}{}
	argCount := 0

	if req.RecipientName != nil {
		argCount++
		query += fmt.Sprintf(", recipient_name = $%d", argCount)
		args = append(args, *req.RecipientName)
	}

	if req.RecipientPhone != nil {
		argCount++
		query += fmt.Sprintf(", recipient_phone = $%d", argCount)
		args = append(args, *req.RecipientPhone)
	}

	if req.Detail != nil {
		detailJSON, err := json.Marshal(req.Detail)
		if err != nil {
			r.log.Error("Failed to marshal address detail", zap.Error(err))
			return nil, err
		}

		fullText := req.Detail.Province + " " + req.Detail.City + " " + req.Detail.District + " " + req.Detail.Detail

		argCount++
		query += fmt.Sprintf(", detail = $%d", argCount)
		args = append(args, detailJSON)

		argCount++
		query += fmt.Sprintf(", full_text = $%d", argCount)
		args = append(args, fullText)
	}

	argCount++
	query += fmt.Sprintf(" WHERE address_id = $%d AND deleted_at IS NULL", argCount)
	args = append(args, req.AddressID)

	result, err := r.data.db.Exec(ctx, query, args...)
	if err != nil {
		r.log.Error("UpdateAddress failed", zap.Error(err))
		return nil, err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return nil, sql.ErrNoRows
	}

	return &biz.UpdateAddressResponse{}, nil
}

func (r *addressRepo) DeleteAddress(ctx context.Context, req biz.DeleteAddressRequest) (*biz.DeleteAddressResponse, error) {
	query := `UPDATE addresses SET deleted_at = CURRENT_TIMESTAMP WHERE address_id = $1 AND deleted_at IS NULL`

	result, err := r.data.db.Exec(ctx, query, req.AddressID)
	if err != nil {
		r.log.Error("DeleteAddress failed", zap.Error(err))
		return nil, err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return nil, sql.ErrNoRows
	}

	return &biz.DeleteAddressResponse{}, nil
}

func (r *addressRepo) GetAddress(ctx context.Context, req biz.GetAddressRequest) (*biz.GetAddressResponse, error) {
	query := `
		SELECT address_id, recipient_name, recipient_phone, user_id, detail, is_default, created_at, updated_at
		FROM addresses
		WHERE address_id = $1 AND deleted_at IS NULL
	`

	var (
		addressID      string
		recipientName  string
		recipientPhone string
		userID         string
		detailJSON     []byte
		isDefault      bool
		createdAt      time.Time
		updatedAt      time.Time
	)

	err := r.data.db.QueryRow(ctx, query, req.AddressID).Scan(
		&addressID,
		&recipientName,
		&recipientPhone,
		&userID,
		&detailJSON,
		&isDefault,
		&createdAt,
		&updatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		r.log.Error("GetAddress failed", zap.Error(err))
		return nil, err
	}

	var detail biz.AddressDetail
	if err := json.Unmarshal(detailJSON, &detail); err != nil {
		r.log.Error("Failed to unmarshal address detail", zap.Error(err))
		return nil, err
	}

	return &biz.GetAddressResponse{
		AddressID:      addressID,
		RecipientName:  recipientName,
		RecipientPhone: recipientPhone,
		UserID:         userID,
		Detail:         &detail,
		IsDefault:      isDefault,
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}, nil
}

func (r *addressRepo) ListAddresses(ctx context.Context, req biz.ListAddressesRequest) (*biz.ListAddressesResponse, error) {
	query := `
		SELECT address_id, recipient_name, recipient_phone, user_id, detail, is_default, created_at, updated_at
		FROM addresses
		WHERE user_id = $1 AND deleted_at IS NULL
		ORDER BY is_default DESC, created_at DESC
	`

	rows, err := r.data.db.Query(ctx, query, req.UserID)
	if err != nil {
		r.log.Error("ListAddresses failed", zap.Error(err))
		return nil, err
	}
	defer rows.Close()

	var addresses []*biz.GetAddressResponse
	for rows.Next() {
		var (
			addressID      string
			recipientName  string
			recipientPhone string
			userID         string
			detailJSON     []byte
			isDefault      bool
			createdAt      time.Time
			updatedAt      time.Time
		)

		err := rows.Scan(
			&addressID,
			&recipientName,
			&recipientPhone,
			&userID,
			&detailJSON,
			&isDefault,
			&createdAt,
			&updatedAt,
		)
		if err != nil {
			r.log.Error("ListAddresses scan failed", zap.Error(err))
			return nil, err
		}

		var detail biz.AddressDetail
		if err := json.Unmarshal(detailJSON, &detail); err != nil {
			r.log.Error("Failed to unmarshal address detail", zap.Error(err))
			return nil, err
		}

		addresses = append(addresses, &biz.GetAddressResponse{
			AddressID:      addressID,
			RecipientName:  recipientName,
			RecipientPhone: recipientPhone,
			UserID:         userID,
			Detail:         &detail,
			IsDefault:      isDefault,
			CreatedAt:      createdAt,
			UpdatedAt:      updatedAt,
		})
	}

	return &biz.ListAddressesResponse{Addresses: addresses}, nil
}

func (r *addressRepo) SetDefaultAddress(ctx context.Context, req biz.SetDefaultAddressRequest) (*biz.SetDefaultAddressResponse, error) {
	tx, err := r.data.db.Begin(ctx)
	if err != nil {
		r.log.Error("Begin transaction failed", zap.Error(err))
		return nil, err
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `SELECT user_id FROM addresses WHERE address_id = $1 AND deleted_at IS NULL`, req.AddressID).Scan(&userID)
	if err == sql.ErrNoRows {
		return nil, sql.ErrNoRows
	}
	if err != nil {
		r.log.Error("Get user_id failed", zap.Error(err))
		return nil, err
	}

	_, err = tx.Exec(ctx, `UPDATE addresses SET is_default = false WHERE user_id = $1`, userID)
	if err != nil {
		r.log.Error("Reset default addresses failed", zap.Error(err))
		return nil, err
	}

	_, err = tx.Exec(ctx, `UPDATE addresses SET is_default = true WHERE address_id = $1`, req.AddressID)
	if err != nil {
		r.log.Error("Set default address failed", zap.Error(err))
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		r.log.Error("Commit transaction failed", zap.Error(err))
		return nil, err
	}

	return &biz.SetDefaultAddressResponse{}, nil
}