package service

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"
	v1 "github.com/lens077/ecommerce/backend/api/address/v1"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeRegionRepo 让 service 层能脱库测：行政区划是只读字典，
// 真正值得测的是「数据长什么样就原样吐出去」，不涉及事务和并发。
type fakeRegionRepo struct {
	gotParentID int32
	regions     []*biz.Region
	err         error
}

func (f *fakeRegionRepo) ListRegions(_ context.Context, req biz.ListRegionsRequest) (*biz.ListRegionsResponse, error) {
	f.gotParentID = req.ParentID
	if f.err != nil {
		return nil, f.err
	}
	return &biz.ListRegionsResponse{Regions: f.regions}, nil
}

func newSvc(repo biz.RegionRepo) *RegionService {
	return &RegionService{uc: biz.NewRegionUseCase(repo)}
}

func TestListRegions_PassesParentIDThrough(t *testing.T) {
	repo := &fakeRegionRepo{regions: []*biz.Region{
		{ID: 165, ParentID: 20, Level: 2, Code: "440300", Name: "深圳市", NameEN: "Shenzhen City", Pinyin: "shenzhen"},
	}}

	resp, err := newSvc(repo).ListRegions(context.Background(),
		connect.NewRequest(&v1.ListRegionsRequest{ParentId: 20}))

	require.NoError(t, err)
	assert.Equal(t, int32(20), repo.gotParentID)
	require.Len(t, resp.Msg.Regions, 1)
	assert.Equal(t, "深圳市", resp.Msg.Regions[0].Name)
	assert.Equal(t, "Shenzhen City", resp.Msg.Regions[0].NameEn)
	assert.Equal(t, "440300", resp.Msg.Regions[0].Code)
}

// 省直辖县级行政区（海南琼海市、湖北仙桃市等）下面确实没有区县，
// 空列表是正常业务结果，不能当错误抛，也不能返回 nil 让前端 .map 炸掉。
func TestListRegions_EmptyIsNotAnError(t *testing.T) {
	resp, err := newSvc(&fakeRegionRepo{}).ListRegions(context.Background(),
		connect.NewRequest(&v1.ListRegionsRequest{ParentId: 360}))

	require.NoError(t, err)
	require.NotNil(t, resp.Msg.Regions)
	assert.Empty(t, resp.Msg.Regions)
}

func TestListRegions_PropagatesRepoError(t *testing.T) {
	want := errors.New("db down")

	_, err := newSvc(&fakeRegionRepo{err: want}).ListRegions(context.Background(),
		connect.NewRequest(&v1.ListRegionsRequest{ParentId: 0}))

	assert.ErrorIs(t, err, want)
}

// 港澳的区/堂区和「海外」在 GB/T 2260 里根本没有编号。
// 这里守住「不补零、不造码」—— 一旦有人给空 code 填了默认值，
// 前端就会拿着一个不存在的行政区划码去落库。
func TestToPBRegion_KeepsEmptyCode(t *testing.T) {
	pb := toPBRegion(&biz.Region{
		ID: 508, ParentID: 900004, Level: 3, Code: "",
		Name: "葵青区", NameEN: "Kwai Tsing District", Pinyin: "kuiqing",
	})

	assert.Equal(t, "", pb.Code, "空 code 必须原样保留")
	assert.Equal(t, int32(508), pb.Id)
	assert.Equal(t, int32(900004), pb.ParentId)
	assert.Equal(t, int32(3), pb.Level)
	assert.Equal(t, "葵青区", pb.Name)
	assert.Equal(t, "Kwai Tsing District", pb.NameEn)
}

// 直辖市在数据集里只有两级，市级节点是灌库时合成出来的。
// 它照样得能正常映射，前端才不用为这 6 个省份写特判。
func TestToPBRegion_SyntheticMunicipalityCity(t *testing.T) {
	pb := toPBRegion(&biz.Region{
		ID: 900000, ParentID: 1, Level: 2, Code: "110100",
		Name: "北京市", NameEN: "Beijing City", Pinyin: "beijing",
	})

	assert.Equal(t, int32(900000), pb.Id)
	assert.Equal(t, int32(1), pb.ParentId, "合成市级节点挂在省级下面")
	assert.Equal(t, int32(2), pb.Level)
	assert.Equal(t, "110100", pb.Code, "用的是国标市辖区码，不是省级码")
}
