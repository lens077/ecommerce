package biz

import "context"

// Region 是一个行政区划节点。
//
// 级联用的是 ID 而不是 Code：港澳的区/堂区和「海外」在国标里压根没有编号，
// 拿 Code 当键这 28 个节点就串不起来。
type Region struct {
	ID       int32  `json:"id"`
	ParentID int32  `json:"parent_id"`
	Level    int32  `json:"level"` // 1 省 / 2 市 / 3 区县
	Code     string `json:"code"`  // GB/T 2260，可能为空
	Name     string `json:"name"`  // 规范中文名，含后缀
	NameEN   string `json:"name_en"`
	Pinyin   string `json:"pinyin"`
}

type ListRegionsRequest struct {
	// ParentID 为 0 时取省级列表
	ParentID int32
}

type ListRegionsResponse struct {
	// 空列表是合法结果：省直辖县级行政区（海南琼海市、湖北仙桃市等）下面没有区县
	Regions []*Region
}

type RegionRepo interface {
	ListRegions(ctx context.Context, req ListRegionsRequest) (*ListRegionsResponse, error)
}

type RegionUseCase struct {
	repo RegionRepo
}

func NewRegionUseCase(repo RegionRepo) *RegionUseCase {
	return &RegionUseCase{repo: repo}
}

func (uc *RegionUseCase) ListRegions(ctx context.Context, req ListRegionsRequest) (*ListRegionsResponse, error) {
	return uc.repo.ListRegions(ctx, req)
}
