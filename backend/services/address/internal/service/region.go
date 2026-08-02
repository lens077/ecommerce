package service

import (
	"context"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/address/v1"
	"github.com/lens077/ecommerce/backend/api/address/v1/addressv1connect"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
)

type RegionService struct {
	uc *biz.RegionUseCase
}

var _ addressv1connect.RegionServiceHandler = (*RegionService)(nil)

func NewRegionService(uc *biz.RegionUseCase) addressv1connect.RegionServiceHandler {
	return &RegionService{uc: uc}
}

func (s *RegionService) ListRegions(ctx context.Context, c *connect.Request[v1.ListRegionsRequest]) (*connect.Response[v1.ListRegionsResponse], error) {
	result, err := s.uc.ListRegions(ctx, biz.ListRegionsRequest{
		ParentID: c.Msg.ParentId,
	})
	if err != nil {
		return nil, err
	}

	regions := make([]*v1.Region, 0, len(result.Regions))
	for _, r := range result.Regions {
		regions = append(regions, toPBRegion(r))
	}

	return connect.NewResponse(&v1.ListRegionsResponse{Regions: regions}), nil
}

// toPBRegion 把 biz 层的节点转成 proto。
// Code 是原样透传的：港澳的区/堂区和「海外」在国标里没有编号，这里不补零也不造码。
func toPBRegion(r *biz.Region) *v1.Region {
	return &v1.Region{
		Id:       r.ID,
		ParentId: r.ParentID,
		Level:    r.Level,
		Code:     r.Code,
		Name:     r.Name,
		NameEn:   r.NameEN,
		Pinyin:   r.Pinyin,
	}
}
