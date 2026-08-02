package data

import (
	"context"

	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
	"go.uber.org/zap"
)

var _ biz.RegionRepo = (*regionRepo)(nil)

type regionRepo struct {
	data *Data
	log  *zap.Logger
}

func NewRegionRepo(data *Data, logger *zap.Logger) biz.RegionRepo {
	return &regionRepo{
		data: data,
		log:  logger,
	}
}

// ListRegions 直接查库，不做缓存。
//
// 单次最多 500 行（省级 35 / 某省下的市 / 某市下的区），走 idx_regions_parent
// 是索引扫描，加缓存换来的收益还不如多一层失效逻辑的麻烦。真要扛量了
// Data 里已经有 Redis client，那时再说。
func (r *regionRepo) ListRegions(ctx context.Context, req biz.ListRegionsRequest) (*biz.ListRegionsResponse, error) {
	rows, err := r.data.queries.ListRegionsByParent(ctx, req.ParentID)
	if err != nil {
		r.log.Error("ListRegionsByParent failed", zap.Int32("parent_id", req.ParentID), zap.Error(err))
		return nil, err
	}

	// 省级列表为空只可能是没灌数据 —— 下级为空是正常的（省直辖县级行政区没有区县），
	// 但省级为空一定是漏跑了 seed_regions.sql，把话说清楚省得去翻库。
	if len(rows) == 0 && req.ParentID == 0 {
		total, cntErr := r.data.queries.CountRegions(ctx)
		if cntErr == nil && total == 0 {
			r.log.Warn("addresses.regions 表是空的，行政区划接口会一直返回空列表；" +
				"请执行 internal/data/seed/seed_regions.sql 灌入数据")
		}
	}

	regions := make([]*biz.Region, 0, len(rows))
	for _, row := range rows {
		regions = append(regions, &biz.Region{
			ID:       row.ID,
			ParentID: row.ParentID,
			Level:    int32(row.Level),
			Code:     row.Code,
			Name:     row.Name,
			NameEN:   row.NameEn,
			Pinyin:   row.Pinyin,
		})
	}

	return &biz.ListRegionsResponse{Regions: regions}, nil
}
