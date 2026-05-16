package data

import (
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/inventory/internal/biz"
	"github.com/lens077/ecommerce/backend/services/inventory/internal/data/models"

	"context"

	"go.uber.org/zap"
)

var _ biz.InventoryRepo = (*inventoryRepo)(nil)

type inventoryRepo struct {
	data *Data
	log  *zap.Logger
}

func NewInventoryRepo(data *Data, logger *zap.Logger) biz.InventoryRepo {
	return &inventoryRepo{
		data: data,
		log:  logger.Named("InventoryRepo"),
	}
}

func (u *inventoryRepo) Reserve(ctx context.Context, req biz.ReserveRequest) (*biz.ReserveResponse, error) {
	// 1. 开启事务
	db := u.data.DB(ctx)
	// 对items进行排序防止死锁
	// 可能的死锁: 两个并发事务以不同顺序锁定相同的几行，就会互相等待
	// sort.Slice(req.ReserveItems, func(i, j int) bool {
	// 	if req.ReserveItems[i].SkuID == req.ReserveItems[j].SkuID {
	// 		return req.ReserveItems[i].WarehouseID < req.ReserveItems[j].WarehouseID
	// 	}
	// 	return req.ReserveItems[i].SkuID < req.ReserveItems[j].SkuID
	// }
	for _, item := range req.ReserveItems {
		// 2. 查询当前库存（SELECT available, version FROM ... WHERE ... FOR UPDATE）
		stock, err := db.GetStockBySkuId(ctx, models.GetStockBySkuIdParams{
			MerchantID: req.MerchantID,
			SkuID:      item.SkuID,
		})
		if err != nil {
			return nil, u.data.dbErrHandler.MustHandleError(err, biz.ErrOrderItemsSkuIdNotFound)
		}
		// 3. 校验 available >= req.Quantity，否则返回库存不足
		if stock.Available < item.Quantity {
			return nil, biz.ErrInsufficientStock
		}
		// 4. 执行 Reserve 更新（available = available - quantity, version = version + 1）
		_, reserveErr := u.data.db.Reserve(ctx, models.ReserveParams{
			Quantity:    stock.Available - item.Quantity,
			MerchantID:  req.MerchantID,
			SkuID:       item.SkuID,
			WarehouseID: req.WarehouseID,
			Version:     stock.Version + 1,
		})
		if reserveErr != nil {
			return nil, u.data.dbErrHandler.MustHandleError(err, biz.ErrOrderItemsSkuIdNotFound)
		}
		// 5. 插入日志（幂等）
		insertChangeLogErr := u.data.db.InsertChangeLog(ctx, models.InsertChangeLogParams{
			OrderNo:         req.OrderNo,
			SkuID:           item.SkuID,
			WarehouseID:     req.WarehouseID,
			MerchantID:      req.MerchantID,
			Quantity:        item.Quantity,
			BeforeAvailable: stock.Available,
			AfterAvailable:  stock.Available - item.Quantity,
			BeforeOnHand:    stock.OnHand,
			AfterOnHand:     stock.OnHand,
			BeforeLocked:    stock.Locked,
			AfterLocked:     stock.Locked,
			FromStatus:      (*models.Stockstatus)(new(constants.StockStatusAvailable)),
			ToStatus:        models.Stockstatus(constants.StockStatusReserved),
		})
		if insertChangeLogErr != nil {
			return nil, u.data.dbErrHandler.MustHandleError(err, biz.ErrOrderNotFound)
		}
	}

	// 6. 提交事务
	// 如果行数为0，回滚并重试（乐观锁）
	return &biz.ReserveResponse{}, nil
}

func (u *inventoryRepo) ReleaseReserve(ctx context.Context, req biz.ReleaseReserveRequest) (*biz.ReleaseReserveResponse, error) {
	// TODO implement me
	panic("implement me")
}
