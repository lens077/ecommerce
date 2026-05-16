package biz

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

var ErrInsufficientStock = errors.New("[Stock] insufficient stock")
var ErrOrderAlreadyExists = errors.New("[Stock] order_no is exists")
var ErrOrderNotFound = errors.New("[Stock] order_no is not found")
var ErrOrderItemsSkuIdNotFound = errors.New("[Stock] items sku_id is not found")

// InventoryInfo 业务层库存模型
type InventoryInfo struct {
}

type (
	ReserveRequest struct {
		MerchantID   uuid.UUID
		ReserveItems []ReserveItem
		WarehouseID  string
		Version      int32
		OrderNo      string
	}
	ReserveItem struct {
		SkuID       int64
		Quantity    int32
		WarehouseID string
	}
	ReserveResponse struct {
		Status bool
		Msg    string
	}
)
type (
	ReleaseReserveRequest struct {
	}

	ReleaseReserveResponse struct {
	}
)

// InventoryRepo 库存接口
type InventoryRepo interface {
	Reserve(ctx context.Context, req ReserveRequest) (*ReserveResponse, error)
	ReleaseReserve(ctx context.Context, req ReleaseReserveRequest) (*ReleaseReserveResponse, error)
}

type InventoryUseCase struct {
	repo   InventoryRepo
	logger *zap.Logger
}

func NewInventoryUseCase(repo InventoryRepo, logger *zap.Logger) *InventoryUseCase {
	return &InventoryUseCase{
		repo:   repo,
		logger: logger.Named("InventoryUseCase"),
	}
}

func (uc *InventoryUseCase) Reserve(ctx context.Context, req ReserveRequest) (*ReserveResponse, error) {
	return uc.repo.Reserve(ctx, req)
}

func (uc *InventoryUseCase) ReleaseReserve(ctx context.Context, req ReleaseReserveRequest) (*ReleaseReserveResponse, error) {
	return uc.repo.ReleaseReserve(ctx, req)
}
