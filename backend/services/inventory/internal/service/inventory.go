package service

import (
	"context"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	inventoryv1 "github.com/lens077/ecommerce/backend/api/inventory/v1"
	"github.com/lens077/ecommerce/backend/api/inventory/v1/inventoryv1connect"
	"github.com/lens077/ecommerce/backend/services/inventory/internal/biz"
)

// InventoryService 实现 Connect 服务
type InventoryService struct {
	uc *biz.InventoryUseCase
}

func (s *InventoryService) Reserve(ctx context.Context, c *connect.Request[inventoryv1.ReserveRequest]) (*connect.Response[inventoryv1.ReserveResponse], error) {
	items := make([]biz.ReserveItem, 0, len(c.Msg.Items))
	// items := make([]biz.ReserveItem, 0)
	for _, item := range c.Msg.Items {
		items = append(items, biz.ReserveItem{
			SkuID:    item.SkuId,
			Quantity: item.Quantity,
		})
	}
	merchantId, err := uuid.Parse(c.Msg.MerchantId)
	if err != nil {
		return nil, err
	}
	reserve, err := s.uc.Reserve(ctx, biz.ReserveRequest{
		MerchantID:   merchantId,
		ReserveItems: items,
		WarehouseID:  "df0001", // TODO WarehouseID
		OrderNo:      c.Msg.OrderNo,
	})
	if err != nil {
		return nil, err
	}
	response := &inventoryv1.ReserveResponse{
		Status: reserve.Status,
		Msg:    reserve.Msg,
	}

	return connect.NewResponse(response), nil
}

func (s *InventoryService) ReleaseReserve(ctx context.Context, c *connect.Request[inventoryv1.ReleaseReserveRequest]) (*connect.Response[inventoryv1.ReleaseReserveResponse], error) {
	response := &inventoryv1.ReleaseReserveResponse{
		Status: false,
		Msg:    "",
	}

	return connect.NewResponse(response), nil
}

// 显式接口检查
var _ inventoryv1connect.InventoryServiceHandler = (*InventoryService)(nil)

func NewInventoryService(uc *biz.InventoryUseCase) inventoryv1connect.InventoryServiceHandler {
	return &InventoryService{
		uc: uc,
	}
}
