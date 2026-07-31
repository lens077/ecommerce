package data

import (
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
	"github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/config"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/dbutil"
	"github.com/lens077/ecommerce/backend/services/cart/internal/pkg/money"

	"context"

	"go.uber.org/zap"
)

var _ biz.CartRepo = (*cartRepo)(nil)

type cartRepo struct {
	queries *models.Queries
	rdb     *LiveRedis
	log     *zap.Logger
	// live 当前配置。存 *Live 而不是 *conf.Bootstrap:后者是构造那一刻的快照,
	// 存下来就等于把这个 repo 永久钉死在启动时的配置上,热更新对它无效。
	live *config.Live
}

func (c cartRepo) RemoveCartItem(ctx context.Context, req biz.RemoveCartItemRequest) (*biz.RemoveCartItemResponse, error) {
	statuses := make([]models.CartCartType, 0, len(req.Statuses))
	for _, status := range req.Statuses {
		statuses = append(statuses, models.CartCartType(status))
	}
	status := models.CartCartType(constants.CartStatusActive)
	c.log.Sugar().Debugf("11231%v", status)
	c.log.Sugar().Debugf("11231%+v", statuses)
	var cart, err = c.queries.RemoveCartItem(ctx, models.RemoveCartItemParams{
		UserID: pgtype.UUID{
			Bytes: req.ConsumerId,
			Valid: true,
		},
		MerchantIds: req.MerchantIds,
		SpuIds:      req.SpuIds,
		SkuIds:      req.SkuIds,
		Statuses:    statuses, // 要删除的商品它们的状态
		Status:      &status,  // 查询该用户的购物车的商品状态
	})
	if err != nil {
		return nil, err
	}
	return &biz.RemoveCartItemResponse{
		CartItemQuantity: uint32(cart.CartItemQuantity),
		IsCartEmpty:      cart.IsCartEmpty,
	}, nil
}

func (c cartRepo) UpdateCartItemQuantity(ctx context.Context, req biz.UpdateCartItemQuantityRequest) (*biz.UpdateCartItemQuantityResponse, error) {
	status := models.CartCartType(req.Status)
	var CartItemQuantity, err = c.queries.UpdateCartItemQuantity(ctx, models.UpdateCartItemQuantityParams{
		MerchantID: pgtype.UUID{
			Bytes: req.MerchantId,
			Valid: true,
		},
		UserID: pgtype.UUID{
			Bytes: req.ConsumerId,
			Valid: true,
		},
		SpuID:  new(int64(req.SpuId)),
		SkuID:  new(int64(req.SkuId)),
		Status: &status,
	})
	if err != nil {
		return nil, err
	}
	return &biz.UpdateCartItemQuantityResponse{
		CartItemQuantity: uint32(CartItemQuantity),
	}, nil
}

func (c cartRepo) GetCart(ctx context.Context, req biz.GetCartRequest) (*biz.GetCartResponse, error) {
	status := models.CartCartType(req.Status)
	rows, err := c.queries.GetCartItems(ctx, models.GetCartItemsParams{
		UserID: req.ConsumerId,
		Status: status,
	})
	if err != nil {
		return nil, err
	}

	totalCartItemQuantity := len(rows)
	var items []*biz.CartItem

	for _, row := range rows {
		price, _ := money.NumericToFloat(row.Price)

		// 每次请求都读当前配置:改完对象存储域名下一个请求就用新的,不必重启
		skuThumbnailUrl := pkg.FormatObjectURL(string(constants.BucketEcommerce), row.SkuThumbnailUrl, c.live.Get().GetStore())
		statusEnum := dbutil.ToCartStatusEnum(row.Status)
		items = append(items, &biz.CartItem{
			ID:              row.ID,
			MerchantId:      row.MerchantID,
			ShopName:        row.ShopName,
			SpuId:           uint64(row.SpuID),
			SkuId:           uint64(row.SkuID),
			Quantity:        uint32(row.Quantity),
			Selected:        row.Selected,
			SpuName:         row.SpuName,
			SkuName:         row.SkuName,
			Price:           price,
			SkuAttributes:   row.SkuAttributes,
			SkuThumbnailUrl: skuThumbnailUrl,
			Status:          statusEnum,
		})

	}

	return &biz.GetCartResponse{
		Items:            items,
		CartItemQuantity: uint32(totalCartItemQuantity),
		IsCartEmpty:      len(items) == 0,
	}, nil
}

func (c cartRepo) GetCartSummary(ctx context.Context, req biz.GetCartSummaryRequest) (*biz.GetCartSummaryResponse, error) {
	status := models.CartCartType(req.Status)
	totalCount, err := c.queries.GetCartSummary(ctx, models.GetCartSummaryParams{
		UserID: req.ConsumerId,
		Status: status,
	})
	if err != nil {
		return nil, err
	}

	return &biz.GetCartSummaryResponse{
		TotalCount: uint32(totalCount),
	}, nil
}

func (c cartRepo) AddProductToCart(ctx context.Context, req biz.AddProductToCartRequest) (*biz.AddProductToCartResponse, error) {
	price, err := money.Float64ToNumeric(req.Price)
	if err != nil {
		return nil, err
	}
	row, err := c.queries.AddProductToCart(ctx, models.AddProductToCartParams{
		UserID: pgtype.UUID{
			Bytes: req.ConsumerId,
			Valid: true,
		},
		MerchantID: pgtype.UUID{
			Bytes: req.MerchantId,
			Valid: true,
		},

		SpuID:           new(int64(req.SpuID)),
		SkuID:           new(int64(req.SkuID)),
		Quantity:        new(int32(req.Quantity)),
		Selected:        new(req.Selected),
		SpuName:         new(req.SpuName),
		SkuName:         new(req.SkuName),
		Price:           price,
		SkuAttributes:   req.SkuAttributes,
		SkuThumbnailUrl: new(req.SkuThumbnailUrl),
		Status:          new(models.CartCartType(constants.CartStatusActive)),
	})
	if err != nil {
		return nil, err
	}

	return &biz.AddProductToCartResponse{
		CartItemQuantity: int32(row.CartItemQuantity),
		CartItemId:       uint64(row.CartItemID),
	}, nil
}

func NewCartRepo(data *Data, logger *zap.Logger, live *config.Live) biz.CartRepo {
	return &cartRepo{
		// 传入 *PgPool 这个壳而非某个具体的池,连接池热重建后 queries 依旧有效
		queries: models.New(data.db),
		rdb:     data.rdb,
		log:     logger,
		live:    live,
	}
}
